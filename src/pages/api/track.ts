// 독자 흐름 수집 API (재건 5단계 D20)
// - POST /api/track. 공개 주소다. 쿠키를 읽지도 쓰지도 않는다(2단계 D5). 응답은 저장하지 않는다(no-store).
// - 순서: Origin(있으면 같은 사이트) → 크기(4 KB) → 본문 검사(events.ts) → 로봇 User-Agent → 저장 판단(운영 호스트) → 저장.
// - 저장은 운영 호스트(www.cruzlab.dev)에서만 한다. 미리보기·localhost의 보통 방문은 검사만 하고 204로 끝낸다.
//   시험 표지(stage5-test-) 방문은 운영 호스트가 아닐 때만 저장한다(스모크, events.ts trackStoreDecision).
// - User-Agent는 로봇 거르기에만 쓰고 저장하지 않는다. IP를 읽지 않는다.
// - 응답: 204(받음. 저장했는지는 알리지 않는다), 400(본문 틀림), 403(다른 사이트), 413(크기), 405(POST 밖), 503(저장 실패).
//   sendBeacon은 응답을 보지 않는다. 코드는 스모크와 점검용이다.

import type { APIRoute } from 'astro';
import { errorResponse, noContentResponse } from '@/lib/server/api-response';
import { recordTrackEvents } from '@/lib/server/reader-store';
import {
  MAX_TRACK_BODY_BYTES,
  isAllowedTrackOrigin,
  isBotUserAgent,
  parseTrackBody,
  trackStoreDecision,
} from '@/lib/tracker/events';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (!isAllowedTrackOrigin(request.headers.get('origin'), request.url)) {
    return errorResponse(403, 'ORIGIN_MISMATCH', '요청 출처가 이 사이트가 아닙니다.');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_TRACK_BODY_BYTES) {
    return errorResponse(413, 'TOO_LARGE', '본문이 너무 큽니다.');
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return errorResponse(400, 'INVALID_BODY', '본문을 읽지 못했습니다.');
  }
  const parsed = parseTrackBody(text);
  if (!parsed.ok) {
    if (parsed.reason === 'size') return errorResponse(413, 'TOO_LARGE', '본문이 너무 큽니다.');
    return errorResponse(400, 'INVALID_EVENTS', '이벤트가 올바르지 않습니다.', {
      reason: parsed.reason,
    });
  }

  if (isBotUserAgent(request.headers.get('user-agent'))) return noContentResponse();

  const decision = trackStoreDecision({
    hostHeader: request.headers.get('host'),
    urlHost: url.hostname,
    visit: parsed.visit,
  });
  if (decision === 'skip') return noContentResponse();

  try {
    await recordTrackEvents({ visit: parsed.visit, events: parsed.events });
  } catch (error) {
    console.error('[track] 저장 실패', error);
    return errorResponse(503, 'TRACK_FAILED', '이벤트를 저장하지 못했습니다.');
  }
  return noContentResponse();
};

// POST 밖의 메서드
export const ALL: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
