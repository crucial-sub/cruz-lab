// 관리자 표시 테스트 (재건 5단계 D4)
import { describe, expect, it } from 'vitest';
import {
  ADMIN_HINT_KEY,
  ADMIN_HINT_MAX_AGE_MS,
  clearAdminHint,
  hasAdminHint,
  writeAdminHint,
} from '@/admin/admin-hint';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const NOW = Date.parse('2026-11-10T00:00:00Z');

describe('관리자 표시', () => {
  it('세션 만료 시각을 남기고, 그 전까지만 살아 있다', () => {
    const storage = memoryStorage();
    const expires = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString();
    writeAdminHint(storage, expires, NOW);
    expect(storage.values.get(ADMIN_HINT_KEY)).toBe(String(Date.parse(expires)));
    expect(hasAdminHint(storage, NOW)).toBe(true);
    expect(hasAdminHint(storage, Date.parse(expires))).toBe(false);
  });

  it('만료 시각이 없거나 틀리거나 지났으면 14일로 둔다', () => {
    for (const value of [null, 'not-a-date', new Date(NOW - 1000).toISOString()]) {
      const storage = memoryStorage();
      writeAdminHint(storage, value, NOW);
      expect(Number(storage.values.get(ADMIN_HINT_KEY))).toBe(NOW + ADMIN_HINT_MAX_AGE_MS);
    }
  });

  it('14일보다 길게 남기지 않는다', () => {
    const storage = memoryStorage();
    writeAdminHint(storage, new Date(NOW + 100 * 24 * 60 * 60 * 1000).toISOString(), NOW);
    expect(Number(storage.values.get(ADMIN_HINT_KEY))).toBe(NOW + ADMIN_HINT_MAX_AGE_MS);
  });

  it('로그아웃하면 지운다', () => {
    const storage = memoryStorage();
    writeAdminHint(storage, null, NOW);
    clearAdminHint(storage);
    expect(hasAdminHint(storage, NOW)).toBe(false);
  });

  it('값이 숫자가 아니면 표시가 없다', () => {
    const storage = memoryStorage();
    storage.setItem(ADMIN_HINT_KEY, 'yes');
    expect(hasAdminHint(storage, NOW)).toBe(false);
  });

  it('저장 공간이 막혀도 던지지 않는다', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeAdminHint(blocked, null, NOW)).not.toThrow();
    expect(() => clearAdminHint(blocked)).not.toThrow();
    expect(hasAdminHint(blocked, NOW)).toBe(false);
  });
});
