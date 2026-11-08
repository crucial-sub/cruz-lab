// 복원 대상 고르기 테스트 (scripts/migrate/stage2-restore.mjs)
import { describe, expect, it } from 'vitest';
import { selectRestoreDocs } from '../../scripts/migrate/lib/restore-plan.mjs';

describe('selectRestoreDocs', () => {
  const dumpIds = ['a', 'b', 'c'];

  it('--ids도 --all도 없으면 거부한다', () => {
    expect(() => selectRestoreDocs({ dumpIds, existingIds: [], ids: null, all: false, overwrite: false })).toThrow();
  });

  it('기본은 지금 없는 문서만 쓴다', () => {
    expect(selectRestoreDocs({ dumpIds, existingIds: ['b'], ids: null, all: true, overwrite: false })).toEqual({
      write: ['a', 'c'],
      skippedExisting: ['b'],
      notInDump: [],
    });
  });

  it('--overwrite면 있는 문서도 덮는다', () => {
    expect(selectRestoreDocs({ dumpIds, existingIds: ['b'], ids: null, all: true, overwrite: true }).write).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('--ids는 덤프에 있는 것만 고르고 없는 ID를 알린다', () => {
    expect(selectRestoreDocs({ dumpIds, existingIds: [], ids: ['c', 'z'], all: false, overwrite: false })).toEqual({
      write: ['c'],
      skippedExisting: [],
      notInDump: ['z'],
    });
  });
});
