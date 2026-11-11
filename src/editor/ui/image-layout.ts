// 이미지 폭·정렬의 에디터 표시 (재건 5단계 D13)
// - 변환기(from-doc)와 같은 판정으로 "이미지만 있는 단락"을 찾아 단락에 node decoration을 붙인다(보이는 대로 저장).
//   class="editor-image-solo", 정렬이 있으면 data-align. editor.css가 이 단락 안에서만 폭과 정렬(text-align)을 적용한다.
// - 노드 뷰는 자기 위치를 모른다. 형제가 바뀌어도 다시 그려지지 않는다. 그래서 표시는 단락 데코레이션이 맡는다.
// - 데코레이션은 문서가 바뀔 때만 다시 계산한다.
// - soloImageStateAt·isSoloImageAt: 노드 뷰가 메뉴·손잡이를 켤지 정할 때 쓴다(선택될 때 그리므로 그때 판정한다).
// - dragImageWidth: 끌어서 폭 바꾸기의 반올림·범위(순수 함수).
// - setImageAttrsKeepingSelection: 메뉴가 속성을 바꾸고 이미지 노드 선택을 지킨다(지금 문서의 속성에 더한다).

import type { Node as PmNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  canHoldImageLayout,
  IMAGE_WIDTH_MAX,
  IMAGE_WIDTH_MIN,
  imageLayoutOf,
  isBlankInline,
  soloImageIndex,
  type ImageAlign,
  type InlineShape,
} from '@/editor/markdown/image-html';

// 이미지만 있는 단락의 클래스 (editor.css)
export const SOLO_IMAGE_CLASS = 'editor-image-solo';

// 데코레이션 spec (테스트가 읽는다)
export interface SoloImageSpec {
  imageSolo: true;
  align: ImageAlign | null;
}

// 단락 자식 → 판정용 모양
function inlineShapes(paragraph: PmNode): InlineShape[] {
  const shapes: InlineShape[] = [];
  paragraph.forEach((child) => {
    shapes.push({ type: child.type.name, text: child.text, marked: child.marks.length > 0 });
  });
  return shapes;
}

// 부모의 index번째 자식이 마크다운에서 몇 번째로 쓰이는지(앞의 빈 단락은 쓰이지 않는다, 리뷰 S3)
function writtenIndexOf(parent: PmNode, index: number): number {
  let written = 0;
  for (let child = 0; child < index; child += 1) {
    const node = parent.child(child);
    if (!(node.type.name === 'paragraph' && isBlankInline(inlineShapes(node)))) written += 1;
  }
  return written;
}

// 이미지만 있는 단락이면 그 이미지의 단락 안 오프셋, 아니면 null
export function soloImageOffset(paragraph: PmNode): number | null {
  if (paragraph.type.name !== 'paragraph') return null;
  const index = soloImageIndex(inlineShapes(paragraph));
  if (index < 0) return null;
  let offset = 0;
  for (let child = 0; child < index; child += 1) offset += paragraph.child(child).nodeSize;
  return offset;
}

// 이미지 자리의 폭·정렬 상태
// - solo: 폭·정렬을 저장할 수 있는 단락에 홀로 있다
// - shared: 단락에 다른 내용이 있다(또는 단락 밖이다)
// - blocked: 홀로 있지만 자리(표 칸, 체크 항목 첫 단락)가 HTML 블록을 받지 않는다
export type SoloImageState = 'solo' | 'shared' | 'blocked';

// 문서 위치 pos(이미지 노드 앞)의 이미지 상태
export function soloImageStateAt(doc: PmNode, pos: number): SoloImageState {
  if (pos < 0 || pos > doc.content.size) return 'shared';
  const $pos = doc.resolve(pos);
  if ($pos.depth < 1 || $pos.parent.type.name !== 'paragraph') return 'shared';
  if (soloImageOffset($pos.parent) !== $pos.parentOffset) return 'shared';
  const container = $pos.node($pos.depth - 1);
  const written = writtenIndexOf(container, $pos.index($pos.depth - 1));
  return canHoldImageLayout(container.type.name, written) ? 'solo' : 'blocked';
}

// 이미지가 폭·정렬을 저장할 수 있는 단락에 홀로 있는지
export function isSoloImageAt(doc: PmNode, pos: number): boolean {
  return soloImageStateAt(doc, pos) === 'solo';
}

// 문서 전체의 데코레이션. 표 셀·체크 항목 첫 단락 같은 자리는 canHoldImageLayout이 뺀다
export function imageLayoutDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos, parent, index) => {
    // 글자 블록 안(인라인)은 볼 것이 없다
    if (!node.isTextblock) return true;
    if (node.type.name !== 'paragraph' || !parent) return false;
    if (!canHoldImageLayout(parent.type.name, writtenIndexOf(parent, index))) return false;
    const offset = soloImageOffset(node);
    if (offset === null) return false;
    const image = node.nodeAt(offset);
    const align = imageLayoutOf(image?.attrs)?.align ?? null;
    const spec: SoloImageSpec = { imageSolo: true, align };
    decorations.push(
      Decoration.node(
        pos,
        pos + node.nodeSize,
        align ? { class: SOLO_IMAGE_CLASS, 'data-align': align } : { class: SOLO_IMAGE_CLASS },
        spec,
      ),
    );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const imageLayoutKey = new PluginKey<DecorationSet>('editorImageLayout');

// 데코레이션 플러그인. 문서가 바뀔 때만 다시 계산한다
export function createImageLayoutPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: imageLayoutKey,
    state: {
      init: (_config, state) => imageLayoutDecorations(state.doc),
      apply: (tr, previous) => (tr.docChanged ? imageLayoutDecorations(tr.doc) : previous),
    },
    props: {
      decorations(state) {
        return imageLayoutKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

// ───────────── 끌어서 폭 바꾸기 ─────────────

// 끄는 단위(px)
export const IMAGE_DRAG_STEP = 10;

// 끌기 결과 폭: 처음 폭 + 끈 거리를 10px 단위로 반올림한다. 최소 16, 최대 maxWidth(본문 폭, 4096 이하)
// - maxWidth를 모르면(0·NaN) 최대는 4096이다
export function dragImageWidth(startWidth: number, delta: number, maxWidth: number): number {
  const limit =
    Number.isFinite(maxWidth) && maxWidth > 0
      ? Math.min(IMAGE_WIDTH_MAX, Math.max(IMAGE_WIDTH_MIN, Math.floor(maxWidth)))
      : IMAGE_WIDTH_MAX;
  const rounded = Math.round((startWidth + delta) / IMAGE_DRAG_STEP) * IMAGE_DRAG_STEP;
  return Math.min(limit, Math.max(IMAGE_WIDTH_MIN, rounded));
}

// 손잡이를 끈 가로 거리 → 폭 변화
// - 가운데 정렬은 양쪽으로 커지므로 두 배다. 오른쪽 정렬은 손잡이가 왼쪽 가장자리에 있어 방향이 반대다
export function dragDelta(dx: number, align: ImageAlign | null): number {
  if (align === 'center') return dx * 2;
  if (align === 'right') return -dx;
  return dx;
}

// 이미지 속성을 바꾸고 그 이미지를 노드 선택으로 둔다(메뉴가 닫히지 않게, 되돌리기 한 번)
// - 속성은 트랜잭션의 지금 문서에서 읽은 노드 속성에 더한다. 노드 뷰가 그린 때의 속성(React props)을 쓰지 않는다.
//   iPhone은 폭 입력 칸의 blur(폭 반영)와 "가운데" click(정렬)을 다시 그리기 전에 연달아 보낸다. 그린 때의 속성에
//   덮어쓰면 click이 앞의 폭을 지웠다(main 병합 준비 작업 문서 6.2).
// - setNodeMarkup은 잎 노드를 바꿔 끼워 선택이 글자 선택으로 풀린다. 그래서 같은 트랜잭션에서 노드 선택을 다시 둔다.
// - 그 자리에 노드가 없으면 false다(트랜잭션을 건드리지 않는다).
export function setImageAttrsKeepingSelection(
  tr: Transaction,
  pos: number,
  attributes: Record<string, unknown>,
): boolean {
  const current = pos >= 0 && pos < tr.doc.content.size ? tr.doc.nodeAt(pos) : null;
  if (!current) return false;
  tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attributes });
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  return true;
}
