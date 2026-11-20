// 문서 출처 처리기 테스트 (서가 1단계 T5, Plan J4·J5·J9·J11·J12)
// - 문서 출처 주소는 /d/ 아래다(사용자 결정 2026-11-17: Vercel이 라우트 없는 경로를 함수로 보내지 않는다)
// - 저장소 접근은 가짜 의존성으로 바꾼다. 처리기의 판정(입장권, 쿠키, 경로, 머리)만 본다.
import { describe, expect, it } from 'vitest';
import { handleRawRequest, primeStream, type RawDeps, type RawDocState } from '@/library/server/raw';
import {
  DOC_COOKIE_NAME,
  SHARE_COOKIE_NAME,
  createDocCookie,
  createShareCookie,
  createShareTicket,
  createTicket,
} from '@/library/ticket';

const SECRET = 'k'.repeat(48);
const NOW = Date.UTC(2026, 10, 17, 3, 0, 0);
const DOC = 'a1b2c3d4e5f6a7b8c9d0';
const OTHER = 'ffffffffffffffffffff';
const SHA = (c: string) => c.repeat(64);

const STATE: RawDocState = {
  html: {
    rev: 7,
    files: new Map([
      ['index.html', { contentType: 'text/html; charset=utf-8', bytes: 12, sha256: SHA('a') }],
      ['shots/그림 1.png', { contentType: 'image/png', bytes: 4, sha256: SHA('b') }],
      ['clip.mp4', { contentType: 'video/mp4', bytes: 100, sha256: SHA('c') }],
    ]),
  },
  md: {
    rev: 8,
    files: new Map([
      ['index.md', { contentType: 'text/markdown; charset=utf-8', bytes: 5, sha256: SHA('d') }],
      ['img/a.png', { contentType: 'image/png', bytes: 3, sha256: SHA('e') }],
    ]),
  },
};

function deps(overrides: Partial<RawDeps> = {}): RawDeps & { opened: string[] } {
  const opened: string[] = [];
  return {
    now: () => NOW,
    secret: SECRET,
    siteOrigin: 'https://www.cruzlab.dev',
    loadDoc: async (id) => (id === DOC ? STATE : null),
    openFile: async (id, rev, path) => {
      opened.push(`${id}/${rev}/${path}`);
      return new Blob([`body:${path}`]).stream();
    },
    signedReadUrl: async (id, rev, path) => `https://storage.example/${id}/${rev}/${encodeURIComponent(path)}?sig=1`,
    opened,
    ...overrides,
  };
}

const req = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  return new Request(`https://raw.cruzlab.dev${path}`, { ...init, headers });
};
const cookieFor = (id = DOC, now = NOW) => `${DOC_COOKIE_NAME}=${createDocCookie(id, now, SECRET)}`;

describe('/d/_open: 입장권 → 문서 쿠키 → 302 (J4)', () => {
  it('맞는 입장권이면 문서 경로에만 묶인 쿠키를 주고 index.html로 보낸다', async () => {
    const res = await handleRawRequest(req(`/d/_open?t=${createTicket(DOC, NOW, SECRET)}`), deps());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/d/${DOC}/index.html`);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${DOC_COOKIE_NAME}=`);
    expect(setCookie).toContain(`Path=/d/${DOC}/`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Domain');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('md만 있는 문서도 쿠키를 준다. pixel=1이면 302 대신 1px 그림 (J12)', async () => {
    const mdOnly = deps({ loadDoc: async () => ({ md: STATE.md }) });
    const res = await handleRawRequest(req(`/d/_open?t=${createTicket(DOC, NOW, SECRET)}&pixel=1`), mdOnly);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(res.headers.get('set-cookie')).toContain(`Path=/d/${DOC}/`);
  });

  it('http 요청(로컬 개발)이면 Secure를 뺀다 (http에서는 Secure 쿠키가 저장되지 않는다)', async () => {
    const res = await handleRawRequest(
      new Request(`http://raw.localhost:4321/d/_open?t=${createTicket(DOC, NOW, SECRET)}`),
      deps(),
    );
    expect(res.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('입장권 없음·만료·위조·내린 문서는 같은 404', async () => {
    const expired = createTicket(DOC, NOW - 120_000, SECRET);
    const forged = createTicket(DOC, NOW, 'x'.repeat(48));
    const gone = createTicket(OTHER, NOW, SECRET);
    const bodies = new Set<string>();
    for (const path of ['/d/_open', `/d/_open?t=${expired}`, `/d/_open?t=${forged}`, `/d/_open?t=${gone}`]) {
      const res = await handleRawRequest(req(path), deps());
      expect(res.status, path).toBe(404);
      expect(res.headers.get('set-cookie')).toBeNull();
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
  });
});

describe('/d/{문서 id}/{파일}: 문서 쿠키로 연다 (J4·J5)', () => {
  it('쿠키가 맞으면 파일을 J11 머리와 함께 준다', async () => {
    const d = deps();
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: cookieFor() }), d);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('body:index.html');
    expect(d.opened).toEqual([`${DOC}/7/index.html`]);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-length')).toBe('12');
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('etag')).toBe(`"r7-${'a'.repeat(16)}"`);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('/d/{id}/ 는 index.html, 인코딩된 한글·공백 경로를 푼다', async () => {
    const d = deps();
    expect((await handleRawRequest(req(`/d/${DOC}/`, { cookie: cookieFor() }), d)).status).toBe(200);
    const nfdPath = encodeURI('shots/그림 1.png'.normalize('NFD'));
    const res = await handleRawRequest(req(`/d/${DOC}/${nfdPath}`, { cookie: cookieFor() }), d);
    expect(res.status).toBe(200);
    expect(d.opened).toEqual([`${DOC}/7/index.html`, `${DOC}/7/shots/그림 1.png`]);
  });

  it('html에 없는 파일은 md 판에서 찾는다 (md 뷰어의 상대 이미지, J12)', async () => {
    const d = deps();
    const res = await handleRawRequest(req(`/d/${DOC}/img/a.png`, { cookie: cookieFor() }), d);
    expect(res.status).toBe(200);
    expect(d.opened).toEqual([`${DOC}/8/img/a.png`]);
  });

  it('If-None-Match가 같으면 304', async () => {
    const res = await handleRawRequest(
      req(`/d/${DOC}/index.html`, { cookie: cookieFor(), headers: { 'if-none-match': `"r7-${'a'.repeat(16)}"` } }),
      deps(),
    );
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
  });

  it('HEAD는 머리만 준다', async () => {
    const d = deps();
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { method: 'HEAD', cookie: cookieFor() }), d);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('12');
    expect(d.opened).toEqual([]);
  });

  it('영상은 저장소 서명 주소로 302 (J11)', async () => {
    const res = await handleRawRequest(req(`/d/${DOC}/clip.mp4`, { cookie: cookieFor() }), deps());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`https://storage.example/${DOC}/7/clip.mp4?sig=1`);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('쿠키 없음·만료·위조·다른 문서의 쿠키·없는 파일·나쁜 경로는 모두 같은 404', async () => {
    const bodies = new Set<string>();
    const cases: [string, string | undefined][] = [
      [`/d/${DOC}/index.html`, undefined],
      [`/d/${DOC}/index.html`, cookieFor(DOC, NOW - 13 * 3600 * 1000)],
      [`/d/${DOC}/index.html`, `${DOC_COOKIE_NAME}=${createDocCookie(DOC, NOW, 'z'.repeat(48))}`],
      [`/d/${DOC}/index.html`, cookieFor(OTHER)],
      [`/d/${DOC}/nope.png`, cookieFor()],
      [`/d/${DOC}/..%2F${OTHER}%2Findex.html`, cookieFor()],
      [`/d/${DOC}/%E0%A4%A`, cookieFor()],
      [`/d/${DOC}/.secret`, cookieFor()],
      [`/d/${OTHER}/index.html`, cookieFor(OTHER)],
      [`/${DOC}/index.html`, cookieFor()],
      ['/d', cookieFor()],
      ['/d/', cookieFor()],
      ['/_open', undefined],
      ['/', cookieFor()],
      ['/admin', cookieFor()],
      ['/robots.txt', undefined],
      ['/abc/index.html', undefined],
    ];
    for (const [path, cookie] of cases) {
      const res = await handleRawRequest(req(path, { cookie }), deps());
      expect(res.status, path).toBe(404);
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
  });

  // PR #35 리뷰(CodeRabbit 되답): 판 기록에는 있는데 버킷에 파일이 없으면, 첫 읽기 오류가 200이 아니라 J5 404가 된다
  it('버킷 파일의 첫 읽기가 실패하면(primeStream이 던짐) J5 404', async () => {
    const missing = () =>
      primeStream(new ReadableStream<Uint8Array>({ pull: () => Promise.reject(new Error('No such object')) }));
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: cookieFor() }), deps({ openFile: missing }));
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Astro-Reroute')).toBe('no');
    expect(await res.text()).toContain('href="https://www.cruzlab.dev/admin/library"');
  });

  it('여러 문서 쿠키가 함께 오면 이 문서의 것을 찾는다', async () => {
    const both = `${cookieFor(OTHER)}; ${cookieFor()}`;
    expect((await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: both }), deps())).status).toBe(200);
  });

  it('GET·HEAD가 아니면 404', async () => {
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { method: 'POST', cookie: cookieFor() }), deps());
    expect(res.status).toBe(404);
  });

  it('404 화면에 "서가에서 다시 열기" 링크가 있다 (J5)', async () => {
    const res = await handleRawRequest(req('/x'), deps());
    expect(await res.text()).toContain('href="https://www.cruzlab.dev/admin/library"');
  });

  // 배포 환경의 Astro는 미들웨어가 돌려준 404를 사이트 404 화면(/404.html)으로 바꿔 그린다.
  // X-Astro-Reroute: no가 있어야 J5 화면이 그대로 나간다(2026-11-18 미리보기에서 발견).
  it('J5 404에는 Astro가 404 화면으로 바꾸지 않게 하는 표시가 있다', async () => {
    for (const path of ['/x', '/d/_open', `/d/${DOC}/index.html`]) {
      const res = await handleRawRequest(req(path), deps());
      expect(res.status).toBe(404);
      expect(res.headers.get('X-Astro-Reroute')).toBe('no');
    }
  });
});

// ---------- 공유 입장권·공유 쿠키 (서가 2단계 T8, Plan J47·J50) ----------

describe('공유 입장권·공유 쿠키 (J47)', () => {
  const SHARE = 'AbCdEfGhIjKlMnOpQrStUv_-';
  const shareTicket = (id = DOC, now = NOW) => createShareTicket(id, SHARE, now, SECRET);
  const shareCookie = (id = DOC, ttl = 600) => `${SHARE_COOKIE_NAME}=${createShareCookie(id, SHARE, NOW, SECRET, ttl)}`;
  // 공유가 살아 있고 문서가 범위 안이면 끝나는 시각을 준다. asked에 물은 것을 남긴다
  const shareDeps = (access: { expiresAtMs: number | null } | null, overrides: Partial<RawDeps> = {}) => {
    const asked: string[] = [];
    const d = deps({
      shareEnabled: true,
      checkShare: async (shareId, docId) => {
        asked.push(`${shareId}:${docId}`);
        return access;
      },
      ...overrides,
    });
    return Object.assign(d, { asked });
  };

  it('공유 입장권 → 공유 쿠키(문서 경로, 12시간과 남은 기간 중 짧은 쪽) → index.html 302', async () => {
    const d = shareDeps({ expiresAtMs: NOW + 90_000 });
    const res = await handleRawRequest(req(`/d/_open?t=${shareTicket()}`), d);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/d/${DOC}/index.html`);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SHARE_COOKIE_NAME}=`);
    expect(setCookie).toContain(`Path=/d/${DOC}/`);
    expect(setCookie).toContain('Max-Age=90');
    expect(setCookie).toContain('Secure');
    expect(setCookie).not.toContain(`${DOC_COOKIE_NAME}=`);
    expect(d.asked).toEqual([`${SHARE}:${DOC}`]);
  });

  it('끌 때까지 공유는 12시간 쿠키. pixel=1이면 1px 그림 (공유 md 화면의 그림, J48)', async () => {
    const res = await handleRawRequest(req(`/d/_open?t=${shareTicket()}&pixel=1`), shareDeps({ expiresAtMs: null }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(res.headers.get('set-cookie')).toContain(`Max-Age=${12 * 60 * 60}`);
  });

  it('끈 공유·끝난 공유·범위 밖 문서(checkShare null), 공유 스위치 꺼짐은 같은 404', async () => {
    const bodies = new Set<string>();
    const cases: [string, RawDeps][] = [
      ['꺼진 공유', shareDeps(null)],
      ['스위치 꺼짐', shareDeps({ expiresAtMs: null }, { shareEnabled: false })],
      ['1초 안에 끝남', shareDeps({ expiresAtMs: NOW + 500 })],
      ['스위치 설정 없음', deps()],
    ];
    for (const [name, d] of cases) {
      const res = await handleRawRequest(req(`/d/_open?t=${shareTicket()}`), d);
      expect(res.status, name).toBe(404);
      expect(res.headers.get('set-cookie'), name).toBeNull();
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
  });

  it('공유 쿠키가 맞고 공유가 살아 있으면 파일을 준다', async () => {
    const d = shareDeps({ expiresAtMs: null });
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: shareCookie() }), d);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('body:index.html');
    expect(d.asked).toEqual([`${SHARE}:${DOC}`]);
  });

  it('끈 뒤(checkShare null)에는 같은 공유 쿠키로도 404', async () => {
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: shareCookie() }), shareDeps(null));
    expect(res.status).toBe(404);
  });

  it('다른 문서의 공유 쿠키, 스위치 꺼짐이면 404. 공유를 묻지도 않는다', async () => {
    const other = shareDeps({ expiresAtMs: null });
    expect((await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: shareCookie(OTHER) }), other)).status).toBe(404);
    expect(other.asked).toEqual([]);
    const off = shareDeps({ expiresAtMs: null }, { shareEnabled: false });
    expect((await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: shareCookie() }), off)).status).toBe(404);
    expect(off.asked).toEqual([]);
  });

  it('공유 쿠키는 관리자 문서 쿠키 자리에서 통하지 않는다 (이름을 바꿔 보내도 404)', async () => {
    const value = createShareCookie(DOC, SHARE, NOW, SECRET, 600);
    const res = await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: `${DOC_COOKIE_NAME}=${value}` }), shareDeps({ expiresAtMs: null }));
    expect(res.status).toBe(404);
  });

  it('관리자 문서 쿠키는 공유를 묻지 않고 그대로 통한다', async () => {
    const d = shareDeps(null);
    expect((await handleRawRequest(req(`/d/${DOC}/index.html`, { cookie: cookieFor() }), d)).status).toBe(200);
    expect(d.asked).toEqual([]);
  });
});
