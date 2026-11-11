// 찾기·바꾸기 상태와 계산 (재건 5단계 D7)
// - 검색 상태·강조·이동·바꾸기는 prosemirror-search(ProseMirror 공식, MIT)가 한다. 이 파일은 그것을 에디터에 붙이고
//   막대(FindBar.tsx)가 쓰는 순수 계산(찾은 수 "2 / 5", 질의 만들기)을 둔다.
// - 바꾸기·모두 바꾸기는 closeHistory로 앞의 입력과 묶지 않는다. 모두 바꾸기는 트랜잭션 하나라 Mod+Z 한 번에 전부 되돌아간다.
// - 문자열 검색은 글자 그대로 찾는다(literal: \n 같은 표기를 줄바꿈으로 바꾸지 않는다).
// - 인라인 원자(이미지·인라인 수식·줄바꿈)를 걸치는 결과는 뺀다. 검색은 원자를 U+FFFC 한 글자로 읽어
//   정규식 `.`가 이미지와 맞고, 바꾸면 이미지가 지워진다(리뷰 S5).
// - DOM 없이 돈다(상태만 읽는다). 테스트는 헤드리스 에디터로 한다.

import { Extension, type Editor } from '@tiptap/core';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { dispatchAsOwnUndoStep } from '@/editor/commands/history-step';
import {
  findNext,
  findPrev,
  getSearchState,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchState,
  type SearchResult,
} from 'prosemirror-search';

// 찾은 수를 셀 때의 한도. 넘으면 "1000+"로 보인다(긴 글에서 키 입력마다 세는 비용을 막는다)
export const MAX_COUNTED_MATCHES = 1000;

export interface FindOptions {
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
}

export const EMPTY_FIND_OPTIONS: FindOptions = {
  search: '',
  replace: '',
  caseSensitive: false,
  regexp: false,
};

// 검색 플러그인을 붙이는 확장. 스키마를 바꾸지 않는다
export const EditorSearch = Extension.create({
  name: 'editorSearch',
  addProseMirrorPlugins() {
    return [search()];
  },
});

// 결과가 인라인 원자(글자가 아닌 인라인 노드)를 걸치지 않는지
function withoutInlineAtoms(state: EditorState, result: SearchResult): boolean {
  let clean = true;
  state.doc.nodesBetween(result.from, result.to, (node) => {
    if (node.isInline && !node.isText) clean = false;
    return clean;
  });
  return clean;
}

// 막대의 값 → 검색 질의
export function buildQuery(options: FindOptions): SearchQuery {
  return new SearchQuery({
    search: options.search,
    replace: options.replace,
    caseSensitive: options.caseSensitive,
    regexp: options.regexp,
    literal: true,
    filter: withoutInlineAtoms,
  });
}

// 지금 선택이 지금 질의의 결과 하나인지(다시 Mod+F를 누를 때 찾을 글자를 바꾸지 않는다, 리뷰 B6)
export function selectionIsMatch(state: EditorState): boolean {
  const query = getSearchState(state)?.query;
  const { from, to, empty } = state.selection;
  if (!query || !query.valid || empty) return false;
  const found = query.findNext(state, from, to);
  return !!found && found.from === from && found.to === to;
}

export interface MatchStats {
  // 찾은 수(한도까지)
  total: number;
  // 지금 선택이 몇 번째 결과인지(1부터). 결과를 고르지 않았으면 null
  current: number | null;
  // 한도를 넘었는지
  capped: boolean;
}

// 문서에서 찾은 수와 지금 선택의 순번을 센다. 빈 결과(정규식 ^ 등)에서 멈추지 않게 한 칸씩 나아간다
export function matchStats(state: EditorState, query: SearchQuery): MatchStats {
  if (!query.valid) return { total: 0, current: null, capped: false };
  const { from, to } = state.selection;
  const end = state.doc.content.size;
  let total = 0;
  let current: number | null = null;
  for (let pos = 0; pos <= end; ) {
    const next = query.findNext(state, pos, end);
    if (!next) break;
    if (total >= MAX_COUNTED_MATCHES) return { total, current, capped: true };
    total += 1;
    if (next.from === from && next.to === to) current = total;
    pos = Math.max(next.to, pos + 1);
  }
  return { total, current, capped: false };
}

// "2 / 5" 표기. 찾을 글자가 없으면 빈 글자, 정규식 오류면 "정규식 오류"
export function describeMatches(options: FindOptions, stats: MatchStats): string {
  if (!options.search) return '';
  if (options.regexp && !buildQuery(options).valid) return '정규식 오류';
  if (stats.total === 0) return '없음';
  const total = stats.capped ? `${MAX_COUNTED_MATCHES}+` : String(stats.total);
  return `${stats.current ?? '–'} / ${total}`;
}

// 질의를 플러그인에 넣는다. moveToMatch면 커서 뒤(없으면 처음)의 첫 결과를 고른다(입력하는 대로 따라간다)
export function applyQuery(editor: Editor, options: FindOptions, moveToMatch: boolean): void {
  const query = buildQuery(options);
  const state = editor.state;
  const tr: Transaction = setSearchState(state.tr, query);
  if (moveToMatch && query.valid) {
    const found = query.findNext(state, state.selection.from) ?? query.findNext(state, 0);
    if (found)
      tr.setSelection(TextSelection.create(state.doc, found.from, found.to)).scrollIntoView();
  }
  editor.view.dispatch(tr);
}

// 검색을 지운다(막대를 닫을 때). 강조가 사라진다
// - 에디터 화면 전체가 닫힐 때도 불린다. 이미 닫힌 뷰의 dispatch 오류는 버린다(지울 강조가 없다)
export function clearQuery(editor: Editor): void {
  const current = getSearchState(editor.state);
  if (!current || !current.query.search) return;
  try {
    editor.view.dispatch(setSearchState(editor.state.tr, new SearchQuery({ search: '' })));
  } catch {
    // 닫힌 에디터
  }
}

// 다음·이전 결과로 간다
export function goToMatch(editor: Editor, direction: 'next' | 'prev'): boolean {
  const command = direction === 'next' ? findNext : findPrev;
  return command(editor.state, editor.view.dispatch);
}

// 지금 결과를 바꾸고 다음 결과로 간다. 결과를 고르지 않았으면 다음 결과를 고르기만 한다
// - 바꾸기 한 번이 되돌리기 한 단계다(앞·뒤 입력과 묶지 않는다, 리뷰 B5)
export function replaceOne(editor: Editor): boolean {
  return replaceNext(editor.state, (tr) => {
    if (tr.docChanged) dispatchAsOwnUndoStep(editor.view, tr);
    else editor.view.dispatch(tr);
  });
}

// 모두 바꾼다. 트랜잭션 하나다
export function replaceEvery(editor: Editor): boolean {
  return replaceAll(editor.state, (tr) => dispatchAsOwnUndoStep(editor.view, tr));
}

// 세로로 스크롤되는 가장 가까운 조상(없으면 문서)
function scrollContainerOf(element: HTMLElement): HTMLElement {
  for (let current = element.parentElement; current; current = current.parentElement) {
    const overflow = window.getComputedStyle(current).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      current.scrollHeight > current.clientHeight
    )
      return current;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

// 고른 결과가 보이게 스크롤한다
// - 포커스가 찾기 칸에 있으면 ProseMirror의 scrollIntoView는 돌지 않는다(DOM 선택이 에디터 밖이다). 그래서 직접 옮긴다.
// - 블록이 아니라 결과 글자의 좌표로 옮긴다(긴 단락에서도 보이게, 리뷰 B14). 이미 보이면 옮기지 않는다.
// - DOM이 없는 환경(테스트)이나 닫힌 에디터에서는 아무것도 하지 않는다
export function revealSelection(editor: Editor): void {
  if (typeof document === 'undefined') return;
  try {
    const view = editor.view;
    const coords = view.coordsAtPos(view.state.selection.from);
    const container = scrollContainerOf(view.dom as HTMLElement);
    const isDocument =
      container === document.scrollingElement || container === document.documentElement;
    const top = isDocument ? 0 : container.getBoundingClientRect().top;
    const height = isDocument ? window.innerHeight : container.clientHeight;
    const margin = 48;
    if (coords.top >= top + margin && coords.bottom <= top + height - margin) return;
    container.scrollTop += coords.top - top - height / 3;
  } catch {
    // 닫힌 에디터
  }
}

// 막대를 열 때 미리 넣을 글자: 한 블록 안의 짧은 선택이면 그 글자
export function selectionSearchText(state: EditorState): string | null {
  const { from, to, empty, $from, $to } = state.selection;
  if (empty || !$from.sameParent($to)) return null;
  const text = state.doc.textBetween(from, to, '\n');
  if (!text || text.length > 100 || text.includes('\n')) return null;
  return text;
}
