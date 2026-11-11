// 독자 흐름 날짜 요약 테스트 (재건 5단계 D20, Plan 8.1 "날짜 요약 계산(방문·이동·들어온 곳)")
import { describe, expect, it } from 'vitest';
import { keepKnownEntries } from '@/lib/server/reader-store';
import {
  dailyIncrementsOf,
  entryReadersOf,
  exitsOf,
  rateOf,
  SUMMARY_KEY_LENGTH,
  siteReadersOf,
  visitsByEntryOf,
  type IncrementTree,
} from '@/lib/tracker/daily';
import { parseTrackBody, type TrackEvent } from '@/lib/tracker/events';

const VISIT = '6f1c2a9e-1111-4222-8333-944455556666';
// 시험 이벤트 → 검사를 통과한 이벤트. 요청 하나는 한 페이지라, 같은 p·i를 가진 이벤트끼리 묶어 따로 검사한다
function events(raw: Array<Record<string, unknown>>): TrackEvent[] {
  const parsed: TrackEvent[] = [];
  for (const item of raw) {
    const { p, i, ...event } = item;
    const result = parseTrackBody(JSON.stringify({ v: VISIT, p, i, e: [event] }));
    if (!result.ok) throw new Error(result.reason);
    parsed.push(...result.events);
  }
  return parsed;
}

// 더할 수 나무를 문서 값으로 더한다(Firestore increment 흉내)
function merge(target: IncrementTree, tree: IncrementTree): IncrementTree {
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'number') {
      const current = target[key];
      target[key] = (typeof current === 'number' ? current : 0) + value;
    } else {
      const current = target[key];
      target[key] = merge(typeof current === 'object' ? current : {}, value);
    }
  }
  return target;
}

describe('dailyIncrementsOf', () => {
  it('방문의 첫 페이지: 사이트 방문·조회, 들어온 곳(사이트·글), 글 조회·방문', () => {
    const tree = dailyIncrementsOf(
      events([{ t: 'view', s: 1, p: '/blog/a', i: 'A', r: 'linkedin.com', n: 1 }]),
    );
    expect(tree).toEqual({
      site: { views: 1, visits: 1 },
      refs: { 'linkedin.com': 1 },
      entries: { A: { views: 1, visits: 1, refs: { 'linkedin.com': 1 } } },
    });
  });

  it('같은 방문의 다음 페이지: 앞 글의 onward·next, 이 글의 들어온 곳은 앞 페이지 경로. 사이트 방문은 늘지 않는다', () => {
    const tree = dailyIncrementsOf(
      events([{ t: 'view', s: 3, p: '/blog/b', i: 'B', r: '/blog/a', b: 'A', n: 1 }]),
    );
    expect(tree).toEqual({
      site: { views: 1 },
      entries: {
        B: { views: 1, visits: 1, refs: { '/blog/a': 1 } },
        A: { onward: 1, next: { B: 1 } },
      },
    });
  });

  it('같은 글을 다시 열면(새로 고침) onward만 센다. next·들어온 곳·방문은 세지 않는다', () => {
    const tree = dailyIncrementsOf(
      events([{ t: 'view', s: 2, p: '/blog/a', i: 'A', r: '/blog/a', b: 'A' }]),
    );
    expect(tree).toEqual({ site: { views: 1 }, entries: { A: { views: 1, onward: 1 } } });
  });

  it('글에서 목록으로: 앞 글의 onward는 늘고 next는 없다', () => {
    const tree = dailyIncrementsOf(events([{ t: 'view', s: 2, p: '/blog', r: '/blog/a', b: 'A' }]));
    expect(tree).toEqual({ site: { views: 1 }, entries: { A: { onward: 1 } } });
  });

  it('read·out·pdf·copy·search·404', () => {
    const tree = dailyIncrementsOf(
      events([
        { t: 'read', s: 2, p: '/blog/a', i: 'A', d: 75 },
        { t: 'read', s: 3, p: '/blog/a', i: 'A', d: 100 },
        { t: 'out', s: 4, p: '/blog/a', i: 'A', u: 'https://github.com/x' },
        { t: 'pdf', s: 5, p: '/about' },
        { t: 'copy', s: 6, p: '/blog/a', i: 'A', k: 0 },
        { t: 'search', s: 7, p: '/blog', q: 'Rust', c: 0 },
        { t: 'search', s: 8, p: '/blog', q: 'rust', c: 2 },
        { t: '404', s: 9, p: '/old/x', r: '/blog/a', b: 'A' },
      ]),
    );
    expect(tree).toEqual({
      entries: { A: { read75: 1, read100: 1, out: 1, copy: 1, onward: 1 } },
      site: { out: 1, pdf: 1, copy: 1 },
      search: { rust: { n: 2, zero: 1 } },
      notFound: { '/old/x': { n: 1, refs: { '/blog/a': 1 } } },
    });
  });

  it('방문이 404로 시작하면 사이트 방문·들어온 곳을 센다(조회는 아니다)', () => {
    const tree = dailyIncrementsOf(events([{ t: '404', s: 1, p: '/x', r: 'google.com' }]));
    expect(tree).toEqual({
      site: { visits: 1 },
      refs: { 'google.com': 1 },
      notFound: { '/x': { n: 1, refs: { 'google.com': 1 } } },
    });
  });

  it('방문자가 정하는 key(404 경로·들어온 곳)는 300자로 자른다', () => {
    const long = `/${'a'.repeat(600)}`;
    const tree = dailyIncrementsOf(events([{ t: '404', s: 1, p: long, r: long }]));
    expect(Object.keys(tree.notFound as IncrementTree)[0]).toHaveLength(SUMMARY_KEY_LENGTH);
    expect(Object.keys(tree.refs as IncrementTree)[0]).toHaveLength(SUMMARY_KEY_LENGTH);
  });

  it('경로·도메인의 점과 빗금은 key 글자 그대로다', () => {
    const tree = dailyIncrementsOf(events([{ t: '404', s: 1, p: '/a.b/c', r: 'm.example.co.kr' }]));
    expect(Object.keys(tree.notFound as IncrementTree)).toEqual(['/a.b/c']);
    expect(Object.keys(tree.refs as IncrementTree)).toEqual(['m.example.co.kr']);
  });
});

describe('keepKnownEntries (발행 글 메모 목록 검사)', () => {
  it('모르는 글 ID: view·copy는 글 아닌 페이지로, read는 버림, 앞 글 ID는 지움', () => {
    const kept = keepKnownEntries(
      events([
        { t: 'view', s: 1, p: '/blog/x', i: 'X', n: 1, b: 'Y' },
        { t: 'read', s: 2, p: '/blog/x', i: 'X', d: 75 },
        { t: 'copy', s: 3, p: '/blog/x', i: 'X', k: 0 },
        { t: 'read', s: 4, p: '/blog/a', i: 'A', d: 75 },
      ]),
      new Set(['A']),
    );
    expect(kept.map((event) => event.type)).toEqual(['view', 'copy', 'read']);
    expect(kept[0]).toMatchObject({ entryId: null, prevEntryId: null, firstInVisit: false });
    expect(dailyIncrementsOf(kept)).toEqual({
      site: { views: 1, visits: 1, copy: 1 },
      refs: { '(direct)': 1 },
      entries: { A: { read75: 1 } },
    });
  });
});

describe('화면용 요약', () => {
  // 이틀 동안 방문 3개: 1) linkedin → A → B(75%) 2) (direct) → A → 떠남 3) 다음 날 google → B → 404
  const day1: IncrementTree = {};
  merge(
    day1,
    dailyIncrementsOf(events([{ t: 'view', s: 1, p: '/blog/a', i: 'A', r: 'linkedin.com', n: 1 }])),
  );
  merge(
    day1,
    dailyIncrementsOf(
      events([{ t: 'view', s: 2, p: '/blog/b', i: 'B', r: '/blog/a', b: 'A', n: 1 }]),
    ),
  );
  merge(day1, dailyIncrementsOf(events([{ t: 'read', s: 3, p: '/blog/b', i: 'B', d: 75 }])));
  merge(day1, dailyIncrementsOf(events([{ t: 'view', s: 1, p: '/blog/a', i: 'A', r: '', n: 1 }])));
  merge(day1, dailyIncrementsOf(events([{ t: 'search', s: 2, p: '/blog', q: 'zig', c: 0 }])));
  const day2: IncrementTree = {};
  merge(
    day2,
    dailyIncrementsOf(events([{ t: 'view', s: 1, p: '/blog/b', i: 'B', r: 'google.com', n: 1 }])),
  );
  merge(day2, dailyIncrementsOf(events([{ t: '404', s: 2, p: '/gone', r: '/blog/b', b: 'B' }])));
  merge(day2, dailyIncrementsOf(events([{ t: 'search', s: 3, p: '/blog', q: 'rust', c: 3 }])));
  merge(day2, dailyIncrementsOf(events([{ t: 'search', s: 4, p: '/blog', q: 'rust', c: 3 }])));
  const docs = new Map<string, unknown>([
    ['2026-11-01', day1],
    ['2026-11-02', day2],
  ]);
  const days = ['2026-10-31', '2026-11-01', '2026-11-02'];

  it('사이트: 날짜별(빈 날 0), 합계, 많이 읽힌 글, 들어온 곳, 검색어 0건 먼저, 없는 주소', () => {
    const site = siteReadersOf(docs, days);
    expect(site.daily).toEqual([
      { day: '2026-10-31', visits: 0, views: 0 },
      { day: '2026-11-01', visits: 2, views: 3 },
      { day: '2026-11-02', visits: 1, views: 1 },
    ]);
    expect(site.totals).toEqual({ visits: 3, views: 4, out: 0, pdf: 0, copy: 0 });
    expect(site.entries).toEqual([
      { id: 'A', visits: 2, views: 2 },
      { id: 'B', visits: 2, views: 2 },
    ]);
    expect(site.refs).toEqual([
      { key: '(direct)', count: 1 },
      { key: 'google.com', count: 1 },
      { key: 'linkedin.com', count: 1 },
    ]);
    expect(site.searches).toEqual([
      { term: 'zig', count: 1, zero: 1 },
      { term: 'rust', count: 2, zero: 0 },
    ]);
    expect(site.notFound).toEqual([
      { path: '/gone', count: 1, refs: [{ key: '/blog/b', count: 1 }] },
    ]);
  });

  it('글: 들어온 곳, 다음 글, 전 글, 읽음·떠남', () => {
    const a = entryReadersOf(docs, days, 'A');
    expect(a.totals).toMatchObject({ visits: 2, views: 2, onward: 1 });
    expect(a.next).toEqual([{ key: 'B', count: 1 }]);
    expect(a.prev).toEqual([]);
    expect(exitsOf(a.totals)).toBe(1);
    expect(rateOf(exitsOf(a.totals), a.totals.views)).toBe(0.5);

    const b = entryReadersOf(docs, days, 'B');
    expect(b.totals).toMatchObject({ visits: 2, views: 2, read75: 1, onward: 1 });
    expect(b.prev).toEqual([{ key: 'A', count: 1 }]);
    expect(b.refs).toEqual([
      { key: '/blog/a', count: 1 },
      { key: 'google.com', count: 1 },
    ]);
    expect(rateOf(b.totals.read75, b.totals.views)).toBe(0.5);
    expect(b.daily.map((point) => point.visits)).toEqual([0, 1, 1]);
  });

  it('30일 방문 수(목록 readers30)', () => {
    expect([...visitsByEntryOf(docs.values())]).toEqual([
      ['A', 2],
      ['B', 2],
    ]);
  });

  it('깨진 문서도 읽는다(수가 아니면 0)', () => {
    const broken = new Map<string, unknown>([
      [
        '2026-11-01',
        {
          site: { visits: 'x', views: -3 },
          entries: { A: 'bad', B: { visits: 2, next: [1] } },
          refs: null,
        },
      ],
    ]);
    const site = siteReadersOf(broken, ['2026-11-01']);
    expect(site.totals.visits).toBe(0);
    expect(site.entries).toEqual([{ id: 'B', visits: 2, views: 0 }]);
    expect(entryReadersOf(broken, ['2026-11-01'], 'B').next).toEqual([]);
  });

  it('비율: 분모 0이면 null, 1을 넘지 않는다', () => {
    expect(rateOf(1, 0)).toBeNull();
    expect(rateOf(5, 4)).toBe(1);
    expect(exitsOf({ views: 1, onward: 3 })).toBe(0);
  });
});
