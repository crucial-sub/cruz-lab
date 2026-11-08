// 이미지 크기 선택 (재건 3단계 D3 답, D11 9)
// - 서버가 만든 변형 3종(w480, w960, 최대) 중 하나의 주소를 고른다. 마크다운은 표준 이미지 문법 그대로다.
// - 원본이 작으면 작은 변형이 없다(planVariants). 그러면 null이다.

export type ImageSize = 'small' | 'medium' | 'large';

export interface AssetVariantInfo {
  url: string;
  width: number;
}

// GET /api/admin/assets/{id}·finalize 응답의 asset 중 에디터가 쓰는 부분
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

export const IMAGE_SIZE_LABELS: Record<ImageSize, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
};

// 크기 → 변형 주소. 그 변형이 없으면 null
export function variantUrlFor(asset: UploadedAsset, size: ImageSize): string | null {
  if (!asset.variants) return null;
  switch (size) {
    case 'small':
      return asset.variants.w480?.url ?? null;
    case 'medium':
      return asset.variants.w960?.url ?? null;
    case 'large':
      return asset.variants.max.url;
    default:
      return null;
  }
}

// 지금 주소가 어느 크기인지. 어느 변형도 아니면 null
export function sizeOfUrl(asset: UploadedAsset, url: string): ImageSize | null {
  for (const size of ['small', 'medium', 'large'] as const) {
    if (variantUrlFor(asset, size) === url) return size;
  }
  return null;
}
