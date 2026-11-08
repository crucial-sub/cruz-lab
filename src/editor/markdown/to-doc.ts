// mdast → ProseMirror JSON (재건 3단계 D4, Plan 4.2)
// - 공개 페이지와 같은 파서가 만든 mdast를 에디터 문서 JSON으로 바꾼다. DOM이 필요 없다.
// - 텍스트의 ZWSP는 지우고 줄 안 줄바꿈은 공백으로 둔다(공개 페이지가 그렇게 그린다).
//   ZWSP 바로 옆의 줄바꿈은 브라우저가 지우므로(CSS Text segment break 변환) 공백으로 바꾸지 않고 없앤다.
// - 원시 HTML은 <br>만 받는다. 그 밖은 텍스트로 두고 경고한다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

import type { JSONContent } from '@tiptap/core';
import type * as Md from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import {
  countBreakTags,
  isBreakOnlyHtml,
  removeZwspAndSoftBreaks,
} from '../../lib/content/markdown.ts';
import { detectCallout } from '../../lib/content/remark-callout.ts';
import { embedOfParagraph } from '../../lib/content/remark-embed.ts';

export interface ConversionWarning {
  code: 'unsupported-html' | 'unsupported-node';
  message: string;
  // 문제가 된 원문 조각
  detail: string;
}

type PmMark = { type: string; attrs?: Record<string, unknown> };

// remark-math 노드 (mdast 타입 확장은 remark-math가 등록한다. 여기서는 필요한 칸만 본다)
type MathLike = { type: 'math' | 'inlineMath'; value: string };

// mdast 루트 → 문서 JSON과 경고 목록
export function mdastToDoc(root: Md.Root): { doc: JSONContent; warnings: ConversionWarning[] } {
  const warnings: ConversionWarning[] = [];
  const content = convertBlocks(root.children, warnings);
  return {
    doc: { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] },
    warnings,
  };
}

// 블록 노드 목록 → PM 블록 노드 목록
function convertBlocks(
  nodes: ReadonlyArray<Md.RootContent>,
  warnings: ConversionWarning[],
): JSONContent[] {
  const result: JSONContent[] = [];
  for (const node of nodes) result.push(...convertBlock(node, warnings));
  return result;
}

function paragraphOf(inlines: JSONContent[]): JSONContent {
  return inlines.length > 0 ? { type: 'paragraph', content: inlines } : { type: 'paragraph' };
}

// 경고를 남기고 원문을 텍스트 단락으로 둔다
function unsupportedBlock(
  node: Md.RootContent,
  code: ConversionWarning['code'],
  warnings: ConversionWarning[],
): JSONContent[] {
  const text = 'value' in node && typeof node.value === 'string' ? node.value : mdastToString(node);
  warnings.push({
    code,
    message:
      code === 'unsupported-html'
        ? '지원하지 않는 HTML은 텍스트로 남습니다'
        : `지원하지 않는 노드(${node.type})는 텍스트로 남습니다`,
    detail: text.slice(0, 200),
  });
  return text ? [paragraphOf([{ type: 'text', text }])] : [];
}

function convertBlock(node: Md.RootContent, warnings: ConversionWarning[]): JSONContent[] {
  switch (node.type) {
    case 'paragraph': {
      const embed = embedOfParagraph(node);
      if (embed) return [{ type: 'embed', attrs: { provider: embed.provider, url: embed.url } }];
      return [paragraphOf(convertInlines(node.children, [], warnings))];
    }
    case 'heading':
      return [
        withContent(
          { type: 'heading', attrs: { level: node.depth } },
          convertInlines(node.children, [], warnings),
        ),
      ];
    case 'thematicBreak':
      return [{ type: 'horizontalRule' }];
    case 'blockquote': {
      const callout = detectCallout(node);
      if (callout) {
        return [
          {
            type: 'callout',
            attrs: { type: callout.type },
            content: nonEmptyBlocks(convertBlocks(callout.children, warnings)),
          },
        ];
      }
      return [
        { type: 'blockquote', content: nonEmptyBlocks(convertBlocks(node.children, warnings)) },
      ];
    }
    case 'list':
      return [convertList(node, warnings)];
    case 'code': {
      const block: JSONContent = {
        type: 'codeBlock',
        attrs: { language: node.lang ?? null, meta: node.meta ?? null },
      };
      if (node.value) block.content = [{ type: 'text', text: node.value }];
      return [block];
    }
    case 'html':
      // 블록 위치의 <br>은 세로 여백만 만든다. 버린다(D1 정규화 2)
      if (isBreakOnlyHtml(node.value)) return [];
      return unsupportedBlock(node, 'unsupported-html', warnings);
    case 'table':
      return [convertTable(node, warnings)];
    case 'math':
      return [{ type: 'blockMath', attrs: { latex: (node as unknown as MathLike).value } }];
    default:
      return unsupportedBlock(node, 'unsupported-node', warnings);
  }
}

// 블록 컨테이너(인용, 콜아웃, 목록 항목)는 자식이 하나 이상이어야 한다
function nonEmptyBlocks(blocks: JSONContent[]): JSONContent[] {
  return blocks.length > 0 ? blocks : [{ type: 'paragraph' }];
}

function withContent(node: JSONContent, content: JSONContent[]): JSONContent {
  return content.length > 0 ? { ...node, content } : node;
}

// 목록의 느슨함 (mdast-util-to-hast와 같은 판정: 목록 spread이거나 항목 하나라도 spread)
function isLooseList(node: Md.List): boolean {
  if (node.spread) return true;
  return node.children.some((item) =>
    item.spread === null || item.spread === undefined ? item.children.length > 1 : item.spread,
  );
}

// 체크 항목이 하나라도 있으면 체크 목록이다. 섞인 목록(체크 항목과 보통 항목)은 모두 체크 항목이 된다(알려진 한계. 기존 글에는 없다)
function convertList(node: Md.List, warnings: ConversionWarning[]): JSONContent {
  const spread = isLooseList(node);
  const isTask = node.children.some((item) => typeof item.checked === 'boolean');
  const items = node.children.map((item) => convertListItem(item, isTask, warnings));
  if (isTask) return { type: 'taskList', content: items };
  if (node.ordered)
    return { type: 'orderedList', attrs: { start: node.start ?? 1, spread }, content: items };
  return { type: 'bulletList', attrs: { spread }, content: items };
}

// 목록 항목의 첫 자식은 단락이어야 한다(Tiptap ListItem: paragraph block*)
function convertListItem(
  item: Md.ListItem,
  isTask: boolean,
  warnings: ConversionWarning[],
): JSONContent {
  const blocks = convertBlocks(item.children, warnings);
  if (blocks.length === 0 || blocks[0].type !== 'paragraph') blocks.unshift({ type: 'paragraph' });
  if (isTask)
    return { type: 'taskItem', attrs: { checked: item.checked === true }, content: blocks };
  return { type: 'listItem', content: blocks };
}

// GFM 표: 첫 행은 머리 셀. 열 정렬은 셀 속성 align. 셀 안은 단락 하나.
// 머리 행보다 많은 셀은 공개 페이지(mdast-util-to-hast)처럼 자른다
function convertTable(node: Md.Table, warnings: ConversionWarning[]): JSONContent {
  const align = node.align ?? [];
  const columnCount = node.children[0]?.children.length ?? 0;
  const rows = node.children.map((row, rowIndex) => ({
    type: 'tableRow',
    content: row.children.slice(0, columnCount).map((cell, cellIndex) => ({
      type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
      attrs: { align: align[cellIndex] ?? null },
      content: [paragraphOf(convertInlines(cell.children, [], warnings))],
    })),
  }));
  return { type: 'table', content: rows };
}

// ───────────── 인라인 ─────────────

function textNode(text: string, marks: PmMark[]): JSONContent {
  return marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text };
}

// 인라인 노드(하드 브레이크, 이미지, 수식)도 바깥 마크를 물려받는다. 그래야 `**가<br>나**`의 굵게가 갈라지지 않는다
function withMarks(node: JSONContent, marks: PmMark[]): JSONContent {
  return marks.length > 0 ? { ...node, marks } : node;
}

// 인라인 노드 목록 → PM 인라인 노드 목록. marks는 바깥에서 물려받은 마크다
function convertInlines(
  nodes: ReadonlyArray<Md.PhrasingContent>,
  marks: PmMark[],
  warnings: ConversionWarning[],
): JSONContent[] {
  const result: JSONContent[] = [];
  for (const node of nodes) result.push(...convertInline(node, marks, warnings));
  return result;
}

function convertInline(
  node: Md.PhrasingContent,
  marks: PmMark[],
  warnings: ConversionWarning[],
): JSONContent[] {
  switch (node.type) {
    case 'text': {
      // ZWSP는 옛 에디터의 보정 문자다. 줄 안 줄바꿈은 공개 페이지가 공백으로 그린다(ZWSP 옆은 없앤다)
      const text = removeZwspAndSoftBreaks(node.value);
      return text ? [textNode(text, marks)] : [];
    }
    case 'strong':
      return convertInlines(node.children, [...marks, { type: 'bold' }], warnings);
    case 'emphasis':
      return convertInlines(node.children, [...marks, { type: 'italic' }], warnings);
    case 'delete':
      return convertInlines(node.children, [...marks, { type: 'strike' }], warnings);
    case 'inlineCode':
      return node.value ? [textNode(node.value, [...marks, { type: 'code' }])] : [];
    case 'link':
      return convertInlines(
        node.children,
        [...marks, { type: 'link', attrs: { href: node.url, title: node.title ?? null } }],
        warnings,
      );
    case 'image':
      return [
        withMarks(
          {
            type: 'image',
            attrs: { src: node.url, alt: node.alt ?? null, title: node.title ?? null },
          },
          marks,
        ),
      ];
    case 'break':
      return [withMarks({ type: 'hardBreak' }, marks)];
    case 'html': {
      if (isBreakOnlyHtml(node.value)) {
        return Array.from({ length: countBreakTags(node.value) }, () =>
          withMarks({ type: 'hardBreak' }, marks),
        );
      }
      warnings.push({
        code: 'unsupported-html',
        message: '지원하지 않는 HTML은 텍스트로 남습니다',
        detail: node.value.slice(0, 200),
      });
      return [textNode(node.value, marks)];
    }
    case 'inlineMath':
      return [
        withMarks(
          { type: 'inlineMath', attrs: { latex: (node as unknown as MathLike).value } },
          marks,
        ),
      ];
    default: {
      const text = mdastToString(node);
      warnings.push({
        code: 'unsupported-node',
        message: `지원하지 않는 노드(${node.type})는 텍스트로 남습니다`,
        detail: text.slice(0, 200),
      });
      return text ? [textNode(text, marks)] : [];
    }
  }
}
