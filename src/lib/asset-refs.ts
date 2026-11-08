// 본문·표지에서 Firebase Storage 주소를 찾아 자산과 잇는다 (재건 2단계 Plan D6)
// - 글을 저장·발행할 때 assets.usedBy를 계산한다.
// - 마이그레이션이 legacy 자산의 usedBy와 표지 assetId를 계산한다.
// - 서버와 Node 스크립트에서만 쓴다(node:crypto).

import { createHash } from 'node:crypto';

// 표지 값 중 이 파일이 읽는 부분
type CoverLike = { kind: 'generated' } | { kind: 'image'; url: string; assetId?: string | null };

// Firebase 다운로드 URL: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<인코딩된 경로>?alt=media&token=…
const FIREBASE_URL_PATTERN = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/\s"'<>()]+)\/o\/([^?\s"'<>()#]+)/g;
// GCS 공개·서명 URL: https://storage.googleapis.com/<bucket>/<경로>
const GCS_URL_PATTERN = /https:\/\/storage\.googleapis\.com\/([^/\s"'<>()]+)\/([^?\s"'<>()#]+)/g;

// 경로 조각을 디코딩한다. 잘못된 인코딩이면 null
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

// GCS 주소의 경로는 '/'로 나뉜 조각마다 인코딩되어 있다
function decodeGcsPath(rawPath: string): string | null {
  const parts = rawPath.split('/').map(safeDecode);
  return parts.some((part) => part === null) ? null : parts.join('/');
}

// URL 하나에서 우리 버킷의 객체 경로를 꺼낸다. 다른 주소면 null
export function storagePathFromUrl(url: string, bucket: string): string | null {
  for (const match of url.matchAll(FIREBASE_URL_PATTERN)) {
    if (match.index !== 0) break;
    return match[1] === bucket ? safeDecode(match[2]) : null;
  }
  for (const match of url.matchAll(GCS_URL_PATTERN)) {
    if (match.index !== 0) break;
    return match[1] === bucket ? decodeGcsPath(match[2]) : null;
  }
  return null;
}

// 마크다운(원시 HTML 포함) 안의 우리 버킷 객체 경로를 나온 순서대로, 중복 없이 돌려준다
export function extractStoragePaths(markdown: string, bucket: string): string[] {
  const found: { index: number; path: string }[] = [];

  for (const match of markdown.matchAll(FIREBASE_URL_PATTERN)) {
    if (match[1] !== bucket) continue;
    const path = safeDecode(match[2]);
    if (path) found.push({ index: match.index ?? 0, path });
  }
  for (const match of markdown.matchAll(GCS_URL_PATTERN)) {
    if (match[1] !== bucket) continue;
    const path = decodeGcsPath(match[2]);
    if (path) found.push({ index: match.index ?? 0, path });
  }

  found.sort((a, b) => a.index - b.index);
  const result: string[] = [];
  for (const item of found) {
    if (!result.includes(item.path)) result.push(item.path);
  }
  return result;
}

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

// 새 자산은 assets/{id}/… 경로에 있다
export const ASSET_PATH_PREFIX = 'assets/';

// 객체 경로로 자산 ID를 정한다
// - assets/{id}/… → id
// - 그 밖(images/…, series-covers/…) → legacy ID
export function assetIdFromStoragePath(storagePath: string): string {
  if (storagePath.startsWith(ASSET_PATH_PREFIX)) {
    const id = storagePath.slice(ASSET_PATH_PREFIX.length).split('/')[0];
    if (id) return id;
  }
  return legacyAssetId(storagePath);
}
