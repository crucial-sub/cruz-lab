// 본문·표지에서 Firebase Storage 주소를 찾아 자산과 잇는다 (재건 2단계 Plan D6)
// - 글을 저장·발행할 때 assets.usedBy를 계산한다.
// - 마이그레이션이 legacy 자산의 usedBy와 표지 assetId를 계산한다.
// - 서버와 Node 스크립트에서만 쓴다(node:crypto).

import { createHash } from 'node:crypto';
import {
  ASSET_PATH_PREFIX,
  assetIdFromAssetPath,
  extractStoragePaths,
  storagePathFromUrl,
} from './asset-url.ts';

// 브라우저도 쓰는 주소 파서는 asset-url.ts에 있다. 서버·스크립트는 여기서 그대로 가져다 쓴다
export { ASSET_PATH_PREFIX, extractStoragePaths, storagePathFromUrl };

// 표지 값 중 이 파일이 읽는 부분
type CoverLike = { kind: 'generated' } | { kind: 'image'; url: string; assetId?: string | null };

// 글 내용(본문 + 표지)이 쓰는 객체 경로를 모은다
export function collectContentStoragePaths(
  content: { markdown: string; cover: CoverLike },
  bucket: string,
): string[] {
  const paths = extractStoragePaths(content.markdown, bucket);
  if (content.cover.kind === 'image') {
    const coverPath = storagePathFromUrl(content.cover.url, bucket);
    if (coverPath && !paths.includes(coverPath)) paths.push(coverPath);
  }
  return paths;
}

// legacy 자산 ID: 'legacy-' + 경로 SHA-1 앞 20자 (재실행해도 같은 ID)
export function legacyAssetId(storagePath: string): string {
  return `legacy-${createHash('sha1').update(storagePath).digest('hex').slice(0, 20)}`;
}

// 객체 경로로 자산 ID를 정한다
// - assets/{id}/… → id
// - 그 밖(images/…, series-covers/…) → legacy ID
export function assetIdFromStoragePath(storagePath: string): string {
  return assetIdFromAssetPath(storagePath) ?? legacyAssetId(storagePath);
}
