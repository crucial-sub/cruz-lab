// 공유 마크다운 파이프라인 테스트 (재건 3단계 Plan 4.3, D1 정규화)
import { describe, expect, it } from 'vitest';
import { markdownToHtml, normalizeForCompare, parseMarkdown } from '@/lib/content/markdown';

describe('normalizeForCompare (D1 정규화 규칙)', () => {
  it('규칙 1: ZWSP를 지운다', () => {
    expect(normalizeForCompare('가\u200b나 **굵게**\u200b다')).toBe(
      normalizeForCompare('가나 **굵게**다'),
    );
  });

  it('규칙 2: 단락 사이에 홀로 있는 <br>을 지운다', () => {
    expect(normalizeForCompare('가\n\n<br />\n\n나')).toBe(normalizeForCompare('가\n\n나'));
    expect(normalizeForCompare('가\n\n</br>\n\n나')).toBe(normalizeForCompare('가\n\n나'));
  });

  it('규칙 2는 줄 안의 <br>을 지우지 않는다', () => {
    expect(normalizeForCompare('가<br />나')).not.toBe(normalizeForCompare('가나'));
    expect(normalizeForCompare('가<br />나')).toBe(normalizeForCompare('가\\\n나'));
  });

  it('규칙 3: 공백 묶음을 공백 하나로 합친다 (줄 안 줄바꿈 포함)', () => {
    expect(normalizeForCompare('가\n나   다\t라')).toBe(normalizeForCompare('가 나 다 라'));
    expect(normalizeForCompare('**굵게**\n**또**')).toBe(normalizeForCompare('**굵게** **또**'));
  });

  it('규칙 4: 코드 블록 안은 정규화하지 않는다', () => {
    expect(normalizeForCompare('```\na  b\n```')).not.toBe(normalizeForCompare('```\na b\n```'));
    expect(normalizeForCompare('`a  b`')).not.toBe(normalizeForCompare('`a b`'));
  });

  it('표기가 달라도 렌더가 같으면 같다 (글머리, 구분선, 강조 기호)', () => {
    expect(normalizeForCompare('* 하나\n* 둘\n\n***\n\n__굵게__ _기울임_')).toBe(
      normalizeForCompare('- 하나\n- 둘\n\n---\n\n**굵게** *기울임*'),
    );
  });

  it('렌더가 다르면 다르다 (느슨한 목록, 시작 번호, 제목 단계, 이미지 제목, NBSP)', () => {
    expect(normalizeForCompare('- 하나\n- 둘')).not.toBe(normalizeForCompare('- 하나\n\n- 둘'));
    expect(normalizeForCompare('1. 하나')).not.toBe(normalizeForCompare('3. 하나'));
    expect(normalizeForCompare('## 제목')).not.toBe(normalizeForCompare('### 제목'));
    expect(normalizeForCompare('![a](x.png "t")')).not.toBe(normalizeForCompare('![a](x.png)'));
    expect(normalizeForCompare('가 나')).not.toBe(normalizeForCompare('가 나'));
  });
});

describe('parseMarkdown', () => {
  it('remark-gfm과 remark-math를 쓴다', () => {
    const root = parseMarkdown('| a |\n|---|\n| 1 |\n\n$x$ ~~d~~');
    expect(root.children[0]?.type).toBe('table');
    const paragraph = root.children[1];
    expect(paragraph?.type).toBe('paragraph');
    const types =
      paragraph && 'children' in paragraph ? paragraph.children.map((child) => child.type) : [];
    expect(types).toContain('inlineMath');
    expect(types).toContain('delete');
  });
});

describe('markdownToHtml', () => {
  it('콜아웃을 div.callout으로 그리고 표시 줄을 지운다', () => {
    const html = markdownToHtml('> [!note]\n> 본문');
    expect(html).toContain('class="callout callout-note"');
    expect(html).toContain('data-callout="note"');
    expect(html).toContain('<p>본문</p>');
    expect(html).not.toContain('[!note]');
  });

  it('모르는 콜아웃 종류는 보통 인용이다', () => {
    const html = markdownToHtml('> [!danger]\n> 본문');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('[!danger]');
  });

  it('지원 주소 단락을 iframe으로 바꾼다 (허용 호스트만)', () => {
    const youtube = markdownToHtml('https://youtu.be/dQw4w9WgXcQ');
    expect(youtube).toContain('<iframe');
    expect(youtube).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(youtube).toContain('loading="lazy"');
    expect(youtube).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
    expect(youtube).toContain('referrerpolicy="strict-origin"');
    expect(youtube).toContain('class="embed embed-youtube"');

    const sandbox = markdownToHtml('https://codesandbox.io/s/new');
    expect(sandbox).toContain('src="https://codesandbox.io/embed/new"');
  });

  it('지원하지 않는 주소나 설명이 있는 링크는 링크 그대로다', () => {
    expect(markdownToHtml('https://example.com/x')).not.toContain('<iframe');
    expect(markdownToHtml('https://example.com/x')).toContain('<a href="https://example.com/x"');
    expect(markdownToHtml('[설명](https://youtu.be/dQw4w9WgXcQ)')).not.toContain('<iframe');
    expect(markdownToHtml('앞 글자 https://youtu.be/dQw4w9WgXcQ')).not.toContain('<iframe');
  });

  it('수식을 KaTeX로 그린다', () => {
    const html = markdownToHtml('$x^2$\n\n$$\ny\n$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
  });

  it('코드 블록을 highlight.js 클래스로 그린다', () => {
    const html = markdownToHtml('```js\nconst a = 1;\n```');
    expect(html).toContain('hljs');
    expect(html).toContain('language-js');
  });

  it('영상 확장자 이미지는 video, 외부 링크는 새 창, 원시 <br>은 그대로다', () => {
    const html = markdownToHtml(
      '![영상](https://x.y/a.webm)\n\n[밖](https://x.y) [안](/blog)\n\n가<br />나',
    );
    expect(html).toContain('<video src="https://x.y/a.webm"');
    expect(html).toContain(
      '<a href="https://x.y" target="_blank" rel="noopener noreferrer">밖</a>',
    );
    expect(html).toContain('<a href="/blog">안</a>');
    expect(html).toContain('가<br>나');
  });
});

describe('리뷰 지적 수정 (PR-A 6.1)', () => {
  // 지적 6: 공개 페이지(react-markdown defaultUrlTransform)처럼 위험한 프로토콜을 막는다
  it('javascript:·data: 주소는 비운다', () => {
    expect(markdownToHtml('[x](javascript:alert(1))')).toContain('<a href="">x</a>');
    expect(markdownToHtml('![x](data:text/html,abc)')).toContain('<img src=""');
    expect(markdownToHtml('[x](https://a.b) [y](/blog) [z](mailto:a@b.c) [w](#id)')).toContain(
      'href="https://a.b"',
    );
    expect(markdownToHtml('[y](/blog)')).toContain('href="/blog"');
    expect(markdownToHtml('[z](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
    expect(markdownToHtml('[w](#id)')).toContain('href="#id"');
    expect(markdownToHtml('![v](JavaScript:alert(1).webm)')).not.toContain('JavaScript:');
  });

  // 지적 7b: 정규화도 브라우저처럼 ZWSP 옆 줄바꿈을 지운다
  it('규칙 1 보완: ZWSP 옆의 줄바꿈은 공백이 되지 않는다', () => {
    expect(normalizeForCompare('가​\n나')).toBe(normalizeForCompare('가나'));
    expect(normalizeForCompare('가​\n나')).not.toBe(normalizeForCompare('가 나'));
    expect(normalizeForCompare('가\n​나')).toBe(normalizeForCompare('가나'));
  });
});
