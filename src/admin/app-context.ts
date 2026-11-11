// 관리자 앱 상태 공유 (재건 5단계 D9·D10)
// - 화면들이 함께 쓰는 값: 지금 화면, 앱 안 이동, 목록 데이터(한 번 받아 둔다), 알림, 로그아웃.
// - AdminApp이 값을 만든다. 화면은 useAdmin()으로 읽는다.

import { createContext, useContext } from 'react';
import { ApiClientError, redirectToLogin } from '@/editor/state/api';
import type { EntryKind } from '@/lib/entry-schema';
import type { AdminListItem } from '@/lib/server/admin-entries';
import type { AdminRoute } from './router';
import type { ToastState } from './ui';

export type ListLoad =
  | { phase: 'idle' | 'loading' }
  | { phase: 'ready'; items: AdminListItem[] }
  | { phase: 'error'; message: string };

export interface AdminContextValue {
  route: AdminRoute;
  navigate(path: string, options?: { replace?: boolean }): void;
  // 주소 쿼리만 바꾼다(거르기·검색). 기록을 쌓지 않는다
  replaceSearch(search: string): void;
  list: ListLoad;
  // 목록을 받는다. 이미 받았으면 그대로 쓴다(force면 다시 받는다). 실패하면 null
  loadList(force?: boolean): Promise<AdminListItem[] | null>;
  patchItem(id: string, patch: Partial<AdminListItem>): void;
  // 새로 만든 글의 빈 줄을 목록에 넣는다(다시 받지 않는다). 새 프로젝트(5단계 D2)가 연재 값을 함께 준다
  addItem(id: string, kind: EntryKind, series?: AdminListItem['series']): void;
  removeItem(id: string): void;
  showToast(tone: ToastState['tone'], message: string): void;
  logout(): Promise<void>;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('AdminApp 안에서만 쓴다');
  return value;
}

// 세션이 끝났으면(401) 로그인 화면으로 보내고 true. 화면은 알림을 띄우지 않는다
export function redirectIfUnauthorized(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 401) {
    redirectToLogin();
    return true;
  }
  return false;
}

// 오류를 사람이 읽을 문구로
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return '알 수 없는 오류가 났습니다.';
}
