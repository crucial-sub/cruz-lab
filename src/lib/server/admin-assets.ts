// 관리자 자산 API의 Storage·Firestore 처리 (재건 2단계 D6, Plan 6.4)
// - 업로드 주소: 같은 해시가 있으면 그 자산을 준다. 없으면 pending 문서와 V4 서명 PUT 주소(15분)를 준다.
// - finalize: 원본의 실제 형식을 확인하고 webp 변형을 만든다. 변형을 만든 뒤 원본을 지운다(메타데이터·GPS 제거).
// - purge: 고아가 된 지 N일 지난 자산과 24시간 지난 pending 자산을 지운다. 지우기 직전에 모든 글을 다시 훑는다.

import { createHash, randomUUID } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { getDownloadURL } from 'firebase-admin/storage';
import sharp from 'sharp';
import { assetIdFromStoragePath, extractStoragePaths, storagePathFromUrl } from '@/lib/asset-refs';
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
} from '@/lib/asset-rules';
import { assetDocSchema, isTimestampLike, toDateValue, type AssetDoc, type AssetVariant } from '@/lib/entry-schema';
import { ApiError, zodIssues } from './api-response';
import { collectUsedAssetIds } from './asset-usage';
import { ASSETS_COLLECTION, ENTRIES_COLLECTION, LEGACY_POSTS_COLLECTION, LEGACY_SERIES_COLLECTION } from './entries';
import { getServerBucket, getServerDb, getStorageBucketName } from './firebase-server';

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

// ───────────── 한 개 읽기 (재건 3단계 D11 9) ─────────────

// 자산 문서 하나. 에디터의 이미지 크기 메뉴가 있는 변형을 확인할 때 쓴다(GET /api/admin/assets/{id}). 읽기만 한다
export async function getAssetForAdmin(id: string) {
  const snapshot = await assetsRef().doc(id).get();
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '자산이 없습니다.');
  return { asset: serializeAsset(id, parseStoredAsset(id, snapshot.data())) };
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

// Storage에 파일을 올리고 Firebase 다운로드 주소를 받는다
// - 다운로드 토큰을 메타데이터에 넣어야 getDownloadURL()이 주소를 만든다.
async function saveWithDownloadUrl(path: string, data: Buffer, contentType: string): Promise<string> {
  const file = getServerBucket().file(path);
  await file.save(data, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      metadata: { firebaseStorageDownloadTokens: randomUUID() },
    },
  });
  return getDownloadURL(file);
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
// - 옛 posts의 본문과 heroImage(heroVideo 포함)
// - 옛 series의 coverImage
async function collectAllReferencedAssetIds(): Promise<Set<string>> {
  const db = getServerDb();
  const bucket = getStorageBucketName();
  const [entries, legacyPosts, legacySeries] = await Promise.all([
    db.collection(ENTRIES_COLLECTION).select('draft', 'published').get(),
    db.collection(LEGACY_POSTS_COLLECTION).select('content', 'heroImage', 'heroVideo').get(),
    db.collection(LEGACY_SERIES_COLLECTION).select('coverImage').get(),
  ]);

  const ids = new Set<string>();
  for (const docSnap of entries.docs) {
    for (const id of collectUsedAssetIds([docSnap.get('draft'), docSnap.get('published')])) ids.add(id);
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

  for (const docSnap of snapshot.docs) {
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

  const referenced = candidates.length > 0 ? await collectAllReferencedAssetIds() : new Set<string>();
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
