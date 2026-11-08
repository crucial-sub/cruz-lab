// 업로드 클라이언트 (재건 3단계 D11 2·4·5·6)
// 1. 형식(png·jpeg·webp·gif·webm·mp4)과 크기(이미지 20 MB, 영상 100 MB)를 먼저 본다. 틀리면 서버에 묻지 않는다.
// 2. SHA-256(Web Crypto) → POST upload-url. 같은 해시가 있으면(existing) 그 자산을 바로 쓴다.
// 3. PUT uploadUrl(헤더는 requiredHeaders만. 버킷 CORS가 필요하다) → POST finalize → asset.
// - 전송(transport)은 주입한다. 테스트는 가짜 전송으로 순서만 확인한다. 실제 전송은 state/api.ts가 만든다.

import {
  ALLOWED_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  isVideoContentType,
  type AllowedContentType,
} from '@/lib/asset-rules';
import type { UploadedAsset } from './image-size';

export interface UploadUrlRequest {
  fileName: string;
  contentType: AllowedContentType;
  bytes: number;
  sha256: string;
}

export type UploadUrlResponse =
  | { existing: UploadedAsset }
  | {
      assetId: string;
      uploadUrl: string;
      expiresAt: string;
      requiredHeaders: Record<string, string>;
    };

// 서버·Storage와 말하는 부분. 테스트가 가짜로 바꾼다
export interface UploadTransport {
  requestUploadUrl(input: UploadUrlRequest): Promise<UploadUrlResponse>;
  put(
    url: string,
    blob: Blob,
    headers: Record<string, string>,
    onProgress: (ratio: number) => void,
  ): Promise<void>;
  finalize(assetId: string): Promise<{ asset: UploadedAsset }>;
}

export type UploadCheck =
  | { ok: true; contentType: AllowedContentType }
  | { ok: false; reason: 'unsupported-type' | 'too-large'; message: string };

// 올리기 전에 형식과 크기를 본다
export function checkUploadFile(file: { type: string; size: number; name: string }): UploadCheck {
  if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      reason: 'unsupported-type',
      message: `받지 않는 형식입니다 (${file.type || '알 수 없음'}). png·jpeg·webp·gif·webm·mp4만 올릴 수 있습니다.`,
    };
  }
  const contentType = file.type as AllowedContentType;
  const limit = isVideoContentType(contentType) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      reason: 'too-large',
      message: `파일이 너무 큽니다 (${Math.round(file.size / 1024 / 1024)} MB). 한도는 ${limit / 1024 / 1024} MB입니다.`,
    };
  }
  return { ok: true, contentType };
}

// Blob 내용의 SHA-256 소문자 16진수
export async function sha256OfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface UploadResult {
  asset: UploadedAsset;
  // 같은 해시가 이미 있어 업로드를 건너뛰었다
  existing: boolean;
}

// 파일 하나를 올린다. 실패하면 오류를 던진다(호출하는 쪽이 "다시 시도"를 보인다)
export async function uploadAsset(
  file: File,
  transport: UploadTransport,
  onProgress: (ratio: number) => void,
): Promise<UploadResult> {
  const check = checkUploadFile(file);
  if (!check.ok) throw new Error(check.message);

  const sha256 = await sha256OfBlob(file);
  const ticket = await transport.requestUploadUrl({
    fileName: file.name,
    contentType: check.contentType,
    bytes: file.size,
    sha256,
  });
  if ('existing' in ticket) {
    onProgress(1);
    return { asset: ticket.existing, existing: true };
  }

  await transport.put(ticket.uploadUrl, file, ticket.requiredHeaders, onProgress);
  const { asset } = await transport.finalize(ticket.assetId);
  return { asset, existing: false };
}
