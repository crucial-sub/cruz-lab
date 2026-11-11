// 공유 마크다운 파이프라인 (재건 3단계 Plan 4.3)
// - parseMarkdown: 공개 페이지와 같은 파서(remark-parse + remark-gfm)에 remark-math를 더한 것. 변환기와 미리보기가 쓴다.
// - renderMarkdown·markdownToHtml: 미리보기 모드와 공개 페이지(4단계)가 쓰는 HTML. react-markdown의 규칙(영상 → video,
//   외부 링크 → 새 창)을 옮겼다. 4단계: 하이라이트는 주입받은 Shiki(D8), 제목 id·목차(D16), 새 자산 srcset(D15),
//   코드 블록 틀(D8). 하이라이터가 없으면 코드는 민무늬다.
// - normalizeForCompare: 왕복 검사(D1). 공개 페이지 파서로 읽고 정규화 규칙 1~5를 적용한 HTML 문자열.
// - stringifyMarkdown: 변환기가 마크다운을 쓸 때의 표기 옵션(Plan 4.2)을 한 곳에 둔다.
// - 브라우저와 Node에서 같이 돈다. Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

import type { Root as HastRoot, Nodes as HastNodes, Properties } from 'hast';
import type { Image, Link, Node as MdNode, Root } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import type { EmbedProvider } from './embed-url.ts';
import type { CodeHighlighter } from './shiki-languages.ts';
import rehypeAssets, { type RenderAsset } from './rehype-assets.ts';
import rehypeHeadings, { tocOf, type FileWithData, type TocEntry } from './rehype-headings.ts';
import rehypeCodeBlocks, { remarkCodeMeta } from './rehype-shiki.ts';
import remarkCallout from './remark-callout.ts';
import remarkEmbed, { embedUrlOfParagraph } from './remark-embed.ts';
import rehypeStripUnsafe from './rehype-strip-unsafe.ts';
import { isVideoUrl, safeUrl, VIDEO_EXTENSIONS } from './safe-url.ts';

export type { CodeHighlighter, RenderAsset, TocEntry };

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

// 주소 판정(safeUrl, isVideoUrl, VIDEO_EXTENSIONS)은 safe-url.ts에 있다. 여기서 다시 내보낸다
export { isVideoUrl, safeUrl, VIDEO_EXTENSIONS };

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
    // 이미지·링크 목적지는 이스케이프 없이 쓴다(4단계 D14). 기본 핸들러는 `&`를 `\&`로 쓴다
    image: handleImage,
    link: handleLink,
  },
};

// 날 주소 한 줄을 다시 읽었을 때 같은 주소의 임베드 단락이 되는지 (GFM 자동 링크는 끝의 `_ * ~ . , : ; ! ?`를 링크에서 뺀다)
function bareUrlStaysEmbed(url: string): boolean {
  const first = parseMarkdown(url).children[0];
  return first?.type === 'paragraph' && embedUrlOfParagraph(first) === url;
}

// ───────────── 이미지·링크 목적지 (4단계 D14) ─────────────

// mdast-util-to-markdown 기본 핸들러는 목적지의 `&` 뒤에 글자가 오면 `\&`로 쓴다(`?alt=media\&token=`).
// CommonMark는 목적지 안의 `\&`와 `&`를 같은 글자로 읽으므로 렌더는 같다. 그러나 백업 저장소의 마크다운에서
// 주소를 복사하면 `\`가 붙는다. 그래서 목적지는 다시 읽었을 때 같은 주소가 되는 최소한만 이스케이프한다.
// - `\` 뒤에 ASCII 문장 부호가 오거나 `\`가 주소 끝이면 `\\`로 쓴다(그대로 두면 이스케이프로 읽힌다.
//   끝의 `\`는 뒤에 붙는 `)`·`>`를 이스케이프한다).
// - `&`가 문자 참조(`&amp;`, `&#38;`, `&#x26;`)를 이루면 `\&`로 쓴다(그대로 두면 참조로 읽힌다). 그 밖 `&`는 그대로다.
// - 공백·제어 문자·`<`·`>`·`(`·`)`가 있으면 `<…>`로 감싸고 안의 `<`·`>`를 `\<`·`\>`로 쓴다(CommonMark 목적지 규칙).
// - 줄바꿈(LF·CR)은 `&#xA;`·`&#xD;`로 쓴다.
const ESCAPABLE_BACKSLASH = /\\(?=[!-/:-@[-`{-~]|$)/g;
const CHARACTER_REFERENCE_START =
  /&(?=#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};|[A-Za-z][A-Za-z0-9]{0,31};)/g;
const NEEDS_POINTY_DESTINATION = /[\0- \u007F<>()]/;

export function encodeDestination(url: string, hasTitle: boolean): string {
  if (!url) return hasTitle ? '<>' : '';
  const escaped = url
    .replace(ESCAPABLE_BACKSLASH, '\\\\')
    .replace(CHARACTER_REFERENCE_START, '\\&')
    // 꺾쇠 목적지에도 줄 끝은 올 수 없다. 문자 참조로 쓴다(기본 핸들러와 같다)
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
  if (!NEEDS_POINTY_DESTINATION.test(url)) return escaped;
  return `<${escaped.replace(/[<>]/g, (char) => `\\${char}`)}>`;
}

type StringifyHandlers = NonNullable<StringifyOptions['handlers']>;
type ImageHandler = NonNullable<StringifyHandlers['image']>;
type HandlerState = Parameters<ImageHandler>[2];
type HandlerInfo = Parameters<ImageHandler>[3];

function checkQuote(state: HandlerState): '"' | "'" {
  return state.options.quote === "'" ? "'" : '"';
}

// 제목 `"…"` (기본 핸들러와 같은 이스케이프)
function writeTitle(
  title: string,
  state: HandlerState,
  tracker: ReturnType<HandlerState['createTracker']>,
  before: string,
): string {
  const quote = checkQuote(state);
  const exit = state.enter(quote === '"' ? 'titleQuote' : 'titleApostrophe');
  let value = tracker.move(' ' + quote);
  value += tracker.move(
    state.safe(title, { before: before + value, after: quote, ...tracker.current() }),
  );
  value += tracker.move(quote);
  exit();
  return value;
}

// 이미지: 기본 핸들러(mdast-util-to-markdown 2.1.2 handle/image.js)와 같고 목적지만 encodeDestination이다
function handleImage(
  node: Image,
  _parent: unknown,
  state: HandlerState,
  info: HandlerInfo,
): string {
  const exit = state.enter('image');
  const labelExit = state.enter('label');
  const tracker = state.createTracker(info);
  let value = tracker.move('![');
  value += tracker.move(state.safe(node.alt, { before: value, after: ']', ...tracker.current() }));
  value += tracker.move('](');
  labelExit();
  value += tracker.move(encodeDestination(node.url, Boolean(node.title)));
  if (node.title) value += writeTitle(node.title, state, tracker, value);
  value += tracker.move(')');
  exit();
  return value;
}
handleImage.peek = () => '!';

// 링크를 자동 링크(<주소>)로 쓸지 (기본 핸들러의 formatLinkAsAutolink와 같다)
function formatLinkAsAutolink(node: Link, state: HandlerState): boolean {
  const raw = mdastToString(node);
  return Boolean(
    !state.options.resourceLink &&
      node.url &&
      !node.title &&
      node.children.length === 1 &&
      node.children[0].type === 'text' &&
      (raw === node.url || 'mailto:' + raw === node.url) &&
      /^[a-z][a-z+.-]+:/i.test(node.url) &&
      !/[\0- <>\u007F]/.test(node.url),
  );
}

// 링크: 기본 핸들러(handle/link.js)와 같고 목적지만 encodeDestination이다. 자동 링크는 기본과 같다
function handleLink(node: Link, _parent: unknown, state: HandlerState, info: HandlerInfo): string {
  const tracker = state.createTracker(info);
  if (formatLinkAsAutolink(node, state)) {
    // 자동 링크 안에서는 이스케이프가 듣지 않는다. 문맥 스택을 숨긴다(기본 핸들러와 같다)
    const stack = state.stack;
    state.stack = [];
    const exit = state.enter('autolink');
    let value = tracker.move('<');
    value += tracker.move(
      state.containerPhrasing(node, { before: value, after: '>', ...tracker.current() }),
    );
    value += tracker.move('>');
    exit();
    state.stack = stack;
    return value;
  }
  const exit = state.enter('link');
  const labelExit = state.enter('label');
  let value = tracker.move('[');
  value += tracker.move(
    state.containerPhrasing(node, { before: value, after: '](', ...tracker.current() }),
  );
  value += tracker.move('](');
  labelExit();
  value += tracker.move(encodeDestination(node.url, Boolean(node.title)));
  if (node.title) value += writeTitle(node.title, state, tracker, value);
  value += tracker.move(')');
  exit();
  return value;
}
handleLink.peek = (node: Link, _parent: unknown, state: HandlerState) =>
  formatLinkAsAutolink(node, state) ? '<' : '[';

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

// ───────────── HTML (미리보기, 공개 페이지) ─────────────

// react-markdown의 components 규칙을 hast에 적용한다 (옛 MarkdownPostView.tsx 114~160행)
// - 주소 필터(safeUrl)도 react-markdown과 같다. 공개 페이지가 이 함수를 쓰므로 여기서 막는다
// - 4단계: 모양 클래스(Tailwind rounded-lg 등)를 붙이지 않는다. 모양은 src/styles/prose.css가 정한다.
//   이미지는 lazy + async 디코딩, 영상은 preload="metadata"(D15)
function rehypePublicRules() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'img') {
        const src = safeUrl(typeof node.properties.src === 'string' ? node.properties.src : '');
        const alt = typeof node.properties.alt === 'string' ? node.properties.alt : undefined;
        if (isVideoUrl(src)) {
          node.tagName = 'video';
          const properties: Properties = {
            src,
            autoPlay: true,
            loop: true,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          };
          if (alt) properties.title = alt;
          node.properties = properties;
        } else {
          node.properties = { ...node.properties, src, loading: 'lazy', decoding: 'async' };
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
      }
    });
  };
}

// 표를 가로 스크롤 상자로 감싼다 (좁은 화면에서 표가 본문 폭을 넘지 않게. 키보드로도 스크롤하도록 tabindex,
// 탭이 멈추는 자리라 이름 있는 영역(role=region, aria-label)으로 둔다)
function rehypeTableScroll() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined) return undefined;
      if (parent.type === 'element' && parent.tagName === 'div') {
        const classes = Array.isArray(parent.properties.className)
          ? parent.properties.className
          : [];
        if (classes.includes('table-scroll')) return SKIP;
      }
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: '표' },
        children: [node],
      };
      return SKIP;
    });
  };
}

// KaTeX 결과가 있는지 file.data.hasMath에 적는다 (글 상세가 KaTeX CSS를 넣을지 정한다, D16)
function rehypeMathFlag() {
  return (tree: HastRoot, file: FileWithData) => {
    let found = false;
    visit(tree, 'element', (node) => {
      const classes = Array.isArray(node.properties.className) ? node.properties.className : [];
      if (classes.includes('katex')) {
        found = true;
        return false;
      }
      return undefined;
    });
    file.data.hasMath = found;
  };
}

export interface MarkdownRenderOptions {
  // 코드 하이라이터(Shiki). 없으면 코드 블록은 민무늬다(틀은 같다)
  highlighter?: CodeHighlighter;
  // 새 자산 srcset·크기(D15). 없으면 이미지 주소 그대로다
  assets?: { byId: ReadonlyMap<string, RenderAsset>; bucket: string };
  // 문서 안 id와 그 id를 가리키는 #주소·aria-describedby 앞에 붙일 글자.
  // 한 페이지에 본문 여러 개를 그릴 때(/notes 스트림) 제목·각주 id가 겹치지 않게 한다(4단계 PR-B 리뷰 경미 5)
  idPrefix?: string;
}

// 문서 안 id에 접두사를 붙인다 (idPrefix, 처리의 마지막 단계)
// - hast에서 바꾼다. 글자(코드 안의 id="…" 등)는 건드리지 않는다.
// - 목차(file.data.toc)는 이미 뽑았으므로 바뀌지 않는다. 스트림은 목차를 쓰지 않는다.
function rehypePrefixIds(options: { prefix: string }) {
  const { prefix } = options;
  return (tree: HastRoot) => {
    visit(tree, 'element', (node) => {
      const { properties } = node;
      if (typeof properties.id === 'string' && properties.id) properties.id = `${prefix}${properties.id}`;
      if (typeof properties.href === 'string' && properties.href.startsWith('#') && properties.href.length > 1) {
        properties.href = `#${prefix}${properties.href.slice(1)}`;
      }
      if (Array.isArray(properties.ariaDescribedBy)) {
        properties.ariaDescribedBy = properties.ariaDescribedBy.map((id) => `${prefix}${id}`);
      }
    });
  };
}

export interface MarkdownRenderResult {
  html: string;
  // h2·h3 목차 (문서 순서)
  toc: TocEntry[];
  // KaTeX 결과가 있는지
  hasMath: boolean;
}

// 옵션에 맞는 처리기를 만든다
// - 순서: 원시 HTML → 안전 처리 → 제목 id·목차 → KaTeX → 코드 블록(하이라이트·틀) → 주소·영상 규칙 → 표 스크롤 상자 → srcset
// - 안전 처리(rehype-strip-unsafe)가 먼저 돈다. 그 뒤에 만드는 것(제목 앵커, 코드 틀의 button, Shiki·KaTeX의 style)은 남는다
function createHtmlProcessor(options: MarkdownRenderOptions) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkCallout)
    .use(remarkEmbed)
    .use(remarkCodeMeta)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // 원시 HTML의 스크립트·이벤트 속성·위험 주소를 지운다(3단계 리뷰 6.2 지적 11)
    .use(rehypeStripUnsafe)
    .use(rehypeHeadings)
    .use(rehypeKatex)
    .use(rehypeMathFlag)
    .use(rehypeCodeBlocks, { highlighter: options.highlighter })
    .use(rehypePublicRules)
    .use(rehypeTableScroll);
  if (options.assets) {
    processor.use(rehypeAssets, { assets: options.assets.byId, bucket: options.assets.bucket });
  }
  if (options.idPrefix) {
    processor.use(rehypePrefixIds, { prefix: options.idPrefix });
  }
  return processor.use(rehypeStringify);
}

// 옵션이 없는 처리기는 하나를 다시 쓴다(미리보기 첫 화면, 테스트)
const plainHtmlProcessor = createHtmlProcessor({});

// 마크다운 → HTML + 목차 + 수식 여부 (콜아웃·임베드·수식·코드 틀 포함, 원시 HTML 안전 처리)
export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): MarkdownRenderResult {
  const processor =
    options.highlighter || options.assets || options.idPrefix
      ? createHtmlProcessor(options)
      : plainHtmlProcessor;
  const file = processor.processSync(markdown);
  return {
    html: String(file),
    toc: tocOf(file),
    hasMath: file.data.hasMath === true,
  };
}

// 마크다운 → HTML (renderMarkdown의 html만)
export function markdownToHtml(markdown: string, options: MarkdownRenderOptions = {}): string {
  return renderMarkdown(markdown, options).html;
}

// ───────────── 왕복 검사 정규화 (규칙 1~7) ─────────────

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
  // 규칙 7(4단계 사용자 결정 2026-11-09): 블록 처음·끝의 공백을 지운다
  if (!code && node.type === 'element' && EDGE_TRIM_BLOCKS.has(node.tagName)) {
    trimHastEdge(node.children, 'start');
    trimHastEdge(node.children, 'end');
  }
}

// 규칙 7: 브라우저는 블록의 처음·끝 공백을 그리지 않는다(규칙 3·6과 같은 근거).
// 4단계 D14 변환기가 단락 끝 공백(`&#x20;`)을 지운 글이 왕복 검사에서 다르게 보이지 않게 한다.
// - 대상 블록: 단락, 제목, 목록 항목, 표 칸
// - 링크·강조 같은 인라인 요소 안으로 들어간다. 코드·이미지·줄바꿈 같은 잎을 만나면 멈춘다(그 옆 공백은 보인다)
// - NBSP는 공백이 아니라 글자다. 지우지 않는다(규칙 3이 이미 스페이스·탭·줄바꿈만 합친다)
const EDGE_TRIM_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th']);
const EDGE_TRIM_INLINES = new Set([
  'a',
  'strong',
  'em',
  'del',
  's',
  'b',
  'i',
  'u',
  'span',
  'mark',
  'small',
]);

function trimHastEdge(children: HastNodes[], side: 'start' | 'end') {
  while (children.length > 0) {
    const index = side === 'start' ? 0 : children.length - 1;
    const child = children[index];
    if (child.type === 'text') {
      child.value = child.value.replace(side === 'start' ? /^ +/ : / +$/, '');
      if (child.value !== '') return;
      children.splice(index, 1);
      continue;
    }
    if (child.type === 'element' && EDGE_TRIM_INLINES.has(child.tagName)) {
      trimHastEdge(child.children, side);
    }
    return;
  }
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
// - 규칙 1~5는 3단계 Plan D1, 규칙 6(<br> 앞뒤 공백)은 3단계 구현 중 추가,
//   규칙 7(블록 처음·끝 공백)은 4단계 사용자 결정(2026-11-09, 4단계 작업 문서 5절 21)
export function normalizeForCompare(markdown: string): string {
  const mdast = compareParser.parse(markdown);
  dropBlockBreaks(mdast);
  const hast = compareBridge.runSync(mdast) as HastRoot;
  normalizeHastText(hast, false);
  return String(compareStringifier.stringify(hast));
}
