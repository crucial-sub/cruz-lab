// 명령 표 (재건 5단계 D14, 3단계 D9·부록 B)
// - 명령마다 id·이름·묶음·범위·기본 키를 둔다. 기본 키 문자열은 이 파일에만 있다.
// - 레지스트리(registry.ts)는 이 표의 칸에 실행 함수·아이콘·메뉴 표시를 더한다.
// - 서버의 키맵 설정 검사(admin-settings.ts)와 관리자 설정 화면이 이 표를 가져온다.
//   그래서 이 파일은 순수 데이터다. 아이콘·Tiptap·ProseMirror·zod를 가져오지 않는다.
// - 기본 키는 Mod+Alt를 쓰지 않는다(계획 문서 2.2 #2). 맥의 제목·단락 키는 ⌃⇧숫자다(3단계 사용자 결정 2026-11-09).

import type { KeyBinding } from './keymap';

export type CommandGroup = 'block' | 'mark' | 'insert' | 'view' | 'doc';

// 묶음의 화면 이름 (설정 화면)
export const COMMAND_GROUP_LABELS: Readonly<Record<CommandGroup, string>> = {
  block: '블록',
  mark: '글자 모양',
  insert: '넣기',
  view: '보기',
  doc: '문서',
};

export interface CommandSpec {
  id: string;
  // 한국어 표시 이름. 슬래시·팔레트·설정 화면이 이 이름을 쓴다
  title: string;
  group: CommandGroup;
  // 'editor': 에디터에 포커스가 있을 때 Tiptap 키맵이 받는다. 'page': 창 전체에서 받는다
  scope: 'editor' | 'page';
  // 기본 키. 없으면 null
  keys: KeyBinding | null;
}

// 같은 키를 두 플랫폼에 쓴다(기본 키는 대개 그렇다)
const both = (key: string): KeyBinding => ({ mac: key, other: key });
// 제목·단락 키: 맥에서는 ⌘⇧3·⌘⇧4가 OS 스크린샷 키라 브라우저에 오지 않는다. 맥만 ⌃⇧숫자를 쓴다(리뷰 6.3 중요 4)
const blockLevelKey = (digit: number): KeyBinding => ({
  mac: `Ctrl-Shift-${digit}`,
  other: `Mod-Shift-${digit}`,
});

function spec(
  id: string,
  title: string,
  group: CommandGroup,
  scope: CommandSpec['scope'],
  keys: KeyBinding | null = null,
): CommandSpec {
  return { id, title, group, scope, keys };
}

// 명령 표. 순서가 툴바·팔레트·설정 화면의 기본 순서다(레지스트리도 이 순서로 만든다)
export const COMMAND_SPECS: readonly CommandSpec[] = [
  // ───── 블록 ─────
  spec('paragraph', '단락', 'block', 'editor', blockLevelKey(0)),
  spec('heading-2', '제목 2', 'block', 'editor', blockLevelKey(2)),
  spec('heading-3', '제목 3', 'block', 'editor', blockLevelKey(3)),
  spec('heading-4', '제목 4', 'block', 'editor', blockLevelKey(4)),
  spec('heading-cycle', '제목 바꾸기 (2 → 3 → 단락)', 'block', 'editor'),
  spec('bullet-list', '글머리 목록', 'block', 'editor', both('Mod-Shift-8')),
  spec('ordered-list', '번호 목록', 'block', 'editor', both('Mod-Shift-7')),
  spec('task-list', '체크 목록', 'block', 'editor', both('Mod-Shift-9')),
  spec('blockquote', '인용', 'block', 'editor', both('Mod-Shift-.')),
  spec('callout-note', '콜아웃 (메모)', 'block', 'editor'),
  spec('callout-tip', '콜아웃 (팁)', 'block', 'editor'),
  spec('callout-warning', '콜아웃 (주의)', 'block', 'editor'),
  spec('code-block', '코드 블록', 'block', 'editor', both('Mod-Shift-c')),
  // 블록 이동(5단계 D6). 맥의 ⌘⇧↑/↓는 원래 "문서 처음·끝까지 선택"이다. 에디터 안에서만 블록 이동으로 쓴다
  spec('block-move-up', '블록 위로 옮기기', 'block', 'editor', both('Mod-Shift-ArrowUp')),
  spec('block-move-down', '블록 아래로 옮기기', 'block', 'editor', both('Mod-Shift-ArrowDown')),

  // ───── 마크 ─────
  spec('bold', '굵게', 'mark', 'editor', both('Mod-b')),
  spec('italic', '기울임', 'mark', 'editor', both('Mod-i')),
  spec('strike', '취소선', 'mark', 'editor', both('Mod-Shift-x')),
  spec('code', '인라인 코드', 'mark', 'editor', both('Mod-e')),
  spec('link', '링크', 'mark', 'editor', both('Mod-Shift-k')),

  // ───── 넣기 ─────
  spec('image', '이미지', 'insert', 'editor', both('Mod-Shift-i')),
  spec('table', '표', 'insert', 'editor'),
  spec('horizontal-rule', '구분선', 'insert', 'editor'),
  spec('math-block', '수식 블록', 'insert', 'editor'),
  spec('math-inline', '인라인 수식', 'insert', 'editor'),
  spec('table-add-row', '아래에 행 추가', 'block', 'editor'),
  spec('table-add-column', '오른쪽에 열 추가', 'block', 'editor'),
  spec('table-delete-row', '행 삭제', 'block', 'editor'),
  spec('table-delete-column', '열 삭제', 'block', 'editor'),
  spec('table-delete', '표 삭제', 'block', 'editor'),

  // ───── 보기 ─────
  spec(
    'mode-cycle',
    '보기 모드 바꾸기 (편집 → 소스 → 미리보기)',
    'view',
    'page',
    both('Mod-Shift-m'),
  ),
  spec('mode-edit', '편집 모드', 'view', 'page'),
  spec('mode-source', '소스 모드', 'view', 'page'),
  spec('mode-preview', '미리보기', 'view', 'page'),
  spec('toggle-panel', '메타 패널 열고 닫기', 'view', 'page', both('Mod-Shift-,')),
  spec('command-palette', '명령 팔레트', 'view', 'page', both('Mod-k')),

  // ───── 문서 ─────
  spec('undo', '되돌리기', 'doc', 'editor', both('Mod-z')),
  spec('redo', '다시 실행', 'doc', 'editor', both('Mod-Shift-z')),
  spec('select-word', '단어·줄 선택', 'doc', 'editor', both('Mod-d')),
  spec('collapse-selection', '선택 풀기', 'doc', 'editor', both('Escape')),
  // 찾기·바꾸기(5단계 D7). 편집 모드에서만 받는다. 소스·미리보기 모드는 브라우저 찾기 그대로다
  spec('find', '찾기·바꾸기', 'doc', 'page', both('Mod-f')),
  spec('save-now', '지금 저장', 'doc', 'page', both('Mod-s')),
  spec('publish', '발행', 'doc', 'page', both('Mod-Shift-Enter')),
  // 이전 발행본(5단계 D3). 기본 키는 없다. 팔레트와 상단 바 메뉴에서 연다
  spec('revisions', '이전 발행본', 'doc', 'page'),
];

const SPECS_BY_ID = new Map(COMMAND_SPECS.map((item) => [item.id, item]));

// id로 명령 칸을 찾는다. 없으면 오류(레지스트리와 표가 어긋난 것은 코드 결함이다)
export function commandSpec(id: string): CommandSpec {
  const found = SPECS_BY_ID.get(id);
  if (!found) throw new Error(`명령 표에 없는 id입니다: ${id}`);
  return { ...found, keys: found.keys ? { ...found.keys } : null };
}

// 표에 있는 id인지
export function isKnownCommandId(id: string): boolean {
  return SPECS_BY_ID.has(id);
}
