// 공개 주소 리다이렉트 테스트 (2단계 Plan 7.4, 4단계 D11 동의어 태그 → 카테고리)
import { describe, expect, it } from 'vitest';
import { findPublicRedirect } from '@/lib/redirects';

const enc = (path: string) => encodeURI(path);

describe('findPublicRedirect', () => {
  it('옛 연재 주소를 보낸다', () => {
    expect(findPublicRedirect('/series/wesbos')).toBe('/series/wesbos30');
    expect(findPublicRedirect('/series/wesbos/')).toBe('/series/wesbos30');
    expect(findPublicRedirect(enc('/series/크래프톤-정글'))).toBe(enc('/blog/tag/크래프톤-정글'));
  });

  it('정규화되지 않은 태그 주소를 정규화한 주소로 보낸다', () => {
    expect(findPublicRedirect(enc('/blog/tag/크래프톤 정글'))).toBe(enc('/blog/tag/크래프톤-정글'));
    expect(findPublicRedirect(enc('/blog/tag/크래프톤정글'))).toBe(enc('/blog/tag/크래프톤-정글'));
    expect(findPublicRedirect(enc('/blog/tag/proxy lab'))).toBe('/blog/tag/proxy-lab');
    expect(findPublicRedirect('/blog/tag/CSAPP')).toBe('/blog/tag/csapp');
  });

  it('카테고리 동의어 태그는 미들웨어가 정규화만 한다. 카테고리로는 태그 페이지가 데이터로 보낸다 (5단계 PR-B 리뷰 S2)', () => {
    expect(findPublicRedirect('/blog/tag/javascript')).toBeNull();
    expect(findPublicRedirect(enc('/blog/tag/운영체제'))).toBeNull();
    expect(findPublicRedirect('/blog/tag/JavaScript')).toBe('/blog/tag/javascript');
    expect(findPublicRedirect(enc('/blog/tag/React Native'))).toBe('/blog/tag/react-native');
    expect(findPublicRedirect('/blog/tag/javascript/')).toBeNull();
  });

  it('한글 NFD 주소는 NFC로 보낸다', () => {
    const nfd = encodeURI('/blog/tag/크래프톤-정글'.normalize('NFD'));
    expect(findPublicRedirect(nfd)).toBe(enc('/blog/tag/크래프톤-정글'));
  });

  it('이미 정규화된 주소와 다른 주소는 그대로 둔다', () => {
    expect(findPublicRedirect(enc('/blog/tag/크래프톤-정글'))).toBeNull();
    expect(findPublicRedirect('/blog/tag/csapp')).toBeNull();
    expect(findPublicRedirect('/blog/category/javascript')).toBeNull();
    expect(findPublicRedirect('/series/wesbos30')).toBeNull();
    expect(findPublicRedirect('/blog/some-post')).toBeNull();
    expect(findPublicRedirect('/blog/tag/%E0%A4%A')).toBeNull(); // 잘못된 인코딩
  });
});
