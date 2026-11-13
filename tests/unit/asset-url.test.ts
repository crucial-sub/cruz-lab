// 브라우저용 자산 주소 파서 테스트 (재건 3단계 D11 9). node:crypto 없이 돈다
import { describe, expect, it } from 'vitest';
import {
  assetIdFromAssetPath,
  assetIdFromUrl,
  firebaseDownloadUrl,
  storagePathFromUrl,
} from '@/lib/asset-url';

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

// 서버가 토큰을 정해 올린 파일의 다운로드 주소 (이미지 회전·좌우반전 작업: 파일마다 메타데이터 요청 하나를 줄인다)
// - firebase-admin getDownloadURL과 같은 모양이어야 한다:
//   https://firebasestorage.googleapis.com/v0/b/{버킷}/o/{encodeURIComponent(경로)}?alt=media&token={토큰}
describe('firebaseDownloadUrl', () => {
  it('getDownloadURL과 같은 모양이다', () => {
    expect(firebaseDownloadUrl(BUCKET, 'assets/abc123/w960.webp', 'tok-1')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/cruz-lab.appspot.com/o/assets%2Fabc123%2Fw960.webp?alt=media&token=tok-1',
    );
  });

  it('만든 주소에서 경로와 자산 ID를 다시 읽는다', () => {
    const url = firebaseDownloadUrl(BUCKET, 'assets/abc123/w1600.webp', 'tok-2');
    expect(storagePathFromUrl(url, BUCKET)).toBe('assets/abc123/w1600.webp');
    expect(assetIdFromUrl(url, BUCKET)).toBe('abc123');
  });

  it('경로와 토큰의 특수 문자를 인코딩한다', () => {
    expect(firebaseDownloadUrl(BUCKET, 'a b/c&d.webp', 'x&y')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/cruz-lab.appspot.com/o/a%20b%2Fc%26d.webp?alt=media&token=x%26y',
    );
  });
});
