// 명령 레지스트리 (재건 3단계 D9, Plan 부록 B)
// - 단축키, 슬래시 메뉴, 명령 팔레트, 툴바, 모바일 툴바가 모두 이 목록 하나를 읽는다.
// - 키 문자열은 이 파일에만 있다. 기본 키는 부록 B다. Mod+Alt는 쓰지 않는다(계획 문서 2.2 #2).
// - 화면 동작(파일 고르기, 링크·수식 입력 창, 모드 전환, 저장, 발행, 패널, 팔레트)은 주입한 actions가 한다.
// - D9 인터페이스에 세 칸을 더했다(작업 문서 5절):
//   scope('editor' | 'page'): 'page'는 에디터 밖(소스·미리보기 모드, 제목 칸)에서도 키가 돈다.
//   isAvailable: 그 자리에서 쓸 수 있는지(표 명령은 표 안에서만). 팔레트와 툴바가 거른다.
//   inToolbar: 데스크톱 툴바에 그릴지(기본은 block·mark·insert 묶음 전부).

import type { ChainedCommands, Editor } from '@tiptap/core';
import {
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
  Send,
  Sigma,
  SquareCode,
  Strikethrough,
  Table,
  Trash2,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { CalloutType } from '@/lib/content/remark-callout';
import type { KeyBinding } from './keymap';

export type CommandGroup = 'block' | 'mark' | 'insert' | 'view' | 'doc';
export type ViewModeName = 'edit' | 'source' | 'preview';

export interface EditorCommand {
  id: string;
  // 한국어 표시 이름. 슬래시·팔레트가 이 이름으로 거른다
  title: string;
  group: CommandGroup;
  // 'editor': 에디터에 포커스가 있을 때 Tiptap 키맵이 받는다. 'page': 창 전체에서 받는다
  scope: 'editor' | 'page';
  keys: KeyBinding | null;
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
}

// 같은 키를 두 플랫폼에 쓴다(기본 키는 대개 그렇다)
const both = (key: string): KeyBinding => ({ mac: key, other: key });
// 제목·단락 키: 맥에서는 ⌘⇧3·⌘⇧4가 OS 스크린샷 키라 브라우저에 오지 않는다. 맥만 ⌃⇧숫자를 쓴다(사용자 결정 2026-11-09, 리뷰 6.3 중요 4)
const blockLevelKey = (digit: number): KeyBinding => ({
  mac: `Ctrl-Shift-${digit}`,
  other: `Mod-Shift-${digit}`,
});

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
function calloutCommand(type: CalloutType, title: string, icon: LucideIcon): EditorCommand {
  return {
    id: `callout-${type}`,
    title,
    group: 'block',
    scope: 'editor',
    keys: null,
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
    id: `heading-${level}`,
    title: `제목 ${level}`,
    group: 'block',
    scope: 'editor',
    keys: blockLevelKey(level),
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
  title: string,
  icon: LucideIcon,
  run: (editor: Editor) => boolean,
): EditorCommand {
  return {
    id,
    title,
    group: 'block',
    scope: 'editor',
    keys: null,
    run,
    isAvailable: inTable,
    inSlash: false,
    inPalette: true,
    icon,
  };
}

// 화면 동작 명령(문서를 직접 바꾸지 않는다)
function actionCommand(
  base: Omit<EditorCommand, 'run' | 'scope'> & { scope?: EditorCommand['scope'] },
  action: () => void,
): EditorCommand {
  return {
    scope: 'page',
    ...base,
    run: () => {
      action();
      return true;
    },
  };
}

// 기본 명령 목록을 만든다. 순서가 툴바·팔레트의 기본 순서다
export function createCommands(actions: CommandActions): EditorCommand[] {
  return [
    // ───── 블록 ─────
    {
      id: 'paragraph',
      title: '단락',
      group: 'block',
      scope: 'editor',
      keys: blockLevelKey(0),
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
      id: 'heading-cycle',
      title: '제목 바꾸기 (2 → 3 → 단락)',
      group: 'block',
      scope: 'editor',
      keys: null,
      run: cycleHeading,
      isActive: (editor) => editor.isActive('heading'),
      inSlash: false,
      inPalette: false,
      inToolbar: false,
      icon: Heading,
    },
    {
      id: 'bullet-list',
      title: '글머리 목록',
      group: 'block',
      scope: 'editor',
      keys: both('Mod-Shift-8'),
      run: (editor) => focused(editor, (chain) => chain.toggleBulletList()),
      isActive: (editor) => editor.isActive('bulletList'),
      inSlash: true,
      inPalette: true,
      icon: List,
    },
    {
      id: 'ordered-list',
      title: '번호 목록',
      group: 'block',
      scope: 'editor',
      keys: both('Mod-Shift-7'),
      run: (editor) => focused(editor, (chain) => chain.toggleOrderedList()),
      isActive: (editor) => editor.isActive('orderedList'),
      inSlash: true,
      inPalette: true,
      icon: ListOrdered,
    },
    {
      id: 'task-list',
      title: '체크 목록',
      group: 'block',
      scope: 'editor',
      keys: both('Mod-Shift-9'),
      run: (editor) => focused(editor, (chain) => chain.toggleTaskList()),
      isActive: (editor) => editor.isActive('taskList'),
      inSlash: true,
      inPalette: true,
      icon: ListTodo,
    },
    {
      id: 'blockquote',
      title: '인용',
      group: 'block',
      scope: 'editor',
      keys: both('Mod-Shift-.'),
      run: (editor) => focused(editor, (chain) => chain.toggleBlockquote()),
      isActive: (editor) => editor.isActive('blockquote'),
      inSlash: true,
      inPalette: true,
      icon: Quote,
    },
    calloutCommand('note', '콜아웃 (메모)', Info),
    calloutCommand('tip', '콜아웃 (팁)', Lightbulb),
    calloutCommand('warning', '콜아웃 (주의)', TriangleAlert),
    {
      id: 'code-block',
      title: '코드 블록',
      group: 'block',
      scope: 'editor',
      keys: both('Mod-Shift-c'),
      run: (editor) => focused(editor, (chain) => chain.toggleCodeBlock()),
      isActive: (editor) => editor.isActive('codeBlock'),
      inSlash: true,
      inPalette: true,
      icon: SquareCode,
    },

    // ───── 마크 ─────
    {
      id: 'bold',
      title: '굵게',
      group: 'mark',
      scope: 'editor',
      keys: both('Mod-b'),
      run: (editor) => focused(editor, (chain) => chain.toggleBold()),
      isActive: (editor) => editor.isActive('bold'),
      inSlash: false,
      inPalette: true,
      icon: Bold,
    },
    {
      id: 'italic',
      title: '기울임',
      group: 'mark',
      scope: 'editor',
      keys: both('Mod-i'),
      run: (editor) => focused(editor, (chain) => chain.toggleItalic()),
      isActive: (editor) => editor.isActive('italic'),
      inSlash: false,
      inPalette: true,
      icon: Italic,
    },
    {
      id: 'strike',
      title: '취소선',
      group: 'mark',
      scope: 'editor',
      keys: both('Mod-Shift-x'),
      run: (editor) => focused(editor, (chain) => chain.toggleStrike()),
      isActive: (editor) => editor.isActive('strike'),
      inSlash: false,
      inPalette: true,
      icon: Strikethrough,
    },
    {
      id: 'code',
      title: '인라인 코드',
      group: 'mark',
      scope: 'editor',
      keys: both('Mod-e'),
      run: (editor) => focused(editor, (chain) => chain.toggleCode()),
      isActive: (editor) => editor.isActive('code'),
      inSlash: false,
      inPalette: true,
      icon: Code,
    },
    actionCommand(
      {
        id: 'link',
        title: '링크',
        group: 'mark',
        scope: 'editor',
        keys: both('Mod-Shift-k'),
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
        title: '이미지',
        group: 'insert',
        scope: 'editor',
        keys: both('Mod-Shift-i'),
        isAvailable: notInCode,
        inSlash: true,
        inPalette: true,
        icon: Image,
      },
      () => actions.pickImage(),
    ),
    {
      id: 'table',
      title: '표',
      group: 'insert',
      scope: 'editor',
      keys: null,
      run: (editor) =>
        focused(editor, (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
      isAvailable: canInsertBlock,
      inSlash: true,
      inPalette: true,
      icon: Table,
    },
    {
      id: 'horizontal-rule',
      title: '구분선',
      group: 'insert',
      scope: 'editor',
      keys: null,
      run: (editor) => focused(editor, (chain) => chain.setHorizontalRule()),
      isAvailable: canInsertBlock,
      inSlash: true,
      inPalette: true,
      icon: Minus,
    },
    actionCommand(
      {
        id: 'math-block',
        title: '수식 블록',
        group: 'insert',
        scope: 'editor',
        keys: null,
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
        title: '인라인 수식',
        group: 'insert',
        scope: 'editor',
        keys: null,
        isAvailable: notInCode,
        inSlash: true,
        inPalette: true,
        icon: Radical,
      },
      () => actions.editMath({ kind: 'inline', pos: null, latex: '' }),
    ),
    tableCommand('table-add-row', '아래에 행 추가', BetweenHorizontalEnd, (editor) =>
      focused(editor, (chain) => chain.addRowAfter()),
    ),
    tableCommand('table-add-column', '오른쪽에 열 추가', BetweenVerticalEnd, (editor) =>
      focused(editor, (chain) => chain.addColumnAfter()),
    ),
    tableCommand('table-delete-row', '행 삭제', Rows3, (editor) =>
      focused(editor, (chain) => chain.deleteRow()),
    ),
    tableCommand('table-delete-column', '열 삭제', Columns3, (editor) =>
      focused(editor, (chain) => chain.deleteColumn()),
    ),
    tableCommand('table-delete', '표 삭제', Trash2, (editor) =>
      focused(editor, (chain) => chain.deleteTable()),
    ),

    // ───── 보기 ─────
    actionCommand(
      {
        id: 'mode-cycle',
        title: '보기 모드 바꾸기 (편집 → 소스 → 미리보기)',
        group: 'view',
        keys: both('Mod-Shift-m'),
        inSlash: false,
        inPalette: true,
        icon: RefreshCw,
      },
      () => actions.cycleMode(),
    ),
    actionCommand(
      {
        id: 'mode-edit',
        title: '편집 모드',
        group: 'view',
        keys: null,
        inSlash: false,
        inPalette: true,
        icon: PenLine,
      },
      () => actions.setMode('edit'),
    ),
    actionCommand(
      {
        id: 'mode-source',
        title: '소스 모드',
        group: 'view',
        keys: null,
        inSlash: true,
        inPalette: true,
        icon: FileCode,
      },
      () => actions.setMode('source'),
    ),
    actionCommand(
      {
        id: 'mode-preview',
        title: '미리보기',
        group: 'view',
        keys: null,
        inSlash: true,
        inPalette: true,
        icon: Eye,
      },
      () => actions.setMode('preview'),
    ),
    actionCommand(
      {
        id: 'toggle-panel',
        title: '메타 패널 열고 닫기',
        group: 'view',
        keys: both('Mod-Shift-,'),
        inSlash: false,
        inPalette: true,
        icon: PanelRight,
      },
      () => actions.togglePanel(),
    ),
    actionCommand(
      {
        id: 'command-palette',
        title: '명령 팔레트',
        group: 'view',
        keys: both('Mod-k'),
        inSlash: false,
        inPalette: false,
        icon: Command,
      },
      () => actions.openPalette(),
    ),

    // ───── 문서 ─────
    {
      id: 'undo',
      title: '되돌리기',
      group: 'doc',
      scope: 'editor',
      keys: both('Mod-z'),
      run: (editor) => focused(editor, (chain) => chain.undo()),
      inSlash: false,
      inPalette: true,
      icon: Undo2,
    },
    {
      id: 'redo',
      title: '다시 실행',
      group: 'doc',
      scope: 'editor',
      keys: both('Mod-Shift-z'),
      run: (editor) => focused(editor, (chain) => chain.redo()),
      inSlash: false,
      inPalette: true,
      icon: Redo2,
    },
    actionCommand(
      {
        id: 'save-now',
        title: '지금 저장',
        group: 'doc',
        keys: both('Mod-s'),
        inSlash: false,
        inPalette: true,
        icon: Save,
      },
      () => actions.saveNow(),
    ),
    actionCommand(
      {
        id: 'publish',
        title: '발행',
        group: 'doc',
        keys: both('Mod-Shift-Enter'),
        inSlash: false,
        inPalette: true,
        icon: Send,
      },
      () => actions.publish(),
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
