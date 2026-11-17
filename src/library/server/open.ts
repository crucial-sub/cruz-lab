// 서가 문서 주소의 열기 판정 (서가 1단계 Plan J7·J14)
// - /admin/library/d/{문서 id}가 부른다. 관리자 세션 검사는 미들웨어가 먼저 한다(J3: 로그아웃이면 로그인 화면).
// - html 판이 있으면: 입장권(1분)을 만들고, 읽음을 표시하고, 문서 출처의 /d/_open?t=로 보낸다(J6 독립 페이지).
//   md 판과 짝이어도 html을 연다. "글 / 그림" 전환은 T7에서 붙인다.
// - md 판만 있으면: T7(md 뷰어) 전까지 안내 화면이다(사용자 결정 2026-11-18, 안 A). 읽음을 표시하지 않는다.
// - id 꼴이 틀리거나 없는 문서면 404다.
// - 저장소 접근은 DocOpenDeps로 받는다. 운영은 createDocOpenDeps(), 단위 테스트는 가짜를 쓴다.

import { docOriginFor, rawOpenUrl } from '../host';
import { assertSecret, createTicket, isDocId } from '../ticket';
import { getLibraryDoc, markLibraryDocRead, type LibraryDoc } from './store';

export type DocOpenResult =
  | { kind: 'not-found' }
  | { kind: 'redirect'; location: string }
  | { kind: 'md-pending'; doc: LibraryDoc };

export interface DocOpenDeps {
  now(): number;
  secret: string;
  docOrigin: string; // 문서 출처 (https://raw.cruzlab.dev)
  loadDoc(docId: string): Promise<LibraryDoc | null>;
  markRead(docId: string): Promise<unknown>;
}

// 서가 문서 주소 요청 하나를 판정한다
export async function resolveDocOpen(docId: string | undefined, deps: DocOpenDeps): Promise<DocOpenResult> {
  if (!isDocId(docId)) return { kind: 'not-found' };
  const doc = await deps.loadDoc(docId);
  if (!doc) return { kind: 'not-found' };
  if (!doc.formats.html) return { kind: 'md-pending', doc };

  // 입장권을 먼저 만든다. 비밀값 설정이 틀리면 읽음 표시 전에 던진다
  const ticket = createTicket(docId, deps.now(), deps.secret);
  try {
    await deps.markRead(docId);
  } catch (error) {
    // 읽음 표시보다 문서를 여는 일이 먼저다. 실패는 기록만 남긴다
    console.error(`[library] 읽음 표시 실패: ${docId}`, error);
  }
  return { kind: 'redirect', location: rawOpenUrl(deps.docOrigin, ticket) };
}

// 운영 의존성을 만든다. 입장권 비밀값이나 문서 출처 설정이 없으면 던진다
export function createDocOpenDeps(requestUrl: URL): DocOpenDeps {
  const docOrigin = docOriginFor(import.meta.env.LIBRARY_DOC_HOST, requestUrl.protocol, Boolean(import.meta.env.DEV));
  if (!docOrigin) throw new Error('LIBRARY_DOC_HOST 설정이 없거나 호스트 꼴이 아닙니다.');
  return {
    now: () => Date.now(),
    secret: assertSecret(import.meta.env.LIBRARY_TICKET_SECRET),
    docOrigin,
    loadDoc: getLibraryDoc,
    markRead: markLibraryDocRead,
  };
}
