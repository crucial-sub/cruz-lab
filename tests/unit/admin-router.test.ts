// 관리자 앱 라우터 테스트 (재건 5단계 D9)
import { describe, expect, it } from 'vitest';
import {
  adminPathOf,
  documentTitleOf,
  editPath,
  isSameRoute,
  parseAdminPath,
  routeForLinkClick,
  type LinkClickInput,
} from '@/admin/router';

describe('parseAdminPath', () => {
  it('첫 화면은 쿼리를 함께 가진다', () => {
    expect(parseAdminPath('/admin')).toEqual({ name: 'home', search: '' });
    expect(parseAdminPath('/admin/', '?status=draft')).toEqual({ name: 'home', search: '?status=draft' });
    expect(parseAdminPath('/admin', 'q=pintos')).toEqual({ name: 'home', search: '?q=pintos' });
    expect(parseAdminPath('/admin', '?')).toEqual({ name: 'home', search: '' });
  });

  it('에디터 주소의 글 ID를 읽는다', () => {
    expect(parseAdminPath('/admin/edit/AbC123xyz')).toEqual({ name: 'edit', id: 'AbC123xyz' });
    expect(parseAdminPath('/admin/edit/stage5-test-1/')).toEqual({ name: 'edit', id: 'stage5-test-1' });
    // 프로젝트 글 ID는 한글 slug를 가질 수 있다(project-<key>-<slug>)
    const hangul = 'project-pintos-스레드';
    expect(parseAdminPath(`/admin/edit/${encodeURIComponent(hangul)}`)).toEqual({ name: 'edit', id: hangul });
    expect(adminPathOf({ name: 'edit', id: hangul })).toBe(`/admin/edit/${encodeURIComponent(hangul)}`);
  });

  it('틀린 글 ID는 받지 않는다', () => {
    expect(parseAdminPath('/admin/edit/')).toBeNull();
    expect(parseAdminPath('/admin/edit')).toBeNull();
    expect(parseAdminPath('/admin/edit/a%2Fb')).toBeNull();
    expect(parseAdminPath('/admin/edit/..')).toBeNull();
    expect(parseAdminPath('/admin/edit/%E0%A4%A')).toBeNull();
    expect(parseAdminPath('/admin/edit/a/b')).toBeNull();
  });

  it('출간 기록 화면', () => {
    expect(parseAdminPath('/admin/log')).toEqual({ name: 'log' });
  });

  it('만들지 않은 화면과 옛 주소는 모른다(앱이 첫 화면으로 바꾼다)', () => {
    expect(parseAdminPath('/admin/posts')).toBeNull();
    expect(parseAdminPath('/admin/posts/new')).toBeNull();
    expect(parseAdminPath('/admin/readers')).toBeNull();
    expect(parseAdminPath('/admin/settings')).toBeNull();
    expect(parseAdminPath('/admin/login')).toBeNull();
    expect(parseAdminPath('/blog/abc')).toBeNull();
  });
});

describe('PR-B 화면 주소(5단계 D12·D1·D2)', () => {
  it('이미지·분류·연재 주소를 안다. 끝의 /도 받는다', () => {
    expect(parseAdminPath('/admin/assets')).toEqual({ name: 'assets' });
    expect(parseAdminPath('/admin/taxonomy/')).toEqual({ name: 'taxonomy' });
    expect(parseAdminPath('/admin/series')).toEqual({ name: 'series' });
    expect(parseAdminPath('/admin/series/abc')).toBeNull();
    expect(parseAdminPath('/admin/constructor')).toBeNull();
    expect(parseAdminPath('/admin/toString')).toBeNull();
  });
});

describe('adminPathOf', () => {
  it('화면 → 주소 → 화면이 같다', () => {
    for (const path of ['/admin', '/admin?status=hidden&q=a', '/admin/edit/abc', '/admin/log', '/admin/assets', '/admin/taxonomy', '/admin/series']) {
      const url = new URL(path, 'https://x.test');
      const route = parseAdminPath(url.pathname, url.search)!;
      expect(adminPathOf(route)).toBe(path);
    }
  });

  it('에디터 주소는 ID를 인코딩한다', () => {
    expect(editPath('abc_DEF-1')).toBe('/admin/edit/abc_DEF-1');
  });

  it('같은 화면 판정은 쿼리까지 본다', () => {
    expect(isSameRoute({ name: 'home', search: '' }, { name: 'home', search: '?' })).toBe(true);
    expect(isSameRoute({ name: 'home', search: '' }, { name: 'home', search: '?q=a' })).toBe(false);
    expect(isSameRoute({ name: 'edit', id: 'a' }, { name: 'edit', id: 'b' })).toBe(false);
  });

  it('화면마다 탭 제목이 있다', () => {
    expect(documentTitleOf({ name: 'home', search: '' })).toContain('Cruz Lab 관리');
    expect(documentTitleOf({ name: 'log' })).toContain('출간 기록');
  });
});

describe('routeForLinkClick', () => {
  const base: LinkClickInput = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: null,
    download: false,
    href: 'https://cruzlab.test/admin/edit/abc',
    currentOrigin: 'https://cruzlab.test',
  };

  it('앱 주소 왼쪽 클릭은 앱이 받는다', () => {
    expect(routeForLinkClick(base)).toEqual({ name: 'edit', id: 'abc' });
    expect(routeForLinkClick({ ...base, href: '/admin?kind=note' })).toEqual({
      name: 'home',
      search: '?kind=note',
    });
  });

  it('새 탭·수정 키·다른 단추는 브라우저에 맡긴다', () => {
    expect(routeForLinkClick({ ...base, metaKey: true })).toBeNull();
    expect(routeForLinkClick({ ...base, ctrlKey: true })).toBeNull();
    expect(routeForLinkClick({ ...base, shiftKey: true })).toBeNull();
    expect(routeForLinkClick({ ...base, button: 1 })).toBeNull();
    expect(routeForLinkClick({ ...base, target: '_blank' })).toBeNull();
    expect(routeForLinkClick({ ...base, download: true })).toBeNull();
    expect(routeForLinkClick({ ...base, defaultPrevented: true })).toBeNull();
  });

  it('공개 페이지·다른 origin·로그인 화면은 앱이 받지 않는다', () => {
    expect(routeForLinkClick({ ...base, href: '/blog/abc' })).toBeNull();
    expect(routeForLinkClick({ ...base, href: 'https://evil.test/admin' })).toBeNull();
    expect(routeForLinkClick({ ...base, href: '/admin/login' })).toBeNull();
    expect(routeForLinkClick({ ...base, target: '_self' })).toEqual({ name: 'edit', id: 'abc' });
  });

  it('같은 주소의 # 링크(제목 앵커·각주)는 브라우저에 맡긴다', () => {
    const here = { ...base, currentPath: '/admin/edit/abc' };
    expect(routeForLinkClick({ ...here, href: 'https://cruzlab.test/admin/edit/abc#intro' })).toBeNull();
    // 다른 화면으로 가는 # 링크는 앱이 받는다
    expect(routeForLinkClick({ ...here, href: 'https://cruzlab.test/admin/log#top' })).toEqual({ name: 'log' });
    // # 없는 같은 주소는 그대로(앱이 같은 화면이면 아무것도 하지 않는다)
    expect(routeForLinkClick(here)).toEqual({ name: 'edit', id: 'abc' });
  });
});
