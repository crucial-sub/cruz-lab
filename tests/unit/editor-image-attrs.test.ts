// 이미지 폭·정렬 테스트 (재건 5단계 D13)
// - 원시 HTML 두 모양 읽기·거부·쓰기, 왕복, "이미지만 있는 단락" 판정, 스키마 속성, 에디터 데코레이션, 끌기 폭 계산
import { getSchema, type JSONContent } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { DecorationSet } from '@tiptap/pm/view';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '@/editor/extensions';
import { docToMarkdown, markdownToDoc } from '@/editor/markdown';
import {
  canHoldImageLayout,
  imageHtml,
  IMAGE_WIDTH_MAX,
  IMAGE_WIDTH_MIN,
  normalizeImageAlign,
  normalizeImageWidth,
  parseImageHtml,
  soloImageIndex,
  type InlineShape,
} from '@/editor/markdown/image-html';
import {
  createImageLayoutPlugin,
  dragDelta,
  dragImageWidth,
  imageLayoutDecorations,
  imageLayoutKey,
  isSoloImageAt,
  SOLO_IMAGE_CLASS,
  soloImageStateAt,
  type SoloImageSpec,
} from '@/editor/ui/image-layout';
import { normalizeForCompare } from '@/lib/content/markdown';

const schema = getSchema(createEditorExtensions());

// 문서 JSON이 에디터 스키마에 맞는지
function assertValidDoc(doc: JSONContent) {
  schema.nodeFromJSON(doc).check();
}

const t = (text: string, marks?: JSONContent['marks']): JSONContent =>
  marks ? { type: 'text', text, marks } : { type: 'text', text };
const p = (...content: JSONContent[]): JSONContent =>
  content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
const img = (attrs: Record<string, unknown>, marks?: JSONContent['marks']): JSONContent =>
  marks ? { type: 'image', attrs, marks } : { type: 'image', attrs };
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

// 마크다운 첫 블록의 첫 인라인
function firstInline(markdown: string): JSONContent | undefined {
  return markdownToDoc(markdown).doc.content?.[0]?.content?.[0];
}

describe('읽기: 두 모양만 이미지 노드다', () => {
  it('폭만: <img …> 하나. 속성은 지금 모양에 width만 더한다', () => {
    const { doc: result, warnings } = markdownToDoc(
      '<img src="https://e.com/a.png" alt="그림" title="캡션" width="600">',
    );
    expect(warnings).toEqual([]);
    expect(result).toEqual(
      doc(p(img({ src: 'https://e.com/a.png', alt: '그림', title: '캡션', width: 600 }))),
    );
    assertValidDoc(result);
  });

  it('속성 순서·따옴표 종류·/>·대소문자를 가리지 않는다', () => {
    const expected = { src: 'x.png', alt: 'a b', title: null, width: 320 };
    for (const markdown of [
      '<img width="320" alt="a b" src="x.png">',
      "<img src='x.png' alt='a b' width='320'>",
      '<img src=x.png alt="a b" width=320>',
      '<img src="x.png" alt="a b" width="320" />',
      '<img src="x.png" alt="a b" width="320"/>',
      '<IMG SRC="x.png" ALT="a b" WIDTH="320">',
    ]) {
      expect(firstInline(markdown), markdown).toEqual(img(expected));
    }
  });

  it('정렬: <p align="…"> + <img> + </p>. 여러 줄도 읽는다', () => {
    expect(firstInline('<p align="center"><img src="x.png" alt="가운데" width="480"></p>')).toEqual(
      img({ src: 'x.png', alt: '가운데', title: null, width: 480, align: 'center' }),
    );
    expect(firstInline('<p align="center">\n  <img src="x.png" width="480">\n</p>')).toEqual(
      img({ src: 'x.png', alt: null, title: null, width: 480, align: 'center' }),
    );
    expect(firstInline('<p align=\'RIGHT\'><img src="x.png" alt=""></p >')).toEqual(
      img({ src: 'x.png', alt: '', title: null, align: 'right' }),
    );
  });

  it('align="left"는 기본값이라 정렬을 두지 않는다', () => {
    expect(firstInline('<p align="left"><img src="x.png" alt="" width="200"></p>')).toEqual(
      img({ src: 'x.png', alt: '', title: null, width: 200 }),
    );
  });

  it('문자 참조를 푼다 (&amp; &lt; &gt; &quot; &#39; 숫자 참조)', () => {
    const image = parseImageHtml(
      '<img src="https://e.com/?a=1&amp;b=2" alt="&lt;그림&gt; &quot;x&quot; &#39;y&#39; &#65;&#x42;" width="600">',
    );
    expect(image).toEqual({
      src: 'https://e.com/?a=1&b=2',
      alt: '<그림> "x" \'y\' AB',
      title: null,
      width: 600,
      align: null,
    });
  });

  it('참조가 아닌 &는 그대로다 (Storage 주소의 &token=)', () => {
    const src = 'https://firebasestorage.googleapis.com/v0/b/b/o/a.png?alt=media&token=1-2';
    expect(parseImageHtml(`<img src="${src}" alt="" width="600">`)?.src).toBe(src);
  });

  it('세미콜론 없는 이름 참조로 읽힐 글자가 있으면 읽지 않는다(리뷰 S9). 주소의 &이름=은 받는다', () => {
    expect(parseImageHtml('<img src="x" alt="&lt b" width="600">')).toBeNull();
    expect(parseImageHtml('<img src="x?a=1&b" alt="" width="600">')).toBeNull();
    expect(parseImageHtml('<img src="x?a=1&b=2&c=3" alt="& 그림" width="600">')?.src).toBe(
      'x?a=1&b=2&c=3',
    );
  });

  it('목록 항목·인용·콜아웃 첫 블록 안에서도 읽는다', () => {
    const list = markdownToDoc('- <img src="x" alt="" width="600">\n- 둘').doc;
    expect(list.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]).toMatchObject({
      type: 'image',
      attrs: { width: 600 },
    });
    const quote = markdownToDoc('> <p align="center"><img src="x" alt=""></p>').doc;
    expect(quote.content?.[0]).toMatchObject({ type: 'blockquote' });
    expect(quote.content?.[0]?.content?.[0]?.content?.[0]?.attrs?.align).toBe('center');
    const callout = markdownToDoc('> [!note]\n>\n> <img src="x" alt="" width="200">').doc;
    expect(callout.content?.[0]).toMatchObject({ type: 'callout', attrs: { type: 'note' } });
    expect(callout.content?.[0]?.content?.[0]?.content?.[0]?.attrs?.width).toBe(200);
    for (const result of [list, quote, callout]) assertValidDoc(result);
  });
});

describe('거부: 다른 속성·모양은 지금처럼 경고 + 글자다', () => {
  const rejected = [
    // 모르는 속성
    '<img src="x" width="600" height="300">',
    '<img src="x" class="wide" width="600">',
    '<img src="x" onerror="alert(1)">',
    // 같은 속성 두 번
    '<img src="x" src="y" width="600">',
    '<img src="x" width="100" WIDTH="200">',
    // src 없음·빈 src
    '<img alt="a" width="600">',
    '<img src="" width="600">',
    // 폭이 정수가 아니거나 범위 밖
    `<img src="x" width="${IMAGE_WIDTH_MIN - 1}">`,
    `<img src="x" width="${IMAGE_WIDTH_MAX + 1}">`,
    '<img src="x" width="60%">',
    '<img src="x" width="600px">',
    '<img src="x" width="12.5">',
    '<img src="x" width>',
    // 링크로 감싼 이미지, 다른 태그
    '<a href="https://e.com"><img src="x" width="600"></a>',
    '<figure><img src="x" width="600"></figure>',
    '<div align="center"><img src="x"></div>',
    '<p class="c"><img src="x"></p>',
    '<p><img src="x" width="600"></p>',
    '<p align="justify"><img src="x"></p>',
    '<p align="center" class="c"><img src="x"></p>',
    '<p align="center"><img src="x"><img src="y"></p>',
    '<p align="center">글 <img src="x"></p>',
    '<p align="center"><img src="x" width="600">',
    // 모르는 이름 참조, 쓸 수 없는 숫자 참조
    '<img src="x" alt="a&nbsp;b" width="600">',
    '<img src="x" alt="&#0;" width="600">',
    // 태그 뒤에 다른 글자
    '<img src="x" width="600"> 뒤',
  ];

  for (const markdown of rejected) {
    it(markdown, () => {
      expect(parseImageHtml(markdown)).toBeNull();
      const { doc: result, warnings } = markdownToDoc(markdown);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.every((warning) => warning.code === 'unsupported-html')).toBe(true);
      expect(JSON.stringify(result)).not.toContain('"type":"image"');
      assertValidDoc(result);
    });
  }

  it('블록 HTML은 원문 그대로 글자 단락이 된다', () => {
    const markdown = '<img src="x" width="600" height="300">';
    const { doc: result, warnings } = markdownToDoc(markdown);
    expect(warnings).toEqual([
      {
        code: 'unsupported-html',
        message: '지원하지 않는 HTML은 텍스트로 남습니다',
        detail: markdown,
      },
    ]);
    expect(result).toEqual(doc(p(t(markdown))));
  });

  it('단락 안(줄 안)의 <img>는 블록이 아니라 읽지 않는다', () => {
    const { warnings } = markdownToDoc('글 <img src="x" width="600">');
    expect(warnings).toHaveLength(1);
  });
});

describe('값 맞추기', () => {
  it('폭: 16~4096 정수만. 숫자만 있는 글자도 받는다', () => {
    expect(normalizeImageWidth(600)).toBe(600);
    expect(normalizeImageWidth('600')).toBe(600);
    expect(normalizeImageWidth(' 600 ')).toBe(600);
    expect(normalizeImageWidth(IMAGE_WIDTH_MIN)).toBe(IMAGE_WIDTH_MIN);
    expect(normalizeImageWidth(IMAGE_WIDTH_MAX)).toBe(IMAGE_WIDTH_MAX);
    for (const value of [15, 4097, 12.5, '600px', '50%', '', null, undefined, Number.NaN, '1e3']) {
      expect(normalizeImageWidth(value), String(value)).toBeNull();
    }
  });

  it('정렬: center·right만 남는다. left는 null', () => {
    expect(normalizeImageAlign('center')).toBe('center');
    expect(normalizeImageAlign('RIGHT')).toBe('right');
    for (const value of ['left', 'justify', '', null, 1]) {
      expect(normalizeImageAlign(value), String(value)).toBeNull();
    }
  });
});

describe('쓰기: 폭·정렬이 있을 때만 원시 HTML 한 줄', () => {
  const base = { src: 'x.png', alt: '그림', title: null, width: null, align: null } as const;

  it('폭만 → <img …> (src alt title width 순서)', () => {
    expect(imageHtml({ ...base, width: 600 })).toBe('<img src="x.png" alt="그림" width="600">');
    expect(imageHtml({ ...base, title: '캡션', width: 600 })).toBe(
      '<img src="x.png" alt="그림" title="캡션" width="600">',
    );
  });

  it('정렬만 → <p align><img></p>', () => {
    expect(imageHtml({ ...base, align: 'center' })).toBe(
      '<p align="center"><img src="x.png" alt="그림"></p>',
    );
  });

  it('둘 다', () => {
    expect(imageHtml({ ...base, title: '캡션', width: 480, align: 'right' })).toBe(
      '<p align="right"><img src="x.png" alt="그림" title="캡션" width="480"></p>',
    );
  });

  it('alt는 늘 쓴다(없으면 빈 값). title은 값이 있을 때만', () => {
    expect(imageHtml({ ...base, alt: null, width: 600 })).toBe(
      '<img src="x.png" alt="" width="600">',
    );
  });

  it('& < > " 와 줄바꿈을 문자 참조로 쓴다. 다시 읽으면 같은 값이다', () => {
    const image = {
      src: 'https://e.com/?a=1&b="2"',
      alt: '<그림> & "따옴표"\n둘째 줄',
      title: "작은'따옴표",
      width: 600,
      align: 'center' as const,
    };
    const html = imageHtml(image);
    expect(html).toBe(
      '<p align="center"><img src="https://e.com/?a=1&amp;b=&quot;2&quot;" alt="&lt;그림&gt; &amp; &quot;따옴표&quot;&#10;둘째 줄" title="작은\'따옴표" width="600"></p>',
    );
    expect(html).not.toContain('\n');
    expect(parseImageHtml(html)).toEqual(image);
  });

  it('문서 → 마크다운: 폭만·정렬만·왼쪽(null)', () => {
    expect(docToMarkdown(doc(p(img({ src: 'x.png', alt: 'a', width: 600 }))))).toBe(
      '<img src="x.png" alt="a" width="600">\n',
    );
    expect(docToMarkdown(doc(p(img({ src: 'x.png', alt: 'a', align: 'center' }))))).toBe(
      '<p align="center"><img src="x.png" alt="a"></p>\n',
    );
    // 왼쪽 정렬은 저장하지 않는다(정규화). 폭도 없으면 지금 표기다
    expect(docToMarkdown(doc(p(img({ src: 'x.png', alt: 'a', align: 'left' }))))).toBe(
      '![a](x.png)\n',
    );
  });
});

describe('폭·정렬이 없는 이미지는 지금과 같다', () => {
  it('에디터 JSON(모든 속성이 null)도 ![]()로 쓴다', () => {
    const editorAttrs = {
      src: 'https://e.com/a.png',
      alt: '그림',
      title: '캡션',
      width: null,
      height: null,
      align: null,
      uploadId: null,
      uploadProgress: null,
      uploadError: null,
    };
    expect(docToMarkdown(doc(p(img(editorAttrs))))).toBe('![그림](https://e.com/a.png "캡션")\n');
  });

  it('to-doc이 만드는 평범한 이미지 attrs는 { src, alt, title }이다', () => {
    expect(firstInline('![a](x.png "t")')).toEqual(img({ src: 'x.png', alt: 'a', title: 't' }));
  });

  it('문장 안 이미지·링크 이미지·표 칸 이미지는 그대로다', () => {
    for (const markdown of [
      '문장 안 ![작은 그림](https://e.com/c.png) 이미지\n',
      '[![링크 이미지](https://e.com/d.png)](https://e.com/d)\n',
    ]) {
      expect(docToMarkdown(markdownToDoc(markdown).doc)).toBe(markdown);
    }
    // 표는 열 폭을 맞춰 쓴다. 이미지 표기만 본다
    const table = '| a |\n| - |\n| ![칸](https://e.com/e.png) |\n';
    const rewritten = docToMarkdown(markdownToDoc(table).doc);
    expect(rewritten).toContain('| ![칸](https://e.com/e.png) |');
    expect(rewritten).not.toContain('<img');
  });
});

describe('왕복: 마크다운 → 문서 → 마크다운이 같고 문서 JSON도 같다', () => {
  const cases: Array<[string, string]> = [
    ['단락', '<img src="https://e.com/a.png" alt="폭만" width="600">\n'],
    ['단락(정렬·캡션)', '<p align="center"><img src="x" alt="a" title="캡션" width="480"></p>\n'],
    ['목록 항목', '- <img src="x" alt="" width="600">\n- 둘\n'],
    ['번호 목록', '1. <p align="right"><img src="x" alt="a" width="480"></p>\n'],
    ['인용', '> <p align="center"><img src="x" alt="" width="600"></p>\n'],
    ['콜아웃 첫 블록', '> [!note]\n>\n> <img src="x" alt="" width="600">\n'],
    ['콜아웃 둘째 블록', '> [!tip]\n> 본문\n>\n> <p align="center"><img src="x" alt=""></p>\n'],
    ['체크 항목 둘째 블록', '- [ ] 할 일\n\n  <img src="x" alt="" width="300">\n'],
  ];

  for (const [name, markdown] of cases) {
    it(name, () => {
      const first = markdownToDoc(markdown);
      expect(first.warnings).toEqual([]);
      assertValidDoc(first.doc);
      const rewritten = docToMarkdown(first.doc);
      expect(rewritten).toBe(markdown);
      expect(markdownToDoc(rewritten).doc).toEqual(first.doc);
      expect(normalizeForCompare(rewritten)).toBe(normalizeForCompare(markdown));
    });
  }

  it('콜아웃 첫 블록이 <p align>이면 표시 줄을 따로 쓴다(렌더는 같다)', () => {
    const markdown = '> [!note]\n> <p align="center"><img src="x" alt=""></p>\n';
    const { doc: first } = markdownToDoc(markdown);
    const rewritten = docToMarkdown(first);
    expect(rewritten).toBe('> [!note]\n>\n> <p align="center"><img src="x" alt=""></p>\n');
    expect(markdownToDoc(rewritten).doc).toEqual(first);
  });

  it('목록 항목에 다른 블록이 있으면 느슨한 목록으로 써서 HTML 블록이 다음 블록을 삼키지 않는다', () => {
    const tight = doc({
      type: 'bulletList',
      attrs: { spread: false },
      content: [
        {
          type: 'listItem',
          content: [
            p(img({ src: 'x', alt: '', title: null, width: 300 })),
            {
              type: 'bulletList',
              attrs: { spread: false },
              content: [{ type: 'listItem', content: [p(t('중첩'))] }],
            },
          ],
        },
        { type: 'listItem', content: [p(t('둘'))] },
      ],
    });
    assertValidDoc(tight);
    const markdown = docToMarkdown(tight);
    expect(markdown).toBe('- <img src="x" alt="" width="300">\n\n  - 중첩\n\n- 둘\n');
    const reopened = markdownToDoc(markdown);
    expect(reopened.warnings).toEqual([]);
    expect(reopened.doc.content?.[0]?.attrs).toMatchObject({ spread: true });
    // 중첩 목록이 살아 있고, 한 번 더 왕복해도 같다
    expect(reopened.doc.content?.[0]?.content?.[0]?.content?.[1]?.type).toBe('bulletList');
    expect(docToMarkdown(reopened.doc)).toBe(markdown);
  });

  it('여러 줄 <p align>은 한 줄로 바뀌지만 렌더는 같다', () => {
    const markdown = '<p align="center">\n  <img src="x" alt="" width="480">\n</p>\n';
    const rewritten = docToMarkdown(markdownToDoc(markdown).doc);
    expect(rewritten).toBe('<p align="center"><img src="x" alt="" width="480"></p>\n');
  });
});

describe('이미지만 있는 단락 판정', () => {
  const shape = (type: string, text?: string, marked = false): InlineShape => ({
    type,
    text,
    marked,
  });

  it('이미지 하나 + 접히는 공백 글자만', () => {
    expect(soloImageIndex([shape('image')])).toBe(0);
    expect(soloImageIndex([shape('text', ' \t'), shape('image'), shape('text', '\n ')])).toBe(1);
    // 공백 글자에 마크가 있어도 된다(쓸 때 지워진다)
    expect(soloImageIndex([shape('image'), shape('text', ' ', true)])).toBe(0);
  });

  it('NBSP·다른 글자·마크 있는 이미지·이미지 둘·줄바꿈·빈 단락은 아니다', () => {
    expect(soloImageIndex([shape('text', ' '), shape('image')])).toBe(-1);
    expect(soloImageIndex([shape('text', '글'), shape('image')])).toBe(-1);
    expect(soloImageIndex([shape('image', undefined, true)])).toBe(-1);
    expect(soloImageIndex([shape('image'), shape('image')])).toBe(-1);
    expect(soloImageIndex([shape('hardBreak'), shape('image')])).toBe(-1);
    expect(soloImageIndex([])).toBe(-1);
  });

  it('표 셀·체크 항목 첫 단락·모르는 부모에는 쓰지 않는다', () => {
    expect(canHoldImageLayout('doc', 3)).toBe(true);
    expect(canHoldImageLayout('blockquote', 0)).toBe(true);
    expect(canHoldImageLayout('callout', 0)).toBe(true);
    expect(canHoldImageLayout('listItem', 0)).toBe(true);
    expect(canHoldImageLayout('taskItem', 1)).toBe(true);
    expect(canHoldImageLayout('taskItem', 0)).toBe(false);
    expect(canHoldImageLayout('tableCell', 0)).toBe(false);
    expect(canHoldImageLayout('tableHeader', 0)).toBe(false);
    expect(canHoldImageLayout('mystery', 0)).toBe(false);
  });

  const wide = { src: 'x.png', alt: 'a', title: null, width: 600 };

  it('문서 → 마크다운: 공백 글자는 괜찮다', () => {
    expect(docToMarkdown(doc(p(t('  '), img(wide), t(' '))))).toBe(
      '<img src="x.png" alt="a" width="600">\n',
    );
  });

  it('문서 → 마크다운: 조건이 깨지면 폭·정렬을 쓰지 않는다', () => {
    const link = [{ type: 'link', attrs: { href: 'https://e.com' } }];
    expect(docToMarkdown(doc(p(t(' '), img(wide))))).toBe(' ![a](x.png)\n');
    expect(docToMarkdown(doc(p(img(wide, link))))).toBe('[![a](x.png)](https://e.com)\n');
    expect(docToMarkdown(doc(p(t('글 '), img(wide))))).toBe('글 ![a](x.png)\n');
    expect(docToMarkdown(doc(p(img(wide), img(wide))))).toBe('![a](x.png)![a](x.png)\n');
    // 표 칸
    const table = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('머리'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [p(img(wide))] }] },
      ],
    });
    assertValidDoc(table);
    expect(docToMarkdown(table)).toContain('| ![a](x.png) |');
    // 체크 항목 첫 단락
    const task = doc({
      type: 'taskList',
      content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(img(wide))] }],
    });
    assertValidDoc(task);
    expect(docToMarkdown(task)).toBe('- [x] ![a](x.png)\n');
  });

  it('영상 주소에는 폭·정렬을 쓰지 않는다(공개 페이지가 <video>로 바꾸고 폭을 버린다)', () => {
    expect(
      docToMarkdown(doc(p(img({ src: 'clip.mp4', alt: '', width: 600, align: 'center' })))),
    ).toBe('![](clip.mp4)\n');
  });
});

describe('스키마 속성 (에디터 안 복사·붙여넣기)', () => {
  const type = schema.nodes.image;
  // DOM 없이 parseDOM을 부르려고 getAttribute만 흉내 낸다
  const element = (attributes: Record<string, string>) =>
    ({ getAttribute: (name: string) => attributes[name] ?? null }) as unknown as HTMLElement;
  const parse = (attributes: Record<string, string>) => {
    const rule = type.spec.parseDOM?.[0] as { getAttrs: (node: HTMLElement) => unknown };
    return rule.getAttrs(element(attributes)) as Record<string, unknown>;
  };

  it('data-width는 숫자로, data-align은 정렬로 읽는다', () => {
    expect(parse({ src: 'x', 'data-width': '600', 'data-align': 'center' })).toMatchObject({
      width: 600,
      align: 'center',
    });
    expect(parse({ src: 'x', 'data-width': '600px', 'data-align': 'left' })).not.toHaveProperty(
      'width',
    );
    expect(parse({ src: 'x', 'data-width': '9999' }).width ?? null).toBeNull();
  });

  it('바깥 HTML의 width는 읽지 않는다(공개 글·웹 페이지를 복사해 붙인 경우, 리뷰 S2)', () => {
    // 공개 글의 새 자산 이미지에는 rehype-assets가 최대 변형 폭(width="2400")을 붙인다
    expect(parse({ src: 'x', width: '2400', height: '1350' }).width ?? null).toBeNull();
    expect(parse({ src: 'x', width: '600' }).width ?? null).toBeNull();
  });

  it('data-width·data-align으로 쓴다. 값이 없으면 쓰지 않는다', () => {
    const [, withLayout] = type.spec.toDOM?.(
      type.create({ src: 'x', width: 600, align: 'right' }),
    ) as [string, Record<string, unknown>];
    expect(withLayout).toMatchObject({ 'data-width': '600', 'data-align': 'right' });
    expect(withLayout).not.toHaveProperty('width');
    const [, plain] = type.spec.toDOM?.(type.create({ src: 'x' })) as [
      string,
      Record<string, unknown>,
    ];
    expect(plain).not.toHaveProperty('data-width');
    expect(plain).not.toHaveProperty('data-align');
  });
});

describe('에디터 표시: 이미지만 있는 단락 데코레이션', () => {
  const solo = { src: 'x.png', alt: 'a', title: null, align: 'center' };
  const testDoc = doc(
    p(img(solo)), // 0: 데코레이션 (정렬 가운데)
    p(t('글 '), img(solo)), // 1: 아님
    { type: 'blockquote', content: [p(t(' '), img({ src: 'y.png', width: 300 }))] }, // 2: 데코레이션 (정렬 없음)
    {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p(img(solo))] }] }],
    }, // 3: 아님 (표 칸)
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [p(img(solo)), p(img(solo))] },
      ],
    }, // 4: 첫 단락은 아님, 둘째 단락은 데코레이션
    p(img({ src: 'clip.mp4', align: 'center' })), // 5: 데코레이션 (영상이라 정렬 없음)
  );

  function stateOf(json: JSONContent) {
    return EditorState.create({
      schema,
      doc: schema.nodeFromJSON(json),
      plugins: [createImageLayoutPlugin()],
    });
  }

  function decorationsOf(state: EditorState): DecorationSet {
    return imageLayoutKey.getState(state) as DecorationSet;
  }

  it('조건에 맞는 단락에만 붙고 정렬을 spec에 담는다', () => {
    assertValidDoc(testDoc);
    const state = stateOf(testDoc);
    // DecorationSet.find()는 문서 순서를 보장하지 않는다. 위치로 줄 세운다
    const found = decorationsOf(state)
      .find()
      .sort((a, b) => a.from - b.from);
    expect(found).toHaveLength(4);
    const summary = found.map((decoration) => {
      const node = state.doc.nodeAt(decoration.from);
      return {
        type: node?.type.name,
        size: decoration.to - decoration.from === node?.nodeSize,
        align: (decoration.spec as SoloImageSpec).align,
        src:
          node?.firstChild?.type.name === 'image'
            ? node.firstChild.attrs.src
            : node?.child(1).attrs.src,
      };
    });
    expect(summary).toEqual([
      { type: 'paragraph', size: true, align: 'center', src: 'x.png' },
      { type: 'paragraph', size: true, align: null, src: 'y.png' },
      { type: 'paragraph', size: true, align: 'center', src: 'x.png' },
      { type: 'paragraph', size: true, align: null, src: 'clip.mp4' },
    ]);
    expect(SOLO_IMAGE_CLASS).toBe('editor-image-solo');
  });

  it('props.decorations가 같은 집합을 준다', () => {
    const plugin = createImageLayoutPlugin();
    const state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON(testDoc),
      plugins: [plugin],
    });
    const fromProps = plugin.props.decorations?.call(plugin, state) as DecorationSet;
    expect(fromProps.find()).toHaveLength(4);
  });

  it('문서가 바뀌면 다시 계산하고, 선택만 바뀌면 그대로 둔다', () => {
    const state = stateOf(doc(p(img(solo)), p(t('끝'))));
    const before = decorationsOf(state);
    expect(before.find()).toHaveLength(1);
    // 선택만 바꾼다
    const moved = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));
    expect(decorationsOf(moved)).toBe(before);
    // 이미지 단락에 글자를 넣는다(이미지 뒤, 위치 2)
    const typed = moved.apply(moved.tr.insertText('글', 2));
    expect(decorationsOf(typed).find()).toHaveLength(0);
    // 글자를 지우면 다시 붙는다
    const erased = typed.apply(typed.tr.delete(2, 3));
    expect(decorationsOf(erased).find()).toHaveLength(1);
  });

  it('imageLayoutDecorations는 순수 함수다(같은 문서 → 같은 결과)', () => {
    const node = schema.nodeFromJSON(testDoc);
    expect(
      imageLayoutDecorations(node)
        .find()
        .map((d) => [d.from, d.to]),
    ).toEqual(
      imageLayoutDecorations(node)
        .find()
        .map((d) => [d.from, d.to]),
    );
  });

  it('isSoloImageAt: 노드 뷰 메뉴의 판정', () => {
    const node = schema.nodeFromJSON(doc(p(img(solo)), p(t('글'), img(solo))));
    // 첫 단락 이미지: 단락 시작(0) + 1
    expect(isSoloImageAt(node, 1)).toBe(true);
    // 둘째 단락 이미지: 첫 단락 크기(3) + 1 + 글자 1
    expect(node.nodeAt(5)?.type.name).toBe('image');
    expect(isSoloImageAt(node, 5)).toBe(false);
    expect(isSoloImageAt(node, -1)).toBe(false);
    expect(isSoloImageAt(node, 999)).toBe(false);
  });

  it('soloImageStateAt: 표 칸·체크 항목 첫 단락은 blocked다', () => {
    const node = schema.nodeFromJSON(
      doc(
        p(t('글'), img(solo)),
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(img(solo))] }] },
          ],
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: false }, content: [p(img(solo)), p(img(solo))] },
          ],
        },
      ),
    );
    // 모든 이미지의 위치와 상태
    const states: string[] = [];
    node.descendants((child, pos) => {
      if (child.type.name === 'image') states.push(soloImageStateAt(node, pos));
      return true;
    });
    expect(states).toEqual(['shared', 'blocked', 'blocked', 'solo']);
  });
});

describe('끌어서 폭 바꾸기 계산', () => {
  it('10px 단위로 반올림한다', () => {
    expect(dragImageWidth(400, 23, 720)).toBe(420);
    expect(dragImageWidth(400, 26, 720)).toBe(430);
    expect(dragImageWidth(333.4, 0, 720)).toBe(330);
  });

  it('최소 16, 최대 본문 폭', () => {
    expect(dragImageWidth(100, -500, 720)).toBe(IMAGE_WIDTH_MIN);
    expect(dragImageWidth(700, 200, 712.6)).toBe(712);
    // 본문 폭을 모르면 최대는 4096
    expect(dragImageWidth(5000, 0, 0)).toBe(IMAGE_WIDTH_MAX);
    expect(dragImageWidth(500, 0, Number.NaN)).toBe(500);
  });

  it('가운데 정렬은 두 배, 오른쪽 정렬은 반대 방향', () => {
    expect(dragDelta(15, null)).toBe(15);
    expect(dragDelta(15, 'center')).toBe(30);
    expect(dragDelta(15, 'right')).toBe(-15);
  });
});

describe('리뷰 S3: 체크 항목에서 빈 첫 단락 뒤의 이미지', () => {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [
              { type: 'paragraph' },
              {
                type: 'paragraph',
                content: [
                  { type: 'image', attrs: { src: 'x.png', alt: '', title: null, width: 300 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('빈 단락은 쓰이지 않으므로 이미지가 처음 쓰이는 블록이다. 폭을 쓰지 않고 체크 상자를 지킨다', () => {
    assertValidDoc(doc);
    const markdown = docToMarkdown(doc);
    expect(markdown).toContain('[x]');
    expect(markdown).not.toContain('<img');
    expect(markdownToDoc(markdown).doc.content?.[0]?.type).toBe('taskList');
  });

  it('에디터 표시도 같은 판정이다(데코레이션 없음, 메뉴는 blocked)', () => {
    const node = schema.nodeFromJSON(doc);
    expect(imageLayoutDecorations(node).find()).toHaveLength(0);
    let imagePos = -1;
    node.descendants((child, pos) => {
      if (child.type.name === 'image') imagePos = pos;
    });
    expect(soloImageStateAt(node, imagePos)).toBe('blocked');
  });
});
