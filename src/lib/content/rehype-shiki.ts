// 코드 블록: 하이라이트 + 틀 (재건 4단계 D8)
// - remarkCodeMeta: 펜스 정보 문자열의 meta(언어 뒤, 예: 파일 이름)를 code 요소의 data-meta 속성으로 옮긴다.
//   mdast → hast는 meta를 node.data에만 두는데, rehype-raw가 hast를 다시 만들면서 data를 버린다.
// - rehypeCodeBlocks: <pre><code>를 아래 틀로 감싼다. highlighter가 있으면 <pre>를 Shiki 결과로 바꾼다.
//   <figure class="code-block" data-lang="js">
//     <div class="code-head"><span class="code-label"><span class="code-lang">js</span><span class="code-meta">a.js</span></span>
//       <button type="button" class="code-copy" hidden>복사</button></div>
//     <pre>…</pre>
//   </figure>
// - 복사 버튼은 hidden으로 나간다. 글 상세 <script>가 hidden을 풀고 클릭을 처리한다(JS가 없으면 버튼도 없다).
//   에디터 미리보기에서는 숨은 채다(Plan D8: 버튼은 동작하지 않아도 된다).
// - highlighter가 없으면(왕복 검사, 미리보기 첫 화면) <pre>는 그대로다. 틀은 같다.
// - rehype-strip-unsafe 뒤에 돈다. 그래서 여기서 만든 button과 Shiki의 style 속성은 지워지지 않는다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙인다.

import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Root as MdRoot } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { CodeHighlighter } from './shiki-languages.ts';

export const CODE_COPY_LABEL = '복사';

export function remarkCodeMeta() {
  return (tree: MdRoot) => {
    visit(tree, 'code', (node) => {
      if (!node.meta) return;
      node.data = {
        ...node.data,
        hProperties: { ...(node.data?.hProperties ?? {}), dataMeta: node.meta },
      };
    });
  };
}

// 요소의 글자를 모은다. 펜스 코드는 텍스트뿐이다. 원시 HTML 코드 블록의 <br>은 줄바꿈이다
function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') {
    if (node.tagName === 'br') return '\n';
    return node.children.map(textOf).join('');
  }
  return '';
}

// 하이라이트한 <pre>. 하이라이터가 실패하면 null(그 블록만 민무늬로 둔다. 글 전체를 실패시키지 않는다)
function highlightedPre(
  highlighter: CodeHighlighter,
  code: Element,
  lang: string | null,
): Element | null {
  try {
    return highlighter.toPre(textOf(code), lang);
  } catch (error) {
    console.warn('코드 하이라이트 실패, 민무늬로 둔다', lang, error);
    return null;
  }
}

// code 요소의 언어 (className의 language-xxx)
function languageOf(code: Element): string | null {
  const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
  for (const name of classes) {
    if (typeof name === 'string' && name.startsWith('language-')) {
      return name.slice('language-'.length) || null;
    }
  }
  return null;
}

// <pre>의 자식이 <code> 하나인지 (앞뒤 공백 텍스트는 무시한다)
function onlyCodeChild(pre: Element): Element | null {
  const elements = pre.children.filter(
    (child) => !(child.type === 'text' && child.value.trim() === ''),
  );
  const only = elements[0];
  return elements.length === 1 && only.type === 'element' && only.tagName === 'code' ? only : null;
}

function span(className: string, value: string): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: [className] },
    children: [{ type: 'text', value }],
  };
}

// 틀의 머리줄: 언어·meta 라벨과 복사 버튼(접근 이름에 언어를 넣는다. 버튼이 여럿이라 "복사"만으로는 구분되지 않는다)
function codeHead(lang: string | null, meta: string | null): Element {
  const label: Element[] = [];
  if (lang) label.push(span('code-lang', lang));
  if (meta) label.push(span('code-meta', meta));
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['code-head'] },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['code-label'] },
        children: label,
      },
      {
        type: 'element',
        tagName: 'button',
        properties: {
          type: 'button',
          className: ['code-copy'],
          ariaLabel: lang ? `${lang} 코드 복사` : '코드 복사',
          hidden: true,
        },
        children: [{ type: 'text', value: CODE_COPY_LABEL }],
      },
    ],
  };
}

export interface RehypeCodeBlocksOptions {
  highlighter?: CodeHighlighter;
}

export default function rehypeCodeBlocks(options: RehypeCodeBlocksOptions = {}) {
  const { highlighter } = options;
  return (tree: HastRoot) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return;
      // 이미 틀 안에 있으면 다시 감싸지 않는다
      if (parent.type === 'element' && parent.tagName === 'figure') return;
      const code = onlyCodeChild(node);
      if (!code) return;

      const lang = languageOf(code);
      const meta = typeof code.properties.dataMeta === 'string' ? code.properties.dataMeta : null;
      const highlighted = highlighter ? highlightedPre(highlighter, code, lang) : null;
      const pre = highlighted ?? node;
      if (!highlighted) delete code.properties.dataMeta;

      const figure: Element = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['code-block'], dataLang: lang ?? '' },
        children: [codeHead(lang, meta), pre],
      };
      parent.children[index] = figure;
      // 새 figure 안은 다시 돌지 않는다
      return SKIP;
    });
  };
}
