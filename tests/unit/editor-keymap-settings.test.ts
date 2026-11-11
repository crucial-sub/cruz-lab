// 키맵 설정 검사 테스트 (재건 5단계 D14)
// - 키 하나 검사(형식, 수식 키, Mod+Alt, 막는 키, Win 키), 설정 전체 검사(모르는 명령, 충돌), 기본값과 같은 줄 빼기,
//   이 기기 플랫폼 키만 바꾸기, 키 잡기(눌린 키 → 키 문자열), 명령 표와 레지스트리가 같은지.
import { describe, expect, it, vi } from 'vitest';
import { COMMAND_SPECS, commandSpec, isKnownCommandId } from '@/editor/commands/command-keys';
import { findKeyConflicts, keyFor } from '@/editor/commands/keymap';
import {
  checkOverrideKey,
  compactOverrides,
  effectiveKeys,
  keyFromEvent,
  resetPlatformKey,
  setPlatformKey,
  validateKeymapOverrides,
  type KeyEventLike,
} from '@/editor/commands/keymap-settings';
import { createCommands, type CommandActions } from '@/editor/commands/registry';

function spyActions(): CommandActions {
  return {
    pickImage: vi.fn(),
    editLink: vi.fn(),
    editMath: vi.fn(),
    setMode: vi.fn(),
    cycleMode: vi.fn(),
    saveNow: vi.fn(),
    publish: vi.fn(),
    togglePanel: vi.fn(),
    openPalette: vi.fn(),
    openRevisions: vi.fn(),
    openFind: vi.fn(() => true),
  };
}

function keyEvent(partial: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe('명령 표와 레지스트리', () => {
  it('레지스트리의 명령은 표와 같은 순서·id·이름·묶음·범위·키다', () => {
    const commands = createCommands(spyActions());
    expect(commands.map((command) => command.id)).toEqual(COMMAND_SPECS.map((item) => item.id));
    for (const command of commands) {
      const spec = commandSpec(command.id);
      expect({
        ...command,
        run: undefined,
        isActive: undefined,
        isAvailable: undefined,
      }).toMatchObject({
        id: spec.id,
        title: spec.title,
        group: spec.group,
        scope: spec.scope,
        keys: spec.keys,
      });
    }
  });

  it('표에 없는 id는 오류이고 isKnownCommandId는 false다', () => {
    expect(() => commandSpec('없는-명령')).toThrow();
    expect(isKnownCommandId('bold')).toBe(true);
    expect(isKnownCommandId('__proto__')).toBe(false);
  });

  it('commandSpec은 표의 키를 복사해 준다(고쳐도 표가 바뀌지 않는다)', () => {
    const copy = commandSpec('bold');
    copy.keys!.mac = 'Mod-q';
    expect(commandSpec('bold').keys?.mac).toBe('Mod-b');
  });
});

describe('checkOverrideKey: 키 하나', () => {
  it('보통 키는 받는다', () => {
    expect(checkOverrideKey('Mod-Shift-b', 'mac')).toBeNull();
    expect(checkOverrideKey('Ctrl-Shift-2', 'mac')).toBeNull();
    expect(checkOverrideKey('Alt-Shift-j', 'other')).toBeNull();
    expect(checkOverrideKey('Mod-Shift-.', 'other')).toBeNull();
    expect(checkOverrideKey('Mod-Space', 'other')).toBeNull();
    expect(checkOverrideKey('F2', 'mac')).toBeNull();
    expect(checkOverrideKey('Shift-F6', 'other')).toBeNull();
  });

  it('형식이 틀리면 format', () => {
    for (const key of [
      '',
      'Mod-',
      'Mod-B',
      'Hyper-b',
      'Mod-Mod-b',
      'Mod-ㅠ',
      'Mod-Shift-Enterr',
      'x'.repeat(41),
    ]) {
      expect(checkOverrideKey(key, 'mac'), key).toBe('format');
    }
  });

  it('수식 키(Mod·Ctrl·Alt) 없는 키는 no-modifier다(F1~F12는 예외)', () => {
    expect(checkOverrideKey('b', 'mac')).toBe('no-modifier');
    expect(checkOverrideKey('Shift-b', 'other')).toBe('no-modifier');
    expect(checkOverrideKey('Enter', 'mac')).toBe('no-modifier');
    expect(checkOverrideKey('Shift-Enter', 'mac')).toBe('no-modifier');
  });

  it('Mod+Alt(맥 ⌘⌥, 그 밖 Ctrl+Alt)는 mod-alt다', () => {
    expect(checkOverrideKey('Mod-Alt-b', 'mac')).toBe('mod-alt');
    expect(checkOverrideKey('Mod-Alt-b', 'other')).toBe('mod-alt');
    expect(checkOverrideKey('Ctrl-Alt-b', 'mac')).toBe('mod-alt');
  });

  it('브라우저·편집 기본 키는 reserved다', () => {
    for (const key of [
      'Mod-w',
      'Mod-t',
      'Mod-n',
      'Mod-q',
      'Mod-l',
      'Mod-Tab',
      'Mod-Shift-t',
      'Mod-c',
      'Mod-v',
      'Mod-x',
      'Mod-a',
      'Mod-Shift-v',
    ]) {
      expect(checkOverrideKey(key, 'mac'), key).toBe('reserved');
      expect(checkOverrideKey(key, 'other'), key).toBe('reserved');
    }
    // 그 밖 플랫폼의 Ctrl은 Mod다. 맥의 ⌃Tab도 탭 전환이다
    expect(checkOverrideKey('Ctrl-w', 'other')).toBe('reserved');
    expect(checkOverrideKey('Ctrl-Tab', 'mac')).toBe('reserved');
    // 맥의 ⌃W, Mod+Shift+C(코드 블록 기본 키)는 막지 않는다
    expect(checkOverrideKey('Ctrl-w', 'mac')).toBeNull();
    expect(checkOverrideKey('Mod-Shift-c', 'mac')).toBeNull();
  });

  it('리뷰 S6: 커서 이동·지우기 키, 새로 고침·개발자 도구, 맥의 ⌃ 편집 키·Space 조합도 reserved다', () => {
    for (const key of [
      'Alt-Backspace',
      'Mod-Backspace',
      'Alt-ArrowLeft',
      'Mod-ArrowRight',
      'Alt-Home',
      'Mod-Delete',
      'Alt-ArrowUp',
      'Mod-ArrowDown',
      'F5',
      'F12',
      'Shift-F11',
      'Mod-r',
      'Mod-Shift-r',
    ]) {
      expect(checkOverrideKey(key, 'mac'), key).toBe('reserved');
      expect(checkOverrideKey(key, 'other'), key).toBe('reserved');
    }
    for (const key of ['Ctrl-d', 'Ctrl-a', 'Ctrl-k', 'Ctrl-Space', 'Mod-Space']) {
      expect(checkOverrideKey(key, 'mac'), key).toBe('reserved');
    }
    // 블록 이동 자리(Mod+Shift+↑/↓), 맥의 ⌃⇧숫자, 그 밖 플랫폼의 Ctrl+D(=Mod+D)는 받는다
    expect(checkOverrideKey('Mod-Shift-ArrowUp', 'mac')).toBeNull();
    expect(checkOverrideKey('Ctrl-Shift-5', 'mac')).toBeNull();
    expect(checkOverrideKey('Ctrl-d', 'other')).toBeNull();
  });

  it('기본 키는 Escape(선택 풀기) 말고 모두 검사를 통과한다(막는 키 목록이 기본 키와 어긋나지 않는다)', () => {
    for (const spec of COMMAND_SPECS) {
      for (const platform of ['mac', 'other'] as const) {
        const key = keyFor(spec, platform);
        if (!key || key === 'Escape') continue;
        expect(checkOverrideKey(key, platform), `${spec.id} ${platform} ${key}`).toBeNull();
      }
    }
  });

  it('Win 키(Meta)는 meta다', () => {
    expect(checkOverrideKey('Meta-b', 'other')).toBe('meta');
    expect(checkOverrideKey('Meta-b', 'mac')).toBe('meta');
  });
});

describe('validateKeymapOverrides: 설정 전체', () => {
  it('빈 설정과 바른 설정은 문제가 없다', () => {
    expect(validateKeymapOverrides({})).toEqual([]);
    expect(validateKeymapOverrides({ bold: { mac: 'Mod-Shift-b', other: 'Mod-Shift-b' } })).toEqual(
      [],
    );
    expect(
      validateKeymapOverrides({ bold: null, table: { mac: 'Mod-Shift-t', other: null } }),
    ).toEqual([{ id: 'table', platform: 'mac', code: 'reserved', message: expect.any(String) }]);
  });

  it('모르는 명령은 unknown-command다', () => {
    const issues = validateKeymapOverrides({ 'no-such': { mac: 'Mod-Shift-b', other: null } });
    expect(issues).toEqual([
      { id: 'no-such', platform: null, code: 'unknown-command', message: expect.any(String) },
    ]);
  });

  it('플랫폼마다 따로 검사한다', () => {
    const issues = validateKeymapOverrides({ bold: { mac: 'Mod-Shift-b', other: 'Mod-Alt-b' } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ id: 'bold', platform: 'other', code: 'mod-alt' });
  });

  it('기본 키와 겹치면 conflict다. 덮어쓴 명령에만 적고 상대 명령 id를 둔다', () => {
    const issues = validateKeymapOverrides({ bold: { mac: 'Mod-i', other: 'Mod-b' } });
    expect(issues).toEqual([
      {
        id: 'bold',
        platform: 'mac',
        code: 'conflict',
        message: expect.stringContaining('기울임'),
        ids: ['italic'],
      },
    ]);
  });

  it('표기가 달라도 같은 키면 충돌이다(그 밖 플랫폼의 Ctrl = Mod)', () => {
    const issues = validateKeymapOverrides({ table: { mac: null, other: 'Ctrl-b' } });
    expect(issues).toMatchObject([
      { id: 'table', platform: 'other', code: 'conflict', ids: ['bold'] },
    ]);
  });

  it('두 명령을 바꿔 서로의 키를 쓰면 충돌이 없다', () => {
    expect(
      validateKeymapOverrides({
        bold: { mac: 'Mod-i', other: 'Mod-i' },
        italic: { mac: 'Mod-b', other: 'Mod-b' },
      }),
    ).toEqual([]);
  });

  it('키를 지운 명령의 기본 키는 다른 명령이 쓸 수 있다', () => {
    expect(
      validateKeymapOverrides({ bold: null, table: { mac: 'Mod-b', other: 'Mod-b' } }),
    ).toEqual([]);
  });

  it('effectiveKeys는 덮어쓰기를 적용한다', () => {
    const effective = effectiveKeys({ bold: { mac: 'Mod-Shift-b', other: null } });
    const bold = effective.find((item) => item.id === 'bold')!;
    expect(keyFor(bold, 'mac')).toBe('Mod-Shift-b');
    expect(keyFor(bold, 'other')).toBeNull();
    expect(findKeyConflicts(effective)).toEqual([]);
  });
});

describe('5단계 리뷰 B1: 기본 키는 덮어쓰기에 그대로 적혀도 받는다', () => {
  it('기본 키는 모두 검사를 통과하거나(수식 키 있음) 기본값이라 검사에서 빠진다', () => {
    for (const spec of COMMAND_SPECS) {
      for (const platform of ['mac', 'other'] as const) {
        const key = keyFor(spec, platform);
        if (!key) continue;
        // 그 명령에 기본 키 그대로를 덮어써도 문제가 없다
        const issues = validateKeymapOverrides({
          [spec.id]: { mac: keyFor(spec, 'mac'), other: keyFor(spec, 'other') },
        });
        expect(issues, `${spec.id} ${platform}`).toEqual([]);
      }
    }
  });

  it('선택 풀기(Escape)를 맥에서만 바꾸거나 지워도 저장할 수 있다', () => {
    const changed = setPlatformKey({}, 'collapse-selection', 'mac', 'Mod-j');
    expect(changed).toEqual({ 'collapse-selection': { mac: 'Mod-j', other: 'Escape' } });
    expect(validateKeymapOverrides(changed)).toEqual([]);
    const cleared = setPlatformKey({}, 'collapse-selection', 'mac', null);
    expect(validateKeymapOverrides(cleared)).toEqual([]);
    // 다른 명령에 Escape를 주는 것은 여전히 막는다
    expect(validateKeymapOverrides({ bold: { mac: 'Escape', other: 'Mod-b' } })[0]?.code).toBe(
      'no-modifier',
    );
  });
});

describe('compactOverrides·setPlatformKey·resetPlatformKey', () => {
  it('기본값과 같은 줄은 뺀다. 둘 다 null이면 null로 맞춘다', () => {
    expect(
      compactOverrides({
        bold: { mac: 'Mod-b', other: 'Mod-b' },
        italic: { mac: null, other: null },
        table: null,
        'no-such': null,
      }),
    ).toEqual({ italic: null, 'no-such': null });
  });

  it('이 기기 플랫폼 키만 바꾸고 다른 플랫폼은 지금 값을 둔다', () => {
    let overrides = setPlatformKey({}, 'bold', 'mac', 'Mod-Shift-b');
    expect(overrides).toEqual({ bold: { mac: 'Mod-Shift-b', other: 'Mod-b' } });
    overrides = setPlatformKey(overrides, 'bold', 'other', null);
    expect(overrides).toEqual({ bold: { mac: 'Mod-Shift-b', other: null } });
    // 맥 키를 기본값으로 되돌려도 그 밖 플랫폼의 지운 값은 남는다
    overrides = resetPlatformKey(overrides, 'bold', 'mac');
    expect(overrides).toEqual({ bold: { mac: 'Mod-b', other: null } });
    // 둘 다 기본값이면 줄이 사라진다
    expect(resetPlatformKey(overrides, 'bold', 'other')).toEqual({});
  });

  it('키 없는 명령에 키를 주고, 다시 지우면 줄이 사라진다', () => {
    const overrides = setPlatformKey({}, 'table', 'other', 'Mod-Shift-y');
    expect(overrides).toEqual({ table: { mac: null, other: 'Mod-Shift-y' } });
    expect(setPlatformKey(overrides, 'table', 'other', null)).toEqual({});
  });
});

describe('keyFromEvent: 키 잡기', () => {
  it('맥: ⌘ → Mod, ⌃ → Ctrl. 글자는 키보드 자리로 읽는다(한글 입력 상태)', () => {
    expect(
      keyFromEvent(keyEvent({ key: 'ㅠ', code: 'KeyB', metaKey: true, shiftKey: true }), 'mac'),
    ).toBe('Mod-Shift-b');
    expect(
      keyFromEvent(keyEvent({ key: '@', code: 'Digit2', ctrlKey: true, shiftKey: true }), 'mac'),
    ).toBe('Ctrl-Shift-2');
    expect(
      keyFromEvent(keyEvent({ key: '>', code: 'Period', metaKey: true, shiftKey: true }), 'mac'),
    ).toBe('Mod-Shift-.');
  });

  it('그 밖: Ctrl → Mod, Win → Meta', () => {
    expect(keyFromEvent(keyEvent({ key: 'b', code: 'KeyB', ctrlKey: true }), 'other')).toBe(
      'Mod-b',
    );
    expect(keyFromEvent(keyEvent({ key: 'b', code: 'KeyB', metaKey: true }), 'other')).toBe(
      'Meta-b',
    );
  });

  it('이름 있는 키와 Space', () => {
    expect(keyFromEvent(keyEvent({ key: 'ArrowUp', code: 'ArrowUp', altKey: true }), 'mac')).toBe(
      'Alt-ArrowUp',
    );
    expect(keyFromEvent(keyEvent({ key: ' ', code: 'Space', ctrlKey: true }), 'other')).toBe(
      'Mod-Space',
    );
    expect(keyFromEvent(keyEvent({ key: 'F2', code: 'F2' }), 'mac')).toBe('F2');
  });

  it('수식 키만 누르면 null(기다린다)', () => {
    expect(
      keyFromEvent(keyEvent({ key: 'Meta', code: 'MetaLeft', metaKey: true }), 'mac'),
    ).toBeNull();
    expect(
      keyFromEvent(keyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), 'other'),
    ).toBeNull();
  });

  it('잡은 Mod+Alt+B는 검사가 막는다(8.4 시나리오 14)', () => {
    const key = keyFromEvent(
      keyEvent({ key: '∫', code: 'KeyB', metaKey: true, altKey: true }),
      'mac',
    );
    expect(key).toBe('Mod-Alt-b');
    expect(checkOverrideKey(key!, 'mac')).toBe('mod-alt');
  });
});
