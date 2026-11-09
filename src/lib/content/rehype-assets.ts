// 본문 이미지의 srcset·크기 (재건 4단계 D15, 3단계 D11 9)
// - 새 자산(assets/{id}/… 주소, 자산 문서에 variants)만 다룬다. legacy 자산과 외부 이미지는 그대로 둔다.
// - 주소가 최대 변형(max)이면 srcset(w480·w960·w1600·max 중 있는 것) + sizes + width·height를 붙인다.
// - 주소가 작은 변형(w480·w960·w1600)이면 그 변형의 width·height만 붙인다. 작성자가 고른 크기를 지킨다.
// - 에디터 미리보기는 자산 맵 없이 부른다(srcset 없음, 모양은 같다).
// - rehypePublicRules(영상 판정, safeUrl) 뒤에 돈다. 영상(<video>)은 건드리지 않는다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙인다.

import type { Root } from 'hast';
import { visit } from 'unist-util-visit';
import { assetIdFromUrl } from '../asset-url.ts';

// 본문 폭(68ch, 약 720px) 기준. 768px 미만은 화면 폭이다
export const CONTENT_IMAGE_SIZES = '(min-width: 768px) 720px, 100vw';

export interface RenderAssetVariant {
  url: string;
  width: number;
  height: number;
}

// 자산 문서 중 렌더가 쓰는 부분 (entry-schema.ts AssetDoc의 variants와 같은 모양)
export interface RenderAsset {
  variants: {
    w480?: RenderAssetVariant;
    w960?: RenderAssetVariant;
    w1600?: RenderAssetVariant;
    max: RenderAssetVariant;
  } | null;
}

export interface RehypeAssetsOptions {
  // 자산 ID → 자산 문서
  assets: ReadonlyMap<string, RenderAsset>;
  // Storage 버킷 이름 (assetIdFromUrl이 우리 버킷 주소만 받는다)
  bucket: string;
}

const SMALL_VARIANT_KEYS = ['w480', 'w960', 'w1600'] as const;

// 최대 변형 주소의 srcset (같은 폭은 한 번만)
export function srcsetOf(variants: NonNullable<RenderAsset['variants']>): string {
  const seen = new Set<number>();
  const parts: string[] = [];
  for (const variant of [variants.w480, variants.w960, variants.w1600, variants.max]) {
    if (!variant || seen.has(variant.width)) continue;
    seen.add(variant.width);
    parts.push(`${variant.url} ${variant.width}w`);
  }
  return parts.join(', ');
}

export default function rehypeAssets(options: RehypeAssetsOptions) {
  const { assets, bucket } = options;
  return (tree: Root) => {
    if (assets.size === 0) return;
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'img') return;
      const src = typeof node.properties.src === 'string' ? node.properties.src : '';
      const id = src ? assetIdFromUrl(src, bucket) : null;
      const variants = id ? assets.get(id)?.variants : null;
      if (!variants) return;

      // 원시 HTML <img width>·<img height>(작성자가 정한 크기, D3)는 그대로 둔다
      const sized = node.properties.width !== undefined || node.properties.height !== undefined;

      if (src === variants.max.url) {
        node.properties = {
          ...node.properties,
          srcSet: srcsetOf(variants),
          sizes: CONTENT_IMAGE_SIZES,
        };
        if (!sized) {
          node.properties.width = variants.max.width;
          node.properties.height = variants.max.height;
        }
        return;
      }
      if (sized) return;
      for (const key of SMALL_VARIANT_KEYS) {
        const variant = variants[key];
        if (variant && variant.url === src) {
          node.properties = { ...node.properties, width: variant.width, height: variant.height };
          return;
        }
      }
    });
  };
}
