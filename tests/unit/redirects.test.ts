// 공개 주소 리다이렉트 테스트 (Plan 7.4)
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
    expect(findPublicRedirect('/blog/tag/JavaScript')).toBe('/blog/tag/javascript');
  });

  it('한글 NFD 주소는 NFC로 보낸다', () => {
    const nfd = encodeURI('/blog/tag/크래프톤-정글'.normalize('NFD'));
    expect(findPublicRedirect(nfd)).toBe(enc('/blog/tag/크래프톤-정글'));
  });

  it('이미 정규화된 주소와 다른 주소는 그대로 둔다', () => {
    expect(findPublicRedirect(enc('/blog/tag/크래프톤-정글'))).toBeNull();
    expect(findPublicRedirect('/blog/tag/csapp')).toBeNull();
    expect(findPublicRedirect('/blog/tag/javascript')).toBeNull();
    expect(findPublicRedirect('/series/wesbos30')).toBeNull();
    expect(findPublicRedirect('/blog/some-post')).toBeNull();
    expect(findPublicRedirect('/blog/tag/%E0%A4%A')).toBeNull(); // 잘못된 인코딩
  });
});
