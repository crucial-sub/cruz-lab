// 링크 공유 서버 (서가 2단계 T8, Plan L7·J44~J47·J52·J53)
// - 공유 기록: Firestore library_shares/{공유 id}. 서버(Admin SDK)만 읽고 쓴다. firestore.rules에 규칙이 없어
//   클라이언트 SDK는 읽지 못한다(Plan 5.3). 끄면 revokedAt만 쓴다. 기록은 지우지 않는다(J44).
// - 공유 주소(/s/{공유 id}) 열기 판정, 문서 출처의 공유 확인(J47), 공유 만들기·목록·끄기(J53), 올리기 결과의 sharedBy(J52).
// - 범위 판정은 모두 share.ts의 shareCoversDoc 하나를 거친다.
// - 공유 기록과 공유 확인 결과는 서버 메모리에 60초 둔다. 그래서 끈 공유는 1분 안에 모든 서버에서 막힌다(C11).
//   끈 서버는 바로 비운다.
// - 저장소 접근은 ShareStoreDeps로 받는다. 운영은 firestoreShareDeps, 단위 테스트는 메모리 가짜를 쓴다.

import type { DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { isTimestampLike, toDateValue, type TimestampLike } from '@/lib/entry-schema';
import { ApiError } from '@/lib/server/api-response';
import { getServerDb } from '@/lib/server/firebase-server';
import { invalidateMemo, memoize } from '@/lib/server/memo-cache';
import { rawOpenUrl, rawTicketPixelUrl } from '../host';
import {
  docFolder,
  isShareId,
  newShareId,
  shareCoversDoc,
  shareExpiresAt,
  shareLabel,
  shareRemainingLabel,
  shareState,
  type ShareDuration,
  type SharedByEntry,
  type ShareScope,
} from '../share';
import { createShareTicket, isDocId } from '../ticket';
import { getLibraryDoc, hasReadyFormat, libraryDocSchema, libraryDocsRef, parseStored, type FormatState, type LibraryDoc } from './store';

export const SHARES_COLLECTION = 'library_shares';
// 공유 기록·공유 확인 결과를 메모리에 두는 시간 (J47: 끈 공유는 1분 안에 막힌다)
export const SHARE_CHECK_TTL_MS = 60_000;

// ---------- 저장 꼴 ----------

const timestampSchema = z.custom<TimestampLike>(isTimestampLike, { message: '시각 값이 아닙니다' });

const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('doc'), docId: z.string() }),
  z.object({ kind: z.literal('project'), project: z.string() }),
  z.object({ kind: z.literal('folder'), project: z.string(), folder: z.string() }),
]);

// 공유 기록 (5.3)
const shareRecordSchema = z.object({
  scope: scopeSchema,
  expiresAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});

// 판정에 쓰는 공유 기록 (시각은 밀리초)
export interface StoredShare {
  scope: ShareScope;
  expiresAtMs: number | null;
  revokedAtMs: number | null;
  createdAtMs: number;
}

// 문서 출처가 받는 공유 확인 결과: 끝나는 시각(끌 때까지는 null)
export interface ShareAccess {
  expiresAtMs: number | null;
}

// 서가 화면(관리자)이 보는 공유 하나
export interface ShareView {
  id: string;
  url: string; // 공유 주소 {블로그 출처}/s/{공유 id}
  scope: ShareScope;
  label: string; // 문서 제목, 프로젝트, "프로젝트 · 폴더"
  expiresAt: string | null; // ISO. 끌 때까지는 null
  remaining: string; // "7일 남음", "끌 때까지"
  createdAt: string;
}

// 올리기 결과의 경고 줄이 쓰는 공유 하나 (J52). 꼴은 share.ts SharedByEntry와 같다
export type SharedBy = SharedByEntry;

// 저장소 동작 (운영은 Firestore, 테스트는 메모리)
export interface ShareStoreDeps {
  now(): number;
  newId(): string;
  getShare(id: string): Promise<StoredShare | null>;
  getDoc(docId: string): Promise<LibraryDoc | null>;
  listDocs(): Promise<{ id: string; doc: LibraryDoc }[]>;
  listShares(): Promise<{ id: string; share: StoredShare }[]>; // 끄지 않은 공유 (끝난 것은 섞여 있다)
  createShare(id: string, share: StoredShare): Promise<void>; // 같은 id가 있으면 던진다
  revokeShare(id: string, atMs: number): Promise<boolean>; // 없으면 거짓. 이미 껐으면 그대로 참
}

// ---------- 판정 ----------

const isLive = (share: StoredShare, nowMs: number) => shareState(share, nowMs) === 'live';

// 판정에 쓰는 문서 정보 (폴더는 키에서 계산한다, J45)
function docInfo(id: string, doc: LibraryDoc) {
  return { id, project: doc.project, folder: docFolder(doc.key) };
}

// 문서 출처의 공유 확인 (J47): 공유가 살아 있고 문서가 범위 안이면 끝나는 시각
export async function checkShareAccessWith(deps: ShareStoreDeps, shareId: string, docId: string): Promise<ShareAccess | null> {
  if (!isShareId(shareId) || !isDocId(docId)) return null;
  const share = await deps.getShare(shareId);
  if (!share || !isLive(share, deps.now())) return null;
  // 문서 하나 공유는 문서를 읽지 않고 가른다
  if (share.scope.kind === 'doc' && share.scope.docId !== docId) return null;
  const doc = await deps.getDoc(docId);
  if (!doc || !shareCoversDoc(share.scope, docInfo(docId, doc))) return null;
  return { expiresAtMs: share.expiresAtMs };
}

// 공유 묶음 목록의 문서 한 줄
export interface ShareListItem {
  id: string;
  title: string;
  folder: string;
  docDate: string | null;
  formats: ('md' | 'html')[];
}

export type ShareOpenResult =
  | { kind: 'not-found' }
  | { kind: 'redirect'; location: string } // html: 공유 입장권으로 문서 출처에 302
  | {
      kind: 'md';
      shareId: string;
      bundle: boolean; // 참이면 묶음 공유 안의 문서다("← 목록"을 보인다)
      label: string; // 공유 이름 (og:title)
      docId: string;
      doc: LibraryDoc;
      md: FormatState;
      hasHtml: boolean;
      docOrigin: string;
      ticketPixelUrl: string; // 공유 입장권 그림 (그림보다 먼저 공유 쿠키를 받는다, J48)
    }
  | { kind: 'list'; shareId: string; label: string; docs: ShareListItem[] };

export interface ShareOpenDeps extends ShareStoreDeps {
  secret: string;
  docOrigin: string;
}

// 한국어 순서로 비교
const compareKo = (a: string, b: string) => a.localeCompare(b, 'ko');

// 공유 주소 요청 하나를 판정한다 (J46)
// - docId: /s/{공유 id}/d/{문서 id}의 문서 id. /s/{공유 id}면 null
// - view: 주소의 ?v= 값. 'html'이면 짝 문서에서 그림(html)을 연다
// - 없는 공유·끝난 공유·끈 공유·범위 밖 문서·없는 문서는 모두 not-found다(어떤 공유·문서가 있는지 드러내지 않는다)
export async function resolveShareOpenWith(
  deps: ShareOpenDeps,
  shareId: string | undefined,
  docId: string | null | undefined,
  view: string | null | undefined,
): Promise<ShareOpenResult> {
  if (!isShareId(shareId)) return { kind: 'not-found' };
  const share = await deps.getShare(shareId);
  if (!share || !isLive(share, deps.now())) return { kind: 'not-found' };
  const { scope } = share;

  // 묶음 공유의 첫 화면: 범위 안 문서 목록 (폴더·제목 순)
  if (!docId && scope.kind !== 'doc') {
    const docs = (await deps.listDocs())
      .filter(({ id, doc }) => hasReadyFormat(doc) && shareCoversDoc(scope, docInfo(id, doc)))
      .map(({ id, doc }) => ({
        id,
        title: doc.title,
        folder: docFolder(doc.key),
        docDate: doc.docDate,
        formats: (['md', 'html'] as const).filter((format) => doc.formats[format]),
      }))
      .sort((a, b) => compareKo(a.folder, b.folder) || compareKo(a.title, b.title));
    return { kind: 'list', shareId, label: shareLabel(scope), docs };
  }

  const targetId = docId ?? (scope.kind === 'doc' ? scope.docId : null);
  if (!isDocId(targetId)) return { kind: 'not-found' };
  if (scope.kind === 'doc' && scope.docId !== targetId) return { kind: 'not-found' };
  const doc = await deps.getDoc(targetId);
  if (!doc || !shareCoversDoc(scope, docInfo(targetId, doc))) return { kind: 'not-found' };
  const { md, html } = doc.formats;
  if (!md && !html) return { kind: 'not-found' };

  const ticket = createShareTicket(targetId, shareId, deps.now(), deps.secret);
  if (!md || (html && view === 'html')) return { kind: 'redirect', location: rawOpenUrl(deps.docOrigin, ticket) };
  return {
    kind: 'md',
    shareId,
    bundle: scope.kind !== 'doc',
    label: shareLabel(scope, doc.title),
    docId: targetId,
    doc,
    md,
    hasHtml: Boolean(html),
    docOrigin: deps.docOrigin,
    ticketPixelUrl: rawTicketPixelUrl(deps.docOrigin, ticket),
  };
}

// ---------- 관리 (J53) ----------

const toIso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function shareUrl(siteOrigin: string, shareId: string): string {
  return `${siteOrigin}/s/${shareId}`;
}

function toView(deps: ShareStoreDeps, id: string, share: StoredShare, siteOrigin: string, docTitle: string | null): ShareView {
  return {
    id,
    url: shareUrl(siteOrigin, id),
    scope: share.scope,
    label: shareLabel(share.scope, docTitle),
    expiresAt: toIso(share.expiresAtMs),
    remaining: shareRemainingLabel(share.expiresAtMs, deps.now()),
    createdAt: new Date(share.createdAtMs).toISOString(),
  };
}

// 문서 하나 공유의 이름(문서 제목)을 읽는다. 내린 문서면 null
async function titleFor(deps: ShareStoreDeps, scope: ShareScope): Promise<string | null> {
  if (scope.kind !== 'doc') return null;
  return (await deps.getDoc(scope.docId))?.title ?? null;
}

// 공유를 만든다. 범위 안에 문서가 하나도 없으면 404 (없는 문서·틀린 이름을 공유하지 않는다)
export async function createShareWith(
  deps: ShareStoreDeps,
  scope: ShareScope,
  duration: ShareDuration,
  siteOrigin: string,
): Promise<ShareView> {
  let docTitle: string | null = null;
  if (scope.kind === 'doc') {
    const doc = await deps.getDoc(scope.docId);
    if (!doc || !hasReadyFormat(doc)) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
    docTitle = doc.title;
  } else {
    const docs = await deps.listDocs();
    if (!docs.some(({ id, doc }) => hasReadyFormat(doc) && shareCoversDoc(scope, docInfo(id, doc)))) {
      throw new ApiError(404, 'NOT_FOUND', '공유할 범위 안에 문서가 없습니다.');
    }
  }
  const now = deps.now();
  const share: StoredShare = { scope, expiresAtMs: shareExpiresAt(duration, now), revokedAtMs: null, createdAtMs: now };
  const id = deps.newId();
  await deps.createShare(id, share);
  return toView(deps, id, share, siteOrigin, docTitle);
}

// 살아 있는 공유 목록 (공유 중 칸). 최근 만든 것부터
export async function listLiveSharesWith(deps: ShareStoreDeps, siteOrigin: string): Promise<ShareView[]> {
  const now = deps.now();
  const live = (await deps.listShares()).filter(({ share }) => isLive(share, now));
  live.sort((a, b) => b.share.createdAtMs - a.share.createdAtMs);
  return Promise.all(live.map(async ({ id, share }) => toView(deps, id, share, siteOrigin, await titleFor(deps, share.scope))));
}

// 공유를 끈다. 없는 공유면 거짓
export async function revokeShareWith(deps: ShareStoreDeps, shareId: string): Promise<boolean> {
  if (!isShareId(shareId)) return false;
  return deps.revokeShare(shareId, deps.now());
}

// 이 문서를 덮는 살아 있는 공유 (J52: 올리기 결과의 경고 줄)
export async function sharesCoveringDocWith(deps: ShareStoreDeps, docId: string): Promise<SharedBy[]> {
  const doc = await deps.getDoc(docId);
  if (!doc) return [];
  const now = deps.now();
  const info = docInfo(docId, doc);
  return (await deps.listShares())
    .filter(({ share }) => isLive(share, now) && shareCoversDoc(share.scope, info))
    .map(({ id, share }) => ({ id, kind: share.scope.kind, label: shareLabel(share.scope, doc.title) }));
}

// ---------- 운영 저장소 (Firestore) ----------

function sharesRef() {
  return getServerDb().collection(SHARES_COLLECTION);
}

const millis = (value: TimestampLike | null) => (value ? toDateValue(value).getTime() : null);

function fromRecord(data: DocumentData | undefined): StoredShare {
  const record = parseStored(shareRecordSchema, '서가 공유', data);
  return {
    scope: record.scope as ShareScope,
    expiresAtMs: millis(record.expiresAt),
    revokedAtMs: millis(record.revokedAt),
    createdAtMs: millis(record.createdAt) ?? 0,
  };
}

// 메모리 캐시 키: 공유 하나에 딸린 키는 모두 같은 접두사다(끄면 함께 비운다)
const sharePrefix = (shareId: string) => `library:share:${shareId}:`;

export const firestoreShareDeps: ShareStoreDeps = {
  now: () => Date.now(),
  newId: () => newShareId(),
  getShare: (id) =>
    memoize(
      `${sharePrefix(id)}record`,
      async () => {
        const snapshot = await sharesRef().doc(id).get();
        return snapshot.exists ? fromRecord(snapshot.data()) : null;
      },
      SHARE_CHECK_TTL_MS,
    ),
  getDoc: getLibraryDoc,
  listDocs: async () => {
    const snapshot = await libraryDocsRef().orderBy('updatedAt', 'desc').limit(1000).get();
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, doc: parseStored(libraryDocSchema, '서가 문서', docSnap.data()) }));
  },
  listShares: async () => {
    const snapshot = await sharesRef().where('revokedAt', '==', null).get();
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, share: fromRecord(docSnap.data()) }));
  },
  createShare: async (id, share) => {
    await sharesRef()
      .doc(id)
      .create({
        scope: share.scope,
        expiresAt: share.expiresAtMs === null ? null : new Date(share.expiresAtMs),
        revokedAt: null,
        createdAt: new Date(share.createdAtMs),
      });
  },
  revokeShare: async (id, atMs) => {
    const ref = sharesRef().doc(id);
    const found = await getServerDb().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return false;
      if (fromRecord(snapshot.data()).revokedAtMs === null) tx.update(ref, { revokedAt: new Date(atMs) });
      return true;
    });
    // 이 서버의 메모리는 바로 비운다. 다른 서버는 60초 안에 낡은 값이 끝난다
    invalidateMemo(sharePrefix(id));
    return found;
  },
};

// 문서 출처가 부른다(raw.ts). 결과를 메모리에 60초 둔다
export function checkShareAccess(shareId: string, docId: string): Promise<ShareAccess | null> {
  return memoize(
    `${sharePrefix(shareId)}doc:${docId}`,
    () => checkShareAccessWith(firestoreShareDeps, shareId, docId),
    SHARE_CHECK_TTL_MS,
  );
}

// 올리기 마무리 응답의 sharedBy (J52). 공유가 꺼져 있으면 빈 목록이다. 읽기에 실패해도 올리기는 끝난다(빈 목록, 기록만)
export async function sharedByForUpload(docId: string, shareEnabled: boolean): Promise<SharedBy[]> {
  if (!shareEnabled) return [];
  try {
    return await sharesCoveringDocWith(firestoreShareDeps, docId);
  } catch (error) {
    console.error(`[library] 공유 중 확인 실패: ${docId}`, error);
    return [];
  }
}
