// 에디터 이미지 회전·좌우반전 (이미지 회전·좌우반전 작업, 사용자 결정 2026-11-12)
// - 단추는 이 블로그 버킷의 새 자산(assets/{id}/…)에만 켠다. 옛 CMS 이미지(images/…)와 외부 이미지는 끈다.
//   영상은 노드 뷰가 따로 끈다.
// - 서버(POST /api/admin/assets/{id}/transform)가 돌린 자산을 주면 src만 바꾼다. 폭·정렬·대체·캡션은 그대로다.
//   한 트랜잭션이라 되돌리기 한 번이면 옛 src로 돌아간다. 이미지 노드 선택은 지킨다(메뉴가 닫히지 않는다).
// - 기다리는 동안 사용자가 src를 바꿨으면(되돌리기 등) 바꾸지 않는다.

import type { Transaction } from '@tiptap/pm/state';
import { assetIdFromUrl, storagePathFromUrl } from '@/lib/asset-url';
import { setImageAttrsKeepingSelection } from './image-layout';

// 이미지 주소 → 돌릴 수 있는지
// - asset: 새 자산. 서버에 이 ID를 보낸다
// - legacy: 우리 버킷의 옛 이미지(크기별 파일 없음)
// - external: 다른 버킷이나 외부 주소
export type ImageTransformTarget =
  | { kind: 'asset'; assetId: string }
  | { kind: 'legacy' }
  | { kind: 'external' };

export function imageTransformTargetOf(src: string, bucket: string): ImageTransformTarget {
  if (!bucket) return { kind: 'external' };
  const assetId = assetIdFromUrl(src, bucket);
  if (assetId) return { kind: 'asset', assetId };
  return storagePathFromUrl(src, bucket) ? { kind: 'legacy' } : { kind: 'external' };
}

// pos의 이미지 src가 expectedSrc일 때만 nextSrc로 바꾸고 노드 선택을 둔다
// - 바꿨으면 true. 이미지가 없거나 src가 다르면 false다(트랜잭션을 건드리지 않는다).
export function replaceImageSrcKeepingSelection(
  tr: Transaction,
  pos: number,
  expectedSrc: string,
  nextSrc: string,
): boolean {
  const node = pos >= 0 && pos < tr.doc.content.size ? tr.doc.nodeAt(pos) : null;
  if (!node || node.type.name !== 'image' || node.attrs.src !== expectedSrc) return false;
  return setImageAttrsKeepingSelection(tr, pos, { src: nextSrc });
}
