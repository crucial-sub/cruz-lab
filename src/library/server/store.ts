// 서가 데이터 읽기·쓰기 (서가 1단계 T4, Plan 5.3·L4)
// - Firestore library_docs/{문서 id}와 그 아래 revisions/{판}. 서버(Admin SDK)만 읽고 쓴다.
//   firestore.rules에 맞는 규칙이 없어 클라이언트 SDK는 읽지 못한다(1.3절 3).
// - 파일은 새 비공개 버킷(LIBRARY_BUCKET)의 {문서 id}/{판}/{파일 경로}에 둔다.
//   다운로드 토큰을 만들지 않는다. 읽기는 서버와 단기 서명 주소로만 한다(1.3절 2).
// - 블로그 데이터(entries, assets)와 기본 버킷은 건드리지 않는다.

import type { DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { isTimestampLike, toDateValue, type TimestampLike } from '@/lib/entry-schema';
import { ApiError, zodIssues } from '@/lib/server/api-response';
import { getServerDb, getServerStorage } from '@/lib/server/firebase-server';
import { invalidateMemo } from '@/lib/server/memo-cache';
import type { DocFormat } from '../rules';

export const LIBRARY_COLLECTION = 'library_docs';
export const REVISIONS_SUBCOLLECTION = 'revisions';

// ---------- 저장 꼴 ----------

const timestampSchema = z.custom<TimestampLike>(isTimestampLike, { message: '시각 값이 아닙니다' });

// 형식 하나의 지금 판
const formatStateSchema = z.object({
  rev: z.number().int().positive(),
  entry: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  fileCount: z.number().int().positive(),
});
export type FormatState = z.infer<typeof formatStateSchema>;

// 문서 하나 (5.3)
// - lastRev: 판 번호를 매기는 셈값. 판 번호는 형식과 상관없이 문서 안에서 하나씩 는다
export const libraryDocSchema = z.object({
  key: z.string().min(1),
  sourcePath: z.string().nullable(),
  project: z.string().min(1),
  title: z.string(),
  docDate: z.string().nullable(),
  formats: z.object({ md: formatStateSchema.optional(), html: formatStateSchema.optional() }),
  lastRev: z.number().int().nonnegative(),
  readAt: timestampSchema.nullable(),
  uploadedAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type LibraryDoc = z.infer<typeof libraryDocSchema>;

// 판 하나에 든 파일
export const revisionFileSchema = z.object({
  path: z.string().min(1),
  contentType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RevisionFile = z.infer<typeof revisionFileSchema>;

// 판 하나 (5.3)
// - origin: mac(맥 입구), web(서가 화면), phone(2단계 폰 고치기, L6)
// - fileName: 원본 파일 이름. 제목을 뽑지 못했을 때 쓴다(J13)
export const revisionSchema = z.object({
  format: z.enum(['md', 'html']),
  origin: z.enum(['mac', 'web', 'phone']),
  status: z.enum(['pending', 'ready']),
  files: z.array(revisionFileSchema).min(1),
  fileName: z.string(),
  createdAt: timestampSchema,
});
export type Revision = z.infer<typeof revisionSchema>;

// 저장된 값을 스키마로 읽는다. 깨진 문서면 500
export function parseStored<T extends z.ZodType>(schema: T, what: string, data: DocumentData | undefined): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(500, 'CORRUPT_LIBRARY_DATA', `저장된 ${what}가 스키마와 맞지 않습니다.`, zodIssues(result.error));
  }
  return result.data;
}

// ---------- 참조 ----------

export function libraryDocsRef() {
  return getServerDb().collection(LIBRARY_COLLECTION);
}

export function libraryDocRef(docId: string) {
  return libraryDocsRef().doc(docId);
}

export function revisionRef(docId: string, rev: number) {
  return libraryDocRef(docId).collection(REVISIONS_SUBCOLLECTION).doc(String(rev));
}

// 서가 버킷 이름 (LIBRARY_BUCKET). 없으면 던진다
export function getLibraryBucketName(): string {
  const name = import.meta.env.LIBRARY_BUCKET;
  if (typeof name !== 'string' || !name.trim()) {
    throw new ApiError(503, 'LIBRARY_NOT_CONFIGURED', 'LIBRARY_BUCKET 설정이 없습니다.');
  }
  return name.trim();
}

export function getLibraryBucket() {
  return getServerStorage().bucket(getLibraryBucketName());
}

// 판 하나의 파일 접두사와 파일 경로
export function revisionPrefix(docId: string, rev: number): string {
  return `${docId}/${rev}/`;
}

export function objectPath(docId: string, rev: number, path: string): string {
  return `${revisionPrefix(docId, rev)}${path}`;
}

// 문서 출처가 읽는 판 정보의 메모리 캐시 키 (raw.ts). 마무리·내리기 뒤 바로 비운다
export function rawStateKey(docId: string): string {
  return `library:raw:${docId}`;
}

export function invalidateRawState(docId: string): void {
  invalidateMemo(rawStateKey(docId));
}

// ---------- 응답 꼴 ----------

export interface LibraryDocSummary {
  id: string;
  title: string;
  project: string;
  docDate: string | null;
  formats: { md?: FormatState; html?: FormatState };
  unread: boolean;
  readAt: string | null;
  uploadedAt: string;
  updatedAt: string;
  url: string; // 서가 문서 주소 (J7). QR 코드와 북마크가 쓴다
}

const toIso = (value: TimestampLike | null): string | null => (value ? toDateValue(value).toISOString() : null);

// 서가 문서 주소: {블로그 출처}/admin/library/d/{문서 id}
export function libraryDocUrl(siteOrigin: string, docId: string): string {
  return `${siteOrigin}/admin/library/d/${docId}`;
}

export function summarize(id: string, doc: LibraryDoc, siteOrigin: string): LibraryDocSummary {
  return {
    id,
    title: doc.title,
    project: doc.project,
    docDate: doc.docDate,
    formats: doc.formats,
    unread: doc.readAt === null,
    readAt: toIso(doc.readAt),
    uploadedAt: toIso(doc.uploadedAt) ?? '',
    updatedAt: toIso(doc.updatedAt) ?? '',
    url: libraryDocUrl(siteOrigin, id),
  };
}

// 올린 형식이 하나라도 있는가 (처음 올리다 만 문서는 목록에 보이지 않는다)
export function hasReadyFormat(doc: LibraryDoc): boolean {
  return Boolean(doc.formats.md || doc.formats.html);
}

// ---------- 읽기 ----------

// 문서 하나. 없거나 아직 올린 형식이 없으면 null
export async function getLibraryDoc(docId: string): Promise<LibraryDoc | null> {
  const snapshot = await libraryDocRef(docId).get();
  if (!snapshot.exists) return null;
  const doc = parseStored(libraryDocSchema, '서가 문서', snapshot.data());
  return hasReadyFormat(doc) ? doc : null;
}

// 판 하나. 없으면 null
export async function getRevision(docId: string, rev: number): Promise<Revision | null> {
  const snapshot = await revisionRef(docId, rev).get();
  return snapshot.exists ? parseStored(revisionSchema, '서가 판', snapshot.data()) : null;
}

// 서가 목록: 올린 형식이 있는 문서, 최근 올린 것부터 (J14)
export async function listLibraryDocs(siteOrigin: string): Promise<LibraryDocSummary[]> {
  const snapshot = await libraryDocsRef().orderBy('updatedAt', 'desc').limit(1000).get();
  const docs: LibraryDocSummary[] = [];
  for (const docSnap of snapshot.docs) {
    const doc = parseStored(libraryDocSchema, '서가 문서', docSnap.data());
    if (hasReadyFormat(doc)) docs.push(summarize(docSnap.id, doc, siteOrigin));
  }
  return docs;
}

// ---------- 쓰기 ----------

// 문서를 읽음으로 표시한다(처음 연 시각). 문서가 없으면 false
export async function markLibraryDocRead(docId: string): Promise<boolean> {
  const ref = libraryDocRef(docId);
  return getServerDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return false;
    const doc = parseStored(libraryDocSchema, '서가 문서', snapshot.data());
    if (!hasReadyFormat(doc)) return false;
    if (doc.readAt === null) tx.update(ref, { readAt: new Date() });
    return true;
  });
}

// 판 하나의 파일을 모두 지운다 (실패는 기록만 남긴다. 남은 파일은 다음 내리기·정리 때 지운다)
export async function deleteRevisionFiles(docId: string, rev: number): Promise<void> {
  try {
    await getLibraryBucket().deleteFiles({ prefix: revisionPrefix(docId, rev), force: true });
  } catch (error) {
    console.error(`[library] 판 파일 삭제 실패: ${docId}/${rev}`, error);
  }
}

// 내리기가 쓰는 저장소 동작 (테스트는 메모리 저장소를 넣는다)
export interface RemoveDocDeps {
  docExists(docId: string): Promise<boolean>;
  // 접두사 아래 파일을 모두 지운다. 하나라도 실패하면 던진다
  deleteFiles(prefix: string): Promise<void>;
  deleteRevisionRecords(docId: string): Promise<void>;
  deleteDocRecord(docId: string): Promise<void>;
  invalidate(docId: string): void;
}

// 서가에서 내린다: 판 파일 → 판 기록 → 문서 기록 순서로 지운다. 문서가 없으면 false (PR #35 리뷰 의견 1·2)
// - 문서 기록을 마지막에 지운다. 중간에 실패하면 던지고 뒤 단계를 하지 않는다.
//   문서 기록(판 번호 셈값 lastRev 포함)이 남으므로 다시 내리기가 남은 것을 이어 지우고,
//   다시 올리기는 이어지는 판 번호를 받아 남은 판 기록과 겹치지 않는다.
// - 파일을 먼저 지우므로, 내리는 사이 다시 올린 판이 "준비됨"이 된 뒤 늦은 파일 삭제에 지워지는 일이 없다.
//   겹쳐 올린 쪽은 마무리 때 판 기록이나 문서 기록이 없어 404로 끝난다.
// - 지우는 동안(보통 1초 안) 문서는 목록에 보이고, 열면 파일이 없어 404일 수 있다(받아들임).
export async function removeLibraryDocWith(deps: RemoveDocDeps, docId: string): Promise<boolean> {
  if (!(await deps.docExists(docId))) return false;
  try {
    await deps.deleteFiles(`${docId}/`);
    await deps.deleteRevisionRecords(docId);
    await deps.deleteDocRecord(docId);
  } finally {
    // 파일을 지우기 시작했으면 문서 출처의 판 정보 캐시는 이미 낡았다
    deps.invalidate(docId);
  }
  return true;
}

// Firestore·서가 버킷으로 지운다
const firestoreRemoveDeps: RemoveDocDeps = {
  docExists: async (docId) => (await libraryDocRef(docId).get()).exists,
  deleteFiles: async (prefix) => {
    await getLibraryBucket().deleteFiles({ prefix, force: true });
  },
  deleteRevisionRecords: async (docId) => {
    const revisions = await libraryDocRef(docId).collection(REVISIONS_SUBCOLLECTION).listDocuments();
    const db = getServerDb();
    for (let i = 0; i < revisions.length; i += 400) {
      const batch = db.batch();
      for (const revRef of revisions.slice(i, i + 400)) batch.delete(revRef);
      await batch.commit();
    }
  },
  deleteDocRecord: async (docId) => {
    await libraryDocRef(docId).delete();
  },
  invalidate: invalidateRawState,
};

export function removeLibraryDoc(docId: string): Promise<boolean> {
  return removeLibraryDocWith(firestoreRemoveDeps, docId);
}

// 이 문서의 형식 하나의 지금 판
export function currentRevision(doc: LibraryDoc, format: DocFormat): FormatState | null {
  return doc.formats[format] ?? null;
}
