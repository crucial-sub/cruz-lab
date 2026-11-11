// 공개 페이지 독자 흐름 수집 스크립트 (재건 5단계 D20)
// - BaseLayout이 모든 공개 페이지에 싣는다. 관리자 표시 스크립트와 합쳐 2 KB 안의 모듈 1개다(Plan 8.1). 그래서 짧게 쓴다.
//   (전역 이름을 짧은 지역 이름으로 받아 두는 것도 크기 때문이다.) 다른 클라이언트 번들과 함께 가져오는 모듈이 없어야 한다
//   (나눠진 청크가 생긴다). events.ts는 브라우저에서 이 파일만 가져온다.
// - 세지 않는 브라우저: 관리자 표시가 있는 브라우저(D4. BaseLayout 인라인 스크립트가 <body data-admin>을 단다),
//   navigator.webdriver인 브라우저. JS가 없으면 이 스크립트가 돌지 않는다.
// - 방문 = 탭 하나의 세션. sessionStorage의 무작위 방문 ID로 같은 방문 안의 페이지만 잇는다. 쿠키·오래 남는 식별자를 쓰지 않는다.
//   30분(VISIT_IDLE_MS) 넘게 이벤트가 없었으면 새 방문이다. 탭을 열어 두거나 브라우저가 세션을 되살려도 다른 날까지 잇지 않는다.
// - 보내기: view(404 화면이면 404)는 열 때 바로, 나머지(read·out·pdf·copy·search)는 떠날 때(pagehide·visibilitychange) 모아서
//   navigator.sendBeacon으로 보낸다. 떠날 때는 새 이벤트가 있을 때만 보낸다. 페이지당 2번까지다(D20).
//   그래서 탭을 오간 뒤 생긴 이벤트는 보내지 못할 수 있다.
//   요청 하나는 한 페이지의 이벤트다. 페이지 경로(p)·글 ID(i)는 본문에 한 번만 쓴다(이벤트 필드는 events.ts parseTrackBody).
//   본문 4 KB 안: 경로 1,024글자 + 이벤트 MAX_QUEUED_EVENTS개(바깥 링크 주소 200글자, 검색어 50글자)라 넘지 않는다.
// - 뒤로 가기 캐시(bfcache)에서 페이지가 돌아오면 그 페이지를 새로 연 것으로 센다(방문 상태를 다시 읽고 view를 보낸다).
//   그러지 않으면 다음 페이지의 "앞 페이지"가 틀린다.
// - 페이지 표시: 글 상세는 [data-entry-id](PostArticle), 본문은 #post-body, 404 화면은 [data-not-found](NotFound).
// - 검색: 목록 검색창([data-post-search], SearchFilter)의 입력을 듣고 1.5초 멈췄을 때 검색어와 보이는 행 수를 기록한다.
//   검색창의 처리기가 먼저 돌아 행을 거른 뒤다(그 요소에 붙은 처리기 → 문서로 올라온 이벤트 순서). 정규화는 서버가 한다.
//   1.5초가 지나기 전에 떠나면 그 검색어는 남지 않는다(D20 "멈췄을 때").

import {
  MAX_BEACONS_PER_PAGE,
  MAX_EVENTS_PER_VISIT,
  MAX_PATH_LENGTH,
  MAX_QUEUED_EVENTS,
  SEARCH_PAUSE_MS,
  TRACK_PATH,
  VISIT_IDLE_MS,
  VISIT_STORAGE_KEY,
} from './events';

type TrackPayload = Record<string, string | number | undefined>;
// 방문 상태: v 방문 ID, s 마지막 이벤트 순서, t 마지막 이벤트 시각(ms), p 앞 페이지 경로, i 앞 페이지 글 ID, n 이 방문에서 연 글 ID
interface VisitState {
  v: string;
  s: number;
  t: number;
  p?: string;
  i?: string;
  n: string[];
}

const doc = document;
const loc = location;
const json = JSON.stringify;
const now = Date.now;
const COPY_BUTTON = 'button.code-copy';

if (!navigator.webdriver && !('admin' in doc.body.dataset)) {
  const path = loc.pathname.slice(0, MAX_PATH_LENGTH);
  const entryId = doc.querySelector<HTMLElement>('[data-entry-id]')?.dataset.entryId;
  const body = doc.getElementById('post-body');
  const queue: TrackPayload[] = [];
  let sends = 0;
  let depthSent = 0;
  let searchTimer: ReturnType<typeof setTimeout>;
  let lastTerm = '';

  // 방문 상태를 읽는다. 없거나 30분 넘게 쉬었으면 새 방문이다(저장 공간이 막히면 페이지마다 새 방문)
  // - 저장 공간이 막힌 브라우저는 sessionStorage를 읽기만 해도 예외다. 값이 없거나 깨졌으면(null) t를 읽을 때 예외다. 모두 새 방문
  const load = (): VisitState => {
    try {
      const saved: VisitState = JSON.parse(sessionStorage[VISIT_STORAGE_KEY]);
      if (now() - saved.t < VISIT_IDLE_MS) return saved;
    } catch {
      // 아래에서 새로 만든다
    }
    return { v: crypto.randomUUID(), s: 0, t: 0, n: [] };
  };
  // view()가 처음 읽는다(아래 다른 함수는 그 뒤에만 불린다)
  let state: VisitState;
  const save = () => {
    state.t = now();
    try {
      sessionStorage[VISIT_STORAGE_KEY] = json(state);
    } catch {
      // 저장 공간이 막혔다
    }
  };
  // 순서를 붙인다. 방문당 상한을 넘으면 버린다
  const stamp = (payload: TrackPayload) => {
    if (state.s < MAX_EVENTS_PER_VISIT) {
      payload.s = ++state.s;
      save();
      return payload;
    }
  };
  const send = (events: TrackPayload[]) => {
    if (events.length && sends++ < MAX_BEACONS_PER_PAGE)
      navigator.sendBeacon(TRACK_PATH, json({ v: state.v, p: path, i: entryId, e: events }));
  };
  const push = (payload: TrackPayload) => {
    if (queue.length < MAX_QUEUED_EVENTS && stamp(payload)) queue.push(payload);
  };

  // 열 때(bfcache에서 돌아올 때도): 들어온 곳은 방문의 첫 페이지면 바깥 도메인 또는 블로그 안 경로,
  // 그 뒤는 방문 안 앞 페이지 경로
  const view = () => {
    state = load();
    sends = depthSent = 0;
    // 방문의 첫 페이지에서 들어온 곳이 없으면 r이 빠진다(서버는 직접으로 센다)
    let ref = state.p;
    if (!state.s)
      try {
        const url = new URL(doc.referrer);
        ref = url.origin === loc.origin ? url.pathname : url.hostname;
      } catch {
        // 들어온 곳이 없다(주소 입력·북마크·앱)
      }
    const first = !!entryId && !state.n.includes(entryId);
    const event = stamp({
      t: doc.querySelector('[data-not-found]') ? '404' : 'view',
      r: ref,
      b: state.i,
      n: +first,
    });
    state.p = path;
    state.i = entryId;
    if (first) state.n.push(entryId);
    save();
    if (event) send([event]);
  };

  // 본문을 75%·100%까지 내려갔는지(본문 끝이 화면 안에 들어오면 100%)
  const depth = () => {
    if (body && entryId) {
      const rect = body.getBoundingClientRect();
      for (const mark of [75, 100])
        if (
          depthSent < mark &&
          (mark < 100
            ? innerHeight - rect.top >= rect.height * 0.75
            : rect.bottom <= innerHeight + 1)
        ) {
          depthSent = mark;
          push({ t: 'read', d: mark });
        }
    }
  };
  const flush = () => {
    depth();
    send(queue.splice(0));
  };

  view();
  // 처리기는 모두 window에 단다. click·input·visibilitychange는 문서에서 window까지 올라온다.
  // scroll 이벤트는 취소할 수 없어 passive를 따로 주지 않는다
  addEventListener('scroll', depth);
  addEventListener('pagehide', flush);
  addEventListener('pageshow', (event) => event.persisted && view());
  addEventListener('visibilitychange', () => doc.hidden && flush());
  addEventListener('click', (event) => {
    // 누른 곳은 늘 요소다(글자를 눌러도 그 글자를 감싼 요소)
    const target = event.target as Element;
    const copy = target.closest(COPY_BUTTON);
    // 글이 아닌 페이지(노트 목록)의 복사도 보낸다. 서버는 사이트 수로만 센다
    if (copy) return push({ t: 'copy', k: [...doc.querySelectorAll(COPY_BUTTON)].indexOf(copy) });
    // <a>는 주소 조각(origin·pathname·protocol)을 직접 갖는다
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (link) {
      if (link.origin === loc.origin) {
        if (/\.pdf$/i.test(link.pathname)) push({ t: 'pdf' });
      } else if (/^https?:$/.test(link.protocol)) push({ t: 'out', u: link.href.slice(0, 200) });
    }
  });
  addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-post-search]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const term = input.value.trim().slice(0, 50);
      if (term.length > 1 && term !== lastTerm) {
        lastTerm = term;
        push({
          t: 'search',
          q: term,
          c: doc.querySelectorAll('[data-post-row]:not([hidden])').length,
        });
      }
    }, SEARCH_PAUSE_MS);
  });
}
