// 문서 출처 응답 (서가 1단계 T4·T5, Plan J4·J5·J11)
// - 문서 출처 호스트(raw.cruzlab.dev)의 모든 요청은 여기로만 온다(미들웨어 분기). 관리자 쿠키를 읽지 않는다.
// - J5: 문서를 열 수 없으면 모든 경로에 같은 404를 준다. 어떤 문서가 있는지 드러내지 않는다.
//   404 화면의 "서가에서 다시 열기"는 서가 화면(블로그 출처의 /admin/library)으로 간다.

const NOT_FOUND_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
};

// 서가 화면 주소 (블로그 출처)
function libraryHomeUrl(): string {
  const site = String(import.meta.env.SITE ?? '').replace(/\/$/, '');
  return `${site}/admin/library`;
}

// 문서 출처의 404 화면 (J5). 본문이 모든 경로에서 같다
export function rawNotFoundResponse(): Response {
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>문서를 열 수 없습니다</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:48px 20px;text-align:center;color:#1d1d1f;background:#fafafa}@media (prefers-color-scheme:dark){body{color:#f5f5f7;background:#111}}a{display:inline-block;margin-top:16px;padding:12px 18px;background:#0a64d8;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
<body><h1>문서를 열 수 없습니다</h1><p>주소가 틀렸거나 열람 시간이 끝났습니다.</p><a href="${libraryHomeUrl()}">서가에서 다시 열기</a></body></html>`;
  return new Response(body, { status: 404, headers: NOT_FOUND_HEADERS });
}

// 서가가 꺼져 있거나 없는 서가 경로 (C5: 서가의 모든 주소가 404)
export function libraryOffResponse(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
}
