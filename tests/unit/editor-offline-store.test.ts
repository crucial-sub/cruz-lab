// 오프라인 보관함(IndexedDB 글당 1칸) 테스트 (재건 3단계 D6)
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  deleteOfflineDraft,
  getOfflineDraft,
  putOfflineDraft,
  type OfflineDraft,
} from '@/editor/state/offline-store';

function sample(id: string, baseVersion = 1): OfflineDraft {
  return {
    id,
    baseVersion,
    savedAt: '2026-11-09T01:00:00.000Z',
    draft: {
      title: '제목',
      description: '',
      slug: '',
      category: null,
      tags: [],
      series: null,
      cover: { kind: 'generated' },
      markdown: '본문',
      editorJson: null,
    },
  };
}

describe('오프라인 보관함', () => {
  it('없는 글은 null이다', async () => {
    const db = new IDBFactory();
    expect(await getOfflineDraft('none', db)).toBeNull();
  });

  it('넣은 것을 그대로 꺼낸다', async () => {
    const db = new IDBFactory();
    await putOfflineDraft(sample('a'), db);
    expect(await getOfflineDraft('a', db)).toEqual(sample('a'));
  });

  it('같은 글은 한 칸이다. 다시 넣으면 덮는다', async () => {
    const db = new IDBFactory();
    await putOfflineDraft(sample('a', 1), db);
    await putOfflineDraft(sample('a', 2), db);
    expect((await getOfflineDraft('a', db))?.baseVersion).toBe(2);
  });

  it('지우면 null이다. 다른 글은 그대로다', async () => {
    const db = new IDBFactory();
    await putOfflineDraft(sample('a'), db);
    await putOfflineDraft(sample('b'), db);
    await deleteOfflineDraft('a', db);
    expect(await getOfflineDraft('a', db)).toBeNull();
    expect(await getOfflineDraft('b', db)).not.toBeNull();
  });
});
