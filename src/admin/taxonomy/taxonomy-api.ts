// 분류 화면·에디터의 API 호출 (재건 5단계 D1)
// - 요청 함수는 에디터의 apiRequest를 쓴다(state/api.ts는 타입만 가져오므로 에디터 청크를 끌어오지 않는다).

import { apiRequest } from '@/editor/state/api';
import type { AffectedEntry, CategoryOperation, MutationResult, readTaxonomyForAdmin } from '@/lib/server/taxonomy-store';

export type TaxonomyView = Awaited<ReturnType<typeof readTaxonomyForAdmin>>;
export type TaxonomyMutation = MutationResult;
export type { AffectedEntry };

export const taxonomyApi = {
  read: () => apiRequest<TaxonomyView>('GET', '/api/admin/taxonomy'),
  changeCategory: (operation: CategoryOperation, baseVersion: number, dryRun: boolean) =>
    apiRequest<TaxonomyMutation>('POST', '/api/admin/taxonomy/categories', { ...operation, baseVersion, dryRun }),
  renameTag: (from: string, to: string, baseVersion: number, dryRun: boolean) =>
    apiRequest<TaxonomyMutation>('POST', '/api/admin/taxonomy/tags', { from, to, baseVersion, dryRun }),
};
