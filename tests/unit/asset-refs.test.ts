// 본문·표지의 Storage 주소 추출 테스트
import { describe, expect, it } from 'vitest';
import {
  assetIdFromStoragePath,
  collectContentStoragePaths,
  extractStoragePaths,
  legacyAssetId,
  storagePathFromUrl,
} from '@/lib/asset-refs';

const BUCKET = 'cruz-lab.firebasestorage.app';
const heroUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/images%2Fheroes%2Fhero-1764848437197.webp?alt=media&token=abc`;
const koreanPath = 'series-covers/1766489016856-정글 로비.webp'.normalize('NFD');
const koreanUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(koreanPath)}?alt=media&token=t`;

describe('storagePathFromUrl', () => {
  it('Firebase 다운로드 URL에서 경로를 꺼낸다', () => {
    expect(storagePathFromUrl(heroUrl, BUCKET)).toBe('images/heroes/hero-1764848437197.webp');
  });

  it('한글 경로는 바이트를 그대로 지킨다(NFD 유지)', () => {
    expect(storagePathFromUrl(koreanUrl, BUCKET)).toBe(koreanPath);
  });

  it('storage.googleapis.com 주소도 읽는다', () => {
    expect(storagePathFromUrl(`https://storage.googleapis.com/${BUCKET}/assets/abc/w960.webp`, BUCKET)).toBe(
      'assets/abc/w960.webp',
    );
  });

  it('다른 버킷이나 외부 주소는 null', () => {
    expect(storagePathFromUrl(heroUrl.replace(BUCKET, 'other-bucket'), BUCKET)).toBeNull();
    expect(storagePathFromUrl('https://user-images.githubusercontent.com/1/a.png', BUCKET)).toBeNull();
    expect(storagePathFromUrl('not a url', BUCKET)).toBeNull();
  });
});

describe('extractStoragePaths', () => {
  it('마크다운 이미지, 원시 HTML, 영상 주소를 모두 찾고 중복을 뺀다', () => {
    const markdown = [
      `![그림](${heroUrl})`,
      `<img src="${koreanUrl}" width="300" />`,
      `<video src='${heroUrl}'></video>`,
      '![외부](https://velog.velcdn.com/images/a.png)',
    ].join('\n');
    expect(extractStoragePaths(markdown, BUCKET)).toEqual([
      'images/heroes/hero-1764848437197.webp',
      koreanPath,
    ]);
  });

  it('표지 주소까지 합친다', () => {
    const paths = collectContentStoragePaths(
      { markdown: `![a](${koreanUrl})`, cover: { kind: 'image', url: heroUrl, assetId: null } },
      BUCKET,
    );
    expect(paths).toEqual([koreanPath, 'images/heroes/hero-1764848437197.webp']);
    expect(
      collectContentStoragePaths({ markdown: '', cover: { kind: 'generated' } }, BUCKET),
    ).toEqual([]);
  });
});

describe('자산 ID', () => {
  it('legacy ID는 경로 SHA-1 앞 20자로 항상 같다', () => {
    const id = legacyAssetId('images/heroes/hero-1764848437197.webp');
    expect(id).toMatch(/^legacy-[0-9a-f]{20}$/);
    expect(legacyAssetId('images/heroes/hero-1764848437197.webp')).toBe(id);
  });

  it('새 자산 경로는 assets/{id}/에서 ID를 꺼낸다', () => {
    expect(assetIdFromStoragePath('assets/AbC123/w960.webp')).toBe('AbC123');
    expect(assetIdFromStoragePath('images/blog/a.png')).toBe(legacyAssetId('images/blog/a.png'));
  });
});
