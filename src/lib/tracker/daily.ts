// 독자 흐름 날짜 요약: 더할 수 계산과 화면용 요약 (재건 5단계 D20)
// - 순수 함수만 둔다. 서버(reader-store.ts)가 저장·읽기에, 스모크가 기대값 계산에 쓴다. 테스트는 reader-daily.test.ts.
// - readerDaily/{YYYY-MM-DD} 문서 모양(모든 잎은 수, Firestore increment로 더한다):
//   site:     { visits, views, out, pdf, copy }   방문 = 방문의 첫 이벤트(seq 1) 수, 조회 = 페이지 수
//   refs:     { [들어온 곳]: n }                  방문의 첫 페이지가 어디서 왔나(바깥 도메인·블로그 안 경로·(direct))
//   entries:  { [글 ID]: { views, visits, read75, read100, out, copy, onward, refs: { [들어온 곳]: n }, next: { [글 ID]: n } } }
//             visits = 그날 그 글을 연 방문 수(D20 "몇 명"), onward = 그 글 다음에 같은 방문에서 다른 페이지를 연 수,
//             refs = 그 글로 오기 바로 전(첫 페이지면 바깥 도메인·(direct), 그 뒤면 앞 페이지 경로), next = 그 글 다음에 연 글
//   search:   { [검색어]: { n, zero } }            zero = 결과 0건이었던 수
//   notFound: { [경로]: { n, refs: { [들어온 곳]: n } } }
// - 떠난 수 = views − onward. 앞 페이지 정보는 다음 페이지가 열릴 때 온다(그 페이지의 view 이벤트 b).
// - 같은 글을 다시 열면(새로 고침, b = i) onward는 세고 next·refs는 세지 않는다(자기 자신으로 가는 이동이 아니다).
// - 방문자가 정하는 key(들어온 곳, 404 경로)는 SUMMARY_KEY_LENGTH로 자른다. 원본 줄은 자르지 않는다.
//   Firestore 필드 경로 한도(1,500바이트) 안에 들고, 문서가 덜 커진다. 검색어는 이미 50자, 글 ID는 128자 안이다.

import type { TrackEvent } from './events';

// 요약 문서의 방문자 key 길이
export const SUMMARY_KEY_LENGTH = 300;

const keyOf = (value: string) => value.slice(0, SUMMARY_KEY_LENGTH);

// 더할 수 나무. 잎은 양의 정수다
export interface IncrementTree {
  [key: string]: number | IncrementTree;
}

function bump(tree: IncrementTree, keys: readonly string[], amount = 1): void {
  let node = tree;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (typeof next === 'object') {
      node = next;
    } else {
      const created: IncrementTree = {};
      node[key] = created;
      node = created;
    }
  }
  const leaf = keys[keys.length - 1];
  const current = node[leaf];
  node[leaf] = (typeof current === 'number' ? current : 0) + amount;
}

// 요청 하나의 이벤트(같은 날) → 그날 문서에 더할 수
export function dailyIncrementsOf(events: readonly TrackEvent[]): IncrementTree {
  const tree: IncrementTree = {};
  for (const event of events) {
    const id = event.entryId;
    switch (event.type) {
      case 'view':
      case '404': {
        const ref = keyOf(event.ref ?? '(direct)');
        if (event.type === 'view') bump(tree, ['site', 'views']);
        if (event.seq === 1) {
          bump(tree, ['site', 'visits']);
          bump(tree, ['refs', ref]);
        }
        if (event.type === '404') {
          const missing = keyOf(event.path);
          bump(tree, ['notFound', missing, 'n']);
          bump(tree, ['notFound', missing, 'refs', ref]);
        } else if (id) {
          bump(tree, ['entries', id, 'views']);
          if (event.firstInVisit) bump(tree, ['entries', id, 'visits']);
          if (ref !== keyOf(event.path)) bump(tree, ['entries', id, 'refs', ref]);
        }
        const prev = event.prevEntryId;
        if (prev) {
          bump(tree, ['entries', prev, 'onward']);
          if (event.type === 'view' && id && id !== prev) bump(tree, ['entries', prev, 'next', id]);
        }
        break;
      }
      case 'read':
        if (id && event.depth)
          bump(tree, ['entries', id, event.depth === 100 ? 'read100' : 'read75']);
        break;
      case 'out':
        bump(tree, ['site', 'out']);
        if (id) bump(tree, ['entries', id, 'out']);
        break;
      case 'pdf':
        bump(tree, ['site', 'pdf']);
        break;
      case 'copy':
        bump(tree, ['site', 'copy']);
        if (id) bump(tree, ['entries', id, 'copy']);
        break;
      case 'search':
        if (event.term) {
          bump(tree, ['search', event.term, 'n']);
          if (event.count === 0) bump(tree, ['search', event.term, 'zero']);
        }
        break;
    }
  }
  return tree;
}

// ───────────── 읽기(화면용 요약) ─────────────

// 저장된 문서는 믿지 않는다: 수가 아니면 0, 객체가 아니면 빈 객체
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function addCounts(target: Map<string, number>, source: unknown): void {
  for (const [key, value] of Object.entries(obj(source))) {
    const count = num(value);
    if (count > 0) target.set(key, (target.get(key) ?? 0) + count);
  }
}

export interface KeyCount {
  key: string;
  count: number;
}

// 많은 순, 같으면 key 순으로 앞에서 limit개
function topOf(counts: Map<string, number>, limit: number): KeyCount[] {
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export interface DailyPoint {
  day: string;
  visits: number;
  views: number;
}

export interface SiteReaders {
  daily: DailyPoint[];
  totals: { visits: number; views: number; out: number; pdf: number; copy: number };
  entries: Array<{ id: string; visits: number; views: number }>;
  refs: KeyCount[];
  searches: Array<{ term: string; count: number; zero: number }>;
  notFound: Array<{ path: string; count: number; refs: KeyCount[] }>;
}

export const SITE_LIST_LIMIT = 20;
export const SEARCH_LIST_LIMIT = 30;

// 날짜 문서들(day → 문서 값) → 사이트 요약. days는 오래된 날부터
export function siteReadersOf(
  docs: ReadonlyMap<string, unknown>,
  days: readonly string[],
): SiteReaders {
  const totals = { visits: 0, views: 0, out: 0, pdf: 0, copy: 0 };
  const entryVisits = new Map<string, { visits: number; views: number }>();
  const refs = new Map<string, number>();
  const searches = new Map<string, { count: number; zero: number }>();
  const notFound = new Map<string, { count: number; refs: Map<string, number> }>();
  const daily: DailyPoint[] = [];

  for (const day of days) {
    const doc = obj(docs.get(day));
    const site = obj(doc.site);
    daily.push({ day, visits: num(site.visits), views: num(site.views) });
    totals.visits += num(site.visits);
    totals.views += num(site.views);
    totals.out += num(site.out);
    totals.pdf += num(site.pdf);
    totals.copy += num(site.copy);
    addCounts(refs, doc.refs);
    for (const [id, value] of Object.entries(obj(doc.entries))) {
      const entry = obj(value);
      const current = entryVisits.get(id) ?? { visits: 0, views: 0 };
      current.visits += num(entry.visits);
      current.views += num(entry.views);
      entryVisits.set(id, current);
    }
    for (const [term, value] of Object.entries(obj(doc.search))) {
      const item = obj(value);
      const current = searches.get(term) ?? { count: 0, zero: 0 };
      current.count += num(item.n);
      current.zero += num(item.zero);
      searches.set(term, current);
    }
    for (const [path, value] of Object.entries(obj(doc.notFound))) {
      const item = obj(value);
      const current = notFound.get(path) ?? { count: 0, refs: new Map<string, number>() };
      current.count += num(item.n);
      addCounts(current.refs, item.refs);
      notFound.set(path, current);
    }
  }

  return {
    daily,
    totals,
    entries: [...entryVisits]
      .map(([id, value]) => ({ id, ...value }))
      .filter((item) => item.visits > 0 || item.views > 0)
      .sort((a, b) => b.visits - a.visits || b.views - a.views || a.id.localeCompare(b.id))
      .slice(0, SITE_LIST_LIMIT),
    refs: topOf(refs, SITE_LIST_LIMIT),
    // 결과 0건이 있었던 검색어를 먼저(D20 "0건 먼저"), 그다음 많은 순
    searches: [...searches]
      .map(([term, value]) => ({ term, ...value }))
      .filter((item) => item.count > 0)
      .sort(
        (a, b) =>
          Number(b.zero > 0) - Number(a.zero > 0) ||
          b.count - a.count ||
          a.term.localeCompare(b.term),
      )
      .slice(0, SEARCH_LIST_LIMIT),
    notFound: [...notFound]
      .map(([path, value]) => ({ path, count: value.count, refs: topOf(value.refs, 3) }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
      .slice(0, SITE_LIST_LIMIT),
  };
}

export interface EntryReaders {
  daily: DailyPoint[];
  totals: {
    visits: number;
    views: number;
    read75: number;
    read100: number;
    out: number;
    copy: number;
    onward: number;
  };
  refs: KeyCount[];
  next: KeyCount[];
  prev: KeyCount[];
}

export const ENTRY_LIST_LIMIT = 10;

// 날짜 문서들 → 글 하나의 요약. 전에 읽은 글(prev)은 다른 글의 next에서 찾는다
export function entryReadersOf(
  docs: ReadonlyMap<string, unknown>,
  days: readonly string[],
  id: string,
): EntryReaders {
  const totals = { visits: 0, views: 0, read75: 0, read100: 0, out: 0, copy: 0, onward: 0 };
  const refs = new Map<string, number>();
  const next = new Map<string, number>();
  const prev = new Map<string, number>();
  const daily: DailyPoint[] = [];

  for (const day of days) {
    const entries = obj(obj(docs.get(day)).entries);
    const entry = obj(entries[id]);
    daily.push({ day, visits: num(entry.visits), views: num(entry.views) });
    for (const key of Object.keys(totals) as Array<keyof typeof totals>)
      totals[key] += num(entry[key]);
    addCounts(refs, entry.refs);
    addCounts(next, entry.next);
    for (const [otherId, value] of Object.entries(entries)) {
      if (otherId === id) continue;
      const count = num(obj(obj(value).next)[id]);
      if (count > 0) prev.set(otherId, (prev.get(otherId) ?? 0) + count);
    }
  }

  return {
    daily,
    totals,
    refs: topOf(refs, SITE_LIST_LIMIT),
    next: topOf(next, ENTRY_LIST_LIMIT),
    prev: topOf(prev, ENTRY_LIST_LIMIT),
  };
}

// 날짜 문서들 → 글마다 방문 수(관리자 목록의 readers30)
export function visitsByEntryOf(docs: Iterable<unknown>): Map<string, number> {
  const visits = new Map<string, number>();
  for (const doc of docs) {
    for (const [id, value] of Object.entries(obj(obj(doc).entries))) {
      const count = num(obj(value).visits);
      if (count > 0) visits.set(id, (visits.get(id) ?? 0) + count);
    }
  }
  return visits;
}

// 비율(0~1). 분모가 0이면 null
export function rateOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.min(1, Math.max(0, part / whole));
}

// 떠난 수 = 조회 − 다음 페이지로 간 수(0 아래로 내려가지 않는다)
export function exitsOf(totals: { views: number; onward: number }): number {
  return Math.max(0, totals.views - totals.onward);
}
