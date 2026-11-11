// 독자 흐름 이벤트 검사 테스트 (재건 5단계 D20, Plan 8.1 "추적 이벤트 검사(종류·크기·경로·상한)")
import { describe, expect, it } from 'vitest';
import {
  DIRECT_REF,
  MAX_BEACONS_PER_PAGE,
  MAX_EVENTS_PER_REQUEST,
  MAX_EVENTS_PER_VISIT,
  MAX_PATH_LENGTH,
  MAX_QUEUED_EVENTS,
  MAX_SEARCH_PER_REQUEST,
  MAX_TRACK_BODY_BYTES,
  OTHER_REF,
  dayRange,
  isAllowedTrackOrigin,
  isBotUserAgent,
  kstDay,
  normalizeRef,
  normalizeSearchTerm,
  normalizeTrackPath,
  parseOutboundUrl,
  parseTrackBody,
  shiftDay,
  trackStoreDecision,
} from '@/lib/tracker/events';

const VISIT = '6f1c2a9e-1111-4222-8333-944455556666';
// 요청 하나 = 한 페이지(p, i)의 이벤트들
const body = (
  events: unknown[],
  page: { p?: unknown; i?: unknown } = { p: '/' },
  visit: unknown = VISIT,
) => JSON.stringify({ v: visit, ...page, e: events });
const reasonOf = (text: string) => {
  const result = parseTrackBody(text);
  return result.ok ? 'ok' : result.reason;
};
const article = { p: '/blog/a', i: 'entryA' };

describe('parseTrackBody: 받는 것', () => {
  it('글 페이지의 view·read·out·copy는 요청의 경로·글 ID를 갖는다', () => {
    const result = parseTrackBody(
      body(
        [
          { t: 'view', s: 1, r: 'www.LinkedIn.com', n: 1 },
          { t: 'read', s: 2, d: 75 },
          { t: 'read', s: 3, d: 100 },
          { t: 'out', s: 4, u: 'https://www.github.com/x?y=1' },
          { t: 'copy', s: 5, k: 2 },
        ],
        article,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [view, read75, read100, out, copy] = result.events;
    expect(view).toMatchObject({
      type: 'view',
      seq: 1,
      path: '/blog/a',
      entryId: 'entryA',
      ref: 'linkedin.com',
      firstInVisit: true,
    });
    expect(read75).toMatchObject({ depth: 75, path: '/blog/a', entryId: 'entryA' });
    expect(read100.depth).toBe(100);
    expect(out).toMatchObject({ url: 'https://www.github.com/x?y=1', domain: 'github.com' });
    expect(copy.index).toBe(2);
  });

  it('글이 아닌 페이지: pdf·search, 404는 글 ID가 없다(앞 페이지 글 ID는 남는다)', () => {
    const about = parseTrackBody(body([{ t: 'pdf', s: 5 }], { p: '/about' }));
    expect(about.ok && about.events[0]).toMatchObject({
      type: 'pdf',
      path: '/about',
      entryId: null,
    });
    const blog = parseTrackBody(
      body([{ t: 'search', s: 7, q: '  PintOS  스레드 ', c: 0 }], { p: '/blog' }),
    );
    expect(blog.ok && blog.events[0]).toMatchObject({ term: 'pintos 스레드', count: 0 });
    const missing = parseTrackBody(
      body([{ t: '404', s: 8, r: '/blog', b: 'entryA' }], { p: '/old-post' }),
    );
    expect(missing.ok && missing.events[0]).toMatchObject({
      type: '404',
      path: '/old-post',
      entryId: null,
      ref: '/blog',
      prevEntryId: 'entryA',
    });
  });

  it('들어온 곳이 없으면 (direct)다. 글이 아닌 view의 n은 무시한다', () => {
    const result = parseTrackBody(body([{ t: 'view', s: 1, r: '', n: 1 }]));
    expect(result.ok && result.events[0]).toMatchObject({ ref: DIRECT_REF, firstInVisit: false });
  });

  it('한글 글 ID(프로젝트 글)를 받는다', () => {
    expect(
      reasonOf(body([{ t: 'view', s: 1 }], { p: '/projects/x/y', i: 'project-pintos-스레드' })),
    ).toBe('ok');
  });

  it('글이 아닌 페이지의 copy(노트 목록)는 받는다. 글 ID 없이 사이트 수로 센다', () => {
    const result = parseTrackBody(body([{ t: 'copy', s: 3, k: 1 }], { p: '/notes' }));
    expect(result.ok && result.events[0]).toMatchObject({ type: 'copy', entryId: null, index: 1 });
  });

  it('드문 실제 값은 고쳐 받는다: 이상한 hostname은 (other), 긴 경로는 자른다, //로 시작하는 경로', () => {
    const odd = parseTrackBody(body([{ t: 'view', s: 1, r: 'not a domain!' }]));
    expect(odd.ok && odd.events[0].ref).toBe(OTHER_REF);
    const long = parseTrackBody(
      body([{ t: '404', s: 1 }], { p: `/${'a'.repeat(MAX_PATH_LENGTH + 50)}` }),
    );
    expect(long.ok && long.events[0].path).toHaveLength(MAX_PATH_LENGTH);
    const doubled = parseTrackBody(body([{ t: 'view', s: 2, r: '//x' }], { p: '//x' }));
    expect(doubled.ok && doubled.events[0]).toMatchObject({ path: '//x', ref: '//x' });
  });

  it('읽지 못하는 바깥 링크는 그 이벤트만 버린다', () => {
    const result = parseTrackBody(
      body([
        { t: 'out', s: 1, u: 'javascript:alert(1)' },
        { t: 'out', s: 2, u: `https://a.example/${'x'.repeat(500)}` },
        { t: 'out', s: 3, u: 'https://github.com/a' },
      ]),
    );
    expect(result.ok && result.events.map((event) => event.domain)).toEqual(['github.com']);
  });

  it(`검색어는 요청마다 ${MAX_SEARCH_PER_REQUEST}개까지 받고 나머지는 버린다`, () => {
    const events = Array.from({ length: MAX_SEARCH_PER_REQUEST + 2 }, (_, index) => ({
      t: 'search',
      s: index + 1,
      q: `term ${index}`,
      c: 1,
    }));
    const result = parseTrackBody(body(events, { p: '/blog' }));
    expect(result.ok && result.events).toHaveLength(MAX_SEARCH_PER_REQUEST);
  });

  it('정규화하면 짧아지는 검색어는 그 이벤트만 버린다(요청은 받는다)', () => {
    const result = parseTrackBody(
      body([
        { t: 'search', s: 1, q: '😀', c: 0 },
        { t: 'search', s: 2, q: ' a ', c: 3 },
        { t: 'search', s: 3, q: 'rust', c: 3 },
      ]),
    );
    expect(result.ok && result.events.map((event) => event.term)).toEqual(['rust']);
  });
});

describe('parseTrackBody: 거부', () => {
  it('JSON이 아니거나 모양이 틀리면', () => {
    expect(reasonOf('not json')).toBe('json');
    expect(reasonOf('[]')).toBe('body');
    expect(reasonOf(body([]))).toBe('events');
    expect(reasonOf(JSON.stringify({ v: VISIT, p: '/' }))).toBe('events');
  });

  it('방문 ID 형식', () => {
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: '/' }, 'short'))).toBe('visit');
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: '/' }, 'has space in it'))).toBe('visit');
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: '/' }, 12345678))).toBe('visit');
  });

  it('크기 4 KB를 넘으면', () => {
    const padded = JSON.stringify({
      v: VISIT,
      p: '/',
      e: [{ t: 'pdf', s: 1 }],
      pad: 'x'.repeat(MAX_TRACK_BODY_BYTES),
    });
    expect(reasonOf(padded)).toBe('size');
  });

  it('이벤트 수가 한도를 넘으면', () => {
    const events = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, (_, index) => ({
      t: 'pdf',
      s: index + 1,
    }));
    expect(reasonOf(body(events))).toBe('events');
  });

  it('페이지 경로 구조·글 ID', () => {
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], {}))).toBe('path');
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: 'blog' }))).toBe('path');
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: '/a b' }))).toBe('path');
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: '/a\\b' }))).toBe('path');
    expect(reasonOf(body([{ t: 'pdf', s: 1 }], { p: '/', i: 'a/b' }))).toBe('entry');
  });

  it('view·404는 요청마다 1개, 순서는 커져야 한다(방문 수를 한 요청으로 부풀리지 못하게)', () => {
    const views = Array.from({ length: 3 }, (_, index) => ({ t: 'view', s: index + 1, n: 1 }));
    expect(reasonOf(body(views, article))).toBe('views');
    expect(
      reasonOf(
        body([
          { t: 'view', s: 1 },
          { t: '404', s: 2 },
        ]),
      ),
    ).toBe('views');
    expect(
      reasonOf(
        body([
          { t: 'pdf', s: 2 },
          { t: 'pdf', s: 2 },
        ]),
      ),
    ).toBe('order');
    expect(
      reasonOf(
        body([
          { t: 'pdf', s: 3 },
          { t: 'pdf', s: 2 },
        ]),
      ),
    ).toBe('order');
  });

  it('종류·순서(방문당 상한)', () => {
    expect(reasonOf(body([{ t: 'click', s: 1 }]))).toBe('event:0:type');
    expect(reasonOf(body([{ t: 'pdf', s: 0 }]))).toBe('event:0:seq');
    expect(reasonOf(body([{ t: 'pdf', s: MAX_EVENTS_PER_VISIT + 1 }]))).toBe('event:0:seq');
    expect(reasonOf(body([{ t: 'pdf', s: 1.5 }]))).toBe('event:0:seq');
    // 세 번째 이벤트가 틀려도 요청 전체를 받지 않는다
    expect(
      reasonOf(
        body([
          { t: 'pdf', s: 1 },
          { t: 'pdf', s: 2, x: 1 },
          { t: 'nope', s: 3 },
        ]),
      ),
    ).toBe('event:2:type');
  });

  it('read는 글 페이지여야 한다. 앞 페이지 글 ID 형식', () => {
    expect(reasonOf(body([{ t: 'read', s: 1, d: 75 }]))).toBe('event:0:entry');
    expect(reasonOf(body([{ t: 'view', s: 2, b: '../x' }]))).toBe('event:0:prev');
  });

  it('read 깊이, copy 순서, out 주소 형식, search 글자·수, 들어온 곳 형식', () => {
    expect(reasonOf(body([{ t: 'read', s: 1, d: 50 }], article))).toBe('event:0:depth');
    expect(reasonOf(body([{ t: 'copy', s: 1, k: -1 }], article))).toBe('event:0:index');
    expect(reasonOf(body([{ t: 'out', s: 1 }]))).toBe('event:0:url');
    expect(reasonOf(body([{ t: 'search', s: 1, q: 42, c: 1 }]))).toBe('event:0:term');
    expect(reasonOf(body([{ t: 'search', s: 1, q: 'ab', c: -1 }]))).toBe('event:0:count');
    expect(reasonOf(body([{ t: 'view', s: 1, r: 42 }]))).toBe('event:0:ref');
  });
});

describe('정규화 도우미', () => {
  it('경로', () => {
    expect(normalizeTrackPath('/')).toBe('/');
    expect(normalizeTrackPath('/blog/%ED%95%9C')).toBe('/blog/%ED%95%9C');
    expect(normalizeTrackPath('//x')).toBe('//x');
    expect(normalizeTrackPath(`/${'a'.repeat(MAX_PATH_LENGTH + 10)}`)).toHaveLength(
      MAX_PATH_LENGTH,
    );
    expect(normalizeTrackPath('/a\\b')).toBeNull();
    expect(normalizeTrackPath('/a\u0000b')).toBeNull();
    expect(normalizeTrackPath('/a\nb')).toBeNull();
    expect(normalizeTrackPath('/a b')).toBeNull();
    expect(normalizeTrackPath(42)).toBeNull();
  });

  it('들어온 곳: 도메인은 www를 떼고 소문자, 경로는 그대로', () => {
    expect(normalizeRef('WWW.Google.COM')).toBe('google.com');
    expect(normalizeRef('localhost')).toBe('localhost');
    expect(normalizeRef('com.google.android.gm')).toBe('com.google.android.gm');
    expect(normalizeRef('/blog/a')).toBe('/blog/a');
    expect(normalizeRef(undefined)).toBe(DIRECT_REF);
    // 드문 실제 hostname: 밑줄, 끝의 점, IPv6
    expect(normalizeRef('My_Host.example.com')).toBe('my_host.example.com');
    expect(normalizeRef('example.com.')).toBe('example.com');
    expect(normalizeRef('[::1]')).toBe('[::1]');
    // 읽지 못하면 (other), 글자가 아니면 null(구조 오류)
    expect(normalizeRef('-bad.com')).toBe(OTHER_REF);
    expect(normalizeRef('/a b')).toBe(OTHER_REF);
    expect(normalizeRef(42)).toBeNull();
  });

  it('검색어: NFC·소문자·공백 묶기·50자, 짧으면 null, 예약 모양은 null', () => {
    // 풀어 쓴 자모(NFD) '각가'는 NFC 두 글자가 된다
    expect(normalizeSearchTerm('각가')).toBe('각가');
    expect(normalizeSearchTerm('  Rust   언어 ')).toBe('rust 언어');
    expect(normalizeSearchTerm('x'.repeat(80))).toHaveLength(50);
    expect(normalizeSearchTerm(' a ')).toBeNull();
    expect(normalizeSearchTerm('😀')).toBeNull();
    expect(normalizeSearchTerm('__name__')).toBeNull();
  });

  it('바깥 링크', () => {
    expect(parseOutboundUrl('http://Example.com/a')).toEqual({
      url: 'http://Example.com/a',
      domain: 'example.com',
    });
    expect(parseOutboundUrl('mailto:a@b.c')).toBeNull();
    expect(parseOutboundUrl('/relative')).toBeNull();
  });
});

describe('로봇·출처·저장 판단', () => {
  it('로봇 User-Agent를 거른다. 앱 안 브라우저는 사람이다', () => {
    expect(
      isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    ).toBe(true);
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0',
      ),
    ).toBe(true);
    expect(isBotUserAgent('facebookexternalhit/1.1')).toBe(true);
    expect(isBotUserAgent('curl/8.4.0')).toBe(true);
    expect(isBotUserAgent('node')).toBe(true);
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(isBotUserAgent(safari)).toBe(false);
    expect(isBotUserAgent(`${safari} KAKAOTALK 10.4.0`)).toBe(false);
    expect(isBotUserAgent(`${safari} DaumApps/8.0`)).toBe(false);
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      ),
    ).toBe(false);
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)',
      ),
    ).toBe(true);
    expect(isBotUserAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true);
  });

  it('Origin: 없으면 통과, 다른 사이트면 거부', () => {
    expect(isAllowedTrackOrigin(null, 'https://www.cruzlab.dev/api/track')).toBe(true);
    expect(
      isAllowedTrackOrigin('https://www.cruzlab.dev', 'https://www.cruzlab.dev/api/track'),
    ).toBe(true);
    expect(isAllowedTrackOrigin('https://evil.example', 'https://www.cruzlab.dev/api/track')).toBe(
      false,
    );
    expect(isAllowedTrackOrigin('null', 'https://www.cruzlab.dev/api/track')).toBe(false);
  });

  it('운영 호스트만 저장한다. 시험 표지는 localhost에서만 저장한다', () => {
    const prod = { hostHeader: 'www.cruzlab.dev', urlHost: 'www.cruzlab.dev' };
    expect(trackStoreDecision({ ...prod, visit: VISIT })).toBe('store');
    expect(trackStoreDecision({ ...prod, visit: 'stage5-test-abc' })).toBe('skip');
    expect(
      trackStoreDecision({ hostHeader: 'localhost:4337', urlHost: 'localhost', visit: VISIT }),
    ).toBe('skip');
    expect(
      trackStoreDecision({
        hostHeader: 'localhost:4337',
        urlHost: 'localhost',
        visit: 'stage5-test-abc',
      }),
    ).toBe('test');
    expect(
      trackStoreDecision({
        hostHeader: 'cruz-lab-git-rebuild.vercel.app',
        urlHost: 'cruz-lab-git-rebuild.vercel.app',
        visit: VISIT,
      }),
    ).toBe('skip');
    // X-Forwarded-Host로 주소만 운영처럼 보여도 Host 헤더가 다르면 저장하지 않는다
    expect(
      trackStoreDecision({
        hostHeader: 'cruz-lab-git-rebuild.vercel.app',
        urlHost: 'www.cruzlab.dev',
        visit: VISIT,
      }),
    ).toBe('skip');
    // 대소문자·포트는 무시한다. cruzlab.dev(www 없음)는 운영 주소가 아니다(www로 넘어간다)
    expect(
      trackStoreDecision({
        hostHeader: 'WWW.CRUZLAB.DEV:443',
        urlHost: 'www.cruzlab.dev',
        visit: VISIT,
      }),
    ).toBe('store');
    expect(
      trackStoreDecision({ hostHeader: 'cruzlab.dev', urlHost: 'cruzlab.dev', visit: VISIT }),
    ).toBe('skip');
    // 시험 표지: localhost·127.0.0.1만. 미리보기 주소, 주소만 localhost인 요청은 저장하지 않는다
    expect(
      trackStoreDecision({
        hostHeader: '127.0.0.1:4398',
        urlHost: '127.0.0.1',
        visit: 'stage5-test-a',
      }),
    ).toBe('test');
    expect(
      trackStoreDecision({
        hostHeader: 'cruz-lab-git-rebuild.vercel.app',
        urlHost: 'cruz-lab-git-rebuild.vercel.app',
        visit: 'stage5-test-a',
      }),
    ).toBe('skip');
    expect(
      trackStoreDecision({
        hostHeader: 'cruz-lab-git-rebuild.vercel.app',
        urlHost: 'localhost',
        visit: 'stage5-test-a',
      }),
    ).toBe('skip');
  });

  it('브라우저 한도: 페이지당 보내기 2번(D20), 모으는 이벤트 수는 4 KB 안을 보장한다', () => {
    expect(MAX_BEACONS_PER_PAGE).toBe(2);
    // 경로 1,024 + 글 ID(한글 128자 = 384바이트) + 이벤트마다 바깥 링크 주소 200글자와 필드 글자
    const worst = JSON.stringify({
      v: VISIT,
      p: `/${'a'.repeat(MAX_PATH_LENGTH - 1)}`,
      i: '가'.repeat(128),
      e: Array.from({ length: MAX_QUEUED_EVENTS }, (_, index) => ({
        t: 'out',
        s: 190 + index,
        u: `https://${'x'.repeat(192)}`,
      })),
    });
    expect(new TextEncoder().encode(worst).length).toBeLessThanOrEqual(MAX_TRACK_BODY_BYTES);
  });
});

describe('서울 날짜', () => {
  it('UTC 15시가 서울 날짜의 경계다', () => {
    expect(kstDay(Date.parse('2026-11-10T14:59:59Z'))).toBe('2026-11-10');
    expect(kstDay(Date.parse('2026-11-10T15:00:00Z'))).toBe('2026-11-11');
  });

  it('날짜 옮기기와 범위(오래된 날부터, 달·해 경계)', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayRange('2026-11-02', 3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dayRange('2026-11-11', 90)).toHaveLength(90);
  });
});
