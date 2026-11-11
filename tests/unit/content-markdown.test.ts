// 공유 마크다운 파이프라인 테스트 (재건 3단계 Plan 4.3, D1 정규화)
import { describe, expect, it } from 'vitest';
import {
  encodeDestination,
  markdownToHtml,
  normalizeForCompare,
  parseMarkdown,
} from '@/lib/content/markdown';

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

  it('하이라이터가 없으면 코드 블록은 민무늬이고 틀은 같다 (4단계 D8)', () => {
    const html = markdownToHtml('```js\nconst a = 1;\n```');
    expect(html).not.toContain('hljs');
    expect(html).toContain('<figure class="code-block" data-lang="js">');
    expect(html).toContain('<pre><code class="language-js">const a = 1;\n</code></pre>');
  });

  it('영상 확장자 이미지는 video, 외부 링크는 새 창, 원시 <br>은 그대로다', () => {
    const html = markdownToHtml(
      '![영상](https://x.y/a.webm)\n\n[밖](https://x.y) [안](/blog)\n\n가<br />나',
    );
    expect(html).toContain('<video src="https://x.y/a.webm"');
    expect(html).toContain('preload="metadata"');
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

describe('목적지 인코딩 encodeDestination (4단계 D14)', () => {
  it('보통 주소는 그대로, & 뒤에 글자가 와도 그대로다', () => {
    expect(encodeDestination('https://a.b/c?alt=media&token=1', false)).toBe(
      'https://a.b/c?alt=media&token=1',
    );
  });

  it('문자 참조를 이루는 &만 \\&로 쓴다', () => {
    expect(encodeDestination('https://a.b/?x=&amp;', false)).toBe('https://a.b/?x=\\&amp;');
    expect(encodeDestination('https://a.b/?x=&#38;&#x26;', false)).toBe(
      'https://a.b/?x=\\&#38;\\&#x26;',
    );
    expect(encodeDestination('https://a.b/?x=&amp', false)).toBe('https://a.b/?x=&amp');
  });

  it('공백·괄호·꺾쇠가 있으면 <…>로 감싼다', () => {
    expect(encodeDestination('https://a.b/c d', false)).toBe('<https://a.b/c d>');
    expect(encodeDestination('https://a.b/(c)', false)).toBe('<https://a.b/(c)>');
    expect(encodeDestination('https://a.b/<c>', false)).toBe('<https://a.b/\\<c\\>>');
  });

  it('빈 주소는 제목이 있을 때만 <>다', () => {
    expect(encodeDestination('', false)).toBe('');
    expect(encodeDestination('', true)).toBe('<>');
  });

  it('쓴 주소를 다시 읽으면 같은 주소다', () => {
    for (const url of [
      'https://a.b/?a=1&amp;b',
      'https://a.b/x\\(y',
      'https://a.b/ (1)',
      'https://a.b/\\',
    ]) {
      const tree = parseMarkdown(`[x](${encodeDestination(url, false)})`);
      const paragraph = tree.children[0];
      const link = paragraph.type === 'paragraph' ? paragraph.children[0] : null;
      expect(link?.type === 'link' ? link.url : null, url).toBe(url);
    }
  });
});

describe('리뷰 지적 (경미 3)', () => {
  it('주소의 줄바꿈은 문자 참조로 써서 다시 읽어도 같다', () => {
    for (const url of ['https://e.com/a\nb', 'https://e.com/a\r\nb']) {
      const encoded = encodeDestination(url, false);
      expect(encoded).not.toMatch(/[\r\n]/);
      const paragraph = parseMarkdown(`[x](${encoded})`).children[0];
      const node = paragraph.type === 'paragraph' ? paragraph.children[0] : null;
      expect(node?.type === 'link' ? node.url : null).toBe(url);
    }
  });
});

describe('normalizeForCompare 규칙 7: 블록 처음·끝 공백 (4단계 사용자 결정 2026-11-09)', () => {
  it('단락 끝·처음의 공백(문자 참조 포함)은 렌더에 보이지 않으므로 같다', () => {
    expect(normalizeForCompare('`코드`&#x20;')).toBe(normalizeForCompare('`코드`'));
    expect(normalizeForCompare('&#x20;가')).toBe(normalizeForCompare('가'));
    expect(normalizeForCompare('# 제목&#x20;')).toBe(normalizeForCompare('# 제목'));
    expect(normalizeForCompare('| a&#x20; |\n| - |\n| &#x20;b |')).toBe(
      normalizeForCompare('| a |\n| - |\n| b |'),
    );
    expect(normalizeForCompare('- 항목&#x20;')).toBe(normalizeForCompare('- 항목'));
  });

  it('블록 처음의 링크·강조 안 공백도 같다', () => {
    expect(normalizeForCompare('[&#x20;링크](https://e.com)')).toBe(
      normalizeForCompare('[링크](https://e.com)'),
    );
  });

  it('보이는 공백은 그대로 다르다 (NBSP, 이미지 옆, 인라인 코드 안, 단락 가운데)', () => {
    expect(normalizeForCompare('&nbsp;가')).not.toBe(normalizeForCompare('가'));
    expect(normalizeForCompare('![x](https://e.com/a.png) 가')).not.toBe(
      normalizeForCompare('![x](https://e.com/a.png)가'),
    );
    // CommonMark는 인라인 코드 양쪽 공백을 한 칸씩 지운다. 두 칸이면 한 칸이 남는다
    expect(normalizeForCompare('`  a  `')).not.toBe(normalizeForCompare('`a`'));
    expect(normalizeForCompare('가 나')).not.toBe(normalizeForCompare('가나'));
  });
});
