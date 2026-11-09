// SSR 페이지의 404 응답 표시 (재건 4단계 PR-B 리뷰 중요 3)
// - 이 페이지가 안내 화면(NotFound.astro)을 직접 그리고 상태만 404로 둔다.
// - X-Astro-Reroute: no는 Astro가 404 응답을 404.astro로 바꿔 그리지 않게 한다. 바꿔 그리면 운영(Vercel)에서
//   prerender된 /404.html을 네트워크로 다시 받는다. 로그인 보호가 걸린 미리보기 배포에서는 그 요청이 막힐 수 있다.
// - 캐시 헤더를 붙이지 않는다. 404는 CDN에 저장하지 않는다(PR-A 글 상세와 같은 규칙).
export function markNotFound(response: { status?: number; headers: Headers }) {
  response.status = 404;
  response.headers.set('X-Astro-Reroute', 'no');
}
