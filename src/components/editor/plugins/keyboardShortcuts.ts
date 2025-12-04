/**
 * 키보드 단축키 플러그인
 *
 * 웹 브라우저에서 사용 가능한 단축키를 제공합니다.
 * 모든 단축키는 Cmd+Option (Windows: Ctrl+Alt) 조합을 사용하여
 * 브라우저/시스템 단축키와의 충돌을 방지합니다.
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Command } from '@milkdown/kit/prose/state';
import { toggleMark, setBlockType, wrapIn, lift } from '@milkdown/kit/prose/commands';
import { wrapInList } from '@milkdown/kit/prose/schema-list';
import type { Schema, NodeType } from '@milkdown/kit/prose/model';

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
  category: 'formatting' | 'heading' | 'block' | 'navigation' | 'system';
}

/**
 * 기본 단축키 목록 정의
 * 모든 단축키: Cmd+Option (Mac) / Ctrl+Alt (Windows)
 */
export const shortcutDefinitions: ShortcutDefinition[] = [
  // 서식
  {
    id: 'bold',
    label: '굵게',
    macKey: '⌘+⌥+B',
    winKey: 'Ctrl+Alt+B',
    category: 'formatting',
  },
  {
    id: 'italic',
    label: '기울임',
    macKey: '⌘+⌥+I',
    winKey: 'Ctrl+Alt+I',
    category: 'formatting',
  },
  {
    id: 'strikethrough',
    label: '취소선',
    macKey: '⌘+⌥+S',
    winKey: 'Ctrl+Alt+S',
    category: 'formatting',
  },
  {
    id: 'inlineCode',
    label: '인라인 코드',
    macKey: '⌘+⌥+E',
    winKey: 'Ctrl+Alt+E',
    category: 'formatting',
  },
  {
    id: 'link',
    label: '링크 삽입',
    macKey: '⌘+⌥+K',
    winKey: 'Ctrl+Alt+K',
    category: 'formatting',
  },

  // 제목
  {
    id: 'heading1',
    label: '제목 1',
    macKey: '⌘+⌥+1',
    winKey: 'Ctrl+Alt+1',
    category: 'heading',
  },
  {
    id: 'heading2',
    label: '제목 2',
    macKey: '⌘+⌥+2',
    winKey: 'Ctrl+Alt+2',
    category: 'heading',
  },
  {
    id: 'heading3',
    label: '제목 3',
    macKey: '⌘+⌥+3',
    winKey: 'Ctrl+Alt+3',
    category: 'heading',
  },

  // 블록
  {
    id: 'codeBlock',
    label: '코드 블록',
    macKey: '⌘+⌥+C',
    winKey: 'Ctrl+Alt+C',
    category: 'block',
  },
  {
    id: 'blockquote',
    label: '인용구',
    macKey: '⌘+⌥+Q',
    winKey: 'Ctrl+Alt+Q',
    category: 'block',
  },
  {
    id: 'bulletList',
    label: '글머리 기호',
    macKey: '⌘+⌥+U',
    winKey: 'Ctrl+Alt+U',
    category: 'block',
  },
  {
    id: 'orderedList',
    label: '번호 목록',
    macKey: '⌘+⌥+O',
    winKey: 'Ctrl+Alt+O',
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

  // 시스템
  {
    id: 'save',
    label: '임시저장',
    macKey: '⌘+S',
    winKey: 'Ctrl+S',
    category: 'system',
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
  system: '시스템',
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
 * 리스트 토글 명령어 생성
 * 이미 해당 리스트 타입이면 일반 텍스트로, 아니면 리스트로 변환
 */
function createListToggle(listType: NodeType, itemType: NodeType): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;

    // 현재 리스트 안에 있는지 확인
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.type === listType) {
        // 이미 해당 리스트 타입이면 리스트 해제
        return lift(state, dispatch);
      }
    }

    // 리스트로 감싸기
    return wrapInList(listType)(state, dispatch);
  };
}

/**
 * 스키마 기반 키맵 바인딩 생성
 * 모든 단축키: Mod+Alt 조합
 */
function createKeyBindings(schema: Schema): Record<string, Command> {
  const bindings: Record<string, Command> = {};

  // 마크 토글 (굵게, 기울임, 인라인 코드, 취소선, 링크)
  // Milkdown 스키마 마크 이름: strong, emphasis, inlineCode, strike_through, link
  if (schema.marks.strong) {
    bindings['Mod-Alt-b'] = toggleMark(schema.marks.strong);
  }

  // emphasis (Milkdown) - 기울임
  if (schema.marks.emphasis) {
    bindings['Mod-Alt-i'] = toggleMark(schema.marks.emphasis);
  }

  // inlineCode (Milkdown) - 인라인 코드
  if (schema.marks.inlineCode) {
    bindings['Mod-Alt-e'] = toggleMark(schema.marks.inlineCode);
  }

  // strike_through (Milkdown GFM) - 취소선
  if (schema.marks.strike_through) {
    bindings['Mod-Alt-s'] = toggleMark(schema.marks.strike_through);
  }

  // 링크는 MilkdownEditor.tsx에서 LinkDialog를 통해 처리
  // (Mod-Alt-k 단축키는 에디터 컴포넌트에서 다이얼로그 열기로 처리)

  // 제목 단축키 (Mod+Alt+1~3)
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

    bindings['Mod-Alt-1'] = createHeadingToggle(1);
    bindings['Mod-Alt-2'] = createHeadingToggle(2);
    bindings['Mod-Alt-3'] = createHeadingToggle(3);
  }

  // 블록 단축키
  if (schema.nodes.blockquote) {
    bindings['Mod-Alt-q'] = wrapIn(schema.nodes.blockquote);
  }

  if (schema.nodes.code_block) {
    bindings['Mod-Alt-c'] = setBlockType(schema.nodes.code_block);
  }

  // 리스트 단축키
  if (schema.nodes.bullet_list && schema.nodes.list_item) {
    bindings['Mod-Alt-u'] = createListToggle(schema.nodes.bullet_list, schema.nodes.list_item);
  }

  if (schema.nodes.ordered_list && schema.nodes.list_item) {
    bindings['Mod-Alt-o'] = createListToggle(schema.nodes.ordered_list, schema.nodes.list_item);
  }

  return bindings;
}

/**
 * 키보드 단축키 플러그인
 */
export const keyboardShortcutsPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('cruz-keyboard-shortcuts'),
    props: {
      handleKeyDown: (view, event) => {
        // Cmd(Mac) 또는 Ctrl(Win) + Alt/Option 키가 눌렸는지 확인
        const mod = event.metaKey || event.ctrlKey;
        const alt = event.altKey;

        // Mod+Alt 조합만 처리
        if (!mod || !alt) return false;

        // 키 조합 문자열 생성
        const key = event.key.toLowerCase();
        const keyString = `Mod-Alt-${key}`;

        // 에디터 명령 바인딩 확인 및 실행
        const schema = view.state.schema;
        const bindings = createKeyBindings(schema);
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
