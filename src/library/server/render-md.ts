// md 뷰어 렌더 (서가 1단계 T7, Plan J12)
// - 블로그와 같은 공유 파이프라인(renderMarkdown)으로 그린다. 타이포그래피·목차·코드 색이 블로그 글과 같다.
// - 문서 안 상대 경로 그림·영상은 문서 출처 주소({문서 출처}/d/{문서 id}/{경로})로 바꾼다. 경로 풀이는 올리기의
//   빠진 자산 검사와 같은 resolveRef다. 그래서 올린 파일 경로와 그림 주소가 맞는다.
// - 바꾼 주소는 data-src에 둔다(mediaUrl.defer). 그림 요청에 문서 쿠키가 실려야 하므로, 페이지가 입장권 그림을
//   먼저 불러 쿠키를 받은 뒤 src로 옮긴다. 공유 파이프라인에는 주소 바꾸기 옵션 하나만 더했다(블로그는 주지 않는다).
// - 앞머리(---)는 지운다. 제목 뽑기(rules.ts titleFromMarkdown)와 같은 규칙이다.
// - 링크(a)는 바꾸지 않는다. md 문서 사이 링크를 서가 주소로 바꾸는 일은 2단계 검토다(Plan 2.3).

import { renderMarkdown, type CodeHighlighter, type MarkdownRenderResult } from '@/lib/content/markdown';
import { getServerHighlighter } from '@/lib/server/code-highlighter';
import { memoize } from '@/lib/server/memo-cache';
import { rawDocPath } from '../host';
import { resolveRef } from '../refs';
import { stripFrontmatter } from '../rules';
import { getLibraryBucket, objectPath, type FormatState } from './store';

// md 뷰어가 그릴 것: 렌더 결과 + 본문 첫 h1
export interface LibraryMarkdownView extends MarkdownRenderResult {
  // 본문이 # 제목으로 시작하면 그 h1 요소(html에서는 뺐다). 뷰어가 제목 자리(목차 위)에 둔다. 아니면 null
  titleHtml: string | null;
}

// 같은 판의 렌더 결과를 다시 쓰는 시간 (판이 바뀌면 키가 바뀐다)
const MD_VIEW_TTL_MS = 10 * 60_000;

// 문서 안 상대 경로 → 문서 출처 주소. 문서 밖·다른 서버·특수 주소는 null(그대로 둔다)
// - 쿼리와 조각(#)은 뗀다. 문서 출처는 경로만 본다.
// - 경로 조각마다 주소용으로 인코딩한다. 문서 출처(raw.ts)가 디코딩해 같은 경로를 찾는다.
export function libraryMediaUrl(docOrigin: string, docId: string): (url: string) => string | null {
  return (url) => {
    const resolved = resolveRef('', url);
    if (resolved.kind !== 'local') return null;
    const encoded = resolved.path.split('/').map(encodeURIComponent).join('/');
    return `${docOrigin}${rawDocPath(docId, encoded)}`;
  };
}

// 맨 앞 앞머리를 지우는 규칙은 rules.ts에 있다(검색 색인과 같이 쓴다). 여기서 다시 내보낸다
export { stripFrontmatter };

// md 글자 → md 뷰어 렌더 결과 (I/O 없음)
export function renderLibraryMarkdown(
  markdown: string,
  input: { docOrigin: string; docId: string; highlighter?: CodeHighlighter },
): LibraryMarkdownView {
  const rendered = renderMarkdown(stripFrontmatter(markdown), {
    highlighter: input.highlighter,
    mediaUrl: { rewrite: libraryMediaUrl(input.docOrigin, input.docId), defer: true },
  });
  return { ...rendered, ...splitLeadingTitle(rendered.html) };
}

// 렌더 결과가 h1로 시작하면 그 h1을 떼어 낸다 (h1 안에 h1은 없으므로 첫 </h1>이 그 끝이다)
function splitLeadingTitle(html: string): { titleHtml: string | null; html: string } {
  if (!html.startsWith('<h1')) return { titleHtml: null, html };
  const end = html.indexOf('</h1>');
  if (end < 0) return { titleHtml: null, html };
  const cut = end + '</h1>'.length;
  return { titleHtml: html.slice(0, cut), html: html.slice(cut) };
}

// 서가 버킷에서 md 판의 진입 파일을 읽어 그린다. 같은 판이면 메모리 결과를 쓴다
export function loadLibraryMarkdownView(docId: string, md: FormatState, docOrigin: string): Promise<LibraryMarkdownView> {
  return memoize(
    `library:md:${docId}:${md.rev}`,
    async () => {
      const [buffer] = await getLibraryBucket().file(objectPath(docId, md.rev, md.entry)).download();
      const markdown = buffer.toString('utf8');
      // 하이라이터를 만들지 못했으면 코드는 민무늬다(code-highlighter.ts)
      const highlighter = await getServerHighlighter(markdown);
      return renderLibraryMarkdown(markdown, { docOrigin, docId, highlighter: highlighter ?? undefined });
    },
    MD_VIEW_TTL_MS,
  );
}
