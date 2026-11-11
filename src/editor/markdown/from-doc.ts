// ProseMirror JSON → mdast (재건 3단계 D4, Plan 4.2의 역방향)
// - 에디터 문서 JSON을 mdast로 바꾼다. 마크다운 문자열은 lib/content/markdown.ts의 stringifyMarkdown이 쓴다.
// - 마크는 가장 길게 이어지는 것부터 감싼다(길이가 같으면 링크 > 기울임 > 굵게 > 취소선). 인라인 코드는 잎 노드다.
// - 마크 안의 앞뒤 공백은 마크 밖으로 민다(` 굵게 ` → ` **굵게** `). 마크다운은 `** x **`를 강조로 읽지 않는다.
// - 하드 브레이크는 `\`로 쓴다. 단락 끝, 제목 안, 표 셀 안에서는 `\`가 글자가 되거나 공백이 되므로 <br>로 쓴다.
// - 블록(단락·제목·표 셀) 처음과 끝의 공백, 하드 브레이크 앞뒤의 공백은 지운다(4단계 D14). 브라우저가 그리지 않는 공백이다.
//   남기면 mdast-util-to-markdown이 `&#x20;`로 쓴다. NBSP는 그려지므로 남긴다.
// - 모르는 노드·마크는 오류다. 스키마가 만든 문서에는 모르는 것이 없다.
// - 폭·정렬이 있는 이미지가 홀로 있는 단락은 원시 HTML 블록으로 쓴다(5단계 D13, image-html.ts). 폭·정렬이 없으면 지금처럼 ![]()다.

import type { JSONContent } from '@tiptap/core';
import type * as Md from 'mdast';
import type { EmbedNode } from '../../lib/content/markdown.ts';
import type { CalloutType } from '../../lib/content/remark-callout.ts';
import {
  canHoldImageLayout,
  imageHtml,
  imageLayoutOf,
  isBlankInline,
  soloImageIndex,
} from './image-html.ts';

type PmMark = { type: string; attrs?: Record<string, unknown> };

// 길이가 같을 때 마크를 감싸는 순서(바깥 → 안). CommonMark는 `***x***`를 <em><strong>으로 읽으므로 기울임이 굵게보다 바깥이다
const MARK_ORDER = ['link', 'italic', 'bold', 'strike'] as const;
type WrapMark = (typeof MARK_ORDER)[number];
// 변환기가 아는 마크 전부
const KNOWN_MARKS = new Set<string>([...MARK_ORDER, 'code']);

// 하드 브레이크를 어떻게 쓰는지
type BreakStyle = 'backslash' | 'html';

// 문서 JSON → mdast 루트
export function docToMdast(doc: JSONContent): Md.Root {
  if (doc.type !== 'doc') throw new Error(`문서 루트가 아닙니다: ${doc.type}`);
  return { type: 'root', children: convertBlocks(doc.content ?? [], 'doc') };
}

// 블록 목록을 바꾼다. parentType은 감싼 노드 이름이다(이미지 폭·정렬을 쓸 수 있는 자리인지 정한다)
function convertBlocks(nodes: ReadonlyArray<JSONContent>, parentType: string): Md.RootContent[] {
  const result: Md.RootContent[] = [];
  for (const node of nodes) {
    // 순번은 이미 쓴 블록 수다(빈 단락은 쓰지 않으므로 세지 않는다, 리뷰 S3)
    const converted = convertBlock(node, canHoldImageLayout(parentType, result.length));
    if (converted) result.push(converted);
  }
  return result;
}

function text(value: string): Md.Text {
  return { type: 'text', value };
}

function htmlBreak(): Md.Html {
  return { type: 'html', value: '<br>' };
}

function codeText(node: JSONContent): string {
  return (node.content ?? []).map((child) => child.text ?? '').join('');
}

// ───────────── 이미지 폭·정렬 (5단계 D13) ─────────────

// 빈 단락(쓰이지 않는 블록)인지
function isBlankParagraph(node: JSONContent): boolean {
  return node.type === 'paragraph' && isBlankInline(inlineShapes(node.content ?? []));
}

// 문서 JSON 인라인 → 판정용 모양
function inlineShapes(nodes: ReadonlyArray<JSONContent>) {
  return nodes.map((node) => ({
    type: node.type ?? '',
    text: node.text,
    marked: (node.marks?.length ?? 0) > 0,
  }));
}

// 이미지만 있는 단락이고 그 이미지에 폭·정렬이 있으면 원시 HTML 한 줄, 아니면 null
function layoutImageHtml(paragraph: JSONContent): string | null {
  const content = paragraph.content ?? [];
  const index = soloImageIndex(inlineShapes(content));
  if (index < 0) return null;
  const attrs = content[index].attrs;
  const layout = imageLayoutOf(attrs);
  const src = typeof attrs?.src === 'string' ? attrs.src : '';
  if (!layout || !src) return null;
  return imageHtml({
    src,
    alt: typeof attrs?.alt === 'string' ? attrs.alt : null,
    title: typeof attrs?.title === 'string' && attrs.title ? attrs.title : null,
    ...layout,
  });
}

// layoutAllowed: 이 자리의 단락을 HTML 블록으로 쓸 수 있는지(canHoldImageLayout)
function convertBlock(node: JSONContent, layoutAllowed: boolean): Md.RootContent | null {
  switch (node.type) {
    case 'paragraph': {
      const html = layoutAllowed ? layoutImageHtml(node) : null;
      if (html) return { type: 'html', value: html };
      const children = convertParagraphInlines(node.content ?? []);
      // 빈 단락(공백만 있는 단락 포함)은 마크다운에 없다
      return children.length > 0 ? { type: 'paragraph', children } : null;
    }
    case 'heading':
      return {
        type: 'heading',
        depth: clampDepth(Number(node.attrs?.level ?? 1)),
        // ATX 제목은 한 줄이라 `\` 줄바꿈을 쓸 수 없다
        children: trimBlockInlines(convertInlines(node.content ?? [], 'html')),
      };
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'blockquote':
      return {
        type: 'blockquote',
        children: convertBlocks(node.content ?? [], 'blockquote') as Md.BlockContent[],
      };
    case 'callout':
      return convertCallout(node);
    case 'bulletList':
      return convertList(node, { ordered: false, task: false });
    case 'orderedList':
      return convertList(node, { ordered: true, task: false });
    case 'taskList':
      return convertList(node, { ordered: false, task: true });
    case 'codeBlock':
      return {
        type: 'code',
        lang:
          typeof node.attrs?.language === 'string' && node.attrs.language
            ? node.attrs.language
            : null,
        meta: typeof node.attrs?.meta === 'string' && node.attrs.meta ? node.attrs.meta : null,
        value: codeText(node),
      };
    case 'table':
      return convertTable(node);
    case 'embed': {
      const embed: EmbedNode = {
        type: 'embed',
        provider: node.attrs?.provider === 'codesandbox' ? 'codesandbox' : 'youtube',
        url: String(node.attrs?.url ?? ''),
      };
      return embed;
    }
    case 'blockMath':
      return {
        type: 'math',
        meta: null,
        value: String(node.attrs?.latex ?? ''),
      } as unknown as Md.RootContent;
    default:
      throw new Error(`변환할 수 없는 블록 노드입니다: ${node.type}`);
  }
}

function clampDepth(level: number): Md.Heading['depth'] {
  const depth = Math.min(6, Math.max(1, Math.round(level)));
  return depth as Md.Heading['depth'];
}

// 콜아웃 → `> [!type]` 첫 줄을 더한 인용. 표시 줄은 이스케이프되지 않게 html 노드로 쓴다
// - 첫 블록이 단락이 아니면(이미지 폭·정렬 HTML 포함) 표시 줄을 단락 하나로 앞에 더한다
function convertCallout(node: JSONContent): Md.Blockquote {
  const type = String(node.attrs?.type ?? 'note') as CalloutType;
  const children = convertBlocks(node.content ?? [], 'callout') as Md.BlockContent[];
  const first = children[0];
  if (first && first.type === 'paragraph') {
    children[0] = {
      ...first,
      children: [{ type: 'html', value: `[!${type}]\n` }, ...first.children],
    };
  } else {
    children.unshift({ type: 'paragraph', children: [{ type: 'html', value: `[!${type}]` }] });
  }
  return { type: 'blockquote', children };
}

// 항목 안에 단락이 연이어 둘 있으면 마크다운은 빈 줄로만 나눌 수 있다. 그러면 remark가 느슨한 목록으로 읽는다.
// 다시 열었을 때 JSON이 같도록 처음부터 느슨하게 쓴다
// - 이미지 폭·정렬 HTML 블록도 같다(5단계 D13). HTML 블록은 빈 줄까지 이어져 같은 항목의 다음 블록을 삼킨다.
//   앞 블록이 단락으로 끝나면 HTML 블록(<img>)이 그 단락의 줄로 읽힌다. 그래서 항목에 다른 블록이 있으면 빈 줄로 나눈다
function itemForcesSpread(item: JSONContent): boolean {
  const blocks = item.content ?? [];
  const parentType = item.type ?? 'listItem';
  return blocks.some(
    (block, index) =>
      (block.type === 'paragraph' && blocks[index - 1]?.type === 'paragraph') ||
      (blocks.length > 1 &&
        block.type === 'paragraph' &&
        canHoldImageLayout(
          parentType,
          blocks.slice(0, index).filter((before) => !isBlankParagraph(before)).length,
        ) &&
        layoutImageHtml(block) !== null),
  );
}

function convertList(node: JSONContent, kind: { ordered: boolean; task: boolean }): Md.List {
  const items = node.content ?? [];
  const spread = node.attrs?.spread === true || items.some(itemForcesSpread);
  return {
    type: 'list',
    ordered: kind.ordered,
    start: kind.ordered ? Number(node.attrs?.start ?? 1) : null,
    spread,
    children: items.map((item) => ({
      type: 'listItem',
      spread,
      checked: kind.task ? item.attrs?.checked === true : null,
      children: convertBlocks(item.content ?? [], item.type ?? 'listItem') as Md.BlockContent[],
    })),
  };
}

// 표: 셀 안은 한 줄이다. 하드 브레이크와 단락 경계는 <br>로 쓴다. 열 정렬은 첫 행 셀의 align
function convertTable(node: JSONContent): Md.Table {
  const rows = node.content ?? [];
  const firstRow = rows[0]?.content ?? [];
  const align: Md.AlignType[] = firstRow.map((cell) => toAlign(cell.attrs?.align));
  return {
    type: 'table',
    align,
    children: rows.map((row) => ({
      type: 'tableRow',
      children: (row.content ?? []).map((cell) => ({
        type: 'tableCell',
        children: convertCellInlines(cell),
      })),
    })),
  };
}

function toAlign(value: unknown): Md.AlignType {
  return value === 'left' || value === 'right' || value === 'center' ? value : null;
}

function convertCellInlines(cell: JSONContent): Md.PhrasingContent[] {
  const result: Md.PhrasingContent[] = [];
  for (const block of cell.content ?? []) {
    const inlines = trimBlockInlines(
      block.type === 'paragraph'
        ? convertInlines(block.content ?? [], 'html')
        : [text(codeText(block))],
    );
    if (inlines.length === 0) continue;
    if (result.length > 0) result.push(htmlBreak());
    result.push(...inlines);
  }
  return result;
}

// ───────────── 블록 앞뒤 공백 (4단계 D14) ─────────────

// 브라우저가 블록 처음·끝과 줄바꿈(<br>) 옆에서 지우는 공백. NBSP(U+00A0)는 그려지므로 넣지 않는다
const COLLAPSIBLE_START = /^[ \t\n\r\f]+/;
const COLLAPSIBLE_END = /[ \t\n\r\f]+$/;

type Side = 'start' | 'end';

// 자식 인라인을 갖는 노드 (마크와 링크)
function phrasingParent(
  node: Md.PhrasingContent,
): (Md.Link | Md.Strong | Md.Emphasis | Md.Delete) | null {
  return node.type === 'link' ||
    node.type === 'strong' ||
    node.type === 'emphasis' ||
    node.type === 'delete'
    ? node
    : null;
}

function isBreak(node: Md.PhrasingContent): boolean {
  return node.type === 'break' || (node.type === 'html' && node.value === '<br>');
}

// nodes의 한쪽 끝 글자의 공백을 지운다. 비게 된 글자 노드는 없앤다.
// 마크·링크 안으로 들어간다. 글자가 아닌 잎(코드·이미지·수식·줄바꿈)을 만나면 멈춘다
function trimEdge(nodes: Md.PhrasingContent[], side: Side): void {
  while (nodes.length > 0) {
    const index = side === 'start' ? 0 : nodes.length - 1;
    const node = nodes[index];
    if (node.type === 'text') {
      node.value = node.value.replace(side === 'start' ? COLLAPSIBLE_START : COLLAPSIBLE_END, '');
      if (node.value !== '') return;
      nodes.splice(index, 1);
      continue;
    }
    const parent = phrasingParent(node);
    if (parent) {
      trimEdge(parent.children, side);
      // 공백만 있던 마크·링크는 비게 된다. 빈 링크는 보이지 않는 포커스 자리가 되고 다시 열면 사라지므로 지운다
      if (parent.children.length === 0) {
        nodes.splice(index, 1);
        continue;
      }
    }
    return;
  }
}

// 하드 브레이크 바로 앞뒤의 공백을 지운다 (마크 안의 줄바꿈 포함)
function trimAroundBreaks(nodes: Md.PhrasingContent[]): void {
  for (const node of nodes) {
    const parent = phrasingParent(node);
    if (parent) trimAroundBreaks(parent.children);
  }
  for (let index = 0; index < nodes.length; index += 1) {
    if (!isBreak(nodes[index])) continue;
    // 앞쪽: 줄바꿈 바로 앞 노드들의 끝
    const before = nodes.slice(0, index);
    trimEdge(before, 'end');
    // 뒤쪽: 줄바꿈 바로 뒤 노드들의 처음
    const after = nodes.slice(index + 1);
    trimEdge(after, 'start');
    nodes.splice(0, nodes.length, ...before, nodes[index], ...after);
    index = before.length;
  }
}

// 블록 하나의 인라인: 줄바꿈 앞뒤와 처음·끝의 공백을 지운다
function trimBlockInlines(nodes: Md.PhrasingContent[]): Md.PhrasingContent[] {
  trimAroundBreaks(nodes);
  trimEdge(nodes, 'start');
  trimEdge(nodes, 'end');
  return nodes;
}

// ───────────── 인라인 ─────────────

// 단락의 인라인
// - 먼저 공백을 지운다(D14). 그 뒤 끝에 남은 하드 브레이크를 <br>로 바꾼다(`\` 뒤에 글이 없으면 글자가 된다).
//   순서가 반대면 `a` + 줄바꿈 + 공백에서 공백만 지워져 끝 줄바꿈이 `\`로 남는다(4단계 리뷰 중요 1).
function convertParagraphInlines(nodes: ReadonlyArray<JSONContent>): Md.PhrasingContent[] {
  const result = trimBlockInlines(convertInlines(nodes, 'backslash'));
  convertTrailingBreaks(result);
  return result;
}

// 끝의 하드 브레이크를 <br>로 바꾼다. 마크 안의 끝 브레이크도 바꾼다(`**a\` + 줄바꿈 + `**`는 강조가 깨진다)
function convertTrailingBreaks(nodes: Md.PhrasingContent[]): void {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.type === 'break') {
      nodes[index] = htmlBreak();
      continue;
    }
    if (isBreak(node)) continue;
    const parent = phrasingParent(node);
    if (parent) convertTrailingBreaks(parent.children);
    return;
  }
}

function convertInlines(
  nodes: ReadonlyArray<JSONContent>,
  breakStyle: BreakStyle,
): Md.PhrasingContent[] {
  return wrapMarks(nodes, breakStyle);
}

function markOf(node: JSONContent, mark: WrapMark): PmMark | undefined {
  return node.marks?.find((candidate) => candidate.type === mark);
}

// 두 노드가 같은 마크를 갖는지 (링크는 href·title까지 같아야 한다)
function sameMark(mark: WrapMark, a: PmMark | undefined, b: PmMark | undefined): boolean {
  if (!a || !b) return false;
  if (mark !== 'link') return true;
  return a.attrs?.href === b.attrs?.href && (a.attrs?.title ?? null) === (b.attrs?.title ?? null);
}

// index부터 같은 마크가 이어지는 길이
function runLength(
  nodes: ReadonlyArray<JSONContent>,
  index: number,
  mark: WrapMark,
  first: PmMark,
): number {
  let end = index + 1;
  while (end < nodes.length && sameMark(mark, first, markOf(nodes[end], mark))) end += 1;
  return end - index;
}

function withoutMark(node: JSONContent, mark: WrapMark): JSONContent {
  const marks = node.marks?.filter((candidate) => candidate.type !== mark);
  return marks && marks.length > 0 ? { ...node, marks } : { ...node, marks: undefined };
}

// 마크가 이어지는 구간을 하나의 mdast 노드로 감싼다
// - 각 위치에서 가장 길게 이어지는 마크를 먼저 감싼다. 그래야 `_a **b**_`가 <em>a <strong>b</strong></em>로 원문 구조를 지킨다.
// - 길이가 같으면 MARK_ORDER 순서다. 원문이 `**_x_**`였는지 `_**x**_`였는지는 ProseMirror 문서에 남지 않는다(알려진 한계).
function wrapMarks(
  nodes: ReadonlyArray<JSONContent>,
  breakStyle: BreakStyle,
): Md.PhrasingContent[] {
  const result: Md.PhrasingContent[] = [];
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    let best: { mark: WrapMark; pm: PmMark; length: number } | null = null;
    for (const mark of MARK_ORDER) {
      const pm = markOf(node, mark);
      if (!pm) continue;
      const length = runLength(nodes, index, mark, pm);
      if (!best || length > best.length) best = { mark, pm, length };
    }
    if (!best) {
      result.push(convertLeaf(node, breakStyle));
      index += 1;
      continue;
    }
    const chosen = best;
    const inner = wrapMarks(
      nodes.slice(index, index + chosen.length).map((item) => withoutMark(item, chosen.mark)),
      breakStyle,
    );
    result.push(...wrapWith(chosen.mark, chosen.pm, inner));
    index += chosen.length;
  }
  return result;
}

// 마크 구간의 앞뒤 공백을 떼어 낸다. 링크는 공백을 안에 둬도 되므로 그대로 둔다
function splitEdgeSpaces(children: Md.PhrasingContent[]): {
  before: string;
  inner: Md.PhrasingContent[];
  after: string;
} {
  const inner = children.map((child) => ({ ...child }));
  let before = '';
  let after = '';
  const first = inner[0];
  if (first?.type === 'text') {
    const match = /^\s+/.exec(first.value);
    if (match) {
      before = match[0];
      first.value = first.value.slice(match[0].length);
    }
  }
  const last = inner[inner.length - 1];
  if (last?.type === 'text') {
    const match = /\s+$/.exec(last.value);
    if (match) {
      after = match[0];
      last.value = last.value.slice(0, last.value.length - match[0].length);
    }
  }
  return {
    before,
    inner: inner.filter((child) => !(child.type === 'text' && child.value === '')),
    after,
  };
}

function wrapWith(
  mark: WrapMark,
  pm: PmMark,
  children: Md.PhrasingContent[],
): Md.PhrasingContent[] {
  if (mark === 'link') {
    return [
      {
        type: 'link',
        url: String(pm.attrs?.href ?? ''),
        title: typeof pm.attrs?.title === 'string' && pm.attrs.title ? pm.attrs.title : null,
        children,
      },
    ];
  }
  const { before, inner, after } = splitEdgeSpaces(children);
  const result: Md.PhrasingContent[] = [];
  if (before) result.push(text(before));
  if (inner.length > 0) {
    if (mark === 'bold') result.push({ type: 'strong', children: inner });
    else if (mark === 'italic') result.push({ type: 'emphasis', children: inner });
    else result.push({ type: 'delete', children: inner });
  }
  if (after) result.push(text(after));
  return result;
}

// 잎 노드: 텍스트(코드 마크면 inlineCode), 이미지, 하드 브레이크, 인라인 수식
function convertLeaf(node: JSONContent, breakStyle: BreakStyle): Md.PhrasingContent {
  switch (node.type) {
    case 'text': {
      const value = node.text ?? '';
      for (const mark of node.marks ?? []) {
        if (!KNOWN_MARKS.has(mark.type)) throw new Error(`변환할 수 없는 마크입니다: ${mark.type}`);
      }
      if (node.marks?.some((mark) => mark.type === 'code')) return { type: 'inlineCode', value };
      return text(value);
    }
    case 'image':
      return {
        type: 'image',
        url: String(node.attrs?.src ?? ''),
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : null,
        title: typeof node.attrs?.title === 'string' && node.attrs.title ? node.attrs.title : null,
      };
    case 'hardBreak':
      return breakStyle === 'html' ? htmlBreak() : { type: 'break' };
    case 'inlineMath':
      return {
        type: 'inlineMath',
        value: String(node.attrs?.latex ?? ''),
      } as unknown as Md.PhrasingContent;
    default:
      throw new Error(`변환할 수 없는 인라인 노드입니다: ${node.type}`);
  }
}
