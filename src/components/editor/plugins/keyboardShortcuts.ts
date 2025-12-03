/**
 * 키보드 단축키 플러그인
 *
 * Obsidian 스타일 키보드 단축키를 제공합니다.
 * - Cmd/Ctrl+B: 굵게
 * - Cmd/Ctrl+I: 기울임
 * - Cmd/Ctrl+1-3: 제목 1-3
 * - Cmd/Ctrl+K: 링크
 * - Cmd/Ctrl+`: 인라인 코드
 * - Cmd/Ctrl+Shift+C: 코드 블록
 * - Cmd/Ctrl+Shift+Q: 인용구
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { keymap } from '@milkdown/kit/prose/keymap';
import type { Command } from '@milkdown/kit/prose/state';
import { toggleMark, setBlockType, wrapIn } from '@milkdown/kit/prose/commands';
import type { Schema } from '@milkdown/kit/prose/model';

/**
 * 단축키 정의 인터페이스
 */
export interface ShortcutDefinition {
  /** 고유 식별자 */
  id: string;
  /** 설명 (한국어) */
  label: string;
  /** Mac 단축키 */
  macKey: string;
  /** Windows/Linux 단축키 */
  winKey: string;
  /** 카테고리 */
  category: 'formatting' | 'heading' | 'block' | 'navigation';
}

/**
 * 기본 단축키 목록 정의
 */
export const shortcutDefinitions: ShortcutDefinition[] = [
  // 서식
  {
    id: 'bold',
    label: '굵게',
    macKey: '⌘+B',
    winKey: 'Ctrl+B',
    category: 'formatting',
  },
  {
    id: 'italic',
    label: '기울임',
    macKey: '⌘+I',
    winKey: 'Ctrl+I',
    category: 'formatting',
  },
  {
    id: 'strikethrough',
    label: '취소선',
    macKey: '⌘+Shift+S',
    winKey: 'Ctrl+Shift+S',
    category: 'formatting',
  },
  {
    id: 'inlineCode',
    label: '인라인 코드',
    macKey: '⌘+E',
    winKey: 'Ctrl+E',
    category: 'formatting',
  },
  {
    id: 'link',
    label: '링크',
    macKey: '⌘+K',
    winKey: 'Ctrl+K',
    category: 'formatting',
  },

  // 제목
  {
    id: 'heading1',
    label: '제목 1',
    macKey: '⌘+1',
    winKey: 'Ctrl+1',
    category: 'heading',
  },
  {
    id: 'heading2',
    label: '제목 2',
    macKey: '⌘+2',
    winKey: 'Ctrl+2',
    category: 'heading',
  },
  {
    id: 'heading3',
    label: '제목 3',
    macKey: '⌘+3',
    winKey: 'Ctrl+3',
    category: 'heading',
  },

  // 블록
  {
    id: 'codeBlock',
    label: '코드 블록',
    macKey: '⌘+Shift+C',
    winKey: 'Ctrl+Shift+C',
    category: 'block',
  },
  {
    id: 'blockquote',
    label: '인용구',
    macKey: '⌘+Shift+Q',
    winKey: 'Ctrl+Shift+Q',
    category: 'block',
  },
  {
    id: 'bulletList',
    label: '글머리 기호',
    macKey: '⌘+Shift+8',
    winKey: 'Ctrl+Shift+8',
    category: 'block',
  },
  {
    id: 'orderedList',
    label: '번호 목록',
    macKey: '⌘+Shift+9',
    winKey: 'Ctrl+Shift+9',
    category: 'block',
  },

  // 네비게이션
  {
    id: 'undo',
    label: '실행 취소',
    macKey: '⌘+Z',
    winKey: 'Ctrl+Z',
    category: 'navigation',
  },
  {
    id: 'redo',
    label: '다시 실행',
    macKey: '⌘+Shift+Z',
    winKey: 'Ctrl+Shift+Z',
    category: 'navigation',
  },
];

/**
 * 카테고리 라벨 정의
 */
export const categoryLabels: Record<string, string> = {
  formatting: '서식',
  heading: '제목',
  block: '블록',
  navigation: '탐색',
};

/**
 * 운영체제 감지
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * 현재 OS에 맞는 단축키 반환
 */
export function getShortcutKey(shortcut: ShortcutDefinition): string {
  return isMac() ? shortcut.macKey : shortcut.winKey;
}

/**
 * 단축키를 카테고리별로 그룹화
 */
export function groupShortcutsByCategory(): Map<string, ShortcutDefinition[]> {
  const grouped = new Map<string, ShortcutDefinition[]>();

  shortcutDefinitions.forEach((shortcut) => {
    const group = grouped.get(shortcut.category) || [];
    group.push(shortcut);
    grouped.set(shortcut.category, group);
  });

  return grouped;
}

/**
 * 스키마 기반 키맵 바인딩 생성
 */
function createKeyBindings(schema: Schema): Record<string, Command> {
  const bindings: Record<string, Command> = {};

  // 마크 토글 (굵게, 기울임, 인라인 코드, 취소선)
  if (schema.marks.strong) {
    bindings['Mod-b'] = toggleMark(schema.marks.strong);
  }

  if (schema.marks.em) {
    bindings['Mod-i'] = toggleMark(schema.marks.em);
  }

  if (schema.marks.code) {
    bindings['Mod-e'] = toggleMark(schema.marks.code);
  }

  if (schema.marks.strike) {
    bindings['Mod-Shift-s'] = toggleMark(schema.marks.strike);
  }

  // 제목 단축키 (Mod+1, Mod+2, Mod+3)
  if (schema.nodes.heading && schema.nodes.paragraph) {
    const headingType = schema.nodes.heading;
    const paragraphType = schema.nodes.paragraph;

    // 제목 토글 명령어 생성 함수
    const createHeadingToggle = (level: number): Command => {
      return (state, dispatch) => {
        const { $from } = state.selection;
        const currentNode = $from.parent;

        // 이미 같은 레벨의 제목이면 일반 텍스트로 변환
        if (currentNode.type === headingType && currentNode.attrs.level === level) {
          return setBlockType(paragraphType)(state, dispatch);
        }

        // 제목으로 변환
        return setBlockType(headingType, { level })(state, dispatch);
      };
    };

    bindings['Mod-1'] = createHeadingToggle(1);
    bindings['Mod-2'] = createHeadingToggle(2);
    bindings['Mod-3'] = createHeadingToggle(3);
  }

  // 블록 단축키
  if (schema.nodes.blockquote) {
    bindings['Mod-Shift-q'] = wrapIn(schema.nodes.blockquote);
  }

  if (schema.nodes.code_block) {
    bindings['Mod-Shift-c'] = setBlockType(schema.nodes.code_block);
  }

  // 목록은 wrapInList가 필요하므로 별도 처리 필요
  // commonmark 프리셋에서 제공하는 명령어 사용 권장

  return bindings;
}

/**
 * 키보드 단축키 플러그인
 *
 * Milkdown의 $prose 유틸리티를 사용하여 Prosemirror 플러그인을 생성합니다.
 */
export const keyboardShortcutsPlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey('cruz-keyboard-shortcuts'),
    props: {
      handleKeyDown: (view, event) => {
        // 스키마에서 키맵 바인딩 생성
        const schema = view.state.schema;
        const bindings = createKeyBindings(schema);

        // 키 조합 생성
        const mod = event.metaKey || event.ctrlKey;
        const shift = event.shiftKey;
        const key = event.key.toLowerCase();

        // 키 조합 문자열 생성
        let keyString = '';
        if (mod) keyString += 'Mod-';
        if (shift) keyString += 'Shift-';
        keyString += key;

        // 바인딩 확인 및 실행
        const command = bindings[keyString];
        if (command) {
          const result = command(view.state, view.dispatch, view);
          if (result) {
            event.preventDefault();
            return true;
          }
        }

        return false;
      },
    },
  });
});

export default keyboardShortcutsPlugin;
