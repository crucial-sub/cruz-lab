// 독자 화면의 API 호출과 표시 도우미 (재건 5단계 D20)
// - 요청 함수는 에디터(state/api.ts)와 같다(타입만 가져오는 파일이라 에디터 청크를 끌어오지 않는다).
// - 표시 글자(들어온 곳·비율·날짜)는 두 화면이 함께 쓴다.

import { apiRequest } from '@/editor/state/api';
import type { VisitPath } from '@/lib/server/reader-store';
import type { EntryReaders, SiteReaders } from '@/lib/tracker/daily';

export type ReaderDays = 30 | 90;

export interface SiteReadersResponse {
  days: ReaderDays;
  today: string;
  from: string;
  summary: SiteReaders;
  pruned: number | null;
}

export interface EntryReadersResponse {
  id: string;
  days: ReaderDays;
  today: string;
  from: string;
  summary: EntryReaders;
  paths: VisitPath[];
  pruned: number | null;
}

export const readersApi = {
  site: (days: ReaderDays) =>
    apiRequest<SiteReadersResponse>('GET', `/api/admin/readers?days=${days}`),
  entry: (id: string, days: ReaderDays) =>
    apiRequest<EntryReadersResponse>(
      'GET',
      `/api/admin/readers/${encodeURIComponent(id)}?days=${days}`,
    ),
};

// 들어온 곳 key → 글자. (direct)는 "직접(주소 입력·북마크·앱)", (other)는 읽지 못한 주소, 경로는 블로그 안
export function refLabel(key: string): string {
  if (key === '(direct)') return '직접(주소 입력·북마크·앱)';
  if (key === '(other)') return '기타(읽지 못한 주소)';
  if (key.startsWith('/')) return `블로그 안 ${decodePath(key)}`;
  return key;
}

// 저장된 경로(퍼센트 인코딩)를 읽을 수 있게 푼다. 풀 수 없으면 그대로
export function decodePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

// 0~1 비율 → '42%'. 없으면 '—'
export function percentText(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function countText(value: number): string {
  return value.toLocaleString('ko-KR');
}

// 'YYYY-MM-DD' → '11월 3일'
export function shortDayText(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${month}월 ${date}일`;
}
