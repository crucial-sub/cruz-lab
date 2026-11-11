// 키맵 설정 검사 (재건 5단계 D14)
// - settings/editor 문서의 keymap(기본값과 다른 명령만, null은 "키 없음")을 검사한다.
// - 서버 API(PUT /api/admin/settings/editor), 관리자 설정 화면, 에디터(열 때)가 같은 함수를 쓴다.
//   그래서 이 파일은 순수 함수다. zod·Tiptap·DOM을 가져오지 않는다(관리자 앱 첫 청크에 들어간다).
// - 막는 키: Mod+Alt 조합(계획 문서 2.2 #2), 브라우저가 가로채는 키(Mod+W·T·N·Q·L·R·Tab, F5·F11·F12),
//   편집 기본 키(Mod+C·V·X·A, Mod+Shift+V), 커서 이동·지우기 키(←·→·Home·End·PageUp·PageDown·Backspace·Delete 조합,
//   Mod+Shift가 아닌 ↑·↓ 조합), 맥의 ⌃ 글자 편집 키(⌃A·E·D·H·K 등)와 ⌘·⌃ Space(입력 소스·Spotlight).
//   수식 키(Mod·Ctrl·Alt) 없는 키(F1~F12만 예외)도 막는다(글자 입력과 겹친다). 리뷰 S6에서 넓혔다.
// - 충돌: 덮어쓰기를 기본 키에 적용한 결과에서 같은 키를 쓰는 명령이 둘 이상이면 충돌이다.

import { COMMAND_SPECS, type CommandSpec } from './command-keys';
import {
  applyKeymapOverrides,
  findKeyConflicts,
  keyFor,
  usesModAlt,
  type KeyBinding,
  type Platform,
} from './keymap';

export type KeymapOverrides = Record<string, KeyBinding | null>;

// 키 문자열의 최대 길이(서버 스키마도 같은 값을 쓴다)
export const MAX_KEY_LENGTH = 40;

// 키 하나의 문제
export type KeyProblem = 'format' | 'no-modifier' | 'mod-alt' | 'reserved' | 'meta';
// 설정 전체의 문제
export type KeymapIssueCode = KeyProblem | 'unknown-command' | 'conflict';

export interface KeymapIssue {
  id: string;
  // 키 하나의 문제면 그 플랫폼. 모르는 명령이면 null
  platform: Platform | null;
  code: KeymapIssueCode;
  message: string;
  // 충돌이면 같은 키를 쓰는 다른 명령 id
  ids?: string[];
}

export const KEY_PROBLEM_MESSAGES: Readonly<Record<KeyProblem, string>> = {
  format: '키 형식이 올바르지 않습니다',
  'no-modifier': '⌘·Ctrl·⌃·Alt 중 하나와 함께 눌러야 합니다(F1~F12는 혼자 써도 됩니다)',
  'mod-alt': 'Mod(⌘·Ctrl)와 Alt를 함께 쓰는 키는 쓸 수 없습니다',
  reserved: '브라우저나 편집 기본 동작이 쓰는 키입니다',
  meta: 'Win 키는 쓸 수 없습니다',
};

const MODIFIER_TOKENS = new Set(['Mod', 'Ctrl', 'Alt', 'Shift', 'Meta']);
// 본 키로 받는 이름 있는 키(prosemirror-keymap·w3c-keyname 이름)
const NAMED_KEYS = new Set([
  'Enter',
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);
// 본 키로 받는 글자: 영문 소문자, 숫자, 문장 부호(키보드 자리 이름 → 글자는 keyFromEvent)
const CHARACTER_KEY = /^[a-z0-9.,/;'[\]\\`=-]$/;
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

// 'Mod-Shift-b' → 수식 키 목록과 본 키. 본 키가 '-'인 'Mod--'도 다룬다(keymap.ts splitKey와 같은 분할)
function splitKeyString(key: string): { modifiers: string[]; base: string } {
  const parts = key.split(/-(?!$)/);
  const base = parts.pop() ?? '';
  return { modifiers: parts, base };
}

// 커서 이동·지우기 키(어떤 수식 키와 함께여도 에디터 구조 키다)
const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backspace',
  'Delete',
]);
// 맥의 ⌃ 글자 편집 키(Cocoa 텍스트 키)
const MAC_CONTROL_EDIT_KEYS = new Set([
  'a',
  'b',
  'd',
  'e',
  'f',
  'h',
  'k',
  'n',
  'o',
  'p',
  't',
  'v',
  'y',
]);

// 브라우저·편집 기본 동작이 쓰는 키인지. hasMod는 그 플랫폼의 Mod(맥 ⌘, 그 밖 Ctrl)를 눌렀는지다
function isReserved(
  base: string,
  mods: ReadonlySet<string>,
  hasMod: boolean,
  platform: Platform,
): boolean {
  // 새로 고침·전체 화면·개발자 도구
  if (base === 'F5' || base === 'F11' || base === 'F12') return true;
  if (NAVIGATION_KEYS.has(base)) return true;
  // ↑·↓는 Mod+Shift(블록 이동 기본 키 자리)만 받는다
  if (base === 'ArrowUp' || base === 'ArrowDown') {
    return !(hasMod && mods.has('Shift') && mods.size === 2);
  }
  if (platform === 'mac') {
    // 입력 소스 바꾸기(⌃Space)·Spotlight(⌘Space)
    if (base === 'Space' && (hasMod || mods.has('Ctrl'))) return true;
    // ⌃ 글자 편집 키(⌃A 줄 처음, ⌃K 줄 끝까지 지우기 등)
    if (mods.has('Ctrl') && mods.size === 1 && MAC_CONTROL_EDIT_KEYS.has(base)) return true;
  }
  // 탭 전환(맥의 ⌃Tab 포함)
  if (base === 'Tab' && (hasMod || mods.has('Ctrl'))) return true;
  if (!hasMod || mods.has('Alt')) return false;
  // 창·탭·종료·주소창·새로 고침. Shift를 함께 눌러도 브라우저가 가져간다(⌘⇧T, ⌘⇧N, ⌘⇧W, ⌘⇧R)
  if (['w', 't', 'n', 'q', 'l', 'r'].includes(base)) return true;
  // 복사·붙여넣기·잘라내기·모두 선택, 서식 없이 붙여넣기(Mod+Shift+V)
  const shift = mods.has('Shift');
  if (!shift && ['c', 'v', 'x', 'a'].includes(base)) return true;
  return shift && base === 'v';
}

// 덮어쓸 키 하나를 검사한다. 문제가 없으면 null
export function checkOverrideKey(key: string, platform: Platform): KeyProblem | null {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) return 'format';
  const { modifiers, base } = splitKeyString(key);
  const mods = new Set<string>();
  for (const token of modifiers) {
    if (!MODIFIER_TOKENS.has(token) || mods.has(token)) return 'format';
    mods.add(token);
  }
  if (!(CHARACTER_KEY.test(base) || NAMED_KEYS.has(base))) return 'format';
  if (mods.has('Meta')) return 'meta';
  if (usesModAlt(key)) return 'mod-alt';
  // 그 밖 플랫폼에서는 Ctrl이 곧 Mod다
  const hasMod = mods.has('Mod') || (platform === 'other' && mods.has('Ctrl'));
  if (!hasMod && !mods.has('Ctrl') && !mods.has('Alt') && !FUNCTION_KEY.test(base)) {
    return 'no-modifier';
  }
  if (isReserved(base, mods, hasMod, platform)) return 'reserved';
  return null;
}

// 덮어쓰기를 명령 표의 기본 키에 적용한 결과(id·키)
export function effectiveKeys(
  overrides: Readonly<KeymapOverrides>,
  specs: readonly CommandSpec[] = COMMAND_SPECS,
): CommandSpec[] {
  return applyKeymapOverrides(specs, overrides);
}

const PLATFORMS: readonly Platform[] = ['mac', 'other'];

// 설정 전체를 검사한다. 문제가 없으면 빈 배열
// - 모르는 명령 id, 키 형식·막는 키, 적용 뒤 충돌을 본다.
// - 충돌은 덮어쓴 명령에만 적는다(기본 키끼리는 충돌하지 않는다: editor-commands 테스트).
export function validateKeymapOverrides(
  overrides: Readonly<KeymapOverrides>,
  specs: readonly CommandSpec[] = COMMAND_SPECS,
): KeymapIssue[] {
  const issues: KeymapIssue[] = [];
  const byId = new Map(specs.map((item) => [item.id, item]));
  for (const [id, value] of Object.entries(overrides)) {
    const spec = byId.get(id);
    if (!spec) {
      issues.push({ id, platform: null, code: 'unknown-command', message: '모르는 명령입니다' });
      continue;
    }
    if (value === null) continue;
    for (const platform of PLATFORMS) {
      const key = value[platform];
      if (key === null) continue;
      // 기본 키와 같은 값은 검사하지 않는다. 이 기기 플랫폼만 바꾸면 다른 플랫폼에는 기본 키가 그대로 적힌다.
      // 기본 키에는 수식 키 없는 Escape(선택 풀기)도 있다(5단계 리뷰 B1)
      if (key === keyFor(spec, platform)) continue;
      const problem = checkOverrideKey(key, platform);
      if (problem) {
        issues.push({ id, platform, code: problem, message: KEY_PROBLEM_MESSAGES[problem] });
      }
    }
  }
  if (issues.length > 0) return issues;

  const titleOf = new Map(specs.map((item) => [item.id, item.title]));
  for (const conflict of findKeyConflicts(effectiveKeys(overrides, specs))) {
    for (const id of conflict.ids) {
      if (!Object.prototype.hasOwnProperty.call(overrides, id)) continue;
      const others = conflict.ids.filter((other) => other !== id);
      issues.push({
        id,
        platform: conflict.platform,
        code: 'conflict',
        message: `${others.map((other) => `‘${titleOf.get(other) ?? other}’`).join(', ')}와(과) 같은 키입니다`,
        ids: others,
      });
    }
  }
  return issues;
}

// 기본값과 같은 덮어쓰기를 뺀다(문서에는 기본값과 다른 명령만 담는다, D14). 모르는 id는 그대로 둔다(검사가 거른다)
export function compactOverrides(
  overrides: Readonly<KeymapOverrides>,
  specs: readonly CommandSpec[] = COMMAND_SPECS,
): KeymapOverrides {
  const byId = new Map(specs.map((item) => [item.id, item]));
  const result: KeymapOverrides = {};
  for (const [id, value] of Object.entries(overrides)) {
    const spec = byId.get(id);
    const normalized =
      value && (value.mac || value.other)
        ? { mac: value.mac ?? null, other: value.other ?? null }
        : null;
    if (spec) {
      const same = PLATFORMS.every(
        (platform) => (normalized?.[platform] ?? null) === (keyFor(spec, platform) ?? null),
      );
      if (same) continue;
    }
    result[id] = normalized;
  }
  return result;
}

// 이 기기 플랫폼의 키 하나를 바꾼 새 덮어쓰기. 다른 플랫폼 키는 지금 값(덮어쓰기 또는 기본값)을 그대로 둔다
export function setPlatformKey(
  overrides: Readonly<KeymapOverrides>,
  id: string,
  platform: Platform,
  key: string | null,
  specs: readonly CommandSpec[] = COMMAND_SPECS,
): KeymapOverrides {
  const spec = specs.find((item) => item.id === id);
  if (!spec) return { ...overrides };
  const current = Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : spec.keys;
  const next: KeyBinding = {
    mac: current?.mac ?? null,
    other: current?.other ?? null,
    [platform]: key,
  };
  return compactOverrides({ ...overrides, [id]: next }, specs);
}

// 이 기기 플랫폼의 키를 기본값으로 되돌린 새 덮어쓰기
export function resetPlatformKey(
  overrides: Readonly<KeymapOverrides>,
  id: string,
  platform: Platform,
  specs: readonly CommandSpec[] = COMMAND_SPECS,
): KeymapOverrides {
  const spec = specs.find((item) => item.id === id);
  if (!spec) return { ...overrides };
  return setPlatformKey(overrides, id, platform, keyFor(spec, platform), specs);
}

// ───────────── 키 잡기 (설정 화면) ─────────────

// KeyboardEvent 중 키 잡기가 읽는 칸 (테스트는 이 모양의 객체를 넘긴다)
export interface KeyEventLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// 키보드 자리 이름 → 문장 부호 글자 (한글 입력 상태에서도 자리로 읽는다)
const CODE_CHARACTERS: Readonly<Record<string, string>> = {
  Period: '.',
  Comma: ',',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
};
const MODIFIER_KEY_NAMES = new Set(['Meta', 'Control', 'Alt', 'Shift', 'OS', 'CapsLock', 'Fn']);

// 눌린 본 키의 이름. 글자는 키보드 자리(code)로 읽는다. 수식 키만 눌렸으면 null
function baseKeyOf(event: KeyEventLike): string | null {
  if (MODIFIER_KEY_NAMES.has(event.key)) return null;
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  if (digit) return digit[1];
  if (CODE_CHARACTERS[event.code]) return CODE_CHARACTERS[event.code];
  if (NAMED_KEYS.has(event.key)) return event.key;
  if (event.key === ' ') return 'Space';
  // 자리 이름이 없는 환경: 글자 하나면 소문자로
  if (event.key.length === 1) return event.key.toLowerCase();
  return event.key || null;
}

// 눌린 키를 키 문자열로 바꾼다('Mod-Shift-b'). 수식 키만 눌렸으면 null
// - 맥: ⌘ → Mod, ⌃ → Ctrl. 그 밖: Ctrl → Mod, Win → Meta(검사가 막는다)
export function keyFromEvent(event: KeyEventLike, platform: Platform): string | null {
  const base = baseKeyOf(event);
  if (!base) return null;
  const parts: string[] = [];
  if (platform === 'mac') {
    if (event.metaKey) parts.push('Mod');
    if (event.ctrlKey) parts.push('Ctrl');
  } else {
    if (event.ctrlKey) parts.push('Mod');
    if (event.metaKey) parts.push('Meta');
  }
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  return [...parts, base].join('-');
}
