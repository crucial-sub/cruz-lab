// 업로드 클라이언트 테스트 (재건 3단계 D11). 전송은 가짜다. 순서와 상태만 본다
import { describe, expect, it } from 'vitest';
import type { UploadedAsset } from '@/editor/upload/image-size';
import {
  checkUploadFile,
  sha256OfBlob,
  uploadAsset,
  type UploadTransport,
} from '@/editor/upload/upload-client';

const asset: UploadedAsset = {
  id: 'abc',
  url: 'https://x/assets/abc/w1600.webp',
  contentType: 'image/webp',
  width: 1600,
  height: 900,
  variants: {
    w480: { url: 'https://x/assets/abc/w480.webp', width: 480 },
    w960: { url: 'https://x/assets/abc/w960.webp', width: 960 },
    w1600: { url: 'https://x/assets/abc/w1600.webp', width: 1600 },
    max: { url: 'https://x/assets/abc/w1600.webp', width: 1600 },
  },
};

function fakeTransport(options: { existing?: boolean; failPut?: boolean } = {}) {
  const calls: string[] = [];
  const transport: UploadTransport = {
    async requestUploadUrl(input) {
      calls.push(`upload-url:${input.contentType}:${input.bytes}:${input.sha256.slice(0, 8)}`);
      if (options.existing) return { existing: asset };
      return {
        assetId: 'abc',
        uploadUrl: 'https://storage.example/put',
        expiresAt: '2026-11-09T02:00:00.000Z',
        requiredHeaders: { 'Content-Type': input.contentType },
      };
    },
    async put(url, _blob, headers, onProgress) {
      calls.push(`put:${url}:${headers['Content-Type']}`);
      if (options.failPut) throw new Error('CORS');
      onProgress(0.5);
      onProgress(1);
    },
    async finalize(assetId) {
      calls.push(`finalize:${assetId}`);
      return { asset };
    },
  };
  return { transport, calls };
}

describe('checkUploadFile', () => {
  it('받는 형식과 크기 안이면 ok', () => {
    expect(checkUploadFile({ type: 'image/png', size: 1000, name: 'a.png' })).toEqual({
      ok: true,
      contentType: 'image/png',
    });
    expect(checkUploadFile({ type: 'video/mp4', size: 50 * 1024 * 1024, name: 'a.mp4' }).ok).toBe(
      true,
    );
  });

  it('svg 등 받지 않는 형식은 거부한다', () => {
    const result = checkUploadFile({ type: 'image/svg+xml', size: 10, name: 'a.svg' });
    expect(result).toMatchObject({ ok: false, reason: 'unsupported-type' });
  });

  it('이미지 20 MB, 영상 100 MB를 넘으면 거부한다', () => {
    expect(
      checkUploadFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 + 1, name: 'a.jpg' }),
    ).toMatchObject({ ok: false, reason: 'too-large' });
    expect(
      checkUploadFile({ type: 'video/webm', size: 100 * 1024 * 1024 + 1, name: 'a.webm' }),
    ).toMatchObject({ ok: false, reason: 'too-large' });
  });
});

describe('sha256OfBlob', () => {
  it('내용의 SHA-256 소문자 16진수', async () => {
    expect(await sha256OfBlob(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('uploadAsset', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

  it('새 파일: upload-url → PUT(헤더는 requiredHeaders만) → finalize 순서로 올리고 진행률을 알린다', async () => {
    const { transport, calls } = fakeTransport();
    const progress: number[] = [];
    const result = await uploadAsset(file, transport, (value) => progress.push(value));
    expect(calls).toEqual([
      'upload-url:image/png:3:039058c6',
      'put:https://storage.example/put:image/png',
      'finalize:abc',
    ]);
    expect(result).toEqual({ asset, existing: false });
    expect(progress).toEqual([0.5, 1]);
  });

  it('같은 해시가 있으면 PUT·finalize 없이 바로 그 자산을 쓴다', async () => {
    const { transport, calls } = fakeTransport({ existing: true });
    const result = await uploadAsset(file, transport, () => {});
    expect(calls).toEqual(['upload-url:image/png:3:039058c6']);
    expect(result).toEqual({ asset, existing: true });
  });

  it('PUT이 실패하면 오류를 그대로 던지고 finalize를 부르지 않는다', async () => {
    const { transport, calls } = fakeTransport({ failPut: true });
    await expect(uploadAsset(file, transport, () => {})).rejects.toThrow('CORS');
    expect(calls.some((call) => call.startsWith('finalize'))).toBe(false);
  });

  it('받지 않는 파일은 서버에 묻지 않고 거부한다', async () => {
    const { transport, calls } = fakeTransport();
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });
    await expect(uploadAsset(svg, transport, () => {})).rejects.toThrow(/형식/);
    expect(calls).toEqual([]);
  });
});
