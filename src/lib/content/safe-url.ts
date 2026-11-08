// 주소 판정 도구 (재건 3단계 Plan 4.3, 리뷰 6.2 지적 10·11)
// - safeUrl: react-markdown defaultUrlTransform과 같은 프로토콜 허용 목록. 그 밖은 빈 주소다.
// - isVideoUrl: 공개 페이지 규칙(영상 확장자 → <video>)의 판정. 쿼리·해시를 뗀 경로의 확장자로 본다.
// - 공유 파이프라인(markdown.ts)과 원시 HTML 안전 처리(rehype-strip-unsafe.ts)가 같이 쓴다. 순수 함수다.

// 공개 페이지가 영상으로 그리는 확장자 (MarkdownPostView.tsx와 같다)
export const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov'];

// 허용 프로토콜 (react-markdown defaultUrlTransform과 같다)
const SAFE_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel']);

// 허용하지 않는 프로토콜(javascript:, data: 등)이면 빈 주소를 돌려준다
export function safeUrl(url: string): string {
  const colon = url.indexOf(':');
  if (colon === -1) return url;
  // 첫 `/`, `?`, `#`보다 뒤의 `:`는 프로토콜이 아니다(상대 경로)
  for (const marker of ['/', '?', '#']) {
    const position = url.indexOf(marker);
    if (position !== -1 && colon > position) return url;
  }
  return SAFE_PROTOCOLS.has(url.slice(0, colon).toLowerCase()) ? url : '';
}

// 영상 주소인지. Firebase 다운로드 주소(…original.mp4?alt=media&token=…)도 영상으로 본다
export function isVideoUrl(url: string): boolean {
  const path = url.split('#')[0].split('?')[0];
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // 잘못된 인코딩이면 원래 경로로 본다
  }
  const lower = decoded.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
