// 서가 문서 주소의 열기 판정 (서가 1단계 Plan J7·J14)
// - /admin/library/d/{문서 id}가 부른다. 관리자 세션 검사는 미들웨어가 먼저 한다(J3: 로그아웃이면 로그인 화면).
// - md 판이 있으면: md 뷰어(T7)다. md·html 짝이어도 글(md)이 기본이다(사용자 결정 2026-11-18, 안 A).
//   입장권(1분)을 만들어 입장권 그림 주소(&pixel=1)를 준다. 뷰어 페이지가 이 그림으로 문서 쿠키를 먼저 받는다(J12).
// - html 판만 있거나 짝에서 ?v=html(그림)이면: 입장권을 만들어 문서 출처의 /d/_open?t=로 보낸다(J6 독립 페이지).
// - 어느 쪽이든 읽음을 표시한다. 입장권을 먼저 만든다(비밀값 설정이 틀리면 읽음 표시 전에 던진다).
// - id 꼴이 틀리거나 없는 문서면 404다.
// - 저장소 접근은 DocOpenDeps로 받는다. 운영은 createDocOpenDeps(), 단위 테스트는 가짜를 쓴다.

import { docOriginFor, rawOpenUrl, rawTicketPixelUrl } from '../host';
import { assertSecret, createTicket, isDocId } from '../ticket';
import { getLibraryDoc, markLibraryDocRead, type FormatState, type LibraryDoc } from './store';

// 주소의 ?v= 값. 'html'이면 짝 문서에서 그림(html)을 연다. 그 밖은 기본(글이 있으면 글)
export const DOC_VIEW_PARAM = 'v';

export type DocOpenResult =
  | { kind: 'not-found' }
  | { kind: 'redirect'; location: string }
  | {
      kind: 'md';
      doc: LibraryDoc;
      md: FormatState;
      hasHtml: boolean; // 참이면 "글 | 그림" 전환을 보인다
      docOrigin: string; // 그림 주소를 바꿀 문서 출처
      ticketPixelUrl: string; // 문서 쿠키를 받는 입장권 그림 ({문서 출처}/d/_open?t=…&pixel=1)
    };

export interface DocOpenDeps {
  now(): number;
  secret: string;
  docOrigin: string; // 문서 출처 (https://raw.cruzlab.dev)
  loadDoc(docId: string): Promise<LibraryDoc | null>;
  markRead(docId: string): Promise<unknown>;
}

// 서가 문서 주소 요청 하나를 판정한다 (view: 주소의 ?v= 값)
export async function resolveDocOpen(
  docId: string | undefined,
  deps: DocOpenDeps,
  view?: string | null,
): Promise<DocOpenResult> {
  if (!isDocId(docId)) return { kind: 'not-found' };
  const doc = await deps.loadDoc(docId);
  if (!doc) return { kind: 'not-found' };
  const { md, html } = doc.formats;
  const openHtml = Boolean(html) && (!md || view === 'html');

  // 입장권을 먼저 만든다. 비밀값 설정이 틀리면 읽음 표시 전에 던진다
  const ticket = createTicket(docId, deps.now(), deps.secret);
  try {
    await deps.markRead(docId);
  } catch (error) {
    // 읽음 표시보다 문서를 여는 일이 먼저다. 실패는 기록만 남긴다
    console.error(`[library] 읽음 표시 실패: ${docId}`, error);
  }
  if (openHtml || !md) return { kind: 'redirect', location: rawOpenUrl(deps.docOrigin, ticket) };
  return {
    kind: 'md',
    doc,
    md,
    hasHtml: Boolean(html),
    docOrigin: deps.docOrigin,
    ticketPixelUrl: rawTicketPixelUrl(deps.docOrigin, ticket),
  };
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
