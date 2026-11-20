// 서가 검색 색인 읽기·쓰기 (서가 2단계 T2, Plan J26·J27)
// - Firestore library_search/{문서 id}: { title, project, md?, html?, updatedAt }. 서버(Admin SDK)만 읽고 쓴다.
//   firestore.rules에 맞는 규칙이 없어 클라이언트 SDK는 읽지 못한다(1단계 1.3절 3).
// - 목록 조회(listLibraryDocs)가 큰 글을 함께 읽지 않게 문서 기록과 따로 둔다.
// - 찾기: 색인 전체를 서버 메모리에 2분 둔다. 쓰기·지우기 뒤 같은 인스턴스는 바로 비운다.
//   제목·프로젝트는 서가 목록의 값(지금 값)을 쓴다. 색인의 title·project는 점검용이다.

import { getServerDb } from '@/lib/server/firebase-server';
import { invalidateMemo, memoize } from '@/lib/server/memo-cache';
import type { DocFormat } from '../rules';
import { searchDocs, searchTextOf, type SearchHit } from '../search';
import type { LibraryDocSummary } from './store';

export const SEARCH_COLLECTION = 'library_search';
const LIBRARY_DOCS_COLLECTION = 'library_docs';
const SEARCH_MEMO_KEY = 'library:search';
const SEARCH_MEMO_TTL_MS = 2 * 60_000;

// 문서 하나의 색인 글자
export interface SearchTexts {
  md?: string;
  html?: string;
}

function searchRef(docId: string) {
  return getServerDb().collection(SEARCH_COLLECTION).doc(docId);
}

// 형식 하나의 색인을 쓴다. 다른 형식의 글자는 그대로 둔다(merge). 그 판이 아직 지금 판일 때만 쓴다
// (서가 2단계 T5, PR-A 리뷰 Codex P2)
// - text는 진입 파일의 글(앞 5 MB)이다. 여기서 검색 글자를 뽑고 200 KB로 자른다.
// - 같은 형식의 두 판이 겹쳐 마무리되면 늦게 쓰는 옛 판 글이 색인에 남을 수 있었다.
//   한 트랜잭션에서 문서 기록의 formats.{형식}.rev를 읽고, 같을 때만 쓴다. 다르면 쓰지 않고 false다.
// - 문서 기록 컬렉션 이름은 store.ts의 LIBRARY_COLLECTION과 같다(store.ts가 이 파일을 가져오므로 돌아 가져오지 않는다).
export async function writeSearchIndexIfCurrent(
  docId: string,
  input: { title: string; project: string; format: DocFormat; rev: number; text: string },
): Promise<boolean> {
  const db = getServerDb();
  const docRef = db.collection(LIBRARY_DOCS_COLLECTION).doc(docId);
  const value = searchTextOf(input.format, input.text);
  const written = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    const current = snapshot.exists ? (snapshot.data()?.formats?.[input.format]?.rev as unknown) : undefined;
    if (current !== input.rev) return false;
    tx.set(searchRef(docId), { title: input.title, project: input.project, [input.format]: value, updatedAt: new Date() }, { merge: true });
    return true;
  });
  if (written) invalidateMemo(SEARCH_MEMO_KEY);
  return written;
}

// 문서 하나의 색인을 지운다 (서가에서 내릴 때)
export async function deleteSearchIndex(docId: string): Promise<void> {
  await searchRef(docId).delete();
  invalidateMemo(SEARCH_MEMO_KEY);
}

// 색인 전체 (메모리 2분)
export function loadSearchTexts(): Promise<Map<string, SearchTexts>> {
  return memoize(
    SEARCH_MEMO_KEY,
    async () => {
      const snapshot = await getServerDb().collection(SEARCH_COLLECTION).get();
      const texts = new Map<string, SearchTexts>();
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        texts.set(docSnap.id, {
          ...(typeof data.md === 'string' ? { md: data.md } : {}),
          ...(typeof data.html === 'string' ? { html: data.html } : {}),
        });
      }
      return texts;
    },
    SEARCH_MEMO_TTL_MS,
  );
}

// 서가 목록에서 찾는다 (J27)
// - 서가 목록(최근 문서 먼저)에 있는 문서만 찾는다. 내린 문서의 색인이 남아도 나오지 않는다.
// - 색인이 없는 문서(색인 채우기 전)는 제목으로만 찾는다.
export async function searchLibrary(docs: readonly LibraryDocSummary[], query: string): Promise<SearchHit[]> {
  const texts = await loadSearchTexts();
  return searchDocs(
    docs.map((doc) => ({ id: doc.id, title: doc.title, ...texts.get(doc.id) })),
    query,
  );
}
