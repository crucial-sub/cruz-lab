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

  it('카테고리와 같은 뜻의 태그 주소는 카테고리 목록으로 보낸다 (4단계 D11)', () => {
    expect(findPublicRedirect('/blog/tag/javascript')).toBe('/blog/category/javascript');
    expect(findPublicRedirect(enc('/blog/tag/운영체제'))).toBe('/blog/category/os');
    expect(findPublicRedirect('/blog/tag/reactnative')).toBe('/blog/category/react-native');
    expect(findPublicRedirect('/blog/tag/react-native')).toBe('/blog/category/react-native');
    expect(findPublicRedirect(enc('/blog/tag/에세이'))).toBe('/blog/category/retrospective');
    // 정규화가 필요한 주소도 한 번에 카테고리로 간다(태그 주소를 거치지 않는다)
    expect(findPublicRedirect('/blog/tag/JavaScript')).toBe('/blog/category/javascript');
    expect(findPublicRedirect(enc('/blog/tag/React Native'))).toBe('/blog/category/react-native');
    expect(findPublicRedirect('/blog/tag/javascript/')).toBe('/blog/category/javascript');
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
