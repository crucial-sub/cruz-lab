// 키맵 순수 함수 (재건 3단계 D9)
// - 키 표기는 Tiptap(prosemirror-keymap) 형식이다: 'Mod-Shift-2', 'Mod-b', 'Mod-Shift-Enter'.
//   Mod는 맥에서 ⌘(Meta), 그 밖에서 Ctrl이다.
// - 사용자 키맵(덮어쓰기)은 settings/editor 문서에 있다(5단계 D14). 검사는 keymap-settings.ts가 한다.
//   덮어쓰기·충돌 검사·표기 함수는 에디터·설정 화면·서버가 함께 쓴다(순수 함수).

export type Platform = 'mac' | 'other';

// 명령의 키. 플랫폼마다 따로 둔다. 기본값은 대개 같다.
// null은 그 플랫폼에서 키가 없다는 뜻이다(5단계 D14: 설정 화면은 이 기기의 플랫폼 키만 고친다)
export interface KeyBinding {
  mac: string | null;
  other: string | null;
}

// 키를 가진 것(명령)의 최소 모양
export interface Keyed {
  id: string;
  keys: KeyBinding | null;
}

export interface KeyConflict {
  platform: Platform;
  key: string;
  ids: string[];
}

// prosemirror-keymap과 같은 규칙으로 맥(iOS 포함)을 판정한다
export function detectPlatform(platform: string | undefined): Platform {
  return platform && /Mac|iP(hone|[oa]d)/.test(platform) ? 'mac' : 'other';
}

// 수식 키 이름 → 표준 이름. Mod는 플랫폼에 따라 정한다
function modifierName(part: string, platform: Platform): string | null {
  switch (part.toLowerCase()) {
    case 'mod':
      return platform === 'mac' ? 'Meta' : 'Ctrl';
    case 'cmd':
    case 'meta':
      return 'Meta';
    case 'ctrl':
    case 'control':
      return 'Ctrl';
    case 'alt':
    case 'option':
      return 'Alt';
    case 'shift':
      return 'Shift';
    default:
      return null;
  }
}

// 키 문자열을 수식 키 목록과 본 키로 나눈다. 본 키가 '-'인 'Mod--'도 다룬다(prosemirror-keymap과 같은 분할)
function splitKey(key: string): { modifiers: string[]; base: string } {
  const parts = key.split(/-(?!$)/);
  const base = parts.pop() ?? '';
  return { modifiers: parts, base };
}

// 수식 키 순서. prosemirror-keymap의 modifiers()와 같다
const MODIFIER_ORDER = ['Alt', 'Ctrl', 'Meta', 'Shift'];

// 같은 키인지 비교할 수 있게 표준 형태로 바꾼다: 'Shift-Mod-B'(맥) → 'Meta-Shift-b'
export function normalizeKey(key: string, platform: Platform): string {
  const { modifiers, base } = splitKey(key);
  const names = new Set<string>();
  for (const part of modifiers) {
    const name = modifierName(part, platform);
    if (name) names.add(name);
  }
  const ordered = MODIFIER_ORDER.filter((name) => names.has(name));
  const normalizedBase = base.length === 1 ? base.toLowerCase() : base;
  return [...ordered, normalizedBase].join('-');
}

// 화면 표기용 이름 있는 키
const MAC_KEY_SYMBOLS: Record<string, string> = {
  Enter: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  Tab: '⇥',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const MAC_MODIFIER_SYMBOLS: Record<string, string> = {
  Meta: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};
// 맥 표기 순서: Plan D9의 예(⌘⇧2)를 따른다
const MAC_DISPLAY_ORDER = ['Meta', 'Ctrl', 'Alt', 'Shift'];
// 그 밖 표기 순서: Ctrl+Alt+Shift+키
const OTHER_DISPLAY_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const OTHER_MODIFIER_NAMES: Record<string, string> = {
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Win',
};

// 키를 사람이 읽는 표기로 바꾼다: 맥 '⌘⇧2', 그 밖 'Ctrl+Shift+2'
export function formatKey(key: string, platform: Platform): string {
  const { modifiers, base } = splitKey(key);
  const names = new Set(
    modifiers.map((part) => modifierName(part, platform)).filter((name): name is string => !!name),
  );
  const label = base.length === 1 ? base.toUpperCase() : base;
  if (platform === 'mac') {
    const symbols = MAC_DISPLAY_ORDER.filter((name) => names.has(name)).map(
      (name) => MAC_MODIFIER_SYMBOLS[name],
    );
    return [...symbols, MAC_KEY_SYMBOLS[base] ?? label].join('');
  }
  const words = OTHER_DISPLAY_ORDER.filter((name) => names.has(name)).map(
    (name) => OTHER_MODIFIER_NAMES[name],
  );
  return [...words, label].join('+');
}

// 명령의 그 플랫폼 키. 없으면 null
export function keyFor(command: Keyed, platform: Platform): string | null {
  return command.keys?.[platform] ?? null;
}

// 덮어쓰기 값 하나를 키로 바꾼다. 두 플랫폼 모두 키가 없으면 null
function bindingOf(value: KeyBinding | null | undefined): KeyBinding | null {
  if (!value || (!value.mac && !value.other)) return null;
  return { mac: value.mac ?? null, other: value.other ?? null };
}

// 사용자 덮어쓰기를 적용한 새 목록을 돌려준다. 값이 null이면 키를 없앤다. 없는 id는 무시한다
export function applyKeymapOverrides<T extends Keyed>(
  commands: readonly T[],
  overrides: Readonly<Record<string, KeyBinding | null>>,
): T[] {
  return commands.map((command) =>
    Object.prototype.hasOwnProperty.call(overrides, command.id)
      ? { ...command, keys: bindingOf(overrides[command.id]) }
      : command,
  );
}

// 같은 키를 쓰는 명령 묶음을 플랫폼별로 찾는다. 표기가 달라도 표준 형태가 같으면 충돌이다
export function findKeyConflicts(commands: readonly Keyed[]): KeyConflict[] {
  const conflicts: KeyConflict[] = [];
  for (const platform of ['mac', 'other'] as const) {
    const byKey = new Map<string, string[]>();
    for (const command of commands) {
      const key = keyFor(command, platform);
      if (!key) continue;
      const normalized = normalizeKey(key, platform);
      byKey.set(normalized, [...(byKey.get(normalized) ?? []), command.id]);
    }
    for (const [key, ids] of byKey) {
      if (ids.length > 1) conflicts.push({ platform, key, ids });
    }
  }
  return conflicts;
}

// Mod(Ctrl·Cmd)와 Alt를 함께 쓰는 키인지. 계획 문서 2.2 #2: 이 조합은 쓰지 않는다
// (윈도의 Ctrl+Alt는 AltGr 글자 입력과 겹친다)
export function usesModAlt(key: string): boolean {
  const { modifiers } = splitKey(key);
  const lowered = modifiers.map((part) => part.toLowerCase());
  const hasAlt = lowered.some((part) => part === 'alt' || part === 'option');
  const hasMod = lowered.some((part) => ['mod', 'ctrl', 'control', 'cmd', 'meta'].includes(part));
  return hasAlt && hasMod;
}

// 키가 있는 명령의 (플랫폼 키, id) 목록. 단축키 확장(shortcuts.ts)이 쓴다
export function shortcutEntries(
  commands: readonly Keyed[],
  platform: Platform,
): Array<{ key: string; id: string }> {
  const entries: Array<{ key: string; id: string }> = [];
  for (const command of commands) {
    const key = keyFor(command, platform);
    if (key) entries.push({ key, id: command.id });
  }
  return entries;
}
