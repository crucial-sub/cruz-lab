// 브라우저용 자산 주소 파서 테스트 (재건 3단계 D11 9). node:crypto 없이 돈다
import { describe, expect, it } from 'vitest';
import { assetIdFromAssetPath, assetIdFromUrl, storagePathFromUrl } from '@/lib/asset-url';

const BUCKET = 'cruz-lab.appspot.com';
const encoded = (path: string) => encodeURIComponent(path);

describe('assetIdFromAssetPath', () => {
  it('assets/{id}/… 경로에서 ID를 꺼낸다', () => {
    expect(assetIdFromAssetPath('assets/abc123/w480.webp')).toBe('abc123');
  });

  it('legacy 경로(images/…)는 null이다', () => {
    expect(assetIdFromAssetPath('images/2024/photo.png')).toBeNull();
    expect(assetIdFromAssetPath('assets/')).toBeNull();
  });
});

describe('assetIdFromUrl', () => {
  it('새 자산의 Firebase 다운로드 주소 → ID', () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded('assets/abc123/w960.webp')}?alt=media&token=t`;
    expect(assetIdFromUrl(url, BUCKET)).toBe('abc123');
  });

  it('legacy 자산, 다른 버킷, 외부 주소는 null', () => {
    expect(
      assetIdFromUrl(
        `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded('images/a.png')}?alt=media`,
        BUCKET,
      ),
    ).toBeNull();
    expect(
      assetIdFromUrl(
        `https://firebasestorage.googleapis.com/v0/b/other/o/${encoded('assets/abc/w480.webp')}?alt=media`,
        BUCKET,
      ),
    ).toBeNull();
    expect(assetIdFromUrl('https://velog.velcdn.com/images/x.png', BUCKET)).toBeNull();
    expect(assetIdFromUrl('blob:http://localhost/123', BUCKET)).toBeNull();
  });

  it('storagePathFromUrl은 asset-refs와 같은 결과다', () => {
    expect(
      storagePathFromUrl(`https://storage.googleapis.com/${BUCKET}/assets/x/w480.webp`, BUCKET),
    ).toBe('assets/x/w480.webp');
  });
});
