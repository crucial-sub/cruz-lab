// 되돌리기 한 단계로 보내기 (재건 5단계 D6·D7, 리뷰 B5)
// - prosemirror-history는 짧은 시간(500ms) 안의 이웃한 변경을 한 묶음으로 합친다.
// - 블록 이동·바꾸기는 "Mod+Z 한 번에 그 동작 하나"여야 한다. 그래서 앞의 입력과도, 바로 뒤의 입력과도 묶지 않는다.
//   closeHistory를 단 트랜잭션은 앞 묶음과 갈라지고, 그 뒤에 보내는 빈 closeHistory 트랜잭션이 다음 입력과 가른다.

import { closeHistory } from '@tiptap/pm/history';
import type { Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export function dispatchAsOwnUndoStep(view: EditorView, tr: Transaction): void {
  view.dispatch(closeHistory(tr));
  view.dispatch(closeHistory(view.state.tr));
}
