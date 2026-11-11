// 이미지 라이브러리의 API 호출 (재건 5단계 D12)
// - 목록: GET /api/admin/assets.
// - 지우기: 2단계 정리 API(POST /api/admin/assets/purge)를 그대로 쓴다. 먼저 시험 실행, 확인 뒤 실행.
//   minOrphanDays는 0이다. 고아가 된 날수를 기다리지 않고 고른 자산 하나만 본다.
// - 서버 파일에서는 타입만 가져온다. 브라우저 묶음에 서버 코드가 들어가지 않는다.

import { apiRequest } from '@/editor/state/api';
import type { AdminAssetItem, purgeAssets } from '@/lib/server/admin-assets';

export interface AssetListResponse {
  items: AdminAssetItem[];
}

// 정리 API의 응답 (candidates: 지울 것, kept: 글이 아직 써서 남긴 것, deleted: 실제로 지운 것)
export type PurgeResponse = Awaited<ReturnType<typeof purgeAssets>>;

export const assetsApi = {
  listAssets: () => apiRequest<AssetListResponse>('GET', '/api/admin/assets'),
  purge: (ids: string[], dryRun: boolean) =>
    apiRequest<PurgeResponse>('POST', '/api/admin/assets/purge', {
      ids,
      dryRun,
      minOrphanDays: 0,
    }),
};
