// 독자 흐름 저장·읽기 (재건 5단계 D20)
// - 원본 줄 readerEvents/{auto}: day, visit, seq, type, path, entryId?, ref?, meta?, at. 90일 뒤 지운다.
// - 날짜 요약 readerDaily/{YYYY-MM-DD}: 글별·사이트 수(맵, increment). 모양은 src/lib/tracker/daily.ts 머리말.
// - 저장: 원본 줄 N개를 배치 하나로 먼저 쓰고, 그다음 요약 문서에 increment를 더한다(두 번 쓰기).
//   요약 쓰기가 실패해도(문서가 너무 커짐, 쓰기 경합) 원본 줄은 남는다. 그때 요약은 그 요청만큼 모자란다(로그를 남긴다).
// - 관리자 화면은 날짜 요약만 읽는다(30일이면 문서 30개 안). 원본 줄은 글 하나의 "방문 경로 예"와 90일 정리 때만 읽는다.
// - 색인: 모두 단일 필드(자동) 또는 같음 조건끼리의 병합이다. 복합 색인을 더하지 않는다(Plan 4.3).
// - 규칙: 두 컬렉션은 Firestore 규칙에 없어 클라이언트 접근이 막힌다. 서버(Admin SDK)만 쓴다.

import { FieldPath, FieldValue, type DocumentData } from 'firebase-admin/firestore';
import {
  dailyIncrementsOf,
  entryReadersOf,
  siteReadersOf,
  visitsByEntryOf,
  type EntryReaders,
  type IncrementTree,
  type SiteReaders,
} from '@/lib/tracker/daily';
import {
  RAW_EVENT_RETENTION_DAYS,
  dayRange,
  kstDay,
  shiftDay,
  type TrackEvent,
  type TrackEventType,
} from '@/lib/tracker/events';
import { ApiError } from './api-response';
import { listPublishedEntries } from './entries';
import { getServerDb } from './firebase-server';

export const READER_EVENTS_COLLECTION = 'readerEvents';
export const READER_DAILY_COLLECTION = 'readerDaily';

// 한 번에 지우는 오래된 원본 줄 수(D20 "500개씩")와 화면을 열 때 되풀이하는 횟수
export const PRUNE_BATCH_SIZE = 500;
export const PRUNE_MAX_ROUNDS = 10;
// 글 하나의 방문 경로 예 수(D20 "10개")와 하루에 받아 보는 후보 줄 수
export const VISIT_PATH_EXAMPLES = 10;
const PATH_CANDIDATES_PER_DAY = 30;

function eventsRef() {
  return getServerDb().collection(READER_EVENTS_COLLECTION);
}

function dailyRef() {
  return getServerDb().collection(READER_DAILY_COLLECTION);
}

// 발행 글 메모 목록에 없는 글 ID를 걸러 낸다(D20 서버 1)
// - view·copy의 글 ID가 모르는 값이면 글이 아닌 페이지로 센다(copy는 사이트 수만). read는 글이 있어야 하므로 버린다.
// - 앞 페이지 글 ID가 모르는 값이면 지운다.
export function keepKnownEntries(
  events: readonly TrackEvent[],
  known: ReadonlySet<string>,
): TrackEvent[] {
  const kept: TrackEvent[] = [];
  for (const event of events) {
    const entryId = event.entryId && known.has(event.entryId) ? event.entryId : null;
    if (event.type === 'read' && !entryId) continue;
    const prevEntryId =
      event.prevEntryId && known.has(event.prevEntryId) ? event.prevEntryId : null;
    kept.push({
      ...event,
      entryId,
      prevEntryId,
      firstInVisit: event.firstInVisit && entryId !== null,
    });
  }
  return kept;
}

// 원본 줄 한 개. 값이 있는 칸만 쓴다(Firestore는 undefined를 받지 않는다)
function rawEventOf(event: TrackEvent, visit: string, day: string): DocumentData {
  const doc: DocumentData = {
    day,
    visit,
    seq: event.seq,
    type: event.type,
    path: event.path,
    at: FieldValue.serverTimestamp(),
  };
  if (event.entryId) doc.entryId = event.entryId;
  if (event.ref) doc.ref = event.ref;
  const meta: Record<string, unknown> = {};
  if (event.prevEntryId) meta.prev = event.prevEntryId;
  if (event.firstInVisit) meta.first = true;
  if (event.depth) meta.depth = event.depth;
  if (event.url) meta.url = event.url;
  if (event.domain) meta.domain = event.domain;
  if (event.index !== null) meta.index = event.index;
  if (event.term) meta.term = event.term;
  if (event.count !== null) meta.count = event.count;
  if (Object.keys(meta).length > 0) doc.meta = meta;
  return doc;
}

// 더할 수 나무 → Firestore increment 값. set(merge)의 중첩 객체 key는 글자 그대로라 '.'·'/'가 있어도 된다
function toIncrements(tree: IncrementTree): DocumentData {
  const data: DocumentData = {};
  for (const [key, value] of Object.entries(tree)) {
    data[key] = typeof value === 'number' ? FieldValue.increment(value) : toIncrements(value);
  }
  return data;
}

// 검사를 통과한 이벤트를 저장한다. 저장한 수를 돌려준다
export async function recordTrackEvents(input: {
  visit: string;
  events: readonly TrackEvent[];
  nowMs?: number;
}): Promise<{ stored: number; dropped: number }> {
  const known = new Set((await listPublishedEntries()).map((entry) => entry.id));
  const events = keepKnownEntries(input.events, known);
  const dropped = input.events.length - events.length;
  if (events.length === 0) return { stored: 0, dropped };

  const day = kstDay(input.nowMs ?? Date.now());
  const batch = getServerDb().batch();
  for (const event of events) batch.set(eventsRef().doc(), rawEventOf(event, input.visit, day));
  await batch.commit();
  try {
    await dailyRef()
      .doc(day)
      .set(
        {
          day,
          updatedAt: FieldValue.serverTimestamp(),
          ...toIncrements(dailyIncrementsOf(events)),
        },
        { merge: true },
      );
  } catch (error) {
    // 원본 줄은 이미 남았다. 요약만 이 요청만큼 모자란다
    console.error('[reader-store] 날짜 요약 쓰기 실패', error);
  }
  return { stored: events.length, dropped };
}

// 날짜 요약 문서들(문서 ID 범위, 있는 문서만 읽는다) → day → 값
export async function readDailyDocs(days: readonly string[]): Promise<Map<string, unknown>> {
  const docs = new Map<string, unknown>();
  if (days.length === 0) return docs;
  const snapshot = await dailyRef()
    .where(FieldPath.documentId(), '>=', days[0])
    .where(FieldPath.documentId(), '<=', days[days.length - 1])
    .get();
  for (const docSnap of snapshot.docs) docs.set(docSnap.id, docSnap.data());
  return docs;
}

// 오래된 원본 줄을 지운다(D20 4). 오늘을 넣어 90일(오늘 포함) 밖, 즉 day < 오늘 − 89인 줄을 500개씩
// - 화면을 오래 열지 않아 밀린 줄을 따라잡게 열 때마다 PRUNE_MAX_ROUNDS번까지 되풀이한다(최대 5,000줄).
export async function pruneOldReaderEvents(today: string): Promise<number> {
  const cutoff = shiftDay(today, -(RAW_EVENT_RETENTION_DAYS - 1));
  let deleted = 0;
  for (let round = 0; round < PRUNE_MAX_ROUNDS; round += 1) {
    const snapshot = await eventsRef().where('day', '<', cutoff).limit(PRUNE_BATCH_SIZE).get();
    if (snapshot.empty) break;
    const batch = getServerDb().batch();
    for (const docSnap of snapshot.docs) batch.delete(docSnap.ref);
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < PRUNE_BATCH_SIZE) break;
  }
  return deleted;
}

export interface ReaderRange {
  days: number;
  today: string;
  range: string[];
}

// 화면 기간(D20 "30·90일"). 없으면 30. 그 밖의 값은 400
export const READER_DAY_CHOICES = [30, 90] as const;

export function parseReaderDays(url: URL): number {
  const value = url.searchParams.get('days');
  if (value === null || value === '') return 30;
  const days = Number(value);
  if (!(READER_DAY_CHOICES as readonly number[]).includes(days)) {
    throw new ApiError(400, 'INVALID_REQUEST', '기간은 30일이나 90일입니다.', { days: value });
  }
  return days;
}

export function readerRangeOf(days: number, nowMs = Date.now()): ReaderRange {
  const today = kstDay(nowMs);
  return { days, today, range: dayRange(today, days) };
}

// 사이트 요약(/admin/readers)
export async function readSiteReaders(range: ReaderRange): Promise<SiteReaders> {
  return siteReadersOf(await readDailyDocs(range.range), range.range);
}

// 방문 경로 예의 한 걸음
export interface VisitStep {
  seq: number;
  type: TrackEventType;
  path: string;
  entryId: string | null;
  ref: string | null;
  depth: number | null;
  domain: string | null;
}

export interface VisitPath {
  day: string;
  steps: VisitStep[];
}

function stepOf(data: DocumentData): VisitStep {
  const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
  return {
    seq: typeof data.seq === 'number' ? data.seq : 0,
    type: data.type,
    path: typeof data.path === 'string' ? data.path : '',
    entryId: typeof data.entryId === 'string' ? data.entryId : null,
    ref: typeof data.ref === 'string' ? data.ref : null,
    depth: typeof meta.depth === 'number' ? meta.depth : null,
    domain: typeof meta.domain === 'string' ? meta.domain : null,
  };
}

// 글 하나의 방문 경로 예(D20 5): 그 글을 연 방문 10개의 이벤트를 순서대로
// - days: 그 글의 조회가 있는 날(요약 문서로 고른다). 빈 날은 찾지 않는다(빈 쿼리도 읽기 1회다). 최신 날부터 7일씩 찾는다.
// - 방문마다 그 글을 처음 연 줄(meta.first)만 고른다(같은 방문의 새로 고침 줄이 자리를 차지하지 않게).
//   같음 조건 네 개(entryId·day·type·meta.first)라 단일 필드 색인 병합으로 된다(복합 색인 없음).
// - 정렬 조건은 복합 색인이 필요해 쓰지 않는다. 그래서 하루에 최대 PATH_CANDIDATES_PER_DAY줄을 받아 시각(at) 최신순으로 고른다.
//   그날 줄이 그보다 많으면 "최근"이 아니라 그날의 예다.
// - 방문마다 원본 줄을 모두 읽는다(방문당 상한 200).
export async function readVisitPaths(
  entryId: string,
  days: readonly string[],
): Promise<VisitPath[]> {
  const found: Array<{ visit: string; day: string }> = [];
  const seen = new Set<string>();
  const newestFirst = [...days].sort().reverse();
  for (
    let start = 0;
    start < newestFirst.length && found.length < VISIT_PATH_EXAMPLES;
    start += 7
  ) {
    const chunk = newestFirst.slice(start, start + 7);
    const snapshots = await Promise.all(
      chunk.map((day) =>
        eventsRef()
          .where('entryId', '==', entryId)
          .where('day', '==', day)
          .where('type', '==', 'view')
          .where('meta.first', '==', true)
          .limit(PATH_CANDIDATES_PER_DAY)
          .get(),
      ),
    );
    snapshots.forEach((snapshot, index) => {
      const docs = [...snapshot.docs].sort(
        (a, b) => (b.get('at')?.toMillis?.() ?? 0) - (a.get('at')?.toMillis?.() ?? 0),
      );
      for (const docSnap of docs) {
        const visit = docSnap.get('visit');
        if (typeof visit !== 'string' || seen.has(visit) || found.length >= VISIT_PATH_EXAMPLES)
          continue;
        seen.add(visit);
        found.push({ visit, day: chunk[index] });
      }
    });
  }
  const visits = await Promise.all(
    found.map(async ({ visit, day }) => {
      const snapshot = await eventsRef().where('visit', '==', visit).limit(200).get();
      const steps = snapshot.docs
        .map((docSnap) => stepOf(docSnap.data()))
        .sort((a, b) => a.seq - b.seq);
      return { day, steps };
    }),
  );
  return visits;
}

// 글 하나의 요약(/admin/readers/<id>)
export async function readEntryReaders(
  entryId: string,
  range: ReaderRange,
): Promise<{ summary: EntryReaders; paths: VisitPath[] }> {
  const docs = await readDailyDocs(range.range);
  const summary = entryReadersOf(docs, range.range, entryId);
  const viewedDays = summary.daily.filter((point) => point.views > 0).map((point) => point.day);
  const paths = await readVisitPaths(entryId, viewedDays).catch((error: unknown) => {
    // 경로 예는 보조 정보다. 읽지 못해도 요약은 보인다
    console.error('[reader-store] 방문 경로 예 읽기 실패', error);
    return [];
  });
  return { summary, paths };
}

// 글마다 최근 days일 방문 수(관리자 목록 readers30). 읽지 못하면 null(화면은 "—")
export async function readEntryVisits(
  days = 30,
  nowMs = Date.now(),
): Promise<Map<string, number> | null> {
  try {
    const docs = await readDailyDocs(dayRange(kstDay(nowMs), days));
    return visitsByEntryOf(docs.values());
  } catch (error) {
    console.error('[reader-store] 30일 방문 수 읽기 실패', error);
    return null;
  }
}
