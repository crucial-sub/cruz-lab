/**
 * Slash Commands 플러그인
 *
 * `/` 입력 시 명령어 메뉴를 표시하여 빠른 블록 삽입을 지원합니다.
 * - 제목 1-3
 * - 글머리 기호 목록
 * - 번호 매기기 목록
 * - 코드 블록
 * - 구분선
 * - 인용구
 */

import { slashFactory } from '@milkdown/plugin-slash';
import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx } from '@milkdown/kit/core';
import {
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  wrapInBlockquoteCommand,
} from '@milkdown/kit/preset/commonmark';

/**
 * Slash 메뉴 아이템 타입 정의
 */
export interface SlashMenuItem {
  /** 고유 식별자 */
  id: string;
  /** 표시 라벨 */
  label: string;
  /** 아이콘 (텍스트 또는 이모지) */
  icon: string;
  /** 그룹 분류 */
  group: 'text' | 'list' | 'advanced';
  /** 검색용 키워드 */
  keywords: string[];
  /** 실행할 명령어 */
  action: (ctx: Ctx) => void;
}

/**
 * 기본 Slash 메뉴 아이템 목록
 */
export const defaultSlashItems: SlashMenuItem[] = [
  // 텍스트 그룹
  {
    id: 'heading1',
    label: '제목 1',
    icon: 'H1',
    group: 'text',
    keywords: ['heading', 'h1', '제목', '헤딩'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(wrapInHeadingCommand.key, 1);
    },
  },
  {
    id: 'heading2',
    label: '제목 2',
    icon: 'H2',
    group: 'text',
    keywords: ['heading', 'h2', '제목', '헤딩'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(wrapInHeadingCommand.key, 2);
    },
  },
  {
    id: 'heading3',
    label: '제목 3',
    icon: 'H3',
    group: 'text',
    keywords: ['heading', 'h3', '제목', '헤딩'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(wrapInHeadingCommand.key, 3);
    },
  },
  {
    id: 'blockquote',
    label: '인용구',
    icon: '❝',
    group: 'text',
    keywords: ['quote', 'blockquote', '인용', '인용구'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(wrapInBlockquoteCommand.key);
    },
  },

  // 목록 그룹
  {
    id: 'bulletList',
    label: '글머리 기호 목록',
    icon: '•',
    group: 'list',
    keywords: ['bullet', 'list', 'ul', '목록', '불릿'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(wrapInBulletListCommand.key);
    },
  },
  {
    id: 'orderedList',
    label: '번호 매기기 목록',
    icon: '1.',
    group: 'list',
    keywords: ['numbered', 'list', 'ol', '번호', '숫자'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(wrapInOrderedListCommand.key);
    },
  },

  // 고급 그룹
  {
    id: 'codeBlock',
    label: '코드 블록',
    icon: '</>',
    group: 'advanced',
    keywords: ['code', 'block', '코드', '블록'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(createCodeBlockCommand.key);
    },
  },
  {
    id: 'divider',
    label: '구분선',
    icon: '—',
    group: 'advanced',
    keywords: ['divider', 'hr', 'line', '구분', '선'],
    action: (ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(insertHrCommand.key);
    },
  },
];

/**
 * Slash 메뉴 아이템 필터링
 *
 * @param items - 전체 메뉴 아이템 목록
 * @param filter - 검색 문자열
 * @returns 필터링된 메뉴 아이템 목록
 */
export function filterSlashItems(
  items: SlashMenuItem[],
  filter: string
): SlashMenuItem[] {
  if (!filter) return items;

  const lowerFilter = filter.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(lowerFilter) ||
      item.keywords.some((keyword) => keyword.toLowerCase().includes(lowerFilter))
  );
}

/**
 * 그룹별로 메뉴 아이템 정렬
 *
 * @param items - 메뉴 아이템 목록
 * @returns 그룹별로 정렬된 메뉴 아이템 목록
 */
export function groupSlashItems(
  items: SlashMenuItem[]
): Map<string, SlashMenuItem[]> {
  const grouped = new Map<string, SlashMenuItem[]>();

  items.forEach((item) => {
    const group = grouped.get(item.group) || [];
    group.push(item);
    grouped.set(item.group, group);
  });

  return grouped;
}

/**
 * 그룹 라벨 정의
 */
export const groupLabels: Record<string, string> = {
  text: '텍스트',
  list: '목록',
  advanced: '고급',
};

/**
 * Slash 플러그인 인스턴스 생성
 */
export const slash = slashFactory('cruz-slash');

export default slash;
