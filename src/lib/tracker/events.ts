// 독자 흐름 이벤트: 종류·검사·정규화 (재건 5단계 D20)
// - 브라우저(공개 수집 스크립트 client.ts)와 서버(POST /api/track)가 함께 쓴다. 스모크도 이 파일을 직접 가져온다.
//   그래서 zod·경로 별칭(@/)·다른 파일 import를 쓰지 않는다(브라우저 번들 크기, Node 타입 지우기 실행).
// - 개인정보 원칙(D20): 쿠키·오래 남는 식별자·IP·User-Agent를 저장하지 않는다. 방문 ID는 탭 세션(sessionStorage)의 무작위 값이다.
//   30분 넘게 쉬면 브라우저가 새 방문 ID를 만든다(client.ts). 그래서 다른 날의 방문이 이어지지 않는다.
//   들어온 곳은 바깥 사이트면 도메인만, 블로그 안이면 경로만 받는다. 경로는 쿼리·해시를 뺀 pathname이다.
// - 저장은 운영 호스트(www.cruzlab.dev)에서만 한다. 미리보기·localhost는 같은 Firestore를 쓰므로 저장하지 않는다.
//   예외: 방문 ID가 시험 표지(stage5-test-)로 시작하고 요청이 localhost일 때만 저장한다(스모크·브라우저 확인용, 끝에 지운다).
//   운영·미리보기에서는 시험 표지 방문을 저장하지 않는다.
// - 검사의 두 갈래: 구조가 틀리면(형식·종류·순서·글 ID) 요청 전체를 받지 않는다(400). 실제 브라우저에서 드물게 나오는
//   값(이상한 hostname, 긴 경로, 바깥 링크 주소, 짧아지는 검색어)은 고쳐 받거나 그 이벤트만 버린다.

// 수집 주소
export const TRACK_PATH = '/api/track';
// 저장하는 호스트(astro.config.mjs의 SITE)
export const PRODUCTION_HOST = 'www.cruzlab.dev';
// 시험 표지. 이 접두사의 방문만 localhost에서 저장한다
export const TEST_VISIT_PREFIX = 'stage5-test-';

// 브라우저 저장 키(sessionStorage). 탭을 닫으면 사라진다
export const VISIT_STORAGE_KEY = 'cruz-visit';
// 이만큼 쉬면 새 방문이다(브라우저가 판단). 탭을 열어 두거나 세션을 되살려도 다른 날까지 이어지지 않게
export const VISIT_IDLE_MS = 30 * 60 * 1000;
// 검색어를 기록하기 전 멈춤 시간(D20 "1.5초 멈췄을 때")
export const SEARCH_PAUSE_MS = 1500;

// 한도
export const MAX_TRACK_BODY_BYTES = 4096; // 본문 4 KB(D20)
export const MAX_EVENTS_PER_VISIT = 200; // 방문당 이벤트 상한(D20). seq가 이 값을 넘으면 받지 않는다
export const MAX_EVENTS_PER_REQUEST = 40; // 요청 하나의 이벤트 수
export const MAX_QUEUED_EVENTS = 10; // 브라우저가 떠날 때 보내는 이벤트 수(넘는 것은 모으지 않는다). 본문 4 KB 안을 보장한다
export const MAX_SEARCH_PER_REQUEST = 5; // 요청 하나의 검색어 수(넘는 것은 버린다)
export const MAX_BEACONS_PER_PAGE = 2; // 페이지 하나가 보내는 요청 수(D20 "최대 2번": 열 때, 떠날 때)
// 경로 길이(퍼센트 인코딩 글자 수). 넘으면 잘라 받는다. 한글 slug 약 110자까지다(한 글자 = 9글자). 지금 가장 긴 공개 경로는 156글자다
export const MAX_PATH_LENGTH = 1024;
export const MAX_URL_LENGTH = 500;
export const MAX_SEARCH_TERM_LENGTH = 50;
export const MIN_SEARCH_TERM_LENGTH = 2;
// 원본 줄(readerEvents) 보관 일수(D20)
export const RAW_EVENT_RETENTION_DAYS = 90;

export const TRACK_EVENT_TYPES = ['view', 'read', 'out', 'pdf', 'copy', 'search', '404'] as const;
export type TrackEventType = (typeof TRACK_EVENT_TYPES)[number];

// 들어온 곳이 없을 때(주소 입력·북마크·앱)의 key
export const DIRECT_REF = '(direct)';
// 들어온 곳 값을 읽지 못했을 때의 key
export const OTHER_REF = '(other)';

// 검사를 통과한 이벤트 한 개
export interface TrackEvent {
  type: TrackEventType;
  // 방문 안 이벤트 순서(1부터). seq 1은 방문의 첫 페이지다
  seq: number;
  // 이벤트가 난 페이지 경로(404면 없는 주소)
  path: string;
  // 글·노트·프로젝트 글 페이지면 그 글 ID
  entryId: string | null;
  // view·404: 들어온 곳. 첫 페이지면 바깥 도메인·블로그 안 경로·DIRECT_REF, 그 뒤는 방문 안 바로 앞 페이지 경로
  ref: string | null;
  // view·404: 방문 안 바로 앞 페이지의 글 ID(앞 페이지가 글일 때)
  prevEntryId: string | null;
  // view: 이 방문에서 이 글을 처음 열었는가(하루 방문 수 = 그 글을 연 방문 수)
  firstInVisit: boolean;
  // read: 본문을 75%·100%까지 내려갔다
  depth: 75 | 100 | null;
  // out: 바깥 링크 주소와 도메인
  url: string | null;
  domain: string | null;
  // copy: 그 페이지의 코드 블록 순서(0부터)
  index: number | null;
  // search: 정규화한 검색어와 결과 수
  term: string | null;
  count: number | null;
}

export type TrackParseResult =
  | { ok: true; visit: string; events: TrackEvent[] }
  | { ok: false; reason: string };

// 방문 ID: 브라우저 crypto.randomUUID() 또는 시험 표지 + 글자
const VISIT_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
// 글 ID. 관리자 라우터(src/admin/router.ts ENTRY_ID_PATTERN)와 같은 글자다
export const TRACK_ENTRY_ID_PATTERN = /^[A-Za-z0-9가-힣_-]{1,128}$/;
// 도메인(소문자 hostname). 점 없는 이름(localhost)·IPv4·밑줄 이름도 받는다
const DOMAIN_PATTERN =
  /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/;
// IPv6 hostname(대괄호)
const IPV6_PATTERN = /^\[[0-9a-f:.]{2,45}\]$/;

// 경로 구조 검사: '/'로 시작, 공백·역슬래시·제어 글자 없음. 통과하면 MAX_PATH_LENGTH로 자른 값, 틀리면 null.
// '//'로 시작하는 경로(https://www.cruzlab.dev//x)도 받는다. 저장 key와 화면 글자로만 쓰고 주소로 쓰지 않는다
export function normalizeTrackPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    /[\s\\]/.test(value) ||
    hasControlCharacter(value)
  ) {
    return null;
  }
  return value.slice(0, MAX_PATH_LENGTH);
}

// 제어 글자(U+0000~U+001F, U+007F)가 있는지
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// 'www.'와 끝의 점을 뗀 소문자 도메인. 틀리면 null
export function normalizeDomain(value: string): string | null {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (IPV6_PATTERN.test(domain)) return domain;
  return domain.length > 0 && domain.length <= 253 && DOMAIN_PATTERN.test(domain) ? domain : null;
}

// 들어온 곳 값 → 저장 key. ''는 DIRECT_REF, 경로는 그대로(길면 자른다), 도메인은 'www.'를 뗀다.
// 글자인데 읽지 못하면 OTHER_REF(요청을 버리지 않는다). 글자가 아니면 null(구조 오류)
export function normalizeRef(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return DIRECT_REF;
  if (typeof value !== 'string') return null;
  if (value.startsWith('/')) return normalizeTrackPath(value) ?? OTHER_REF;
  return normalizeDomain(value) ?? OTHER_REF;
}

// 검색어 정규화: NFC, 앞뒤 공백 제거, 소문자, 공백 묶기, 50자. 2글자보다 짧거나 Firestore 예약 모양(__x__)이면 null
export function normalizeSearchTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const term = [...value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')]
    .slice(0, MAX_SEARCH_TERM_LENGTH)
    .join('')
    .trim();
  if ([...term].length < MIN_SEARCH_TERM_LENGTH) return null;
  if (/^__.*__$/.test(term)) return null;
  return term;
}

// 바깥 링크 주소 검사: http·https, 500자 이하. 도메인을 함께 돌려준다
export function parseOutboundUrl(value: unknown): { url: string; domain: string } | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const domain = normalizeDomain(parsed.hostname);
  return domain ? { url: value, domain } : null;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function optionalEntryId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && TRACK_ENTRY_ID_PATTERN.test(value) ? value : undefined;
}

// 이벤트 한 개 검사. 경로·글 ID는 요청의 값(그 페이지)이다. 틀리면 이유 글자, 버릴 이벤트면 null
// - 버리는 것: 정규화하면 2글자보다 짧아지는 검색어(예: 이모지 하나), 읽지 못하는 바깥 링크 주소(예: 500자 넘음).
//   사람이 쓴 글자·페이지의 링크라 브라우저가 미리 다 걸러 내지 못한다.
function parseEvent(
  raw: unknown,
  path: string,
  entryId: string | null,
): TrackEvent | string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'event';
  const item = raw as Record<string, unknown>;
  if (typeof item.t !== 'string' || !(TRACK_EVENT_TYPES as readonly string[]).includes(item.t))
    return 'type';
  const type = item.t as TrackEventType;
  if (!isIntIn(item.s, 1, MAX_EVENTS_PER_VISIT)) return 'seq';

  const event: TrackEvent = {
    type,
    seq: item.s,
    path,
    entryId,
    ref: null,
    prevEntryId: null,
    firstInVisit: false,
    depth: null,
    url: null,
    domain: null,
    index: null,
    term: null,
    count: null,
  };

  switch (type) {
    case 'view':
    case '404': {
      const ref = normalizeRef(item.r);
      if (ref === null) return 'ref';
      const prev = optionalEntryId(item.b);
      if (prev === undefined) return 'prev';
      event.ref = ref;
      event.prevEntryId = prev;
      event.firstInVisit = type === 'view' && entryId !== null && item.n === 1;
      if (type === '404') event.entryId = null;
      break;
    }
    case 'read':
      if (!entryId) return 'entry';
      if (item.d !== 75 && item.d !== 100) return 'depth';
      event.depth = item.d;
      break;
    case 'out': {
      if (typeof item.u !== 'string') return 'url';
      const outbound = parseOutboundUrl(item.u);
      if (!outbound) return null;
      event.url = outbound.url;
      event.domain = outbound.domain;
      break;
    }
    case 'copy':
      // 글이 아닌 페이지(노트 목록 /notes)에도 복사 단추가 있다. 그때는 사이트 수로만 센다
      if (!isIntIn(item.k, 0, 999)) return 'index';
      event.index = item.k;
      break;
    case 'search': {
      if (typeof item.q !== 'string') return 'term';
      if (!isIntIn(item.c, 0, 100_000)) return 'count';
      const term = normalizeSearchTerm(item.q);
      if (!term) return null;
      event.term = term;
      event.count = item.c;
      break;
    }
    case 'pdf':
      break;
  }
  return event;
}

// 요청 본문(글자) 검사. 크기는 바이트로 본다
// - 본문: { v: 방문 ID, p: 페이지 경로, i?: 그 페이지의 글 ID, e: [이벤트…] }. 요청 하나는 한 페이지의 이벤트다(client.ts).
//   이벤트 필드는 짧은 이름이다: t 종류, s 순서, r 들어온 곳, b 앞 페이지 글 ID, n 이 방문에서 처음 연 글(1),
//   d 읽은 깊이(75·100), u 바깥 링크 주소, k 코드 블록 순서, q 검색어, c 결과 수.
// - 구조 오류면 요청 전체를 받지 않는다(이유: 'path'·'entry'·'views'·'order'·'event:<순번>:<항목>').
//   한 요청에 view·404는 1개까지다(방문 수를 한 요청으로 부풀리지 못하게). seq는 요청 안에서 커져야 한다.
//   검색어는 요청마다 MAX_SEARCH_PER_REQUEST개까지 받고 나머지는 버린다.
export function parseTrackBody(text: string): TrackParseResult {
  if (new TextEncoder().encode(text).length > MAX_TRACK_BODY_BYTES)
    return { ok: false, reason: 'size' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'body' };
  const body = raw as Record<string, unknown>;
  if (typeof body.v !== 'string' || !VISIT_PATTERN.test(body.v))
    return { ok: false, reason: 'visit' };
  const path = normalizeTrackPath(body.p);
  if (path === null) return { ok: false, reason: 'path' };
  const entryId = optionalEntryId(body.i);
  if (entryId === undefined) return { ok: false, reason: 'entry' };
  if (!Array.isArray(body.e) || body.e.length === 0 || body.e.length > MAX_EVENTS_PER_REQUEST) {
    return { ok: false, reason: 'events' };
  }
  const events: TrackEvent[] = [];
  let lastSeq = 0;
  let pages = 0;
  let searches = 0;
  for (const [index, item] of body.e.entries()) {
    const parsed = parseEvent(item, path, entryId);
    if (typeof parsed === 'string') return { ok: false, reason: `event:${index}:${parsed}` };
    const seq = (item as { s: number }).s;
    if (seq <= lastSeq) return { ok: false, reason: 'order' };
    lastSeq = seq;
    if (!parsed) continue;
    if (parsed.type === 'view' || parsed.type === '404') {
      pages += 1;
      if (pages > 1) return { ok: false, reason: 'views' };
    }
    if (parsed.type === 'search') {
      searches += 1;
      if (searches > MAX_SEARCH_PER_REQUEST) continue;
    }
    events.push(parsed);
  }
  return { ok: true, visit: body.v, events };
}

// 로봇 User-Agent. 걸러 내는 데만 쓰고 저장하지 않는다(D20 3)
// - 이름에 bot이 있는 수집기는 'bot' 뒤에 '/'·';'·')'·'-'가 오거나 낱말 'bot'이다(Googlebot/, PetalBot;, Slackbot-).
//   CUBOT 같은 휴대폰 이름(뒤에 공백)은 사람이다.
// - 카카오톡 앱 안 브라우저(KAKAOTALK)·다음 앱(DaumApps)은 사람이다. 카카오 미리보기 수집기는 kakaotalk-scrap,
//   다음 수집기는 Daumoa, 네이버 수집기는 Yeti다.
const BOT_USER_AGENT =
  /bot[/;)-]|\bbot\b|crawl|spider|slurp|archiver|headless|lighthouse|pagespeed|phantom|puppeteer|playwright|selenium|preview|facebookexternalhit|embedly|whatsapp|kakaotalk-scrap|yeti|daumoa|curl|wget|python|httpclient|okhttp|java\/|go-http|node-fetch|axios|undici|^node$/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return true;
  return BOT_USER_AGENT.test(userAgent);
}

// 호스트 글자 → 소문자, 포트 제거
function hostnameOf(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

// 이 컴퓨터 주소인가(시험 표지 방문을 저장하는 곳)
function isLocalHostname(host: string): boolean {
  return (
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  );
}

export type TrackStoreDecision = 'store' | 'test' | 'skip';

// 저장할지 정한다
// - 운영: Host 헤더와 요청 주소의 호스트가 모두 www.cruzlab.dev다. Astro는 X-Forwarded-Host를 주소에 쓰므로
//   Host 헤더도 함께 본다(Vercel은 Host로 배포를 고른다. 미리보기 주소로 운영 Host를 보낼 수 없다).
// - store: 운영 + 보통 방문. test: Host 헤더·주소가 모두 localhost + 시험 표지 방문.
//   skip: 그 밖(미리보기·localhost의 보통 방문, 운영·미리보기의 시험 표지).
export function trackStoreDecision(input: {
  hostHeader: string | null;
  urlHost: string;
  visit: string;
}): TrackStoreDecision {
  const host = hostnameOf(input.hostHeader);
  const urlHost = hostnameOf(input.urlHost);
  const test = input.visit.startsWith(TEST_VISIT_PREFIX);
  if (host === PRODUCTION_HOST && urlHost === PRODUCTION_HOST) return test ? 'skip' : 'store';
  return test && isLocalHostname(host) && isLocalHostname(urlHost) ? 'test' : 'skip';
}

// Origin 검사: 헤더가 있으면 요청 주소의 origin과 같아야 한다(다른 사이트가 방문자 브라우저로 이벤트를 보내지 못하게).
// 헤더가 없으면(오래된 브라우저, 서버 간 요청) 통과다. 로봇 거르기·크기 검사는 따로 한다
export function isAllowedTrackOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader) return true;
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

// ───────────── 날짜(KST) ─────────────

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 그 시각의 서울 날짜 'YYYY-MM-DD'
export function kstDay(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isDayKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DAY_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

// 날짜를 delta일 옮긴다
export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

// endDay로 끝나는 n일(오래된 날부터)
export function dayRange(endDay: string, count: number): string[] {
  const days: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) days.push(shiftDay(endDay, -offset));
  return days;
}
