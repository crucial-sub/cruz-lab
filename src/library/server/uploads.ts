// 서가 올리기 (서가 1단계 T4, Plan 5.2 [올리기] ①·③, J8·J9·J13)
// ① 시작: 원본 정보·파일 목록을 검사하고, 판을 pending으로 만들고, 파일마다 서명 PUT 주소(15분)를 준다.
//    파일은 입구가 버킷으로 바로 보낸다(Vercel 함수의 요청 본문 한도 4.5 MB를 거치지 않는다).
// ③ 마무리: 파일이 모두 있고 크기가 맞는지 보고, 제목을 뽑고, 판을 바꾸고, 앞 판의 파일을 지운다.
// - 입구 둘이 같은 함수를 쓴다: 서가 화면(쿠키, origin 'web'), 맥 입구(서가 토큰, origin 'mac').

import { ApiError } from '@/lib/server/api-response';
import { getServerDb } from '@/lib/server/firebase-server';
import {
  ENTRY_PATHS,
  extractTitle,
  identifyUpload,
  planRevisionSwitch,
  validateManifest,
  type DocFormat,
  type ManifestFile,
  type UploadSource,
} from '../rules';
import { docIdForKey } from '../ticket';
import {
  deleteRevisionFiles,
  getLibraryBucket,
  invalidateRawState,
  libraryDocRef,
  libraryDocSchema,
  objectPath,
  parseStored,
  REVISIONS_SUBCOLLECTION,
  revisionPrefix,
  revisionRef,
  revisionSchema,
  summarize,
  type LibraryDoc,
  type LibraryDocSummary,
  type Revision,
} from './store';

// 서명 PUT 주소 수명 15분 (블로그 자산 업로드와 같다)
export const LIBRARY_UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
// 끝내지 않은 판을 지우는 기준 24시간
export const PENDING_REVISION_EXPIRE_MS = 24 * 60 * 60 * 1000;
// 제목을 뽑으려고 읽는 진입 파일의 앞부분 2 MB
const TITLE_READ_BYTES = 2 * 1024 * 1024;

export type UploadOrigin = 'mac' | 'web';

export interface StartUploadInput {
  format: DocFormat;
  source: UploadSource;
  files: ManifestFile[];
  origin: UploadOrigin;
}

export interface StartUploadResult {
  docId: string;
  rev: number;
  expiresAt: string;
  uploads: { path: string; url: string; headers: Record<string, string> }[];
}

// ① 올리기 시작
export async function startUpload(input: StartUploadInput): Promise<StartUploadResult> {
  const identity = identifyUpload(input.source);
  if (!identity) throw new ApiError(400, 'BAD_SOURCE', '원본 경로나 프로젝트 이름이 올바르지 않습니다.');
  const manifest = validateManifest(input.format, input.files);
  if (!manifest.ok) throw new ApiError(400, 'BAD_MANIFEST', '올릴 파일 목록이 올바르지 않습니다.', manifest.errors);

  // 버킷 설정을 먼저 확인한다(설정이 없으면 Firestore에 아무것도 만들지 않는다)
  const bucket = getLibraryBucket();
  const docId = docIdForKey(identity.key);
  const ref = libraryDocRef(docId);
  const now = new Date();
  const fallbackTitle = extractTitle({ format: input.format, text: '', fileName: input.source.fileName });

  // 판 번호를 매기고 pending 판을 만든다 (같은 문서를 동시에 올려도 번호가 겹치지 않게 트랜잭션)
  const { rev, createdDoc } = await getServerDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists ? parseStored(libraryDocSchema, '서가 문서', snapshot.data()) : null;
    const nextRev = (existing?.lastRev ?? 0) + 1;
    if (existing) {
      tx.update(ref, {
        lastRev: nextRev,
        sourcePath: identity.sourcePath,
        project: identity.project,
        ...(identity.docDate ? { docDate: identity.docDate } : {}),
      });
    } else {
      const doc: LibraryDoc = {
        key: identity.key,
        sourcePath: identity.sourcePath,
        project: identity.project,
        title: fallbackTitle,
        docDate: identity.docDate,
        formats: {},
        lastRev: nextRev,
        readAt: null,
        uploadedAt: now,
        updatedAt: now,
      };
      libraryDocSchema.parse(doc);
      tx.create(ref, doc);
    }
    const revision: Revision = {
      format: input.format,
      origin: input.origin,
      status: 'pending',
      files: manifest.files.map(({ path, contentType, bytes, sha256 }) => ({ path, contentType, bytes, sha256 })),
      fileName: input.source.fileName.normalize('NFC'),
      createdAt: now,
    };
    revisionSchema.parse(revision);
    tx.create(revisionRef(docId, nextRev), revision);
    return { rev: nextRev, createdDoc: !existing };
  });

  await removeStalePendingRevisions(docId, now.getTime());

  const expires = now.getTime() + LIBRARY_UPLOAD_URL_TTL_MS;
  const uploads = await issueUploadUrlsWith(
    {
      deleteFiles: async (prefix) => {
        await bucket.deleteFiles({ prefix, force: true });
      },
      signWriteUrl: async (name, options) => {
        const [url] = await bucket.file(name).getSignedUrl({ version: 'v4', action: 'write', ...options });
        return url;
      },
    },
    { docId, rev, createdDoc, files: manifest.files, expires },
  );

  return { docId, rev, expiresAt: new Date(expires).toISOString(), uploads };
}

// 서명 PUT의 "없을 때만 만들기" 조건 (PR #35 리뷰 의견 3)
// - 버킷에 같은 이름의 파일이 있으면 412로 거절한다. 마무리 뒤 같은 주소로 다시 보내도 준비된 판이 바뀌지 않는다.
// - 서명에 넣은 머리라 입구가 같은 값을 보내야 한다. 서가 버킷 CORS가 이 머리를 허용해야 한다(scripts/ops/library-bucket.mjs).
export const CREATE_ONLY_HEADERS = { 'x-goog-if-generation-match': '0' } as const;

export interface SignWriteOptions {
  expires: number;
  contentType: string;
  extensionHeaders: Record<string, string>;
}

// 서명 주소를 만드는 데 쓰는 버킷 동작 (테스트는 가짜를 넣는다)
export interface IssueUploadUrlsDeps {
  // 접두사 아래 파일을 모두 지운다
  deleteFiles(prefix: string): Promise<void>;
  signWriteUrl(objectName: string, options: SignWriteOptions): Promise<string>;
}

// 파일마다 서명 PUT 주소와 입구가 보낼 머리를 만든다
// - 새 문서(createdDoc)면 {문서 id}/ 아래 남은 파일을 먼저 지운다 (PR #35 리뷰 의견 1·2).
//   앞서 내린 같은 문서의 끊긴 올리기가 파일을 남겼으면, 판 번호가 1부터 다시 시작해 같은 이름이 된다.
//   "없을 때만 만들기" 조건 때문에 그 PUT이 412가 되지 않게 한다. 청소가 실패해도 주소는 준다(기록만 남긴다).
export async function issueUploadUrlsWith(
  deps: IssueUploadUrlsDeps,
  input: { docId: string; rev: number; createdDoc: boolean; files: { path: string; contentType: string }[]; expires: number },
): Promise<StartUploadResult['uploads']> {
  const { docId, rev, createdDoc, files, expires } = input;
  if (createdDoc) {
    try {
      await deps.deleteFiles(`${docId}/`);
    } catch (error) {
      console.error(`[library] 새 문서 자리 청소 실패: ${docId}`, error);
    }
  }
  return Promise.all(
    files.map(async (file) => {
      const url = await deps.signWriteUrl(objectPath(docId, rev, file.path), {
        expires,
        contentType: file.contentType,
        extensionHeaders: { ...CREATE_ONLY_HEADERS },
      });
      return { path: file.path, url, headers: { 'Content-Type': file.contentType, ...CREATE_ONLY_HEADERS } };
    }),
  );
}

// 24시간 넘게 끝내지 않은 판을 지운다 (올리다 멈춘 파일이 남지 않게). 실패는 기록만 남긴다
async function removeStalePendingRevisions(docId: string, nowMs: number): Promise<void> {
  try {
    const pending = await libraryDocRef(docId).collection(REVISIONS_SUBCOLLECTION).where('status', '==', 'pending').get();
    for (const docSnap of pending.docs) {
      const parsed = revisionSchema.safeParse(docSnap.data());
      const createdMs = parsed.success ? toMillis(parsed.data.createdAt) : 0;
      if (nowMs - createdMs < PENDING_REVISION_EXPIRE_MS) continue;
      const rev = Number(docSnap.id);
      if (Number.isSafeInteger(rev)) await deleteRevisionFiles(docId, rev);
      await docSnap.ref.delete();
    }
  } catch (error) {
    console.error(`[library] 끝내지 않은 판 정리 실패: ${docId}`, error);
  }
}

function toMillis(value: Revision['createdAt']): number {
  return value instanceof Date ? value.getTime() : value.toMillis();
}

// 진입 파일의 앞부분을 글자로 읽는다 (제목 뽑기용)
async function readEntryHead(docId: string, rev: number, entry: string, bytes: number): Promise<string> {
  const end = Math.min(bytes, TITLE_READ_BYTES) - 1;
  if (end < 0) return '';
  const [buffer] = await getLibraryBucket()
    .file(objectPath(docId, rev, entry))
    .download({ start: 0, end });
  return buffer.toString('utf8');
}

// ③ 마무리
// - 이미 끝낸 판이면 지금 문서를 그대로 돌려준다(멱등).
// - 파일이 빠졌거나 크기가 다르면 422. 판은 pending으로 남는다(다시 올리고 다시 부를 수 있다).
export async function finalizeUpload(input: { docId: string; rev: number }, siteOrigin: string): Promise<LibraryDocSummary> {
  const { docId, rev } = input;
  const revSnapshot = await revisionRef(docId, rev).get();
  if (!revSnapshot.exists) throw new ApiError(404, 'NOT_FOUND', '올리기 기록이 없습니다.');
  const revision = parseStored(revisionSchema, '서가 판', revSnapshot.data());
  if (revision.status === 'ready') return readSummary(docId, siteOrigin);

  // 파일 존재·크기 확인: 판 접두사 아래 목록을 한 번에 읽는다
  const [objects] = await getLibraryBucket().getFiles({ prefix: revisionPrefix(docId, rev) });
  const sizes = new Map(objects.map((file) => [file.name, Number(file.metadata.size ?? -1)]));
  const missing: string[] = [];
  const wrongSize: string[] = [];
  for (const file of revision.files) {
    const size = sizes.get(objectPath(docId, rev, file.path));
    if (size === undefined) missing.push(file.path);
    else if (size !== file.bytes) wrongSize.push(file.path);
  }
  if (missing.length > 0) {
    throw new ApiError(422, 'UPLOAD_MISSING', '올리지 않은 파일이 있습니다.', { count: missing.length, paths: missing.slice(0, 20) });
  }
  if (wrongSize.length > 0) {
    throw new ApiError(422, 'SIZE_MISMATCH', '올린 파일의 크기가 목록과 다릅니다.', { paths: wrongSize.slice(0, 20) });
  }

  const entry = ENTRY_PATHS[revision.format];
  const entryFile = revision.files.find((file) => file.path === entry);
  if (!entryFile) throw new ApiError(500, 'CORRUPT_LIBRARY_DATA', '판에 진입 파일이 없습니다.');
  const title = extractTitle({
    format: revision.format,
    text: await readEntryHead(docId, rev, entry, entryFile.bytes),
    fileName: revision.fileName,
  });
  const totalBytes = revision.files.reduce((sum, file) => sum + file.bytes, 0);

  const docRef = libraryDocRef(docId);
  const plan = await getServerDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다(내렸을 수 있습니다).');
    const doc = parseStored(libraryDocSchema, '서가 문서', snapshot.data());
    const decision = planRevisionSwitch(doc.formats[revision.format]?.rev ?? null, rev);
    if (decision.activate) {
      const now = new Date();
      tx.update(docRef, {
        [`formats.${revision.format}`]: { rev, entry, bytes: totalBytes, fileCount: revision.files.length },
        title,
        updatedAt: now,
        uploadedAt: now,
        // 다시 올린 문서는 "새로 올린 문서(안 읽음)"로 다시 보인다
        readAt: null,
      });
      tx.update(revisionRef(docId, rev), { status: 'ready' });
    } else if (decision.retire === rev) {
      tx.delete(revisionRef(docId, rev));
    }
    return decision;
  });

  if (plan.activate) invalidateRawState(docId);

  // 앞 판(또는 늦게 끝난 옛 판)의 파일과 기록을 지운다 (J9: 새 판이 준비된 뒤)
  if (plan.retire !== null) {
    await deleteRevisionFiles(docId, plan.retire);
    if (plan.activate) {
      try {
        await revisionRef(docId, plan.retire).delete();
      } catch (error) {
        console.error(`[library] 앞 판 기록 삭제 실패: ${docId}/${plan.retire}`, error);
      }
    }
  }

  return readSummary(docId, siteOrigin);
}

async function readSummary(docId: string, siteOrigin: string): Promise<LibraryDocSummary> {
  const snapshot = await libraryDocRef(docId).get();
  if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
  return summarize(docId, parseStored(libraryDocSchema, '서가 문서', snapshot.data()), siteOrigin);
}
