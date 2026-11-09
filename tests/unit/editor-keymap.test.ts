// 키맵 순수 함수 테스트 (재건 3단계 D9: 덮어쓰기, 충돌 검사, 맥/윈도 표기)
import { describe, expect, it } from 'vitest';
import {
  applyKeymapOverrides,
  detectPlatform,
  findKeyConflicts,
  formatKey,
  keyFor,
  normalizeKey,
  shortcutEntries,
  usesModAlt,
} from '@/editor/commands/keymap';

const commands = [
  { id: 'bold', keys: { mac: 'Mod-b', other: 'Mod-b' } },
  { id: 'heading-2', keys: { mac: 'Mod-Shift-2', other: 'Mod-Shift-2' } },
  { id: 'table', keys: null },
];

describe('detectPlatform', () => {
  it('맥과 iOS 기기는 mac, 그 밖은 other다', () => {
    expect(detectPlatform('MacIntel')).toBe('mac');
    expect(detectPlatform('iPhone')).toBe('mac');
    expect(detectPlatform('iPad')).toBe('mac');
    expect(detectPlatform('Win32')).toBe('other');
    expect(detectPlatform('Linux x86_64')).toBe('other');
    expect(detectPlatform(undefined)).toBe('other');
  });
});

describe('normalizeKey', () => {
  it('Mod를 플랫폼 키로 바꾸고 수식 키 순서를 고정한다', () => {
    expect(normalizeKey('Mod-Shift-2', 'mac')).toBe('Meta-Shift-2');
    expect(normalizeKey('Shift-Mod-2', 'mac')).toBe('Meta-Shift-2');
    expect(normalizeKey('Mod-Shift-2', 'other')).toBe('Ctrl-Shift-2');
    expect(normalizeKey('Cmd-k', 'mac')).toBe('Meta-k');
    expect(normalizeKey('Control-Alt-k', 'other')).toBe('Alt-Ctrl-k');
  });

  it('글자 키는 소문자로 맞춘다. 이름 있는 키와 기호는 그대로 둔다', () => {
    expect(normalizeKey('Mod-B', 'mac')).toBe('Meta-b');
    expect(normalizeKey('Mod-Shift-Enter', 'other')).toBe('Ctrl-Shift-Enter');
    expect(normalizeKey('Mod-Shift-.', 'mac')).toBe('Meta-Shift-.');
    expect(normalizeKey('Mod--', 'mac')).toBe('Meta--');
  });
});

describe('formatKey', () => {
  it('맥은 기호, 그 밖은 Ctrl+ 표기다', () => {
    expect(formatKey('Mod-Shift-2', 'mac')).toBe('⌘⇧2');
    expect(formatKey('Mod-Shift-2', 'other')).toBe('Ctrl+Shift+2');
    expect(formatKey('Mod-b', 'mac')).toBe('⌘B');
    expect(formatKey('Mod-b', 'other')).toBe('Ctrl+B');
  });

  it('Enter·화살표 같은 이름 있는 키도 그린다', () => {
    expect(formatKey('Mod-Shift-Enter', 'mac')).toBe('⌘⇧↩');
    expect(formatKey('Mod-Shift-Enter', 'other')).toBe('Ctrl+Shift+Enter');
    expect(formatKey('Mod-Shift-,', 'other')).toBe('Ctrl+Shift+,');
    expect(formatKey('Alt-ArrowUp', 'mac')).toBe('⌥↑');
  });
});

describe('keyFor', () => {
  it('플랫폼의 키를 돌려주고 키가 없으면 null이다', () => {
    expect(keyFor(commands[0], 'mac')).toBe('Mod-b');
    expect(keyFor(commands[2], 'other')).toBeNull();
  });
});

describe('applyKeymapOverrides', () => {
  it('덮어쓰기가 비어 있으면 키가 그대로다(3단계 기본)', () => {
    const result = applyKeymapOverrides(commands, {});
    expect(result.map((command) => command.keys)).toEqual(commands.map((command) => command.keys));
  });

  it('지정한 명령의 키만 바꾸고 원본은 건드리지 않는다', () => {
    const result = applyKeymapOverrides(commands, {
      bold: { mac: 'Mod-Shift-b', other: 'Mod-Shift-b' },
    });
    expect(result[0].keys).toEqual({ mac: 'Mod-Shift-b', other: 'Mod-Shift-b' });
    expect(result[1].keys).toEqual(commands[1].keys);
    expect(commands[0].keys).toEqual({ mac: 'Mod-b', other: 'Mod-b' });
  });

  it('null은 키를 없앤다. 없는 명령 id는 무시한다', () => {
    const result = applyKeymapOverrides(commands, { 'heading-2': null, nope: null });
    expect(result[1].keys).toBeNull();
    expect(result).toHaveLength(3);
  });
});

describe('findKeyConflicts', () => {
  it('충돌이 없으면 빈 배열이다', () => {
    expect(findKeyConflicts(commands)).toEqual([]);
  });

  it('같은 키를 쓰는 명령을 플랫폼별로 찾는다. 표기가 달라도 같은 키면 충돌이다', () => {
    const conflicting = [
      ...commands,
      { id: 'heading-x', keys: { mac: 'Shift-Mod-2', other: 'Mod-Alt-2' } },
    ];
    expect(findKeyConflicts(conflicting)).toEqual([
      { platform: 'mac', key: 'Meta-Shift-2', ids: ['heading-2', 'heading-x'] },
    ]);
  });

  it('한 플랫폼에서만 겹치면 그 플랫폼만 알린다', () => {
    const conflicting = [
      { id: 'a', keys: { mac: 'Mod-k', other: 'Ctrl-k' } },
      { id: 'b', keys: { mac: 'Ctrl-k', other: 'Mod-k' } },
    ];
    expect(findKeyConflicts(conflicting)).toEqual([
      { platform: 'other', key: 'Ctrl-k', ids: ['a', 'b'] },
    ]);
  });
});

describe('usesModAlt', () => {
  it('Mod(또는 Ctrl·Cmd)와 Alt를 함께 쓰는 키를 찾는다', () => {
    expect(usesModAlt('Mod-Alt-1')).toBe(true);
    expect(usesModAlt('Ctrl-Alt-c')).toBe(true);
    expect(usesModAlt('Mod-Shift-2')).toBe(false);
    expect(usesModAlt('Alt-ArrowUp')).toBe(false);
  });
});

describe('shortcutEntries', () => {
  it('키가 있는 명령만 플랫폼 키와 id로 돌려준다', () => {
    expect(shortcutEntries(commands, 'other')).toEqual([
      { key: 'Mod-b', id: 'bold' },
      { key: 'Mod-Shift-2', id: 'heading-2' },
    ]);
  });
});
