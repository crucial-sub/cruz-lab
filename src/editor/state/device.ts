// 기기 이름 (재건 3단계 D6): 초안 저장 요청의 device 값
// - localStorage 'cruz-lab:device'에 둔다. 처음에는 사용자 에이전트로 추정한다. 메뉴에서 바꾼다.
// - API 한도는 60자다(entry-rules MAX_DEVICE_LENGTH).

import { MAX_DEVICE_LENGTH } from '@/lib/entry-rules';

export const DEVICE_STORAGE_KEY = 'cruz-lab:device';
const FALLBACK_DEVICE = 'device';

// 읽고 쓸 수 있는 저장소(localStorage와 같은 모양)
export interface NameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// 사용자 에이전트로 기기 이름을 추정한다
export function guessDeviceName(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iphone';
  if (ua.includes('ipad')) return 'ipad';
  if (ua.includes('android')) return 'android';
  if (ua.includes('macintosh') || ua.includes('mac os x')) return 'macbook';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return FALLBACK_DEVICE;
}

// 앞뒤 공백을 지우고 60자에서 자른다. 비면 'device'
export function clampDeviceName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_DEVICE_LENGTH).trim();
  return trimmed || FALLBACK_DEVICE;
}

// 저장된 이름을 읽는다. 없으면 추정해서 저장한다
export function readDeviceName(storage: NameStorage, userAgent: string): string {
  const saved = storage.getItem(DEVICE_STORAGE_KEY);
  if (saved && saved.trim()) return clampDeviceName(saved);
  const guessed = guessDeviceName(userAgent);
  storage.setItem(DEVICE_STORAGE_KEY, guessed);
  return guessed;
}

// 이름을 저장한다. 저장한 값을 돌려준다
export function writeDeviceName(storage: NameStorage, name: string): string {
  const value = clampDeviceName(name);
  storage.setItem(DEVICE_STORAGE_KEY, value);
  return value;
}
