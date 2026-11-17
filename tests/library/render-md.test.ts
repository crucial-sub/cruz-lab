// 서가 md 뷰어 렌더 테스트 (서가 1단계 T7, Plan J12)
// - 상대 경로 그림·영상은 문서 출처 주소(/d/{문서 id}/{경로})로 바꾼다. 경로 풀이는 올리기와 같은 resolveRef를 쓴다.
// - 바꾼 주소는 data-src에 둔다. 페이지가 입장권 그림으로 문서 쿠키를 받은 뒤 src로 옮긴다.
// - 앞머리(---)는 지운다. 제목 뽑기(titleFromMarkdown)와 같은 규칙이다.
import { describe, expect, it } from 'vitest';
import { libraryMediaUrl, renderLibraryMarkdown, stripFrontmatter } from '@/library/server/render-md';

const ORIGIN = 'https://raw.cruzlab.dev';
const DOC = 'a1b2c3d4e5f6a7b8c9d0';
const rewrite = libraryMediaUrl(ORIGIN, DOC);

describe('libraryMediaUrl: 문서 안 상대 경로 → 문서 출처 주소', () => {
  it('상대 경로를 문서 출처 주소로 바꾼다', () => {
    expect(rewrite('img/a.png')).toBe(`${ORIGIN}/d/${DOC}/img/a.png`);
    expect(rewrite('./img/a.png')).toBe(`${ORIGIN}/d/${DOC}/img/a.png`);
    expect(rewrite('img/../b.png')).toBe(`${ORIGIN}/d/${DOC}/b.png`);
  });

  it('경로 조각을 주소용으로 인코딩한다(한글, 공백, 이미 인코딩된 글자)', () => {
    expect(rewrite('그림/첫 화면.png')).toBe(
      `${ORIGIN}/d/${DOC}/${encodeURIComponent('그림')}/${encodeURIComponent('첫 화면.png')}`,
    );
    expect(rewrite('img/a%20b.png')).toBe(`${ORIGIN}/d/${DOC}/img/a%20b.png`);
  });

  it('쿼리와 조각(#)은 뗀다(문서 출처는 경로만 본다)', () => {
    expect(rewrite('img/a.png?v=2#top')).toBe(`${ORIGIN}/d/${DOC}/img/a.png`);
  });

  it('문서 밖·다른 서버·특수 주소는 바꾸지 않는다', () => {
    for (const url of ['../x.png', '/abs.png', 'https://e.com/a.png', '//e.com/a.png', '#x', 'data:image/png;base64,AA', '']) {
      expect(rewrite(url)).toBeNull();
    }
  });
});

describe('stripFrontmatter', () => {
  it('맨 앞 앞머리를 지운다', () => {
    expect(stripFrontmatter('---\ntitle: x\n---\n# 제목\n본문')).toBe('# 제목\n본문');
    expect(stripFrontmatter('\uFEFF---\r\ntitle: x\r\n---\r\n# 제목')).toBe('# 제목');
  });

  it('앞머리가 없거나 닫히지 않으면 그대로 둔다', () => {
    expect(stripFrontmatter('# 제목\n\n---\n\n끝')).toBe('# 제목\n\n---\n\n끝');
    expect(stripFrontmatter('---\n열기만 함')).toBe('---\n열기만 함');
  });
});

describe('renderLibraryMarkdown', () => {
  it('상대 그림을 data-src의 문서 출처 주소로 그린다. 바깥 그림은 src 그대로다', () => {
    const { html } = renderLibraryMarkdown('# 제목\n\n![a](img/a.png)\n\n![b](https://cdn.example/b.png)', {
      docOrigin: ORIGIN,
      docId: DOC,
    });
    expect(html).toContain(`data-src="${ORIGIN}/d/${DOC}/img/a.png"`);
    expect(html).toContain('src="https://cdn.example/b.png"');
  });

  it('앞머리를 지우고 그린다', () => {
    const { html } = renderLibraryMarkdown('---\ntitle: x\n---\n# 제목', { docOrigin: ORIGIN, docId: DOC });
    expect(html).not.toContain('title: x');
    expect(html).not.toContain('<hr>');
  });

  it('본문이 # 제목으로 시작하면 그 h1을 떼어 titleHtml로 준다(뷰어가 제목 자리에 둔다)', () => {
    const view = renderLibraryMarkdown('# 제목 **굵게**\n\n본문', { docOrigin: ORIGIN, docId: DOC });
    // 제목 앵커 앞 공백은 NBSP다(rehype-headings)
    expect(view.titleHtml).toMatch(/^<h1 id="[^"]+">제목 <strong>굵게<\/strong>\u00a0<a class="heading-anchor".*<\/h1>$/);
    expect(view.html).toBe('\n<p>본문</p>');
  });

  it('본문이 # 제목으로 시작하지 않으면 titleHtml은 null이고 본문은 그대로다', () => {
    for (const markdown of ['본문\n\n# 제목', '## 소제목']) {
      const view = renderLibraryMarkdown(markdown, { docOrigin: ORIGIN, docId: DOC });
      expect(view.titleHtml).toBeNull();
      expect(view.html).toContain(markdown.startsWith('본문') ? '<h1' : '<h2');
    }
  });

  it('h2·h3 목차를 준다', () => {
    const { toc } = renderLibraryMarkdown('# 제목\n\n## 하나\n\n### 둘', { docOrigin: ORIGIN, docId: DOC });
    expect(toc.map((entry) => [entry.depth, entry.text])).toEqual([
      [2, '하나'],
      [3, '둘'],
    ]);
  });
});
