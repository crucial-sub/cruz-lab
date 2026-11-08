// 퍼지 방식 테스트 (재건 3단계 D7): 글 상세 태그는 삭제, 목록 태그는 무효화
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  invalidate: [] as unknown[],
  dangerouslyDelete: [] as unknown[],
}));

vi.mock('@vercel/functions', () => ({
  invalidateByTag: vi.fn(async (tag: unknown) => void calls.invalidate.push(tag)),
  dangerouslyDeleteByTag: vi.fn(async (tag: unknown) => void calls.dangerouslyDelete.push(tag)),
}));

vi.mock('@/lib/server/entries', () => ({ invalidateEntriesCache: vi.fn() }));

import { purgePublicCache } from '@/lib/server/cdn-purge';

describe('purgePublicCache', () => {
  const originalVercel = process.env.VERCEL;

  beforeEach(() => {
    calls.invalidate.length = 0;
    calls.dangerouslyDelete.length = 0;
  });

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it('Vercel 밖에서는 skipped이고 아무것도 부르지 않는다', async () => {
    delete process.env.VERCEL;
    expect(await purgePublicCache('id1')).toBe('skipped');
    expect(calls.invalidate).toEqual([]);
    expect(calls.dangerouslyDelete).toEqual([]);
  });

  it('Vercel에서는 post-<id>를 지우고 posts는 무효화한다', async () => {
    process.env.VERCEL = '1';
    expect(await purgePublicCache('id1')).toBe('ok');
    expect(calls.dangerouslyDelete).toEqual(['post-id1']);
    expect(calls.invalidate).toEqual(['posts']);
  });
});
