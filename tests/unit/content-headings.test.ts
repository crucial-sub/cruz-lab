// 제목 id·앵커·목차 테스트 (재건 4단계 D16)
import { describe, expect, it } from 'vitest';
import { markdownToHtml, renderMarkdown } from '@/lib/content/markdown';

describe('제목 id (github-slugger)', () => {
  it('한글을 지키고 공백은 -, 문장 부호는 지운다', () => {
    const html = markdownToHtml('## 큐(Queue)란 무엇인가?');
    expect(html).toContain('<h2 id="큐queue란-무엇인가">');
  });

  it('같은 제목은 -1, -2가 붙는다', () => {
    const { toc } = renderMarkdown('## 예제\n\n## 예제\n\n### 예제');
    expect(toc.map((entry) => entry.id)).toEqual(['예제', '예제-1', '예제-2']);
  });

  it('페이지 요소 id(main-content 등)와 겹치지 않는다', () => {
    const { toc } = renderMarkdown('## main content\n\n## post title');
    expect(toc.map((entry) => entry.id)).toEqual(['main-content-1', 'post-title-1']);
  });

  it('h1·h4도 id를 받지만 목차에는 h2·h3만 들어간다', () => {
    const { html, toc } = renderMarkdown('# 하나\n\n## 둘\n\n### 셋\n\n#### 넷');
    expect(html).toContain('<h1 id="하나">');
    expect(html).toContain('<h4 id="넷">');
    expect(toc).toEqual([
      { depth: 2, id: '둘', text: '둘' },
      { depth: 3, id: '셋', text: '셋' },
    ]);
  });

  it('원시 HTML 제목도 id를 받는다 (원래 id는 덮어쓴다)', () => {
    const { html, toc } = renderMarkdown('<h2 id="x">원시 제목</h2>');
    expect(html).toContain('<h2 id="원시-제목">');
    expect(toc).toHaveLength(1);
  });

  it('글자가 없는 제목은 section id다', () => {
    const { toc } = renderMarkdown('## ![](https://e.com/a.png)');
    expect(toc[0]).toMatchObject({ id: 'section', text: '(제목 없음)' });
  });
});

describe('목차 글자', () => {
  it('인라인 코드·굵게·링크·수식은 글자만 남는다', () => {
    const { toc } = renderMarkdown('## `map`과 **reduce** [링크](https://e.com) $O(n)$');
    expect(toc[0].text).toBe('map과 reduce 링크 O(n)');
  });

  it('앵커의 # 글자는 목차에 들어가지 않는다', () => {
    const { toc } = renderMarkdown('## 제목');
    expect(toc[0].text).toBe('제목');
  });
});

describe('제목 앵커', () => {
  it('제목 끝에 자기 id로 가는 링크를 더한다', () => {
    const html = markdownToHtml('## 큐');
    expect(html).toBe(
      '<h2 id="큐">큐\u00a0<a class="heading-anchor" href="#큐" aria-label="제목 링크: 큐">#</a></h2>',
    );
  });

  it('각주 머리(section[data-footnotes])는 건드리지 않는다', () => {
    const { html, toc } = renderMarkdown('본문[^1]\n\n[^1]: 각주');
    expect(html).toContain('id="footnote-label"');
    expect(toc).toHaveLength(0);
  });
});

describe('수식 여부', () => {
  it('KaTeX 결과가 있을 때만 hasMath', () => {
    expect(renderMarkdown('$x$').hasMath).toBe(true);
    expect(renderMarkdown('가격은 \\$5와 \\$10이다').hasMath).toBe(false);
    expect(renderMarkdown('```js\nconst c = "class=\\"katex\\"";\n```').hasMath).toBe(false);
  });
});

describe('리뷰 지적 (경미 2·4·5)', () => {
  it('slug가 비는 제목(이모지·문장 부호만)은 section id다', () => {
    const { toc } = renderMarkdown('## 🚀\n\n## ???\n\n## !!!');
    expect(toc.map((entry) => entry.id)).toEqual(['section', 'section-1', 'section-2']);
    expect(toc[0].text).toBe('🚀');
  });

  it('본문 제목이 각주 머리 id(footnote-label)를 가져가지 않는다', () => {
    const { html } = renderMarkdown('## Footnote label\n\n본문[^1]\n\n[^1]: 각주');
    expect(html.match(/id="footnote-label"/g)).toHaveLength(1);
    expect(html).toContain('<h2 id="footnote-label-1">');
  });

  it('제목 안 각주 번호는 목차 글자와 id에 들어가지 않는다', () => {
    const { toc } = renderMarkdown('## Foo[^1]\n\n[^1]: 각주');
    expect(toc[0]).toMatchObject({ id: 'foo', text: 'Foo' });
  });
});

describe('id 접두사 (4단계 PR-B 리뷰 경미 5, /notes 스트림)', () => {
  it('제목 id·앵커, 각주 id·주소·aria-describedby에 접두사를 붙인다. 글자는 그대로다', () => {
    const markdown = '## 제목\n\n본문[^1]\n\n```html\n<a id="x" href="#y">코드</a>\n```\n\n[^1]: 각주';
    const { html, toc } = renderMarkdown(markdown, { idPrefix: 'n-a-' });
    expect(html).toContain('<h2 id="n-a-제목">');
    expect(html).toContain('href="#n-a-제목"');
    expect(html).toContain('id="n-a-user-content-fnref-1"');
    expect(html).toContain('href="#n-a-user-content-fn-1"');
    expect(html).toContain('aria-describedby="n-a-footnote-label"');
    expect(html).toContain('id="n-a-footnote-label"');
    // 태그 속성의 id는 모두 접두사가 있다
    expect(html).not.toMatch(/<[^>]* id="(?!n-a-)/);
    // 코드 블록 안의 글자는 바꾸지 않는다
    expect(html).toContain('&#x3C;a id="x" href="#y">');
    // 목차는 접두사 전 id다(스트림은 목차를 쓰지 않는다)
    expect(toc[0].id).toBe('제목');
  });

  it('접두사가 없으면 그대로다', () => {
    expect(markdownToHtml('## 제목')).toContain('<h2 id="제목">');
  });
});

