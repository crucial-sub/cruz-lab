// 명령 거르기·최근 사용 순 테스트 (재건 3단계 D9: 슬래시 메뉴, 명령 팔레트)
import { describe, expect, it } from 'vitest';
import {
  filterCommands,
  normalizeQuery,
  readRecent,
  recordRecent,
  writeRecent,
} from '@/editor/commands/filter';

const list = [
  { id: 'heading-2', title: '제목 2' },
  { id: 'heading-3', title: '제목 3' },
  { id: 'bullet-list', title: '글머리 목록' },
  { id: 'ordered-list', title: '번호 목록' },
  { id: 'task-list', title: '체크 목록' },
  { id: 'insert-table', title: '표' },
  { id: 'code-block', title: '코드 블록' },
  { id: 'code', title: '인라인 코드' },
];

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('normalizeQuery', () => {
  it('소문자로 바꾸고 공백과 -를 지운다', () => {
    expect(normalizeQuery(' 제목 2 ')).toBe('제목2');
    expect(normalizeQuery('Heading-2')).toBe('heading2');
  });
});

describe('filterCommands', () => {
  it('빈 질의면 최근 사용 명령을 먼저, 나머지는 레지스트리 순서로 보인다', () => {
    expect(ids(filterCommands(list, '', ['insert-table', 'code']))).toEqual([
      'insert-table',
      'code',
      'heading-2',
      'heading-3',
      'bullet-list',
      'ordered-list',
      'task-list',
      'code-block',
    ]);
  });

  it('공백을 빼고 제목을 비교한다(/제목2 → 제목 2)', () => {
    expect(ids(filterCommands(list, '제목2', []))).toEqual(['heading-2']);
  });

  it('제목이 질의로 시작하는 것을 안에 담은 것보다 먼저 보인다', () => {
    expect(ids(filterCommands(list, '코드', []))).toEqual(['code-block', 'code']);
  });

  it('id로도 찾는다', () => {
    expect(ids(filterCommands(list, 'table', []))).toEqual(['insert-table']);
  });

  it('같은 점수면 최근 사용 순, 그다음 레지스트리 순이다', () => {
    expect(ids(filterCommands(list, '목록', []))).toEqual([
      'bullet-list',
      'ordered-list',
      'task-list',
    ]);
    expect(ids(filterCommands(list, '목록', ['task-list']))).toEqual([
      'task-list',
      'bullet-list',
      'ordered-list',
    ]);
  });

  it('맞는 것이 없으면 빈 배열이다', () => {
    expect(filterCommands(list, '없는명령', [])).toEqual([]);
  });
});

describe('recordRecent', () => {
  it('맨 앞에 넣고 중복을 지우며 최대 개수로 자른다', () => {
    expect(recordRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(recordRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
    expect(recordRecent([], 'a')).toEqual(['a']);
  });
});

describe('readRecent·writeRecent', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      data,
    };
  }

  it('저장한 목록을 다시 읽는다', () => {
    const storage = memoryStorage();
    writeRecent(storage, ['a', 'b']);
    expect(readRecent(storage)).toEqual(['a', 'b']);
  });

  it('값이 없거나 깨졌으면 빈 배열이다. 문자열이 아닌 항목은 버린다', () => {
    expect(readRecent(memoryStorage())).toEqual([]);
    expect(readRecent(memoryStorage({ 'cruz-lab:editor-recent': '{' }))).toEqual([]);
    expect(readRecent(memoryStorage({ 'cruz-lab:editor-recent': '["a",1,null,"b"]' }))).toEqual([
      'a',
      'b',
    ]);
  });

  it('저장소가 예외를 던져도 멈추지 않는다', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readRecent(broken)).toEqual([]);
    expect(() => writeRecent(broken, ['a'])).not.toThrow();
  });
});
