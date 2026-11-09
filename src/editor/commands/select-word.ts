// 단어·줄 선택과 선택 풀기 (사용 피드백 2026-11-09, 작업 문서 2.11)
// - 한 번: 커서에 가장 가까운 단어를 고른다. 커서가 단어 안이나 끝에 붙어 있으면 그 단어다.
//   단어 밖이면 거리가 가까운 단어, 거리가 같으면 앞 단어다. 찾는 범위는 커서가 있는 텍스트 블록 하나다.
// - 선택이 있으면 한 단계 넓힌다: 그 줄 → 블록 전체. "줄"은 줄바꿈(hardBreak, 코드 블록의 \n) 사이다.
//   줄바꿈이 없는 단락은 줄이 곧 블록이라 두 번째에서 끝난다.
// - VS Code의 Cmd+D(같은 글자 다중 선택)는 하지 않는다. ProseMirror는 선택 범위를 하나만 가진다.
//   같은 글자 여러 곳 고치기는 찾기·바꾸기(Plan 14절, 5단계)의 몫이다.
// - 선택 풀기(Esc): 커서를 선택이 끝난 자리(head)에 둔다. Mod+D로 고른 단어면 그 단어 바로 뒤라 이어서 칠 수 있다.
// - DOM 없이 돈다(상태만 읽는다).

import { Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface TextRange {
  from: number;
  to: number;
}

// 단어 글자: 문자(한글·영문 등), 숫자, 결합 기호, 밑줄. 그 밖(공백, 문장 부호, 점, 하이픈, 괄호)은 단어를 나눈다
const WORD_CHAR = /^[\p{L}\p{N}\p{M}_]$/u;
// 블록 글자로 바꿀 때 잎 노드의 글자. 줄바꿈은 줄을 나누고, 이미지·수식은 단어만 나눈다. 둘 다 한 글자라 위치가 1:1로 맞는다
const LINE_BREAK = '\n';
const LEAF_PLACEHOLDER = '￼';

// 글자열 안에서 offset에 가장 가까운 단어 범위(UTF-16 위치). 단어가 없으면 null
export function findWordRange(text: string, offset: number): TextRange | null {
  const runs: TextRange[] = [];
  let index = 0;
  let current: TextRange | null = null;
  for (const char of text) {
    const end = index + char.length;
    if (WORD_CHAR.test(char)) {
      if (current) current.to = end;
      else current = { from: index, to: end };
    } else if (current) {
      runs.push(current);
      current = null;
    }
    index = end;
  }
  if (current) runs.push(current);
  if (runs.length === 0) return null;

  // 커서가 단어 안이나 양 끝에 붙어 있으면 그 단어다(단어 사이에는 단어 아닌 글자가 하나 이상 있어 둘에 동시에 붙지 않는다)
  const touching = runs.find((run) => run.from <= offset && offset <= run.to);
  if (touching) return touching;

  // 가장 가까운 단어. 왼쪽부터 보고 더 가까울 때만 바꾸므로 거리가 같으면 앞 단어가 남는다
  let best = runs[0];
  let bestDistance = Infinity;
  for (const run of runs) {
    const distance = offset < run.from ? run.from - offset : offset - run.to;
    if (distance < bestDistance) {
      best = run;
      bestDistance = distance;
    }
  }
  return best;
}

// 텍스트 블록의 글자(잎 노드는 한 글자씩). 위치 = 블록 시작 + 글자 위치
function blockText(block: ProseMirrorNode): string {
  return block.textBetween(0, block.content.size, undefined, (leaf) =>
    leaf.type.name === 'hardBreak' ? LINE_BREAK : LEAF_PLACEHOLDER,
  );
}

// [from, to]를 덮는 줄 범위(줄바꿈 글자는 넣지 않는다)
function lineRange(text: string, from: number, to: number): TextRange {
  const start = from === 0 ? 0 : text.lastIndexOf(LINE_BREAK, from - 1) + 1;
  const breakAfter = text.indexOf(LINE_BREAK, to);
  return { from: start, to: breakAfter === -1 ? text.length : breakAfter };
}

// 다음에 고를 범위(문서 위치). 더 넓힐 수 없거나 고를 것이 없으면 null
export function nextSelectionRange(state: EditorState): TextRange | null {
  const { $from, $to, empty } = state.selection;
  const block = $from.parent;
  // 텍스트 블록 하나 안의 글자 선택만 다룬다(노드 선택, 여러 블록 선택은 그대로 둔다)
  if (!block.isTextblock || !$from.sameParent($to) || block.content.size === 0) return null;

  const start = $from.start();
  const text = blockText(block);
  const fromOffset = $from.parentOffset;
  const toOffset = $to.parentOffset;

  if (empty) {
    const word = findWordRange(text, fromOffset);
    return word ? { from: start + word.from, to: start + word.to } : null;
  }

  // 선택이 줄보다 좁으면 줄, 줄과 같으면 블록 전체, 블록 전체면 끝
  const line = lineRange(text, fromOffset, toOffset);
  if (fromOffset > line.from || toOffset < line.to) {
    return { from: start + line.from, to: start + line.to };
  }
  if (fromOffset > 0 || toOffset < text.length) {
    return { from: start, to: start + text.length };
  }
  return null;
}

// 선택을 푼 뒤의 커서. 선택이 없거나 풀 자리를 찾지 못하면 null
// - 글자 선택: head 자리(뒤에서 앞으로 고른 선택은 앞쪽).
// - 노드 선택(이미지·임베드 등)과 표 칸 선택: head 근처의 커서. 인라인 이미지는 바로 뒤다.
//   근처에 글자 자리가 없어 다시 노드 선택이 되면(문서 끝의 임베드 등) null이다
export function collapsedSelection(state: EditorState): Selection | null {
  const { selection, doc } = state;
  if (selection.empty) return null;
  if (selection instanceof TextSelection) return TextSelection.create(doc, selection.head);
  const near = Selection.near(doc.resolve(selection.head), 1);
  return near.empty ? near : null;
}
