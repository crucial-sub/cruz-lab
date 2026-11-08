// 공유 마크다운 파이프라인 (재건 3단계 Plan 4.3)
// - parseMarkdown: 공개 페이지와 같은 파서(remark-parse + remark-gfm)에 remark-math를 더한 것. 변환기와 미리보기가 쓴다.
// - markdownToHtml: 미리보기 모드와 4단계 공개 페이지가 쓸 HTML. react-markdown의 규칙(영상 확장자 → video,
//   외부 링크 → 새 창, 인라인 코드 클래스)을 그대로 옮겼다.
// - normalizeForCompare: 왕복 검사(D1). 공개 페이지 파서로 읽고 정규화 규칙 1~5를 적용한 HTML 문자열.
// - stringifyMarkdown: 변환기가 마크다운을 쓸 때의 표기 옵션(Plan 4.2)을 한 곳에 둔다.
// - 브라우저와 Node에서 같이 돈다. Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

import type { Root as HastRoot, Nodes as HastNodes, Properties } from 'hast';
import type { Node as MdNode, Root } from 'mdast';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { EmbedProvider } from './embed-url.ts';
import remarkCallout from './remark-callout.ts';
import remarkEmbed, { embedUrlOfParagraph } from './remark-embed.ts';

// 변환기(from-doc)가 만드는 임베드 노드. 마크다운에는 주소 한 줄로 쓴다
export interface EmbedNode extends MdNode {
  type: 'embed';
  provider: EmbedProvider;
  url: string;
}

declare module 'mdast' {
  interface RootContentMap {
    embed: EmbedNode;
  }
  interface BlockContentMap {
    embed: EmbedNode;
  }
}

// 공개 페이지가 영상으로 그리는 확장자 (MarkdownPostView.tsx와 같다)
export const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov'];

// ───────────── 파서 ─────────────

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

// 마크다운 → mdast (remark-parse + remark-gfm + remark-math)
export function parseMarkdown(markdown: string): Root {
  return parser.parse(markdown);
}

// ───────────── 쓰기 ─────────────

// 마크다운 표기 (Plan 4.2): 글머리 -, 구분선 ---, 기울임 *, 굵게 **, 펜스 코드, 들여쓰기 한 칸, 번호 증가
// - 기울임은 Plan 4.2의 '_' 대신 '*'다. '_'는 단어 안에서 강조를 열고 닫지 못해 한글 조사(`*기울임*도`) 앞에서
//   문자 참조(&#x…;)를 만든다(작업 문서 5절).
export const MARKDOWN_STRINGIFY_OPTIONS: StringifyOptions = {
  bullet: '-',
  rule: '-',
  emphasis: '*',
  strong: '*',
  fences: true,
  listItemIndent: 'one',
  incrementListMarker: true,
  handlers: {
    // 임베드는 주소 한 줄로 쓴다. 날 주소가 자동 링크로 다시 읽히지 않으면(끝이 `_`·`*`·`.` 등) <주소> 꼴로 쓴다
    embed: (node: EmbedNode) => (bareUrlStaysEmbed(node.url) ? node.url : `<${node.url}>`),
  },
};

// 날 주소 한 줄을 다시 읽었을 때 같은 주소의 임베드 단락이 되는지 (GFM 자동 링크는 끝의 `_ * ~ . , : ; ! ?`를 링크에서 뺀다)
function bareUrlStaysEmbed(url: string): boolean {
  const first = parseMarkdown(url).children[0];
  return first?.type === 'paragraph' && embedUrlOfParagraph(first) === url;
}

const stringifier = unified()
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkStringify, MARKDOWN_STRINGIFY_OPTIONS);

// mdast → 마크다운
export function stringifyMarkdown(tree: Root): string {
  return String(stringifier.stringify(tree));
}

// ───────────── 보이지 않는 공백 ─────────────

// 보이지 않는 공백(U+200B). 옛 에디터가 넣은 보정 문자다. 정규식 리터럴에 쓰면 eslint no-irregular-whitespace에 걸려 문자열로 둔다
const ZWSP = '\u200b';
// ZWSP 바로 옆의 줄바꿈. 브라우저는 이 줄바꿈을 지운다(CSS Text 3 segment break 변환). 공백으로 바꾸면 안 된다
const ZWSP_SOFT_BREAK = new RegExp(`${ZWSP}+\\n${ZWSP}*|\\n${ZWSP}+`, 'g');

// 텍스트에서 ZWSP를 지우고 줄 안 줄바꿈을 공백으로 바꾼다. ZWSP 옆의 줄바꿈은 없앤다
// - 변환기(to-doc)와 왕복 검사 정규화가 같은 함수를 쓴다
export function removeZwspAndSoftBreaks(value: string): string {
  return value.replace(ZWSP_SOFT_BREAK, '').replaceAll(ZWSP, '').replace(/\n/g, ' ');
}

// ───────────── 원시 HTML <br> ─────────────

// <br>, <br/>, <br />, </br>(옛 에디터 형식)만 있는 HTML인지
const BREAK_ONLY_PATTERN = /^(?:\s*<\/?br\s*\/?>\s*)+$/i;
const BREAK_TAG_PATTERN = /<\/?br\s*\/?>/gi;

export function isBreakOnlyHtml(value: string): boolean {
  return BREAK_ONLY_PATTERN.test(value);
}

// <br> 태그 수
export function countBreakTags(value: string): number {
  return value.match(BREAK_TAG_PATTERN)?.length ?? 0;
}

// ───────────── HTML (미리보기, 4단계 공개 페이지) ─────────────

function isVideoSource(src: string): boolean {
  const lower = src.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// 허용 프로토콜 (react-markdown defaultUrlTransform과 같다). 그 밖(javascript:, data: 등)은 빈 주소로 바꾼다
const SAFE_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel']);

export function safeUrl(url: string): string {
  const colon = url.indexOf(':');
  if (colon === -1) return url;
  // 첫 `/`, `?`, `#`보다 뒤의 `:`는 프로토콜이 아니다(상대 경로)
  for (const marker of ['/', '?', '#']) {
    const position = url.indexOf(marker);
    if (position !== -1 && colon > position) return url;
  }
  return SAFE_PROTOCOLS.has(url.slice(0, colon).toLowerCase()) ? url : '';
}

// react-markdown의 components 규칙을 hast에 적용한다 (MarkdownPostView.tsx 114~160행)
// - 주소 필터(safeUrl)도 react-markdown과 같다. 4단계 공개 페이지가 이 함수를 쓰므로 여기서 막는다
function rehypePublicRules() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node, _index, parent) => {
      if (node.tagName === 'img') {
        const src = safeUrl(typeof node.properties.src === 'string' ? node.properties.src : '');
        const alt = typeof node.properties.alt === 'string' ? node.properties.alt : undefined;
        if (isVideoSource(src)) {
          node.tagName = 'video';
          const properties: Properties = {
            src,
            autoPlay: true,
            loop: true,
            muted: true,
            playsInline: true,
            className: ['w-full', 'rounded-lg'],
          };
          if (alt) properties.title = alt;
          node.properties = properties;
        } else {
          node.properties = { ...node.properties, src, className: ['rounded-lg'], loading: 'lazy' };
        }
        return;
      }
      if (node.tagName === 'a') {
        const href = safeUrl(typeof node.properties.href === 'string' ? node.properties.href : '');
        node.properties = { ...node.properties, href };
        if (href.startsWith('http')) {
          node.properties = {
            ...node.properties,
            target: '_blank',
            rel: ['noopener', 'noreferrer'],
          };
        }
        return;
      }
      if (node.tagName === 'code') {
        const inPre = parent?.type === 'element' && parent.tagName === 'pre';
        if (!inPre) {
          const existing = Array.isArray(node.properties.className)
            ? node.properties.className
            : [];
          node.properties = {
            ...node.properties,
            className: [...existing, 'rounded', 'bg-bg-card', 'px-1.5', 'py-0.5', 'text-sm'],
          };
        }
      }
    });
  };
}

const htmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallout)
  .use(remarkEmbed)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeHighlight)
  .use(rehypePublicRules)
  .use(rehypeStringify);

// 마크다운 → HTML (콜아웃·임베드·수식·하이라이트 포함)
export function markdownToHtml(markdown: string): string {
  return String(htmlProcessor.processSync(markdown));
}

// ───────────── 왕복 검사 정규화 (D1 규칙 1~5) ─────────────

// 공개 페이지 파서 그대로 (remark-math 없음)
const compareParser = unified().use(remarkParse).use(remarkGfm);
const compareBridge = unified().use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw);
const compareStringifier = unified().use(rehypeStringify);

// 블록 위치에 홀로 있는 <br> HTML 노드를 지운다 (규칙 2)
const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'listItem']);

function dropBlockBreaks(tree: Root) {
  visit(tree, 'html', (node, index, parent) => {
    if (!parent || index === undefined || !BLOCK_CONTAINERS.has(parent.type)) return;
    if (!isBreakOnlyHtml(node.value)) return;
    parent.children.splice(index, 1);
    return index;
  });
}

// 텍스트의 ZWSP를 지우고(규칙 1) 공백 묶음을 공백 하나로 합친다(규칙 3). 코드 안은 건드리지 않는다(규칙 4)
// <br> 바로 앞뒤의 공백은 지운다(규칙 6, 구현 중 추가): 브라우저는 줄 끝과 줄 처음의 공백을 그리지 않는다.
// `가<br />나`와 `가\`+줄바꿈+`나`는 같은 렌더다.
function normalizeHastText(node: HastNodes, inCode: boolean) {
  if (node.type === 'text') {
    if (!inCode) node.value = removeZwspAndSoftBreaks(node.value).replace(/[ \t\r\n]+/g, ' ');
    return;
  }
  if (!('children' in node)) return;
  const code =
    inCode || (node.type === 'element' && (node.tagName === 'code' || node.tagName === 'pre'));
  for (const child of node.children) normalizeHastText(child, code);
  if (!code) trimAroundBreaks(node.children);
}

// <br> 요소 양옆 텍스트의 공백을 지우고, 비게 된 텍스트 노드는 없앤다
function trimAroundBreaks(children: HastNodes[]) {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type !== 'element' || child.tagName !== 'br') continue;
    const previous = children[index - 1];
    if (previous?.type === 'text') previous.value = previous.value.replace(/ +$/, '');
    const next = children[index + 1];
    if (next?.type === 'text') next.value = next.value.replace(/^ +/, '');
  }
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child.type === 'text' && child.value === '') children.splice(index, 1);
  }
}

// 왕복 검사용 정규화 HTML. 두 마크다운의 결과가 같으면 독자가 보는 렌더가 같다
// - 위치 정보(규칙 5)는 HTML 문자열에 남지 않는다
// - 규칙 1~5는 Plan D1, 규칙 6(<br> 앞뒤 공백)은 구현 중 추가(작업 문서에 적는다)
export function normalizeForCompare(markdown: string): string {
  const mdast = compareParser.parse(markdown);
  dropBlockBreaks(mdast);
  const hast = compareBridge.runSync(mdast) as HastRoot;
  normalizeHastText(hast, false);
  return String(compareStringifier.stringify(hast));
}
