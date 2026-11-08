// 자산 업로드·변형·정리 규칙 테스트 (재건 2단계 D6, Plan 6.4)
import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  contentTypeFromSharpFormat,
  detectVideoContentType,
  maxBytesFor,
  originalPathFor,
  planVariants,
  purgeCandidateReason,
  variantPathFor,
  type PurgeAssetState,
} from '@/lib/asset-rules';
import { assetIdFromStoragePath } from '@/lib/asset-refs';

describe('경로', () => {
  it('원본과 변형은 assets/{id}/ 아래에 있다', () => {
    expect(originalPathFor('abc', 'image/jpeg')).toBe('assets/abc/original.jpg');
    expect(variantPathFor('abc', 960)).toBe('assets/abc/w960.webp');
  });

  it('변형 경로로 자산 ID를 되찾는다', () => {
    expect(assetIdFromStoragePath(variantPathFor('abc', 1600))).toBe('abc');
  });
});

describe('크기 한도', () => {
  it('이미지 20 MB, 영상 100 MB', () => {
    expect(maxBytesFor('image/png')).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor('video/mp4')).toBe(MAX_VIDEO_BYTES);
  });
});

describe('실제 형식 확인', () => {
  it('sharp 형식 이름을 받는 형식으로 바꾼다', () => {
    expect(contentTypeFromSharpFormat('jpeg')).toBe('image/jpeg');
    expect(contentTypeFromSharpFormat('svg')).toBeNull();
    expect(contentTypeFromSharpFormat(undefined)).toBeNull();
  });

  it('영상은 첫 바이트로 확인한다', () => {
    expect(detectVideoContentType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe('video/webm');
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...'ftypmp42'.split('').map((c) => c.charCodeAt(0))]);
    expect(detectVideoContentType(mp4)).toBe('video/mp4');
    expect(detectVideoContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('planVariants', () => {
  it('2000px 원본: 480·960·1600과 최대 2000', () => {
    const plan = planVariants(2000);
    expect(plan.maxWidth).toBe(2000);
    expect(plan.widths).toEqual([480, 960, 1600, 2000]);
    expect(plan.keys.map((key) => key.key)).toEqual(['w480', 'w960', 'w1600']);
  });

  it('최대 변형 폭은 2400을 넘지 않는다', () => {
    expect(planVariants(5000).maxWidth).toBe(2400);
  });

  it('원본보다 큰 폭은 만들지 않는다. 같은 폭은 최대 변형을 같이 쓴다', () => {
    const plan = planVariants(960);
    expect(plan.widths).toEqual([480, 960]);
    expect(plan.keys).toEqual([
      { key: 'w480', width: 480 },
      { key: 'w960', width: 960 },
    ]);
  });

  it('작은 이미지는 최대 변형만 만든다', () => {
    const plan = planVariants(300);
    expect(plan.widths).toEqual([300]);
    expect(plan.keys).toEqual([]);
  });
});

describe('purgeCandidateReason', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 8);
  const base: PurgeAssetState = {
    id: 'a',
    status: 'ready',
    legacy: false,
    usedByCount: 0,
    orphanedAtMs: now - 8 * DAY,
    uploadedAtMs: now - 30 * DAY,
  };
  const options = { nowMs: now, minOrphanDays: 7, allowLegacy: false };

  it('고아가 된 지 7일 지났으면 후보다', () => {
    expect(purgeCandidateReason(base, options)).toBe('orphaned');
  });

  it('7일이 안 됐거나, 쓰는 글이 있거나, 고아 표시가 없으면 후보가 아니다', () => {
    expect(purgeCandidateReason({ ...base, orphanedAtMs: now - 6 * DAY }, options)).toBeNull();
    expect(purgeCandidateReason({ ...base, usedByCount: 1 }, options)).toBeNull();
    expect(purgeCandidateReason({ ...base, orphanedAtMs: null }, options)).toBeNull();
  });

  it('minOrphanDays 0이면 방금 고아가 된 자산도 후보다', () => {
    expect(purgeCandidateReason({ ...base, orphanedAtMs: now }, { ...options, minOrphanDays: 0 })).toBe('orphaned');
  });

  it('병합 전에는 legacy 자산을 뺀다', () => {
    expect(purgeCandidateReason({ ...base, legacy: true }, options)).toBeNull();
    expect(purgeCandidateReason({ ...base, legacy: true }, { ...options, allowLegacy: true })).toBe('orphaned');
  });

  it('pending으로 24시간 지난 자산은 후보다', () => {
    const pending = { ...base, status: 'pending' as const, orphanedAtMs: null };
    expect(purgeCandidateReason({ ...pending, uploadedAtMs: now - 25 * 60 * 60 * 1000 }, options)).toBe('pending-expired');
    expect(purgeCandidateReason({ ...pending, uploadedAtMs: now - 60 * 60 * 1000 }, options)).toBeNull();
  });
});
