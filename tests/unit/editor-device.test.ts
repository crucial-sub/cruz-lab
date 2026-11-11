// 기기 이름 추정·저장 테스트 (재건 3단계 D6)
import { describe, expect, it } from 'vitest';
import {
  clampDeviceName,
  guessDeviceName,
  readDeviceName,
  DEVICE_STORAGE_KEY,
} from '@/editor/state/device';

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};

// 테스트용 localStorage 흉내
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('guessDeviceName', () => {
  it('플랫폼별 이름', () => {
    expect(guessDeviceName(UA.mac)).toBe('macbook');
    expect(guessDeviceName(UA.iphone)).toBe('iphone');
    expect(guessDeviceName(UA.ipad)).toBe('ipad');
    expect(guessDeviceName(UA.android)).toBe('android');
    expect(guessDeviceName(UA.windows)).toBe('windows');
    expect(guessDeviceName(UA.linux)).toBe('linux');
    expect(guessDeviceName('')).toBe('device');
  });
});

describe('clampDeviceName', () => {
  it('앞뒤 공백을 지우고 60자에서 자른다. 비면 device', () => {
    expect(clampDeviceName('  내 맥북  ')).toBe('내 맥북');
    expect(clampDeviceName('a'.repeat(100))).toHaveLength(60);
    expect(clampDeviceName('   ')).toBe('device');
  });
});

describe('readDeviceName', () => {
  it('저장된 이름이 있으면 그것을 쓴다', () => {
    const storage = fakeStorage({ [DEVICE_STORAGE_KEY]: 'office-pc' });
    expect(readDeviceName(storage, UA.mac)).toBe('office-pc');
  });

  it('없으면 추정해서 저장한다', () => {
    const storage = fakeStorage();
    expect(readDeviceName(storage, UA.iphone)).toBe('iphone');
    expect(storage.getItem(DEVICE_STORAGE_KEY)).toBe('iphone');
  });
});
