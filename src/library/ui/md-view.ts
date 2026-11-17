// md 뷰어 보조 스크립트 (서가 1단계 T7, Plan J12)
// - 본문의 문서 그림·영상은 주소가 data-src에 있다(render-md.ts). 그림 요청에 문서 쿠키가 실려야 하기 때문이다.
// - 페이지 맨 앞의 입장권 그림({문서 출처}/d/_open?t=…&pixel=1)이 문서 쿠키를 준다. 그 그림이 끝난 뒤 src로 옮긴다.
//   그림이 실패하거나 3초 넘게 걸려도 옮긴다. 쿠키가 이미 있으면(12시간 안에 연 문서) 그림이 그대로 열린다.
// - 코드 복사·목차 위치 표시는 블로그 글 상세 스크립트(post-scripts.ts)를 그대로 쓴다.
// - DOM 타입 대신 작은 꼴(TicketPixel, DeferredMedia)을 받는다. 단위 테스트가 가짜로 시험한다.

// 입장권 그림을 기다리는 최대 시간
export const TICKET_WAIT_MS = 3000;

// data-src를 가진 그림·영상 (HTMLImageElement, HTMLVideoElement가 이 꼴이다)
export interface DeferredMedia {
  src: string;
  dataset: Record<string, string | undefined>;
}

// 입장권 그림 (HTMLImageElement가 이 꼴이다)
export interface TicketPixel {
  complete: boolean;
  addEventListener(type: 'load' | 'error', listener: () => void, options?: { once?: boolean }): void;
}

type SetTimer = (fn: () => void, ms: number) => unknown;

// data-src를 src로 옮긴다. 옮긴 수를 돌려준다
export function releaseDeferredMedia(elements: Iterable<DeferredMedia>): number {
  let count = 0;
  for (const element of elements) {
    const src = element.dataset.src;
    if (!src) continue;
    element.src = src;
    delete element.dataset.src;
    count += 1;
  }
  return count;
}

// 입장권 그림이 끝나면(받음·실패·시간 초과 중 먼저 오는 것) onReady를 한 번 부른다
export function whenTicketReady(pixel: TicketPixel | null, onReady: () => void, setTimer: SetTimer = setTimeout): void {
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    onReady();
  };
  if (!pixel || pixel.complete) {
    ready();
    return;
  }
  pixel.addEventListener('load', ready, { once: true });
  pixel.addEventListener('error', ready, { once: true });
  setTimer(ready, TICKET_WAIT_MS);
}

// md 뷰어 페이지에서 한 번 부른다
export function setupMdView(): void {
  const pixel = document.querySelector<HTMLImageElement>('img[data-library-ticket]');
  whenTicketReady(pixel, () => {
    releaseDeferredMedia(document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img[data-src], video[data-src]'));
  });
}
