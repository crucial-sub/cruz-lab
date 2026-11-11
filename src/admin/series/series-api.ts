// 연재·프로젝트 화면과 에디터 메타 패널의 API 호출 (재건 5단계 D2)
// - 요청 함수는 에디터의 apiRequest를 쓴다(state/api.ts는 타입만 가져오므로 에디터 청크를 끌어오지 않는다).

import { apiRequest } from '@/editor/state/api';
import type { ProjectMeta } from '@/lib/entry-schema';
import type { SeriesRow, SeriesSaveResult } from '@/lib/server/admin-series';

export const seriesApi = {
  list: () => apiRequest<{ items: SeriesRow[] }>('GET', '/api/admin/series'),
  save: (key: string, body: { baseVersion: string | null; title: string; description: string; project: ProjectMeta | null }) =>
    apiRequest<SeriesSaveResult>('PUT', `/api/admin/series/${encodeURIComponent(key)}`, body),
  remove: (key: string, baseVersion: string | null) =>
    apiRequest<{ deleted: true }>('DELETE', `/api/admin/series/${encodeURIComponent(key)}`, { baseVersion }),
  createProject: (key: string, title: string) =>
    apiRequest<{ id: string; key: string }>('POST', '/api/admin/projects', { key, title }),
};
