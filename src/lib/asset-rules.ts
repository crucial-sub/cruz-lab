// 자산 업로드·변형·정리 규칙 (재건 2단계 D6, Plan 6.4)
// - 순수 함수만 둔다. Storage·Firestore를 쓰지 않는다. 단위 테스트 대상이다.

// 받는 형식. svg 등은 거부한다(스크립트를 품을 수 있다)
export const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const VIDEO_CONTENT_TYPES = ['video/webm', 'video/mp4'] as const;
export const ALLOWED_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

// 크기 한도 (D6)
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// 변형 폭과 최대 변형 폭 상한 (D6)
export const VARIANT_WIDTHS = [480, 960, 1600] as const;
export const MAX_VARIANT_WIDTH = 2400;

// 서명 URL 만료 15분 (D6)
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

// 정리 기준 (D6, Plan 6.4)
export const DEFAULT_MIN_ORPHAN_DAYS = 7;
export const PENDING_EXPIRE_MS = 24 * 60 * 60 * 1000;

// 형식별 원본 확장자
const EXTENSIONS: Record<AllowedContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

// sharp metadata().format → 형식
const SHARP_FORMATS: Record<string, AllowedContentType> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function isImageContentType(value: string): boolean {
  return (IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isVideoContentType(value: string): boolean {
  return (VIDEO_CONTENT_TYPES as readonly string[]).includes(value);
}

// 형식별 크기 한도
export function maxBytesFor(contentType: AllowedContentType): number {
  return isVideoContentType(contentType) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

// 원본 객체 경로: assets/{id}/original.<ext>
export function originalPathFor(assetId: string, contentType: AllowedContentType): string {
  return `assets/${assetId}/original.${EXTENSIONS[contentType]}`;
}

// 변형 객체 경로: assets/{id}/w<폭>.webp (폭이 이름에 있어 4단계 렌더러가 srcset을 만들 수 있다)
export function variantPathFor(assetId: string, width: number): string {
  return `assets/${assetId}/w${width}.webp`;
}

// 자산 하나의 Storage 접두사 (정리할 때 통째로 지운다)
export function assetPrefixFor(assetId: string): string {
  return `assets/${assetId}/`;
}

// sharp가 읽은 실제 형식 → 형식. 받지 않는 형식이면 null
export function contentTypeFromSharpFormat(format: string | undefined): AllowedContentType | null {
  return format ? SHARP_FORMATS[format] ?? null : null;
}

// 영상의 실제 형식을 첫 바이트로 확인한다
// - webm: EBML 머리 1A 45 DF A3
// - mp4: 4~7번째 바이트가 'ftyp'
export function detectVideoContentType(head: Uint8Array): AllowedContentType | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return 'video/webm';
  }
  if (head.length >= 8 && String.fromCharCode(head[4], head[5], head[6], head[7]) === 'ftyp') {
    return 'video/mp4';
  }
  return null;
}

// 변형 계획 (D6)
// - 최대 변형 폭은 원본 폭이다(최대 2400).
// - 480·960·1600 중 최대 폭보다 작은 것을 만든다. 같은 폭은 최대 변형 파일을 같이 쓴다.
// - 원본보다 큰 폭은 만들지 않는다.
export interface VariantPlan {
  maxWidth: number;
  widths: number[]; // 실제로 만들 파일의 폭 (작은 것부터, 마지막이 maxWidth)
  keys: { key: 'w480' | 'w960' | 'w1600'; width: number }[]; // variants 필드 → 파일 폭
}

export function planVariants(originalWidth: number): VariantPlan {
  const maxWidth = Math.max(1, Math.min(Math.round(originalWidth), MAX_VARIANT_WIDTH));
  const widths = VARIANT_WIDTHS.filter((width) => width < maxWidth) as number[];
  widths.push(maxWidth);
  const keys = VARIANT_WIDTHS.filter((width) => width <= maxWidth).map((width) => ({
    key: `w${width}` as 'w480' | 'w960' | 'w1600',
    width,
  }));
  return { maxWidth, widths, keys };
}

// 정리 후보 판정 (Plan 6.4 purge)
export interface PurgeAssetState {
  id: string;
  status: 'pending' | 'ready';
  legacy: boolean;
  usedByCount: number;
  orphanedAtMs: number | null;
  uploadedAtMs: number;
}

export type PurgeCandidateReason = 'orphaned' | 'pending-expired';

// 자산 하나가 정리 후보인지 정한다. 후보가 아니면 null
// - 고아가 된 지 minOrphanDays 지난 자산
// - pending으로 24시간 지난 자산(업로드를 끝내지 않음)
// - allowLegacy가 false면 legacy 자산은 뺀다(main 병합 전, D6)
export function purgeCandidateReason(
  asset: PurgeAssetState,
  options: { nowMs: number; minOrphanDays: number; allowLegacy: boolean },
): PurgeCandidateReason | null {
  if (asset.legacy && !options.allowLegacy) return null;
  if (asset.status === 'pending') {
    return options.nowMs - asset.uploadedAtMs >= PENDING_EXPIRE_MS ? 'pending-expired' : null;
  }
  if (asset.usedByCount > 0 || asset.orphanedAtMs === null) return null;
  const orphanAgeMs = options.nowMs - asset.orphanedAtMs;
  return orphanAgeMs >= options.minOrphanDays * 24 * 60 * 60 * 1000 ? 'orphaned' : null;
}
