// 관리자 자산 API의 Storage·Firestore 처리 (재건 2단계 D6, Plan 6.4)
// - 업로드 주소: 같은 해시가 있으면 그 자산을 준다. 없으면 pending 문서와 V4 서명 PUT 주소(15분)를 준다.
// - finalize: 원본의 실제 형식을 확인하고 webp 변형을 만든다. 변형을 만든 뒤 원본을 지운다(메타데이터·GPS 제거).
// - purge: 고아가 된 지 N일 지난 자산과 24시간 지난 pending 자산을 지운다. 지우기 직전에 모든 글을 다시 훑는다.
//   쓰이는 파생 자산의 원본은 지우지 않는다.
// - transform: 이미지를 돌린 파생 자산을 만든다(이미지 회전·좌우반전 작업). 원본 자산은 그대로 둔다.

import { createHash, randomUUID } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { getDownloadURL } from 'firebase-admin/storage';
import sharp from 'sharp';
import { assetIdFromStoragePath, extractStoragePaths, storagePathFromUrl } from '@/lib/asset-refs';
import { firebaseDownloadUrl } from '@/lib/asset-url';
import {
  ALLOWED_CONTENT_TYPES,
  UPLOAD_URL_TTL_MS,
  assetPrefixFor,
  contentTypeFromSharpFormat,
  detectVideoContentType,
  isVideoContentType,
  maxBytesFor,
  originalPathFor,
  planVariants,
  purgeCandidateReason,
  variantPathFor,
  type AllowedContentType,
  type PurgeCandidateReason,
  type VariantPlan,
} from '@/lib/asset-rules';
import {
  isIdentityTransform,
  resolveTransformRequest,
  sameTransform,
  withDerivedRoots,
  type TransformOp,
} from '@/lib/asset-transform';
import { assetDocSchema, isTimestampLike, toDateValue, type AssetDoc, type AssetVariant } from '@/lib/entry-schema';
import { ApiError, zodIssues } from './api-response';
import { collectUsedAssetIds } from './asset-usage';
import {
  ASSETS_COLLECTION,
  ENTRIES_COLLECTION,
  LEGACY_POSTS_COLLECTION,
  LEGACY_SERIES_COLLECTION,
  REVISIONS_SUBCOLLECTION,
} from './entries';
import { getServerBucket, getServerDb, getStorageBucketName } from './firebase-server';
import { renderTransformedVariants } from './image-transform';
import type { ServerTiming } from './server-timing';

// main 병합 전에는 legacy 자산을 정리 대상에서 뺀다(D6, Claude 판단).
// 운영이 옛 이미지를 계속 쓰기 때문이다. 병합 뒤 정리 작업(Plan 15절)에서 true로 바꾼다.
export const PURGE_LEGACY_ASSETS = false;

// 변형 webp 품질
const WEBP_QUALITY = 82;
// 변형·영상 파일의 캐시 (경로가 자산마다 달라 바뀌지 않는다)
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function assetsRef() {
  return getServerDb().collection(ASSETS_COLLECTION);
}

function toIso(value: unknown): string | null {
  return isTimestampLike(value) ? toDateValue(value).toISOString() : null;
}

// 저장된 자산 문서를 스키마로 읽는다. 깨진 문서면 500
function parseStoredAsset(id: string, data: DocumentData | undefined): AssetDoc {
  const result = assetDocSchema.safeParse(data);
  if (!result.success) {
    throw new ApiError(500, 'CORRUPT_ASSET', `저장된 자산 문서가 스키마와 맞지 않습니다: ${id}`, zodIssues(result.error));
  }
  return result.data;
}

// 응답용 자산 (시각은 ISO 문자열)
export function serializeAsset(id: string, asset: AssetDoc) {
  return {
    id,
    ...asset,
    orphanedAt: toIso(asset.orphanedAt),
    uploadedAt: toIso(asset.uploadedAt),
  };
}

// ───────────── 업로드 주소 ─────────────

export interface UploadUrlInput {
  fileName: string;
  contentType: AllowedContentType;
  bytes: number;
  sha256: string;
}

// 업로드 주소를 준다 (Plan 6.4 upload-url)
// - 같은 해시의 ready 자산이 있으면 { existing }. 업로드를 건너뛴다.
// - 같은 해시의 pending 자산이 있으면 그 문서를 다시 쓴다(끝내지 않은 업로드).
// - 없으면 pending 문서를 새로 만든다.
export async function requestUploadUrl(input: UploadUrlInput) {
  if (input.bytes > maxBytesFor(input.contentType)) {
    throw new ApiError(413, 'FILE_TOO_LARGE', `파일이 한도(${maxBytesFor(input.contentType)} 바이트)를 넘습니다.`);
  }

  const sameHash = await assetsRef().where('sha256', '==', input.sha256).get();
  const ready = sameHash.docs.find((docSnap) => docSnap.get('status') === 'ready');
  if (ready) {
    return { existing: serializeAsset(ready.id, parseStoredAsset(ready.id, ready.data())) };
  }

  const pending = sameHash.docs.find((docSnap) => docSnap.get('status') === 'pending');
  const ref = pending ? pending.ref : assetsRef().doc();
  const now = new Date();
  const storagePath = originalPathFor(ref.id, input.contentType);
  const doc: AssetDoc = {
    storagePath,
    url: '',
    contentType: input.contentType,
    bytes: input.bytes,
    sha256: input.sha256,
    variants: null,
    status: 'pending',
    legacy: false,
    usedBy: [],
    orphanedAt: null,
    uploadedAt: now,
  };
  assetDocSchema.parse(doc);
  await ref.set(doc);

  const expires = now.getTime() + UPLOAD_URL_TTL_MS;
  const [uploadUrl] = await getServerBucket().file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires,
    contentType: input.contentType,
  });

  return {
    assetId: ref.id,
    uploadUrl,
    expiresAt: new Date(expires).toISOString(),
    requiredHeaders: { 'Content-Type': input.contentType },
  };
}

// ───────────── finalize ─────────────

// Storage에 파일을 올리고 Firebase 다운로드 주소를 준다
// - 다운로드 토큰을 메타데이터에 넣어야 다운로드 주소가 열린다.
// - 주소는 그 토큰으로 직접 만든다(getDownloadURL과 같은 모양). getDownloadURL은 메타데이터를 한 번 더 받아
//   토큰을 읽으므로 파일마다 요청이 하나 늘었다(이미지 회전·좌우반전 작업, 속도 줄이기).
async function saveWithDownloadUrl(path: string, data: Buffer, contentType: string): Promise<string> {
  const file = getServerBucket().file(path);
  const token = randomUUID();
  await file.save(data, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return firebaseDownloadUrl(file.bucket.name, file.name, token);
}

// Storage 파일 전체의 SHA-256 (영상처럼 큰 파일은 스트림으로 읽는다)
async function hashStorageFile(file: ReturnType<ReturnType<typeof getServerBucket>['file']>): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of file.createReadStream()) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

// 이미지 → webp 변형들 (D6 변형 규칙)
// - 회전 보정(EXIF), 메타데이터 제거(sharp 기본), 움직이는 gif는 움직이는 webp.
async function buildImageVariants(assetId: string, buffer: Buffer) {
  const metadata = await sharp(buffer, { animated: true }).metadata();
  const isAnimated = (metadata.pages ?? 1) > 1;
  const rawWidth = metadata.width ?? 0;
  const rawHeight = metadata.pageHeight ?? metadata.height ?? 0;
  if (rawWidth <= 0 || rawHeight <= 0) {
    throw new ApiError(422, 'INVALID_IMAGE', '이미지 크기를 읽을 수 없습니다.');
  }
  // EXIF 방향 5~8은 가로·세로가 바뀐다
  const swap = !isAnimated && (metadata.orientation ?? 1) >= 5;
  const width = swap ? rawHeight : rawWidth;
  const height = swap ? rawWidth : rawHeight;

  const plan = planVariants(width);
  const files = new Map<number, AssetVariant>();
  for (const targetWidth of plan.widths) {
    let pipeline = sharp(buffer, { animated: isAnimated });
    if (!isAnimated) pipeline = pipeline.rotate();
    const output = await pipeline
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    const path = variantPathFor(assetId, targetWidth);
    const url = await saveWithDownloadUrl(path, output, 'image/webp');
    files.set(targetWidth, {
      path,
      url,
      width: targetWidth,
      height: Math.max(1, Math.round((height * targetWidth) / width)),
      bytes: output.length,
    });
  }

  return variantsFromFiles(plan, files);
}

// 폭별 파일 → 자산 문서의 variants (업로드와 회전·좌우반전이 같이 쓴다)
function variantsFromFiles(plan: VariantPlan, files: ReadonlyMap<number, AssetVariant>) {
  const max = files.get(plan.maxWidth);
  if (!max) throw new ApiError(500, 'VARIANT_FAILED', '최대 변형을 만들지 못했습니다.');
  const variants: NonNullable<AssetDoc['variants']> = { max };
  for (const { key, width: keyWidth } of plan.keys) {
    const variant = files.get(keyWidth);
    if (variant) variants[key] = variant;
  }
  return { max, variants };
}

// 업로드를 끝낸다 (Plan 6.4 finalize)
// - 이미 ready면 그대로 돌려준다(멱등).
// - 원본이 없으면 422 UPLOAD_MISSING. 실제 형식이 선언과 다르면 422 FORMAT_MISMATCH.
// - 확장자나 contentType을 믿지 않는다. 이미지는 sharp, 영상은 첫 바이트로 확인한다.
export async function finalizeAsset(id: string) {
  const ref = assetsRef().doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '자산이 없습니다.');
  const asset = parseStoredAsset(id, snapshot.data());
  if (asset.status === 'ready') return { asset: serializeAsset(id, asset) };
  // legacy 자산이나 assets/{id}/ 밖의 경로는 다루지 않는다(운영이 쓰는 옛 원본을 지우지 않게)
  if (asset.legacy || !asset.storagePath.startsWith(assetPrefixFor(id))) {
    throw new ApiError(422, 'NOT_FINALIZABLE', '이 자산은 업로드를 끝낼 수 없습니다.');
  }

  const declared = asset.contentType as AllowedContentType;
  if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(declared)) {
    throw new ApiError(422, 'UNSUPPORTED_FORMAT', '받지 않는 형식입니다.');
  }

  const original = getServerBucket().file(asset.storagePath);
  const [exists] = await original.exists();
  if (!exists) throw new ApiError(422, 'UPLOAD_MISSING', '업로드한 원본이 없습니다.');
  const [fileMetadata] = await original.getMetadata();
  const size = Number(fileMetadata.size ?? 0);
  if (size > maxBytesFor(declared)) {
    throw new ApiError(422, 'FILE_TOO_LARGE', `파일이 한도(${maxBytesFor(declared)} 바이트)를 넘습니다.`);
  }

  let next: AssetDoc;
  if (isVideoContentType(declared)) {
    if ((await hashStorageFile(original)) !== asset.sha256) {
      throw new ApiError(422, 'HASH_MISMATCH', '올린 파일의 해시가 요청한 해시와 다릅니다.');
    }
    const [head] = await original.download({ start: 0, end: 15 });
    if (detectVideoContentType(head) !== declared) {
      throw new ApiError(422, 'FORMAT_MISMATCH', '파일의 실제 형식이 선언한 형식과 다릅니다.');
    }
    // 영상은 변형 없이 원본을 그대로 쓴다
    await original.setMetadata({
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      metadata: { firebaseStorageDownloadTokens: randomUUID() },
    });
    next = { ...asset, url: await getDownloadURL(original), bytes: size, status: 'ready' };
  } else {
    const [buffer] = await original.download();
    if (createHash('sha256').update(buffer).digest('hex') !== asset.sha256) {
      throw new ApiError(422, 'HASH_MISMATCH', '올린 파일의 해시가 요청한 해시와 다릅니다.');
    }
    const actual = contentTypeFromSharpFormat((await sharp(buffer).metadata()).format);
    if (actual !== declared) {
      throw new ApiError(422, 'FORMAT_MISMATCH', '파일의 실제 형식이 선언한 형식과 다릅니다.');
    }
    const { max, variants } = await buildImageVariants(id, buffer);
    next = {
      ...asset,
      storagePath: max.path,
      url: max.url,
      contentType: 'image/webp',
      bytes: max.bytes,
      width: max.width,
      height: max.height,
      variants,
      status: 'ready',
    };
  }

  // 아직 어느 글도 쓰지 않으면 고아로 표시한다. 글에 넣고 저장하면 지워진다.
  // 표시가 없으면 쓰지 않는 업로드가 영원히 정리되지 않는다(정리 직전 재검사가 쓰는 자산을 지킨다).
  if (next.usedBy.length === 0) next = { ...next, orphanedAt: new Date() };

  assetDocSchema.parse(next);
  await ref.set(next);

  // 변형을 만든 이미지는 원본을 지운다(EXIF·GPS가 남지 않게)
  if (!isVideoContentType(declared)) {
    try {
      await original.delete({ ignoreNotFound: true });
    } catch (error) {
      console.error(`[admin-assets] 원본 삭제 실패: ${asset.storagePath}`, error);
    }
  }

  return { asset: serializeAsset(id, next) };
}

// ───────────── 회전·좌우반전 (이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12) ─────────────

// 돌릴 수 있는 자산인지. 안 되면 422 NOT_TRANSFORMABLE
// - 새로 올린 이미지(assets/{id}/, 변형 있음)만 돌린다. 옛 CMS 이미지와 영상은 돌리지 않는다.
function assertTransformable(id: string, asset: AssetDoc): NonNullable<AssetDoc['variants']> {
  if (asset.legacy || !asset.storagePath.startsWith(assetPrefixFor(id))) {
    throw new ApiError(422, 'NOT_TRANSFORMABLE', '옛 이미지는 돌릴 수 없습니다.');
  }
  if (isVideoContentType(asset.contentType) || asset.contentType.startsWith('video/')) {
    throw new ApiError(422, 'NOT_TRANSFORMABLE', '영상은 돌릴 수 없습니다.');
  }
  if (asset.status !== 'ready' || !asset.variants) {
    throw new ApiError(422, 'NOT_TRANSFORMABLE', '업로드를 끝낸 이미지만 돌릴 수 있습니다.');
  }
  return asset.variants;
}

// 이미지를 돌린 자산을 준다 (POST /api/admin/assets/{id}/transform)
// - 파생 자산을 돌리면 그 원본(root)에서 합친 변환으로 만든다. 다시 압축은 언제나 한 번이다.
// - 합친 변환이 처음 방향이면 원본 자산을 준다. 같은 원본·같은 변환의 자산이 있으면 그것을 준다(새 파일 없음).
// - 없으면 원본의 최대 변형을 돌려 새 자산을 만든다. 아직 어느 글도 쓰지 않으므로 고아로 표시한다
//   (글에 넣고 저장하면 지워진다, finalize와 같다).
// - 원본 문서가 없으면(정리됨) 지금 자산을 원본으로 삼는다.
// - timing을 주면 단계별 시간을 남긴다(Server-Timing): read(Firestore 읽기), dl(원본 받기), img(sharp),
//   up(변형 올리기), write(문서 쓰기).
export async function transformAsset(id: string, op: TransformOp, timing?: ServerTiming) {
  const measure = <T>(name: string, run: () => Promise<T>) => (timing ? timing.measure(name, run) : run());
  const snapshot = await measure('read', () => assetsRef().doc(id).get());
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '자산이 없습니다.');
  const asset = parseStoredAsset(id, snapshot.data());
  assertTransformable(id, asset);

  let { rootId, transform } = resolveTransformRequest(
    { id, derivedFrom: asset.derivedFrom, transform: asset.transform },
    op,
  );
  // 원본 문서와 같은 원본의 파생 자산을 함께 읽는다(요청 하나만큼 줄인다)
  const derivedOf = (rootKey: string) => assetsRef().where('derivedFrom', '==', rootKey).get();
  const [rootSnapshot, siblingsOfRoot] = await measure('read', () =>
    Promise.all([rootId !== id ? assetsRef().doc(rootId).get() : Promise.resolve(null), derivedOf(rootId)]),
  );
  let root = asset;
  let siblings = siblingsOfRoot;
  if (rootSnapshot?.exists) {
    root = parseStoredAsset(rootId, rootSnapshot.data());
  } else if (rootSnapshot) {
    ({ rootId, transform } = resolveTransformRequest({ id }, op));
    siblings = await measure('read', () => derivedOf(rootId));
  }
  const rootVariants = assertTransformable(rootId, root);
  if (isIdentityTransform(transform)) return { asset: serializeAsset(rootId, root) };

  for (const docSnap of siblings.docs) {
    const parsed = assetDocSchema.safeParse(docSnap.data());
    if (!parsed.success || parsed.data.status !== 'ready' || !parsed.data.transform) continue;
    if (sameTransform(parsed.data.transform, transform)) {
      return { asset: serializeAsset(docSnap.id, parsed.data) };
    }
  }

  const [source] = await measure('dl', () => getServerBucket().file(rootVariants.max.path).download());
  const rendered = await measure('img', () => renderTransformedVariants(source, transform));
  const ref = assetsRef().doc();
  let next: AssetDoc;
  try {
    // 변형 파일을 동시에 올린다. 하나가 실패해도 모두 끝난 뒤에 실패로 본다(아래 정리가 늦게 끝난 파일을 놓치지 않게)
    const uploads = await measure('up', () =>
      Promise.allSettled(
        rendered.map(async (file): Promise<AssetVariant> => {
          const path = variantPathFor(ref.id, file.width);
          const url = await saveWithDownloadUrl(path, file.data, 'image/webp');
          return { path, url, width: file.width, height: file.height, bytes: file.data.length };
        }),
      ),
    );
    const failed = uploads.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
    const files = new Map<number, AssetVariant>();
    for (const result of uploads) {
      if (result.status === 'fulfilled') files.set(result.value.width, result.value);
    }
    const largest = rendered[rendered.length - 1];
    const { max, variants } = variantsFromFiles(planVariants(largest.width), files);
    const now = new Date();
    next = {
      storagePath: max.path,
      url: max.url,
      contentType: 'image/webp',
      bytes: max.bytes,
      width: max.width,
      height: max.height,
      sha256: createHash('sha256').update(largest.data).digest('hex'),
      variants,
      status: 'ready',
      legacy: false,
      usedBy: [],
      orphanedAt: now,
      uploadedAt: now,
      derivedFrom: rootId,
      transform,
    };
    assetDocSchema.parse(next);
    const doc = next;
    await measure('write', () => ref.set(doc));
  } catch (error) {
    // 문서 없이 남은 파일은 정리가 찾지 못한다. 만든 파일을 지운다
    await getServerBucket()
      .deleteFiles({ prefix: assetPrefixFor(ref.id) })
      .catch((cleanupError) => console.error(`[admin-assets] 회전 실패 뒤 파일 정리 실패: ${ref.id}`, cleanupError));
    throw error;
  }
  return { asset: serializeAsset(ref.id, next) };
}

// ───────────── purge ─────────────

export interface PurgeInput {
  dryRun: boolean;
  minOrphanDays: number;
  ids: string[] | null; // 이 자산들만 본다(스모크 테스트가 시험 자산만 지울 때)
}

interface PurgeCandidate {
  id: string;
  reason: PurgeCandidateReason;
  storagePath: string;
  legacy: boolean;
  orphanedAt: string | null;
  uploadedAt: string | null;
}

// 지금 어느 글이든 쓰는 자산 ID를 모두 모은다 (지우기 직전 재검사, D6)
// - entries의 초안·발행본 본문과 표지
// - entries/*/revisions의 이전 발행본 본문과 표지(5단계 D3: 이전 판을 미리 보고 가져올 수 있다. PR-B 리뷰 S1)
// - 옛 posts의 본문과 heroImage(heroVideo 포함)
// - 옛 series의 coverImage
async function collectAllReferencedAssetIds(): Promise<Set<string>> {
  const db = getServerDb();
  const bucket = getStorageBucketName();
  const [entries, revisions, legacyPosts, legacySeries] = await Promise.all([
    db.collection(ENTRIES_COLLECTION).select('draft', 'published').get(),
    db.collectionGroup(REVISIONS_SUBCOLLECTION).select('markdown', 'cover').get(),
    db.collection(LEGACY_POSTS_COLLECTION).select('content', 'heroImage', 'heroVideo').get(),
    db.collection(LEGACY_SERIES_COLLECTION).select('coverImage').get(),
  ]);

  const ids = new Set<string>();
  for (const docSnap of entries.docs) {
    for (const id of collectUsedAssetIds([docSnap.get('draft'), docSnap.get('published')])) ids.add(id);
  }
  for (const docSnap of revisions.docs) {
    // entries 아래의 revisions만 본다
    if (docSnap.ref.parent.parent?.parent?.id !== ENTRIES_COLLECTION) continue;
    for (const id of collectUsedAssetIds([docSnap.data() as never])) ids.add(id);
  }

  // 옛 문서의 주소 하나 → 자산 ID
  const addUrl = (value: unknown) => {
    if (typeof value !== 'string' || !value) return;
    const path = storagePathFromUrl(value.trim(), bucket);
    if (path) ids.add(assetIdFromStoragePath(path));
  };
  for (const docSnap of legacyPosts.docs) {
    const content = docSnap.get('content');
    if (typeof content === 'string') {
      for (const path of extractStoragePaths(content, bucket)) ids.add(assetIdFromStoragePath(path));
    }
    addUrl(docSnap.get('heroImage'));
    addUrl(docSnap.get('heroVideo'));
  }
  for (const docSnap of legacySeries.docs) addUrl(docSnap.get('coverImage'));

  return ids;
}

// 자산 하나의 Storage 파일을 지운다
async function deleteAssetFiles(id: string, asset: AssetDoc) {
  const bucket = getServerBucket();
  if (asset.storagePath.startsWith(assetPrefixFor(id))) {
    await bucket.deleteFiles({ prefix: assetPrefixFor(id) });
    return;
  }
  // legacy 경로(images/…): 그 파일만 지운다
  await bucket.file(asset.storagePath).delete({ ignoreNotFound: true });
}

// 정리 (Plan 6.4 purge). 기본은 시험 실행이다
export async function purgeAssets(input: PurgeInput) {
  const nowMs = Date.now();
  const snapshot = await assetsRef().get();
  const candidates: (PurgeCandidate & { asset: AssetDoc })[] = [];
  // 파생 자산 ID → 원본 ID (쓰이는 파생 자산의 원본을 지키려고 모은다)
  const derivedFromById = new Map<string, string>();

  for (const docSnap of snapshot.docs) {
    const derivedFrom = docSnap.get('derivedFrom');
    if (typeof derivedFrom === 'string' && derivedFrom) derivedFromById.set(docSnap.id, derivedFrom);
    if (input.ids && !input.ids.includes(docSnap.id)) continue;
    const asset = parseStoredAsset(docSnap.id, docSnap.data());
    const reason = purgeCandidateReason(
      {
        id: docSnap.id,
        status: asset.status,
        legacy: asset.legacy,
        usedByCount: asset.usedBy.length,
        orphanedAtMs: asset.orphanedAt ? toDateValue(asset.orphanedAt).getTime() : null,
        uploadedAtMs: toDateValue(asset.uploadedAt).getTime(),
      },
      { nowMs, minOrphanDays: input.minOrphanDays, allowLegacy: PURGE_LEGACY_ASSETS },
    );
    if (!reason) continue;
    candidates.push({
      id: docSnap.id,
      reason,
      storagePath: asset.storagePath,
      legacy: asset.legacy,
      orphanedAt: toIso(asset.orphanedAt),
      uploadedAt: toIso(asset.uploadedAt),
      asset,
    });
  }

  // 쓰이는 파생 자산의 원본도 쓰임으로 본다(이미지 회전·좌우반전: 다시 돌리거나 원래 방향으로 돌아올 때 원본이 필요하다)
  const referenced =
    candidates.length > 0
      ? withDerivedRoots(await collectAllReferencedAssetIds(), derivedFromById)
      : new Set<string>();
  const kept = candidates
    .filter((candidate) => referenced.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, reason: 'still-referenced' }));
  const deletable = candidates.filter((candidate) => !referenced.has(candidate.id));

  const deleted: string[] = [];
  if (!input.dryRun) {
    for (const candidate of deletable) {
      await deleteAssetFiles(candidate.id, candidate.asset);
      await assetsRef().doc(candidate.id).delete();
      deleted.push(candidate.id);
    }
  }

  return {
    dryRun: input.dryRun,
    minOrphanDays: input.minOrphanDays,
    candidates: deletable.map((candidate) => ({
      id: candidate.id,
      reason: candidate.reason,
      storagePath: candidate.storagePath,
      legacy: candidate.legacy,
      orphanedAt: candidate.orphanedAt,
      uploadedAt: candidate.uploadedAt,
    })),
    deleted,
    kept,
  };
}

// ───────────── 이미지 라이브러리 목록 (재건 5단계 D12) ─────────────

// 목록 한 칸의 변형 하나
export interface AdminAssetVariantItem {
  name: 'w480' | 'w960' | 'w1600' | 'max';
  width: number;
  height: number;
  bytes: number;
  url: string;
}

// 이미지 라이브러리의 자산 한 개 (시각은 ISO 문자열)
export interface AdminAssetItem {
  id: string;
  url: string; // pending이면 ''
  thumbUrl: string; // 격자 칸 그림 주소
  contentType: string;
  kind: 'image' | 'video';
  bytes: number;
  width: number | null;
  height: number | null;
  legacy: boolean;
  status: 'pending' | 'ready';
  usedBy: string[];
  orphanedAt: string | null;
  uploadedAt: string | null;
  variants: AdminAssetVariantItem[];
}

// 변형 이름의 순서 (작은 것부터)
const VARIANT_NAMES = ['w480', 'w960', 'w1600', 'max'] as const;

// 있는 변형만 작은 것부터 늘어놓는다
function variantItemsOf(asset: AssetDoc): AdminAssetVariantItem[] {
  const variants = asset.variants;
  if (!variants) return [];
  const items: AdminAssetVariantItem[] = [];
  for (const name of VARIANT_NAMES) {
    const variant = variants[name];
    if (!variant) continue;
    items.push({ name, width: variant.width, height: variant.height, bytes: variant.bytes, url: variant.url });
  }
  return items;
}

// 격자 칸 그림 주소
// - 새 자산: w480 변형. 없으면 가장 작은 변형. 변형이 없으면 원본.
// - legacy(변형 없음): 원본. legacy용 작은 변형은 만들지 않는다(데이터 쓰기다, D12).
function thumbUrlOf(asset: AssetDoc, variants: AdminAssetVariantItem[]): string {
  if (asset.variants?.w480) return asset.variants.w480.url;
  const smallest = [...variants].sort((a, b) => a.width - b.width)[0];
  return smallest?.url ?? asset.url;
}

// 자산 문서 → 목록 한 칸
function toAdminAssetItem(id: string, asset: AssetDoc): AdminAssetItem {
  const variants = variantItemsOf(asset);
  // 옛 영상 형식(video/quicktime 등)도 영상으로 본다. 격자가 영상 파일을 <img>로 받지 않게 한다
  const video = isVideoContentType(asset.contentType) || asset.contentType.startsWith('video/');
  return {
    id,
    url: asset.url,
    thumbUrl: thumbUrlOf(asset, variants),
    contentType: asset.contentType,
    kind: video ? 'video' : 'image',
    bytes: asset.bytes,
    width: asset.width ?? asset.variants?.max.width ?? null,
    height: asset.height ?? asset.variants?.max.height ?? null,
    legacy: asset.legacy,
    status: asset.status,
    usedBy: asset.usedBy,
    orphanedAt: toIso(asset.orphanedAt),
    uploadedAt: toIso(asset.uploadedAt),
    variants,
  };
}

// 자산 전부 (GET /api/admin/assets). 읽기만 한다
// - assets 문서를 한 번에 읽는다. 자산 문서에는 본문 칸이 없다.
// - 올린 때 최신순. 같으면 ID 순. 올린 때가 없으면 맨 뒤.
// - 스키마와 맞지 않는 문서는 목록에서 빼고 ID를 로그에 남긴다. 한 문서 때문에 목록 전체가 깨지지 않게 한다.
// - 글 제목은 주지 않는다. 앱이 글 목록 API 결과로 usedBy를 제목으로 바꾼다.
export async function listAssetsForAdmin(): Promise<{ items: AdminAssetItem[] }> {
  const snapshot = await assetsRef().get();
  const items: AdminAssetItem[] = [];
  for (const docSnap of snapshot.docs) {
    const result = assetDocSchema.safeParse(docSnap.data());
    if (!result.success) {
      console.error(`[admin-assets] 스키마와 맞지 않는 자산 문서를 목록에서 뺐습니다: ${docSnap.id}`);
      continue;
    }
    items.push(toAdminAssetItem(docSnap.id, result.data));
  }
  items.sort((a, b) => {
    if (a.uploadedAt !== b.uploadedAt) {
      if (a.uploadedAt === null) return 1;
      if (b.uploadedAt === null) return -1;
      return a.uploadedAt < b.uploadedAt ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return { items };
}
