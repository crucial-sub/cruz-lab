// 관리자 앱의 API 호출 (재건 5단계 D9·D10·D11)
// - 요청 함수와 오류 형식은 에디터(state/api.ts)와 같다. 그 파일은 타입만 가져오므로 에디터 청크를 끌어오지 않는다.

import { apiRequest } from '@/editor/state/api';
import type { EntryStatus } from '@/lib/entry-schema';
import type { PublishAlerts, PublishLogItem } from '@/lib/publish-log';
import type { AdminListItem } from '@/lib/server/admin-entries';

export interface ListResponse {
  counts: Record<EntryStatus, number>;
  items: AdminListItem[];
}

export interface PublishLogPage {
  items: PublishLogItem[];
  nextBefore: string | null;
}

export const appApi = {
  listEntries: () => apiRequest<ListResponse>('GET', '/api/admin/posts'),
  createEntry: (kind: 'post' | 'note') =>
    apiRequest<{ id: string; draft: { version: number } }>('POST', '/api/admin/posts', { kind }),
  setVisibility: (id: string, visible: boolean) =>
    apiRequest<{ status: EntryStatus; changed: boolean; purge: 'ok' | 'skipped' | 'failed' }>(
      'POST',
      `/api/admin/posts/${encodeURIComponent(id)}/visibility`,
      { visible },
    ),
  deleteEntry: (id: string) =>
    apiRequest<{ deleted: true }>('DELETE', `/api/admin/posts/${encodeURIComponent(id)}`, {
      confirm: id,
    }),
  publishLog: (before: string | null) =>
    apiRequest<PublishLogPage>(
      'GET',
      `/api/admin/publish-log${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  publishAlerts: () =>
    apiRequest<{ alerts: PublishAlerts }>('GET', '/api/admin/publish-log?alerts=1'),
  retry: (id: string, target: { purge?: true; backup?: true }) =>
    apiRequest<{ purge?: string; backup?: string; logId: string | null }>(
      'POST',
      `/api/admin/posts/${encodeURIComponent(id)}/retry`,
      target,
    ),
  logout: () => apiRequest<null>('DELETE', '/api/admin/session'),
};
