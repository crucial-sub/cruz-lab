// Storage 주소 → 객체 경로 → 자산 ID (재건 3단계 D11 9)
// - 브라우저와 서버가 같이 쓴다. node:crypto를 쓰지 않는다(legacy ID 해시는 asset-refs.ts에 있다).
// - 에디터의 이미지 크기 메뉴가 주소에서 자산 ID를 읽어 GET /api/admin/assets/{id}를 부른다.
// - asset-refs.ts(서버·스크립트)는 이 파일의 함수를 가져다 다시 내보낸다.

// Firebase 다운로드 URL: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<인코딩된 경로>?alt=media&token=…
const FIREBASE_URL_PATTERN =
  /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/\s"'<>()]+)\/o\/([^?\s"'<>()#]+)/g;
// GCS 공개·서명 URL: https://storage.googleapis.com/<bucket>/<경로>
const GCS_URL_PATTERN = /https:\/\/storage\.googleapis\.com\/([^/\s"'<>()]+)\/([^?\s"'<>()#]+)/g;

// 새 자산은 assets/{id}/… 경로에 있다
export const ASSET_PATH_PREFIX = 'assets/';

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

// assets/{id}/… 경로의 자산 ID. legacy 경로(images/… 등)면 null
export function assetIdFromAssetPath(storagePath: string): string | null {
  if (!storagePath.startsWith(ASSET_PATH_PREFIX)) return null;
  const id = storagePath.slice(ASSET_PATH_PREFIX.length).split('/')[0];
  return id || null;
}

// 주소가 우리 버킷의 새 자산이면 자산 ID. legacy·다른 버킷·외부 주소면 null
export function assetIdFromUrl(url: string, bucket: string): string | null {
  const path = storagePathFromUrl(url, bucket);
  return path ? assetIdFromAssetPath(path) : null;
}
