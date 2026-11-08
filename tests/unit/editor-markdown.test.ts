// 마크다운 ↔ ProseMirror JSON 변환기 테스트 (재건 3단계 D1·D4, Plan 4.2)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getSchema, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from '@/editor/extensions';
import { docToMarkdown, markdownToDoc } from '@/editor/markdown';
import { normalizeForCompare } from '@/lib/content/markdown';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/markdown');
const fixtures = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, markdown: readFileSync(join(FIXTURE_DIR, name), 'utf8') }));

const schema = getSchema(createEditorExtensions());

// 문서 JSON이 에디터 스키마에 맞는지 (ProseMirror check)
function assertValidDoc(doc: JSONContent) {
  schema.nodeFromJSON(doc).check();
}

// 블록 자식 타입 목록
function blockTypes(doc: JSONContent): string[] {
  return (doc.content ?? []).map((node) => node.type ?? '');
}

function first(doc: JSONContent): JSONContent {
  return doc.content?.[0] ?? {};
}

describe('fixture 왕복 (렌더 결과 동일, 안정성, 스키마)', () => {
  it('fixture가 10개 있다', () => {
    expect(fixtures.length).toBe(10);
  });

  for (const fixture of fixtures) {
    it(`${fixture.name}: 다시 쓴 마크다운의 렌더가 원문과 같다`, () => {
      const { doc, warnings } = markdownToDoc(fixture.markdown);
      expect(warnings).toEqual([]);
      assertValidDoc(doc);
      const rewritten = docToMarkdown(doc);
      expect(normalizeForCompare(rewritten)).toBe(normalizeForCompare(fixture.markdown));
    });

    it(`${fixture.name}: 두 번 왕복해도 같은 마크다운이다`, () => {
      const once = docToMarkdown(markdownToDoc(fixture.markdown).doc);
      const twice = docToMarkdown(markdownToDoc(once).doc);
      expect(twice).toBe(once);
    });
  }
});

describe('markdownToDoc 구조', () => {
  it('빈 문서는 빈 단락 하나다', () => {
    const { doc } = markdownToDoc('');
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    assertValidDoc(doc);
    expect(docToMarkdown(doc)).toBe('');
  });

  it('제목 단계 1~6을 보존한다', () => {
    const { doc } = markdownToDoc('# a\n\n###### b');
    expect(doc.content?.map((node) => node.attrs?.level)).toEqual([1, 6]);
  });

  it('줄 안 줄바꿈은 공백, ZWSP는 지운다', () => {
    const { doc } = markdownToDoc('가\u200b나\n다');
    expect(first(doc).content).toEqual([{ type: 'text', text: '가나 다' }]);
  });

  it('겹친 마크의 구조를 지킨다 (기울임 안의 굵게, 링크 안의 굵게)', () => {
    const md = '_기울임 **안의 굵게**_ 와 **굵은 _기울임_** 와 [링크 **굵게** 끝](https://x.y)';
    const rewritten = docToMarkdown(markdownToDoc(md).doc);
    expect(normalizeForCompare(rewritten)).toBe(normalizeForCompare(md));
  });

  it('마크를 겹쳐 쓴다 (굵게+코드, 링크+굵게)', () => {
    const { doc } = markdownToDoc('**`코드`** [**굵은 링크**](https://x.y "t")');
    const inlines = first(doc).content ?? [];
    expect(inlines[0]).toMatchObject({ type: 'text', text: '코드' });
    expect(inlines[0]?.marks?.map((mark) => mark.type).sort()).toEqual(['bold', 'code']);
    const linked = inlines.find((node) => node.text === '굵은 링크');
    expect(linked?.marks?.map((mark) => mark.type).sort()).toEqual(['bold', 'link']);
    expect(linked?.marks?.find((mark) => mark.type === 'link')?.attrs).toMatchObject({
      href: 'https://x.y',
      title: 't',
    });
    assertValidDoc(doc);
  });

  it('목록: 느슨함, 시작 번호, 체크 항목', () => {
    const { doc } = markdownToDoc('- a\n\n- b\n\n3. c\n4. d\n\n- [ ] e\n- [x] f');
    expect(blockTypes(doc)).toEqual(['bulletList', 'orderedList', 'taskList']);
    expect(first(doc).attrs).toMatchObject({ spread: true });
    expect(doc.content?.[1]?.attrs).toMatchObject({ start: 3, spread: false });
    expect(doc.content?.[2]?.content?.map((item) => item.attrs?.checked)).toEqual([false, true]);
    assertValidDoc(doc);
  });

  it('코드 블록: 언어와 meta', () => {
    const { doc } = markdownToDoc('```c title="x"\nint a;\n```\n\n```\nplain\n```');
    expect(first(doc)).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'c', meta: 'title="x"' },
    });
    expect(first(doc).content).toEqual([{ type: 'text', text: 'int a;' }]);
    expect(doc.content?.[1]?.attrs).toMatchObject({ language: null, meta: null });
  });

  it('표: 첫 행은 머리 셀, 열 정렬은 셀 속성', () => {
    const { doc } = markdownToDoc('| a | b |\n|:--|--:|\n| 1 | 2 |');
    const table = first(doc);
    expect(table.type).toBe('table');
    const rows = table.content ?? [];
    expect(rows[0]?.content?.map((cell) => cell.type)).toEqual(['tableHeader', 'tableHeader']);
    expect(rows[1]?.content?.map((cell) => cell.type)).toEqual(['tableCell', 'tableCell']);
    expect(rows[1]?.content?.map((cell) => cell.attrs?.align)).toEqual(['left', 'right']);
    expect(rows[1]?.content?.[0]?.content?.[0]).toMatchObject({ type: 'paragraph' });
    assertValidDoc(doc);
  });

  it('이미지는 단락 안 inline 노드이고 title을 보존한다', () => {
    const { doc } = markdownToDoc('![a](x.png "t")');
    expect(first(doc).type).toBe('paragraph');
    expect(first(doc).content?.[0]).toMatchObject({
      type: 'image',
      attrs: { src: 'x.png', alt: 'a', title: 't' },
    });
  });

  it('하드 브레이크: 두 칸, 백슬래시, 줄 안 <br>, </br>', () => {
    const { doc, warnings } = markdownToDoc('a  \nb\\\nc<br />d</br>e');
    expect(warnings).toEqual([]);
    const types = first(doc).content?.map((node) => node.type);
    expect(types).toEqual([
      'text',
      'hardBreak',
      'text',
      'hardBreak',
      'text',
      'hardBreak',
      'text',
      'hardBreak',
      'text',
    ]);
  });

  it('블록 위치의 <br>은 버리고 경고도 없다', () => {
    const { doc, warnings } = markdownToDoc('a\n\n<br />\n\nb');
    expect(warnings).toEqual([]);
    expect(blockTypes(doc)).toEqual(['paragraph', 'paragraph']);
  });

  it('지원하지 않는 HTML은 텍스트로 두고 경고한다', () => {
    const { doc, warnings } = markdownToDoc('<iframe src="x"></iframe>\n\n가 <span>나</span>');
    // 블록 iframe 1개, 줄 안 <span>과 </span> 각 1개
    expect(warnings.length).toBe(3);
    expect(warnings.every((warning) => warning.code === 'unsupported-html')).toBe(true);
    expect(warnings[0]?.detail).toBe('<iframe src="x"></iframe>');
    expect(first(doc).content?.[0]).toMatchObject({
      type: 'text',
      text: '<iframe src="x"></iframe>',
    });
    assertValidDoc(doc);
  });

  it('콜아웃: [!note]·[!tip]·[!warning]만 콜아웃이고 💡 인용은 인용이다', () => {
    const { doc } = markdownToDoc(
      '> [!note]\n> 본문\n\n> [!TIP]\n> 팁\n\n> [!danger]\n> x\n\n> 💡 팁',
    );
    expect(blockTypes(doc)).toEqual(['callout', 'callout', 'blockquote', 'blockquote']);
    expect(first(doc).attrs).toEqual({ type: 'note' });
    expect(first(doc).content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '본문' }] },
    ]);
    expect(doc.content?.[1]?.attrs).toEqual({ type: 'tip' });
    assertValidDoc(doc);
  });

  it('임베드: 지원 주소만 있는 단락은 embed 노드, 그 밖은 링크', () => {
    const { doc } = markdownToDoc(
      'https://youtu.be/dQw4w9WgXcQ\n\n<https://codesandbox.io/s/new>\n\nhttps://example.com\n\n[a](https://youtu.be/dQw4w9WgXcQ)',
    );
    expect(blockTypes(doc)).toEqual(['embed', 'embed', 'paragraph', 'paragraph']);
    expect(first(doc).attrs).toEqual({ provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(doc.content?.[1]?.attrs).toEqual({
      provider: 'codesandbox',
      url: 'https://codesandbox.io/s/new',
    });
    assertValidDoc(doc);
  });

  it('수식: 인라인과 블록', () => {
    const { doc } = markdownToDoc('a $x$ b\n\n$$\ny = 1\n$$');
    expect(first(doc).content?.[1]).toEqual({ type: 'inlineMath', attrs: { latex: 'x' } });
    expect(doc.content?.[1]).toEqual({ type: 'blockMath', attrs: { latex: 'y = 1' } });
    assertValidDoc(doc);
  });
});

describe('docToMarkdown 표기', () => {
  it('글머리 -, 구분선 ---, 기울임 *, 굵게 **, 펜스 코드', () => {
    const md = docToMarkdown(markdownToDoc('* a\n* b\n\n***\n\n__굵게__ *기울임*\n\n    code').doc);
    expect(md).toBe('- a\n- b\n\n---\n\n**굵게** *기울임*\n\n```\ncode\n```\n');
  });

  it('콜아웃은 > [!type] 첫 줄로, 임베드는 주소 한 줄로 쓴다', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { type: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '경고' }] }],
        },
        { type: 'embed', attrs: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } },
      ],
    });
    expect(md).toBe('> [!warning]\n> 경고\n\nhttps://youtu.be/dQw4w9WgXcQ\n');
  });

  it('단락 끝 하드 브레이크는 <br>로 써서 렌더를 지킨다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '가' }, { type: 'hardBreak' }] },
      ],
    };
    const md = docToMarkdown(doc);
    expect(normalizeForCompare(md)).toBe(normalizeForCompare('가<br />'));
    expect(md).toBe('가<br>\n');
  });

  it('빈 단락은 쓰지 않고 셀 안 여러 단락은 공백으로 잇는다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '가' }] },
        { type: 'paragraph' },
      ],
    };
    expect(docToMarkdown(doc)).toBe('가\n');
  });

  it('수식과 코드 안 마크다운 기호는 그대로다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'a_1 * b' } }] },
        { type: 'blockMath', attrs: { latex: '\\sum_{i} x_i' } },
        {
          type: 'codeBlock',
          attrs: { language: 'js', meta: null },
          content: [{ type: 'text', text: '**not bold**' }],
        },
      ],
    };
    expect(docToMarkdown(doc)).toBe(
      '$a_1 * b$\n\n$$\n\\sum_{i} x_i\n$$\n\n```js\n**not bold**\n```\n',
    );
  });

  it('모르는 노드는 오류다', () => {
    expect(() => docToMarkdown({ type: 'doc', content: [{ type: 'mystery' }] })).toThrow(/mystery/);
  });
});

describe('리뷰 지적 수정 (PR-A 6.1)', () => {
  // 지적 1: 하드 브레이크·줄 안 <br>·인라인 수식이 바깥 마크를 물려받아야 마크 구간이 갈라지지 않는다
  it('굵게 안의 하드 브레이크와 수식은 마크를 물려받는다', () => {
    for (const md of ['**가  \n나**', '**가<br>나**', '**a $x$ b**']) {
      const { doc } = markdownToDoc(md);
      assertValidDoc(doc);
      const rewritten = docToMarkdown(doc);
      expect(normalizeForCompare(rewritten), md).toBe(normalizeForCompare(md));
    }
    expect(docToMarkdown(markdownToDoc('**가  \n나**').doc)).toBe('**가\\\n나**\n');
  });

  // 지적 2: 표 셀과 제목 안의 하드 브레이크는 <br>로 써야 줄바꿈이 남는다
  it('표 셀과 제목 안의 하드 브레이크는 <br>로 쓴다', () => {
    for (const md of [
      '| a | b |\n|---|---|\n| x<br>y | z |',
      '### 제목<br>둘째',
      '# 제목<br>둘째',
    ]) {
      const rewritten = docToMarkdown(markdownToDoc(md).doc);
      expect(normalizeForCompare(rewritten), md).toBe(normalizeForCompare(md));
    }
    const cell: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'x' },
                        { type: 'hardBreak' },
                        { type: 'text', text: 'y' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(docToMarkdown(cell)).toContain('| x<br>y |');
  });

  // 지적 4: 끝 글자 때문에 자동 링크로 읽히지 않는 임베드 주소는 <url>로 쓴다
  it('날 주소로 다시 읽히지 않는 임베드 주소는 <url> 꼴로 쓴다', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ?si=abc_';
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'embed', attrs: { provider: 'youtube', url } }],
    };
    const md = docToMarkdown(doc);
    expect(md).toBe(`<${url}>\n`);
    expect(markdownToDoc(md).doc.content?.[0]).toMatchObject({ type: 'embed', attrs: { url } });
    expect(
      docToMarkdown({
        type: 'doc',
        content: [
          { type: 'embed', attrs: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } },
        ],
      }),
    ).toBe('https://youtu.be/dQw4w9WgXcQ\n');
  });

  // 지적 5: 기울임은 *로 쓴다. _는 한글 조사 앞에서 문자 참조(&#x…;)를 만든다
  it('기울임은 *로 쓰고 한글 조사가 붙어도 문자 참조가 없다', () => {
    const md = docToMarkdown(markdownToDoc('*기울임*도 있고 *a*b').doc);
    expect(md).toBe('*기울임*도 있고 *a*b\n');
  });

  // 지적 5 연관: 마크 안의 앞뒤 공백은 마크 밖으로 민다
  it('마크 안의 앞뒤 공백은 마크 밖으로 민다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '앞' },
            { type: 'text', text: ' 굵게 ', marks: [{ type: 'bold' }] },
            { type: 'text', text: '뒤' },
          ],
        },
      ],
    };
    expect(docToMarkdown(doc)).toBe('앞 **굵게** 뒤\n');
    const onlySpace: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'text', text: ' ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    };
    expect(docToMarkdown(onlySpace)).toBe('a b\n');
  });

  // 지적 7b: ZWSP 옆의 줄바꿈은 브라우저가 지운다(CSS Text segment break). 공백으로 바꾸지 않는다
  it('ZWSP 옆의 줄바꿈은 공백이 아니라 없어진다', () => {
    const { doc } = markdownToDoc('가​\n나 다\n​라');
    expect(first(doc).content).toEqual([{ type: 'text', text: '가나 다라' }]);
  });

  // 지적 8: 머리 행보다 많은 셀은 공개 페이지처럼 자른다
  it('머리 행보다 많은 셀은 자른다', () => {
    const md = '| a |\n|---|\n| 1 | 2 |';
    const { doc } = markdownToDoc(md);
    expect(first(doc).content?.[1]?.content?.length).toBe(1);
    expect(normalizeForCompare(docToMarkdown(doc))).toBe(normalizeForCompare(md));
  });

  // 지적 12: 모르는 마크는 조용히 버리지 않는다
  it('모르는 마크는 오류다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'underline' }] }],
        },
      ],
    };
    expect(() => docToMarkdown(doc)).toThrow(/underline/);
  });

  // 지적 13: 빽빽한 목록인데 항목에 블록이 둘이면 느슨한 목록으로 쓴다(remark와 같은 판정). 다시 열어도 JSON이 같다
  it('항목에 블록이 둘인 목록은 다시 열어도 같은 JSON이다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          attrs: { spread: false },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
              ],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }],
            },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc);
    const reopened = markdownToDoc(md).doc;
    expect(docToMarkdown(reopened)).toBe(md);
    expect(reopened.content?.[0]?.attrs).toMatchObject({ spread: true });
  });
});
