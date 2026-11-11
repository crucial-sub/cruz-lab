// 업로드한 자산의 응답 모양 (재건 3단계 D11)
// - POST /api/admin/assets/{id}/finalize 응답의 asset 중 에디터가 쓰는 부분이다. 업로드 클라이언트가 쓴다.
// - 3단계의 크기 선택(작게·보통·크게 = 변형 파일 고르기)은 지웠다(main 병합 준비 작업 문서 6.6). 그 함수도 함께 지웠다.
//   이미지는 최대 변형(asset.url)으로 넣고, 공개 페이지가 srcset으로 기기에 맞는 파일을 고른다.

export interface AssetVariantInfo {
  url: string;
  width: number;
}

export interface UploadedAsset {
  id: string;
  url: string;
  contentType: string;
  width?: number;
  height?: number;
  variants: {
    w480?: AssetVariantInfo;
    w960?: AssetVariantInfo;
    w1600?: AssetVariantInfo;
    max: AssetVariantInfo;
  } | null;
}
