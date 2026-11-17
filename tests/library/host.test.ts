// 문서 출처 호스트·서가 경로 판정 테스트 (서가 1단계 T3, Plan 5.1 미들웨어 분기)
import { describe, expect, it } from 'vitest';
import {
  docOriginFor,
  isDocHost,
  isLibraryEnabled,
  isLibraryPath,
  isLibraryTokenPath,
  rawOpenUrl,
  resolveLibraryRoute,
} from '@/library/host';

describe('isDocHost', () => {
  it('설정한 문서 출처 호스트와 같으면 참 (대소문자, 끝 점 무시)', () => {
    expect(isDocHost('raw.cruzlab.dev', 'raw.cruzlab.dev')).toBe(true);
    expect(isDocHost('RAW.cruzlab.dev.', 'raw.cruzlab.dev')).toBe(true);
    expect(isDocHost('raw.cruzlab.dev:443', 'raw.cruzlab.dev')).toBe(true);
  });

  it('블로그 호스트와 비슷한 이름은 거짓', () => {
    expect(isDocHost('www.cruzlab.dev', 'raw.cruzlab.dev')).toBe(false);
    expect(isDocHost('raw.cruzlab.dev.evil.com', 'raw.cruzlab.dev')).toBe(false);
    expect(isDocHost('xraw.cruzlab.dev', 'raw.cruzlab.dev')).toBe(false);
    expect(isDocHost(null, 'raw.cruzlab.dev')).toBe(false);
  });

  it('설정에 포트가 있으면 포트까지 비교한다 (로컬 개발)', () => {
    expect(isDocHost('raw.localhost:4321', 'raw.localhost:4321')).toBe(true);
    expect(isDocHost('raw.localhost:4322', 'raw.localhost:4321')).toBe(false);
  });

  it('설정이 비어 있으면 늘 거짓', () => {
    expect(isDocHost('raw.cruzlab.dev', undefined)).toBe(false);
    expect(isDocHost('', '')).toBe(false);
  });
});

describe('isLibraryPath', () => {
  it('서가 화면과 서가 API', () => {
    for (const p of [
      '/admin/library',
      '/admin/library/',
      '/admin/library/d/abc123',
      '/api/admin/library/uploads',
      '/api/library/token/uploads',
    ]) {
      expect(isLibraryPath(p), p).toBe(true);
    }
  });

  it('블로그 경로와 비슷한 이름은 아니다', () => {
    for (const p of ['/admin', '/admin/libraryx', '/api/admin/libraries', '/library', '/blog/library', '/api/libraryx']) {
      expect(isLibraryPath(p), p).toBe(false);
    }
  });
});

describe('isLibraryTokenPath', () => {
  it('/api/library/token/ 아래만', () => {
    expect(isLibraryTokenPath('/api/library/token/uploads')).toBe(true);
    expect(isLibraryTokenPath('/api/library/token')).toBe(true);
    expect(isLibraryTokenPath('/api/admin/library/uploads')).toBe(false);
    expect(isLibraryTokenPath('/api/library/tokenx')).toBe(false);
  });
});

describe('isLibraryEnabled', () => {
  it('true 또는 1일 때만 켠다', () => {
    expect(isLibraryEnabled('true')).toBe(true);
    expect(isLibraryEnabled('1')).toBe(true);
    expect(isLibraryEnabled(true)).toBe(true);
    for (const v of ['false', '0', '', 'yes', undefined, false]) {
      expect(isLibraryEnabled(v)).toBe(false);
    }
  });
});

describe('resolveLibraryRoute: 미들웨어 분기 셋 (Plan 5.1)', () => {
  const base = { docHost: 'raw.cruzlab.dev', enabled: true, routePattern: undefined as string | undefined };

  it('문서 출처 호스트면 경로와 상관없이 raw (꺼져 있으면 404)', () => {
    expect(resolveLibraryRoute({ ...base, host: 'raw.cruzlab.dev', pathname: '/' })).toBe('raw');
    expect(resolveLibraryRoute({ ...base, host: 'raw.cruzlab.dev', pathname: '/admin' })).toBe('raw');
    expect(resolveLibraryRoute({ ...base, host: 'raw.cruzlab.dev', pathname: '/abc123/index.html' })).toBe('raw');
    expect(resolveLibraryRoute({ ...base, enabled: false, host: 'raw.cruzlab.dev', pathname: '/x' })).toBe('not-found');
  });

  it('서가 경로는 꺼져 있으면 404', () => {
    const off = { ...base, enabled: false, host: 'www.cruzlab.dev' };
    expect(resolveLibraryRoute({ ...off, pathname: '/admin/library' })).toBe('not-found');
    expect(resolveLibraryRoute({ ...off, pathname: '/api/admin/library/uploads' })).toBe('not-found');
    expect(resolveLibraryRoute({ ...off, pathname: '/api/library/token/docs' })).toBe('not-found');
    expect(resolveLibraryRoute({ ...off, pathname: '/blog' })).toBe('pass');
  });

  it('서가 토큰 경로는 token, 그 밖의 서가 경로는 기존 관리자 검사로 넘긴다', () => {
    const on = { ...base, host: 'www.cruzlab.dev' };
    expect(resolveLibraryRoute({ ...on, pathname: '/api/library/token/uploads' })).toBe('token');
    expect(resolveLibraryRoute({ ...on, pathname: '/api/library/other' })).toBe('not-found');
    expect(resolveLibraryRoute({ ...on, pathname: '/admin/library' })).toBe('pass');
    expect(resolveLibraryRoute({ ...on, pathname: '/api/admin/library/uploads' })).toBe('pass');
  });

  it('인코딩 우회: 실행할 라우트와 디코딩한 경로를 함께 본다', () => {
    const on = { ...base, host: 'www.cruzlab.dev' };
    expect(resolveLibraryRoute({ ...on, pathname: '/api/%6cibrary/token/docs' })).toBe('token');
    expect(
      resolveLibraryRoute({ ...on, pathname: '/x', routePattern: '/api/library/token/docs' }),
    ).toBe('token');
    expect(resolveLibraryRoute({ ...on, enabled: false, pathname: '/admin/%6Cibrary' })).toBe('not-found');
    // 디코딩할 수 없는 경로는 기존 미들웨어가 400으로 거부한다
    expect(resolveLibraryRoute({ ...on, pathname: '/api/%E0%A4%A' })).toBe('pass');
  });
});

describe('docOriginFor: 서가 문서 주소가 보낼 문서 출처 (J7)', () => {
  it('운영은 요청 프로토콜과 상관없이 https다', () => {
    expect(docOriginFor('raw.cruzlab.dev', 'http:', false)).toBe('https://raw.cruzlab.dev');
    expect(docOriginFor('raw.cruzlab.dev', 'https:', false)).toBe('https://raw.cruzlab.dev');
  });

  it('개발은 요청과 같은 프로토콜이고 포트를 지킨다', () => {
    expect(docOriginFor('raw.localhost:4341', 'http:', true)).toBe('http://raw.localhost:4341');
  });

  it('대문자·앞뒤 빈칸을 맞춘다', () => {
    expect(docOriginFor('  Raw.CruzLab.dev ', 'https:', false)).toBe('https://raw.cruzlab.dev');
  });

  it('설정이 없거나 호스트 꼴이 아니면 null', () => {
    expect(docOriginFor(undefined, 'https:', false)).toBeNull();
    expect(docOriginFor('', 'https:', false)).toBeNull();
    expect(docOriginFor('raw.cruzlab.dev/evil', 'https:', false)).toBeNull();
    expect(docOriginFor('https://raw.cruzlab.dev', 'https:', false)).toBeNull();
    expect(docOriginFor('evil.com@raw.cruzlab.dev', 'https:', false)).toBeNull();
  });
});

describe('rawOpenUrl: 입장권 주소 (J4)', () => {
  it('문서 출처의 /d/_open?t= 로 간다', () => {
    expect(rawOpenUrl('https://raw.cruzlab.dev', 'abc.123.sig_-')).toBe('https://raw.cruzlab.dev/d/_open?t=abc.123.sig_-');
  });

  it('입장권 값을 주소에 맞게 바꾼다', () => {
    expect(rawOpenUrl('https://raw.cruzlab.dev', 'a b&c')).toBe('https://raw.cruzlab.dev/d/_open?t=a%20b%26c');
  });
});
