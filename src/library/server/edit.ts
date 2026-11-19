// 폰 고치기 저장 (서가 2단계 T5, Plan J36~J39, L6·L9)
// - 서가 화면 고치기(글자 칸)가 PUT /api/admin/library/docs/{id}/md { baseRev, text }로 부른다.
// - 새 판(origin 'phone')을 만든다. index.md만 새로 쓰고, 나머지 파일(그림)은 앞 판에서 버킷 안 복사한다.
// - 판을 바꾸기 직전에 md 판이 baseRev가 아니면 새 판을 지우고 409(REV_CHANGED). 맥에서 새 판이 그사이 왔으면
//   덮어쓰지 않는다. 그사이 다른 올리기가 판 번호를 받았어도(lastRev가 늘었다) 409다. 그 올리기가 마무리되면
//   번호가 더 큰 그 판이 폰 판을 덮기 때문이다(폰 글을 잃지 않게 저장을 먼저 멈춘다).
// - 읽음은 그대로 둔다(J38). 제목은 다시 뽑는다. 색인을 다시 쓴다. 되돌리기 상태(mdSync)에 폰 판 번호를 적는다(J39).
// - 저장소 동작은 PhoneEditDeps로 받는다. 운영은 Firestore·서가 버킷, 단위 테스트는 메모리 저장소다.

import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/server/api-response';
import { getServerDb } from '@/lib/server/firebase-server';
import { contentTypeForPath, ENTRY_PATHS, extractTitle } from '../rules';
import { checkPulledReport, mdSyncAfterPull, mdSyncForPhoneSave, type MdSync } from '../sync';
import { writeSearchIndexIfCurrent } from './search-store';
import {
  deleteRevisionFiles,
  getLibraryBucket,
  getLibraryDoc,
  getRevision,
  invalidateRawState,
  libraryDocRef,
  libraryDocSchema,
  objectPath,
  parseStored,
  revisionPrefix,
  revisionRef,
  revisionSchema,
  type FormatState,
  type LibraryDoc,
  type Revision,
} from './store';

// 폰 저장 글의 상한 2 MB (J37). 요청 본문 한도(Vercel 4.5 MB) 안이다
export const MAX_PHONE_TEXT_BYTES = 2 * 1024 * 1024;
// 앞 판 파일을 동시에 복사하는 수
const COPY_CONCURRENCY = 8;

const MD_ENTRY = ENTRY_PATHS.md;

export interface PhoneEditActivation {
  baseRev: number;
  rev: number;
  format: FormatState;
  title: string;
  mdSync: MdSync;
  updatedAt: Date;
}

// 폰 저장이 쓰는 저장소 동작 (테스트는 메모리 저장소를 넣는다)
export interface PhoneEditDeps {
  now(): Date;
  // 올린 형식이 있는 문서. 없으면 null
  loadDoc(docId: string): Promise<LibraryDoc | null>;
  loadRevision(docId: string, rev: number): Promise<Revision | null>;
  // 판 번호를 하나 매기고(lastRev + 1) pending 판 기록을 만든다. 매긴 번호를 돌려준다
  createPendingRevision(docId: string, revision: Revision): Promise<number>;
  // 새 판의 진입 파일을 버킷에 쓴다
  writeEntry(docId: string, rev: number, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  // 앞 판의 파일 하나를 새 판으로 복사한다
  copyFile(docId: string, fromRev: number, toRev: number, path: string): Promise<void>;
  // 판을 바꾼다(한 트랜잭션). md 판이 baseRev가 아니거나 lastRev가 rev가 아니면 바꾸지 않는다
  activate(docId: string, input: PhoneEditActivation): Promise<'activated' | 'rev-changed' | 'gone'>;
  // 판 하나의 파일과 기록을 지운다(새 판 버리기, 앞 판 지우기). 실패는 기록만 남긴다
  deleteRevision(docId: string, rev: number): Promise<void>;
  // 문서 출처의 판 정보 캐시를 비운다
  invalidate(docId: string): void;
  // 색인을 쓴다. 그 판이 아직 지금 판일 때만 쓴다(PR-A 리뷰 Codex P2)
  writeSearchIndex(docId: string, input: { rev: number; title: string; project: string; text: string }): Promise<void>;
}

export type PhoneSaveResult = { changed: boolean; rev: number };

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function revChanged(): ApiError {
  return new ApiError(
    409,
    'REV_CHANGED',
    '그사이 맥에서 새 판이 올라왔습니다. 덮어쓰지 않았습니다. 새 판을 열어 다시 고칩니다.',
  );
}

// 일을 동시에 limit개씩 한다. 하나가 실패하면 남은 일을 시작하지 않고 그 오류를 던진다
async function runPool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await work(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(workers);
}

// 폰 저장 하나
export async function savePhoneEditWith(
  deps: PhoneEditDeps,
  input: { docId: string; baseRev: number; text: string },
): Promise<PhoneSaveResult> {
  const { docId, baseRev, text } = input;
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.byteLength > MAX_PHONE_TEXT_BYTES) {
    throw new ApiError(413, 'TEXT_TOO_LARGE', '글이 2 MB를 넘습니다. 맥에서 고칩니다.');
  }

  const doc = await deps.loadDoc(docId);
  const md = doc?.formats.md;
  if (!doc || !md) throw new ApiError(404, 'NOT_FOUND', '서가에 md 문서가 없습니다.');
  if (md.rev !== baseRev) throw revChanged();

  const base = await deps.loadRevision(docId, baseRev);
  const baseEntry = base?.files.find((file) => file.path === MD_ENTRY);
  if (!base || base.status !== 'ready' || !baseEntry) {
    throw new ApiError(500, 'CORRUPT_LIBRARY_DATA', '앞 판 기록이 없거나 진입 파일이 없습니다.');
  }

  const sha256 = sha256Hex(bytes);
  // 글이 앞 판과 같으면 새 판을 만들지 않는다(되돌릴 폰 판도 생기지 않는다)
  if (sha256 === baseEntry.sha256) return { changed: false, rev: baseRev };

  const contentType = baseEntry.contentType || contentTypeForPath(MD_ENTRY) || 'text/markdown; charset=utf-8';
  const others = base.files.filter((file) => file.path !== MD_ENTRY);
  const now = deps.now();
  const revision: Revision = {
    format: 'md',
    origin: 'phone',
    status: 'pending',
    files: [{ path: MD_ENTRY, contentType, bytes: bytes.byteLength, sha256 }, ...others],
    fileName: base.fileName,
    createdAt: now,
  };
  const rev = await deps.createPendingRevision(docId, revision);

  // 새 판 파일: index.md를 쓰고 나머지를 복사한다. 실패하면 새 판을 버린다
  try {
    await deps.writeEntry(docId, rev, MD_ENTRY, bytes, contentType);
    await runPool(others, COPY_CONCURRENCY, (file) => deps.copyFile(docId, baseRev, rev, file.path));
  } catch (error) {
    await deps.deleteRevision(docId, rev);
    // 앞 판 파일이 지워져 복사가 실패했으면 그사이 맥 판이 마무리된 것이다
    const latest = await deps.loadDoc(docId);
    if (latest?.formats.md?.rev !== baseRev) throw revChanged();
    throw error;
  }

  const title = extractTitle({ format: 'md', text, fileName: base.fileName });
  const totalBytes = revision.files.reduce((sum, file) => sum + file.bytes, 0);
  const outcome = await deps.activate(docId, {
    baseRev,
    rev,
    format: { rev, entry: MD_ENTRY, bytes: totalBytes, fileCount: revision.files.length },
    title,
    mdSync: mdSyncForPhoneSave(doc.mdSync, { origin: base.origin, entrySha256: baseEntry.sha256 }, rev),
    updatedAt: now,
  });
  if (outcome !== 'activated') {
    await deps.deleteRevision(docId, rev);
    if (outcome === 'gone') throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다(내렸을 수 있습니다).');
    throw revChanged();
  }

  deps.invalidate(docId);
  // 앞 판의 파일과 기록을 지운다 (J9: 새 판이 준비된 뒤)
  await deps.deleteRevision(docId, baseRev);
  // 색인 (J26·J38). 실패해도 저장은 끝난다(색인 채우기 스크립트로 다시 만든다)
  try {
    await deps.writeSearchIndex(docId, { rev, title, project: doc.project, text });
  } catch (error) {
    console.error(`[library] 검색 색인 쓰기 실패: ${docId}/${rev}`, error);
  }
  return { changed: true, rev };
}

// ---------- 운영 저장소 (Firestore, 서가 버킷) ----------

function createFirestorePhoneEditDeps(): PhoneEditDeps {
  const db = getServerDb();
  return {
    now: () => new Date(),
    loadDoc: getLibraryDoc,
    loadRevision: getRevision,
    createPendingRevision: (docId, revision) =>
      db.runTransaction(async (tx) => {
        const ref = libraryDocRef(docId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다(내렸을 수 있습니다).');
        const doc = parseStored(libraryDocSchema, '서가 문서', snapshot.data());
        const rev = doc.lastRev + 1;
        revisionSchema.parse(revision);
        tx.update(ref, { lastRev: rev });
        tx.create(revisionRef(docId, rev), revision);
        return rev;
      }),
    writeEntry: async (docId, rev, path, bytes, contentType) => {
      const bucket = getLibraryBucket();
      // 판 자리에 남은 파일(앞서 내린 같은 문서의 끊긴 올리기)을 먼저 지운다 (uploads.ts issueUploadUrlsWith와 같다)
      try {
        await bucket.deleteFiles({ prefix: revisionPrefix(docId, rev), force: true });
      } catch (error) {
        console.error(`[library] 판 자리 청소 실패: ${docId}/${rev}`, error);
      }
      await bucket.file(objectPath(docId, rev, path)).save(Buffer.from(bytes), {
        contentType,
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    },
    copyFile: async (docId, fromRev, toRev, path) => {
      const bucket = getLibraryBucket();
      await bucket.file(objectPath(docId, fromRev, path)).copy(bucket.file(objectPath(docId, toRev, path)));
    },
    activate: (docId, input) =>
      db.runTransaction(async (tx) => {
        const ref = libraryDocRef(docId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return 'gone' as const;
        const doc = parseStored(libraryDocSchema, '서가 문서', snapshot.data());
        if (!doc.formats.md) return 'gone' as const;
        if (doc.formats.md.rev !== input.baseRev || doc.lastRev !== input.rev) return 'rev-changed' as const;
        tx.update(ref, {
          'formats.md': input.format,
          title: input.title,
          updatedAt: input.updatedAt,
          mdSync: input.mdSync,
        });
        tx.update(revisionRef(docId, input.rev), { status: 'ready' });
        return 'activated' as const;
      }),
    deleteRevision: async (docId, rev) => {
      await deleteRevisionFiles(docId, rev);
      try {
        await revisionRef(docId, rev).delete();
      } catch (error) {
        console.error(`[library] 판 기록 삭제 실패: ${docId}/${rev}`, error);
      }
    },
    invalidate: invalidateRawState,
    writeSearchIndex: async (docId, input) => {
      await writeSearchIndexIfCurrent(docId, { ...input, format: 'md' });
    },
  };
}

export function savePhoneEdit(input: { docId: string; baseRev: number; text: string }): Promise<PhoneSaveResult> {
  return savePhoneEditWith(createFirestorePhoneEditDeps(), input);
}

// ---------- 고치기 화면이 읽는 것 ----------

export interface PhoneEditSource {
  doc: LibraryDoc;
  md: FormatState;
  text: string;
  tooLarge: boolean; // 참이면 글을 읽지 않았다(2 MB 넘음). 고치기 화면이 안내만 보인다
}

// 고치기 화면(/admin/library/d/{id}/edit)이 그릴 md 글. md 판이 없으면 null
export async function loadPhoneEditSource(docId: string): Promise<PhoneEditSource | null> {
  const doc = await getLibraryDoc(docId);
  const md = doc?.formats.md;
  if (!doc || !md) return null;
  const revision = await getRevision(docId, md.rev);
  const entry = revision?.files.find((file) => file.path === MD_ENTRY);
  if (!entry) throw new ApiError(500, 'CORRUPT_LIBRARY_DATA', '판에 진입 파일이 없습니다.');
  if (entry.bytes > MAX_PHONE_TEXT_BYTES) return { doc, md, text: '', tooLarge: true };
  const [buffer] = await getLibraryBucket().file(objectPath(docId, md.rev, MD_ENTRY)).download();
  return { doc, md, text: buffer.toString('utf8'), tooLarge: false };
}

// ---------- 맥 되돌리기가 부르는 것 (토큰 API, J41) ----------

// 폰 판 읽기 응답 (GET /api/library/token/docs/{id}/md)
export interface PhoneMdPayload {
  id: string;
  title: string;
  rev: number; // 지금 md 판
  origin: Revision['origin']; // 그 판을 만든 입구 (phone이면 폰 판)
  text: string;
  sha256: string; // 그 판 index.md의 해시
  macSha256: string | null; // 맥 원본에 있다고 아는 md 해시 (J39)
  pendingRev: number | null; // 아직 되돌리지 않은 폰 판 번호
  sourcePath: string | null; // 맥 원본 경로(~/…). 서가 화면 문서는 null
}

// 지금 md 판의 글과 되돌리기 상태. md 판이 없으면 null. 글이 2 MB를 넘으면 413
export async function readPhoneMd(docId: string): Promise<PhoneMdPayload | null> {
  const doc = await getLibraryDoc(docId);
  const md = doc?.formats.md;
  if (!doc || !md) return null;
  const revision = await getRevision(docId, md.rev);
  const entry = revision?.files.find((file) => file.path === MD_ENTRY);
  if (!revision || !entry) throw new ApiError(500, 'CORRUPT_LIBRARY_DATA', '판에 진입 파일이 없습니다.');
  if (entry.bytes > MAX_PHONE_TEXT_BYTES) throw new ApiError(413, 'TEXT_TOO_LARGE', 'md가 2 MB를 넘어 가져오지 않습니다.');
  const [buffer] = await getLibraryBucket().file(objectPath(docId, md.rev, MD_ENTRY)).download();
  return {
    id: docId,
    title: doc.title,
    rev: md.rev,
    origin: revision.origin,
    text: buffer.toString('utf8'),
    sha256: entry.sha256,
    macSha256: doc.mdSync?.macSha256 ?? null,
    pendingRev: doc.mdSync?.pendingRev ?? null,
    sourcePath: doc.sourcePath,
  };
}

// 되돌림 알림 (POST /api/library/token/docs/{id}/md/pulled { rev, sha256 })
// - 맥이 그 판의 글을 원본에 썼다(①) 또는 원본이 이미 그 글이었다(②). 원본 해시를 그 해시로, 폰 판을 없음으로 적는다.
// - 지금 md 판이 rev가 아니면 409 REV_CHANGED(그사이 다시 고쳤다). 해시가 그 판의 것이 아니면 400.
// - md 판이 없으면 false(404)
export async function markMdPulled(docId: string, report: { rev: number; sha256: string }): Promise<boolean> {
  const ref = libraryDocRef(docId);
  return getServerDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return false;
    const doc = parseStored(libraryDocSchema, '서가 문서', snapshot.data());
    const md = doc.formats.md;
    if (!md) return false;
    const revSnapshot = await tx.get(revisionRef(docId, md.rev));
    const revision = revSnapshot.exists ? parseStored(revisionSchema, '서가 판', revSnapshot.data()) : null;
    const entry = revision?.files.find((file) => file.path === MD_ENTRY);
    if (!entry) throw new ApiError(500, 'CORRUPT_LIBRARY_DATA', '판에 진입 파일이 없습니다.');
    const check = checkPulledReport({ rev: md.rev, entrySha256: entry.sha256 }, report);
    if (check === 'rev-changed') throw revChanged();
    if (check === 'sha-mismatch') throw new ApiError(400, 'SHA_MISMATCH', '알린 해시가 그 판의 md 해시와 다릅니다.');
    tx.update(ref, { mdSync: mdSyncAfterPull(report.sha256) });
    return true;
  });
}
