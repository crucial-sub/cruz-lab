// 명령 레지스트리 (재건 3단계 D9, Plan 부록 B)
// - 단축키, 슬래시 메뉴, 명령 팔레트, 툴바, 모바일 툴바가 모두 이 목록 하나를 읽는다.
// - id·이름·묶음·범위·기본 키는 명령 표(command-keys.ts)에 있다(5단계 D14: 서버·설정 화면이 같은 표를 읽는다).
//   이 파일은 그 칸에 실행 함수·아이콘·메뉴 표시를 더한다. 기본 키는 부록 B다. Mod+Alt는 쓰지 않는다(계획 문서 2.2 #2).
// - 사용자 키맵(settings/editor)은 EditorApp이 applyKeymapOverrides로 이 목록에 적용한다.
// - 화면 동작(파일 고르기, 링크·수식 입력 창, 모드 전환, 저장, 발행, 패널, 팔레트)은 주입한 actions가 한다.
// - D9 인터페이스에 세 칸을 더했다(작업 문서 5절):
//   scope('editor' | 'page'): 'page'는 에디터 밖(소스·미리보기 모드, 제목 칸)에서도 키가 돈다.
//   isAvailable: 그 자리에서 쓸 수 있는지(표 명령은 표 안에서만). 팔레트와 툴바가 거른다.
//   inToolbar: 데스크톱 툴바에 그릴지(기본은 block·mark·insert 묶음 전부).

import type { ChainedCommands, Editor } from '@tiptap/core';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  Columns3,
  Command,
  Eye,
  FileCode,
  Heading,
  Heading2,
  Heading3,
  Heading4,
  History,
  Image,
  Info,
  Italic,
  Lightbulb,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PanelRight,
  PenLine,
  Pilcrow,
  Quote,
  Radical,
  Redo2,
  RefreshCw,
  Rows3,
  Save,
  Search,
  Send,
  Sigma,
  SquareCode,
  Strikethrough,
  Table,
  TextCursor,
  TextSelect,
  Trash2,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { CalloutType } from '@/lib/content/remark-callout';
import { commandSpec, type CommandSpec } from './command-keys';
import { dispatchAsOwnUndoStep } from './history-step';
import { moveBlockTransaction, type MoveDirection } from './move-block';
import { collapsedSelection, nextSelectionRange } from './select-word';

export type { CommandGroup } from './command-keys';
export type ViewModeName = 'edit' | 'source' | 'preview';

// 명령 표의 칸(id·이름·묶음·범위·키) + 실행·표시
export interface EditorCommand extends CommandSpec {
  run: (editor: Editor) => boolean;
  isActive?: (editor: Editor) => boolean;
  isAvailable?: (editor: Editor) => boolean;
  inSlash: boolean;
  inPalette: boolean;
  inToolbar?: boolean;
  icon: LucideIcon;
}

// 수식 입력 창을 여는 대상. pos가 있으면 그 노드를 고치고, 없으면 지금 자리에 넣는다
export interface MathTarget {
  kind: 'block' | 'inline';
  pos: number | null;
  latex: string;
}

// 레지스트리가 부르는 화면 동작
export interface CommandActions {
  pickImage(): void;
  editLink(): void;
  editMath(target: MathTarget): void;
  setMode(mode: ViewModeName): void;
  cycleMode(): void;
  saveNow(): void;
  publish(): void;
  togglePanel(): void;
  openPalette(): void;
  // 이전 발행본 대화상자(5단계 D3)
  openRevisions(): void;
  // 찾기·바꾸기 막대(5단계 D7). 편집 모드가 아니면 열지 않고 false(브라우저 찾기에 맡긴다)
  openFind(): boolean;
}

// 지금 자리가 표 안인지
const inTable = (editor: Editor) => editor.isActive('table');
// 코드 블록 안에는 다른 노드를 넣을 수 없다(리뷰 6.3 중요 3)
const notInCode = (editor: Editor) => !editor.isActive('codeBlock');
// 블록 노드(표·구분선·수식 블록)는 코드 블록과 표 셀 안에 넣을 수 없다
const canInsertBlock = (editor: Editor) => notInCode(editor) && !inTable(editor);

// 에디터에 포커스를 돌려준 뒤 명령 묶음을 실행한다. 결과는 명령 묶음의 결과다.
// 툴바·팔레트에서 부르면 포커스가 버튼·입력 칸에 있으므로 먼저 돌려준다(포커스 결과와 명령 결과를 나눈다)
function focused(editor: Editor, build: (chain: ChainedCommands) => ChainedCommands): boolean {
  editor.commands.focus();
  return build(editor.chain()).run();
}

// 제목 순환(모바일 툴바, D12): 단락 → 제목 2 → 제목 3 → 단락
function cycleHeading(editor: Editor): boolean {
  if (editor.isActive('heading', { level: 2 })) {
    return focused(editor, (chain) => chain.setHeading({ level: 3 }));
  }
  if (editor.isActive('heading', { level: 3 }))
    return focused(editor, (chain) => chain.setParagraph());
  return focused(editor, (chain) => chain.setHeading({ level: 2 }));
}

// 콜아웃 명령: 같은 종류 안이면 풀고, 아니면 감싸거나 종류를 바꾼다
function calloutCommand(type: CalloutType, icon: LucideIcon): EditorCommand {
  return {
    ...commandSpec(`callout-${type}`),
    run: (editor) =>
      editor.isActive('callout', { type })
        ? focused(editor, (chain) => chain.unsetCallout())
        : focused(editor, (chain) => chain.setCallout(type)),
    isActive: (editor) => editor.isActive('callout', { type }),
    inSlash: true,
    inPalette: true,
    inToolbar: type === 'note',
    icon,
  };
}

// 제목 2·3·4 명령. 다시 하면 단락으로 돌아간다(toggle)
function headingCommand(level: 2 | 3 | 4, icon: LucideIcon): EditorCommand {
  return {
    ...commandSpec(`heading-${level}`),
    run: (editor) => focused(editor, (chain) => chain.toggleHeading({ level })),
    isActive: (editor) => editor.isActive('heading', { level }),
    inSlash: true,
    inPalette: true,
    icon,
  };
}

// 표 안에서만 쓰는 명령
function tableCommand(
  id: string,
  icon: LucideIcon,
  run: (editor: Editor) => boolean,
): EditorCommand {
  return {
    ...commandSpec(id),
    run,
    isAvailable: inTable,
    inSlash: false,
    inPalette: true,
    icon,
  };
}

// 화면 동작 명령(문서를 직접 바꾸지 않는다). id·이름·범위·키는 명령 표에서 온다
type ActionBase = Omit<EditorCommand, 'run' | keyof CommandSpec> & { id: string };
function actionCommand(base: ActionBase, action: () => void): EditorCommand {
  return {
    ...commandSpec(base.id),
    ...base,
    run: () => {
      action();
      return true;
    },
  };
}

// 블록을 한 칸 옮긴다(5단계 D6). 되돌리기 한 번에 한 칸이도록 앞·뒤의 입력과 묶지 않는다(리뷰 B5).
// 못 옮겨도 키를 받는다(true). 받지 않으면 맥의 ⌘⇧↑/↓가 문서 처음·끝까지 고른다
function moveBlock(editor: Editor, direction: MoveDirection): boolean {
  editor.commands.focus();
  const tr = moveBlockTransaction(editor.state, direction);
  if (tr) dispatchAsOwnUndoStep(editor.view, tr);
  return true;
}

// 기본 명령 목록을 만든다. 순서가 툴바·팔레트의 기본 순서다
export function createCommands(actions: CommandActions): EditorCommand[] {
  return [
    // ───── 블록 ─────
    {
      ...commandSpec('paragraph'),
      run: (editor) => focused(editor, (chain) => chain.setParagraph()),
      isActive: (editor) => editor.isActive('paragraph') && !editor.isActive('listItem'),
      inSlash: true,
      inPalette: true,
      inToolbar: false,
      icon: Pilcrow,
    },
    headingCommand(2, Heading2),
    headingCommand(3, Heading3),
    headingCommand(4, Heading4),
    {
      ...commandSpec('heading-cycle'),
      run: cycleHeading,
      isActive: (editor) => editor.isActive('heading'),
      inSlash: false,
      inPalette: false,
      inToolbar: false,
      icon: Heading,
    },
    {
      ...commandSpec('bullet-list'),
      run: (editor) => focused(editor, (chain) => chain.toggleBulletList()),
      isActive: (editor) => editor.isActive('bulletList'),
      inSlash: true,
      inPalette: true,
      icon: List,
    },
    {
      ...commandSpec('ordered-list'),
      run: (editor) => focused(editor, (chain) => chain.toggleOrderedList()),
      isActive: (editor) => editor.isActive('orderedList'),
      inSlash: true,
      inPalette: true,
      icon: ListOrdered,
    },
    {
      ...commandSpec('task-list'),
      run: (editor) => focused(editor, (chain) => chain.toggleTaskList()),
      isActive: (editor) => editor.isActive('taskList'),
      inSlash: true,
      inPalette: true,
      icon: ListTodo,
    },
    {
      ...commandSpec('blockquote'),
      run: (editor) => focused(editor, (chain) => chain.toggleBlockquote()),
      isActive: (editor) => editor.isActive('blockquote'),
      inSlash: true,
      inPalette: true,
      icon: Quote,
    },
    calloutCommand('note', Info),
    calloutCommand('tip', Lightbulb),
    calloutCommand('warning', TriangleAlert),
    {
      ...commandSpec('code-block'),
      run: (editor) => focused(editor, (chain) => chain.toggleCodeBlock()),
      isActive: (editor) => editor.isActive('codeBlock'),
      inSlash: true,
      inPalette: true,
      icon: SquareCode,
    },
    // 블록 이동(5단계 D6): 명령만 둔다(드래그 핸들은 없다). 팔레트와 모바일 바에서도 쓴다. 툴바에는 그리지 않는다
    {
      ...commandSpec('block-move-up'),
      run: (editor) => moveBlock(editor, 'up'),
      inSlash: false,
      inPalette: true,
      inToolbar: false,
      icon: ArrowUpToLine,
    },
    {
      ...commandSpec('block-move-down'),
      run: (editor) => moveBlock(editor, 'down'),
      inSlash: false,
      inPalette: true,
      inToolbar: false,
      icon: ArrowDownToLine,
    },

    // ───── 마크 ─────
    {
      ...commandSpec('bold'),
      run: (editor) => focused(editor, (chain) => chain.toggleBold()),
      isActive: (editor) => editor.isActive('bold'),
      inSlash: false,
      inPalette: true,
      icon: Bold,
    },
    {
      ...commandSpec('italic'),
      run: (editor) => focused(editor, (chain) => chain.toggleItalic()),
      isActive: (editor) => editor.isActive('italic'),
      inSlash: false,
      inPalette: true,
      icon: Italic,
    },
    {
      ...commandSpec('strike'),
      run: (editor) => focused(editor, (chain) => chain.toggleStrike()),
      isActive: (editor) => editor.isActive('strike'),
      inSlash: false,
      inPalette: true,
      icon: Strikethrough,
    },
    {
      ...commandSpec('code'),
      run: (editor) => focused(editor, (chain) => chain.toggleCode()),
      isActive: (editor) => editor.isActive('code'),
      inSlash: false,
      inPalette: true,
      icon: Code,
    },
    actionCommand(
      {
        id: 'link',
        isActive: (editor) => editor.isActive('link'),
        inSlash: true,
        inPalette: true,
        icon: Link,
      },
      () => actions.editLink(),
    ),

    // ───── 넣기 ─────
    actionCommand(
      {
        id: 'image',
        isAvailable: notInCode,
        inSlash: true,
        inPalette: true,
        icon: Image,
      },
      () => actions.pickImage(),
    ),
    {
      ...commandSpec('table'),
      run: (editor) =>
        focused(editor, (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
      isAvailable: canInsertBlock,
      inSlash: true,
      inPalette: true,
      icon: Table,
    },
    {
      ...commandSpec('horizontal-rule'),
      run: (editor) => focused(editor, (chain) => chain.setHorizontalRule()),
      isAvailable: canInsertBlock,
      inSlash: true,
      inPalette: true,
      icon: Minus,
    },
    actionCommand(
      {
        id: 'math-block',
        isAvailable: canInsertBlock,
        inSlash: true,
        inPalette: true,
        icon: Sigma,
      },
      () => actions.editMath({ kind: 'block', pos: null, latex: '' }),
    ),
    actionCommand(
      {
        id: 'math-inline',
        isAvailable: notInCode,
        inSlash: true,
        inPalette: true,
        icon: Radical,
      },
      () => actions.editMath({ kind: 'inline', pos: null, latex: '' }),
    ),
    tableCommand('table-add-row', BetweenHorizontalEnd, (editor) =>
      focused(editor, (chain) => chain.addRowAfter()),
    ),
    tableCommand('table-add-column', BetweenVerticalEnd, (editor) =>
      focused(editor, (chain) => chain.addColumnAfter()),
    ),
    tableCommand('table-delete-row', Rows3, (editor) =>
      focused(editor, (chain) => chain.deleteRow()),
    ),
    tableCommand('table-delete-column', Columns3, (editor) =>
      focused(editor, (chain) => chain.deleteColumn()),
    ),
    tableCommand('table-delete', Trash2, (editor) =>
      focused(editor, (chain) => chain.deleteTable()),
    ),

    // ───── 보기 ─────
    actionCommand(
      {
        id: 'mode-cycle',
        inSlash: false,
        inPalette: true,
        icon: RefreshCw,
      },
      () => actions.cycleMode(),
    ),
    actionCommand(
      {
        id: 'mode-edit',
        inSlash: false,
        inPalette: true,
        icon: PenLine,
      },
      () => actions.setMode('edit'),
    ),
    actionCommand(
      {
        id: 'mode-source',
        inSlash: true,
        inPalette: true,
        icon: FileCode,
      },
      () => actions.setMode('source'),
    ),
    actionCommand(
      {
        id: 'mode-preview',
        inSlash: true,
        inPalette: true,
        icon: Eye,
      },
      () => actions.setMode('preview'),
    ),
    actionCommand(
      {
        id: 'toggle-panel',
        inSlash: false,
        inPalette: true,
        icon: PanelRight,
      },
      () => actions.togglePanel(),
    ),
    actionCommand(
      {
        id: 'command-palette',
        inSlash: false,
        inPalette: false,
        icon: Command,
      },
      () => actions.openPalette(),
    ),

    // ───── 문서 ─────
    {
      ...commandSpec('undo'),
      run: (editor) => focused(editor, (chain) => chain.undo()),
      inSlash: false,
      inPalette: true,
      icon: Undo2,
    },
    {
      ...commandSpec('redo'),
      run: (editor) => focused(editor, (chain) => chain.redo()),
      inSlash: false,
      inPalette: true,
      icon: Redo2,
    },
    // 단어·줄 선택(사용 피드백 2026-11-09, 작업 문서 2.11). 한 번: 가까운 단어, 다시: 그 줄, 다시: 블록 전체.
    // 넓힐 것이 없어도 키를 받는다(true). 받지 않으면 브라우저가 Mod+D 북마크 창을 연다
    {
      ...commandSpec('select-word'),
      run: (editor) => {
        const range = nextSelectionRange(editor.state);
        editor.commands.focus();
        if (range) editor.commands.setTextSelection(range);
        return true;
      },
      inSlash: false,
      inPalette: true,
      icon: TextSelect,
    },
    // 선택 풀기(사용 피드백 2026-11-09, 작업 문서 2.11). 선택이 없으면 받지 않는다(false):
    // 슬래시 메뉴는 선택 없이 열리므로 그때의 Esc는 지금처럼 메뉴를 닫는다. 팔레트·대화상자는 에디터 밖에서 Esc를 받는다
    {
      ...commandSpec('collapse-selection'),
      run: (editor) => {
        if (editor.state.selection.empty) return false;
        const next = collapsedSelection(editor.state);
        if (next) editor.view.dispatch(editor.state.tr.setSelection(next));
        return true;
      },
      inSlash: false,
      inPalette: false,
      icon: TextCursor,
    },
    // 찾기·바꾸기(5단계 D7). 편집 모드가 아니면 false라 브라우저 찾기가 그대로 열린다
    {
      ...commandSpec('find'),
      run: () => actions.openFind(),
      inSlash: false,
      inPalette: true,
      icon: Search,
    },
    actionCommand(
      {
        id: 'save-now',
        inSlash: false,
        inPalette: true,
        icon: Save,
      },
      () => actions.saveNow(),
    ),
    actionCommand(
      {
        id: 'publish',
        inSlash: false,
        inPalette: true,
        icon: Send,
      },
      () => actions.publish(),
    ),
    // 이전 발행본 (5단계 D3). 키는 없다. 팔레트와 상단 바 메뉴에서 연다
    actionCommand(
      {
        id: 'revisions',
        inSlash: false,
        inPalette: true,
        icon: History,
      },
      () => actions.openRevisions(),
    ),
  ];
}

// id로 명령을 찾는다
export function commandById(
  commands: readonly EditorCommand[],
  id: string,
): EditorCommand | undefined {
  return commands.find((command) => command.id === id);
}

// 지금 자리에서 쓸 수 있는지
export function isCommandAvailable(command: EditorCommand, editor: Editor): boolean {
  return command.isAvailable ? command.isAvailable(editor) : true;
}
