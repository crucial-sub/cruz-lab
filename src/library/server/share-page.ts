// 공유 주소 페이지 공용 (서가 2단계 T8, Plan J46·J48·J49·J50)
// - /s/{공유 id}, /s/{공유 id}/d/{문서 id}가 같이 쓴다. 로그인 없이 연다(미들웨어가 관리자 검사를 하지 않는다).
// - 공유 스위치가 꺼지면(J50) 모든 공유 주소가 404다. 없는 공유·끝난 공유·끈 공유·범위 밖 문서와 같은 화면이다.
// - 응답 머리(J49): 검색 엔진 제외, 리퍼러 없음, 저장하지 않음. 페이지가 applyShareHeaders로 붙인다.

import { docOriginFor } from '../host';
import { assertSecret } from '../ticket';
import { libraryShareEnabled } from './api';
import { loadLibraryMarkdownView, type LibraryMarkdownView } from './render-md';
import { firestoreShareDeps, resolveShareOpenWith, type ShareOpenDeps, type ShareOpenResult } from './shares';

// 공유 응답 머리 (J49)
export const SHARE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
};

export function applyShareHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SHARE_RESPONSE_HEADERS)) headers.set(name, value);
}

// 공유 주소 하나의 공유 주소 접두사 (/s/{공유 id}). md 링크가 이 아래로 간다(J48)
export const shareBasePath = (shareId: string) => `/s/${shareId}`;

export type SharePageResult =
  | { kind: 'not-found' }
  | { kind: 'redirect'; location: string }
  | { kind: 'list'; open: Extract<ShareOpenResult, { kind: 'list' }> }
  // view가 null이면 md 파일을 읽지 못했다(500 안내)
  | { kind: 'md'; open: Extract<ShareOpenResult, { kind: 'md' }>; view: LibraryMarkdownView | null };

// 운영 의존성. 입장권 비밀값이나 문서 출처 설정이 없으면 던진다
function createShareOpenDeps(requestUrl: URL): ShareOpenDeps {
  const docOrigin = docOriginFor(import.meta.env.LIBRARY_DOC_HOST, requestUrl.protocol, Boolean(import.meta.env.DEV));
  if (!docOrigin) throw new Error('LIBRARY_DOC_HOST 설정이 없거나 호스트 꼴이 아닙니다.');
  return { ...firestoreShareDeps, secret: assertSecret(import.meta.env.LIBRARY_TICKET_SECRET), docOrigin };
}

// 공유 주소 페이지가 그릴 것을 정한다. 설정 오류는 던진다(페이지가 503으로 알린다)
export async function loadSharePage(
  requestUrl: URL,
  shareId: string | undefined,
  docId: string | null,
): Promise<SharePageResult> {
  if (!libraryShareEnabled()) return { kind: 'not-found' };
  const open = await resolveShareOpenWith(createShareOpenDeps(requestUrl), shareId, docId, requestUrl.searchParams.get('v'));
  if (open.kind === 'not-found' || open.kind === 'redirect') return open;
  if (open.kind === 'list') return { kind: 'list', open };
  let view: LibraryMarkdownView | null = null;
  try {
    view = await loadLibraryMarkdownView(open.docId, open.doc.key, open.md, open.docOrigin, shareBasePath(open.shareId));
  } catch (error) {
    console.error(`[library] 공유 md 문서 읽기 실패: ${open.docId}`, error);
  }
  return { kind: 'md', open, view };
}
