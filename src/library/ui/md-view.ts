// md 뷰어 보조 스크립트 (서가 1단계 T7, Plan J12)
// - 본문의 문서 그림·영상은 주소가 data-src에 있다(render-md.ts). 그림 요청에 문서 쿠키가 실려야 하기 때문이다.
// - 페이지 맨 앞의 입장권 그림({문서 출처}/d/_open?t=…&pixel=1)이 문서 쿠키를 준다. 그 그림이 끝난 뒤 src로 옮긴다.
//   그림이 실패하거나 3초 넘게 걸려도 옮긴다. 쿠키가 이미 있으면(12시간 안에 연 문서) 그림이 그대로 열린다.
// - 코드 복사·목차 위치 표시는 블로그 글 상세 스크립트(post-scripts.ts)를 그대로 쓴다.
// - DOM 타입 대신 작은 꼴(TicketPixel, DeferredMedia)을 받는다. 단위 테스트가 가짜로 시험한다.

// 입장권 그림을 기다리는 최대 시간
export const TICKET_WAIT_MS = 3000;

// 글자 크기 (서가 2단계 J35): 5단계(%), 기기마다 localStorage에 둔다
// - 머리 안 인라인 스크립트(MdView.astro)가 그리기 전에 같은 값을 읽어 --library-font-scale을 정한다.
export const FONT_SCALES = [90, 100, 112, 125, 140] as const;
export const FONT_SCALE_KEY = 'cruz-library:font-scale';

// 저장된 값 → 글자 크기(%). 5단계 값이 아니면 100
export function parseFontScale(value: string | null): number {
  const scale = FONT_SCALES.find((step) => String(step) === value);
  return scale ?? 100;
}

// data-src·data-poster를 가진 그림·영상·소리·source (HTMLImageElement, HTMLVideoElement, HTMLAudioElement,
// HTMLSourceElement가 이 꼴이다. poster는 영상만 가진다)
export interface DeferredMedia {
  src: string;
  poster?: string;
  dataset: Record<string, string | undefined>;
}

// load()로 주소를 다시 고르는 영상·소리 (HTMLMediaElement가 이 꼴이다)
interface ReloadableMedia {
  load(): void;
}

// 입장권 그림 (HTMLImageElement가 이 꼴이다)
export interface TicketPixel {
  complete: boolean;
  addEventListener(type: 'load' | 'error', listener: () => void, options?: { once?: boolean }): void;
}

type SetTimer = (fn: () => void, ms: number) => unknown;

// data-src를 src로, data-poster를 poster로 옮긴다. 옮긴 속성 수를 돌려준다
export function releaseDeferredMedia(elements: Iterable<DeferredMedia>): number {
  let count = 0;
  for (const element of elements) {
    const { src, poster } = element.dataset;
    if (src) {
      element.src = src;
      delete element.dataset.src;
      count += 1;
    }
    if (poster) {
      element.poster = poster;
      delete element.dataset.poster;
      count += 1;
    }
  }
  return count;
}

function isReloadableMedia(value: unknown): value is ReloadableMedia {
  return typeof value === 'object' && value !== null && typeof (value as ReloadableMedia).load === 'function';
}

// 주소를 옮긴 source의 부모 영상·소리를 한 번씩 load()한다. load()한 수를 돌려준다
// - 이미 문서에 있는 source의 src를 바꿔도 브라우저는 주소를 다시 고르지 않는다(HTML 미디어 자원 고르기 규칙).
export function reloadMediaOf(sources: Iterable<{ parentElement: unknown }>): number {
  const parents = new Set<ReloadableMedia>();
  for (const source of sources) {
    if (isReloadableMedia(source.parentElement)) parents.add(source.parentElement);
  }
  for (const parent of parents) parent.load();
  return parents.size;
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

// localStorage 읽기·쓰기. 막힌 브라우저(개인 정보 보호 등)에서는 조용히 넘어간다
function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장하지 못해도 이 화면에서는 바뀐 크기로 보인다
  }
}

// 글자 크기를 화면에 적용하고 단추의 눌림 표시를 맞춘다 (J35)
function applyFontScale(scale: number): void {
  document.documentElement.style.setProperty('--library-font-scale', String(scale / 100));
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-font-scale]')) {
    button.setAttribute('aria-pressed', button.dataset.fontScale === String(scale) ? 'true' : 'false');
  }
}

// "가" 글자 크기 차림 (J35): 고르면 이 기기에 저장하고 차림을 닫는다. 차림 밖을 누르면 닫는다
function setupFontMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('details[data-font-menu]');
  if (!menu) return;
  applyFontScale(parseFontScale(readLocal(FONT_SCALE_KEY)));
  menu.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-font-scale]');
    if (!button) return;
    const scale = parseFontScale(button.dataset.fontScale ?? null);
    applyFontScale(scale);
    writeLocal(FONT_SCALE_KEY, String(scale));
    menu.open = false;
  });
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
}

// 머리줄 고정 단추 (J34): 고정 API를 부르고 단추 글을 바꾼다. 로그아웃이면 로그인 화면으로 보낸다
function setupPinButton(): void {
  const button = document.querySelector<HTMLButtonElement>('button[data-md-pin]');
  if (!button) return;
  button.addEventListener('click', async () => {
    const pinned = button.getAttribute('aria-pressed') === 'true';
    button.disabled = true;
    try {
      const response = await fetch(`/api/admin/library/docs/${encodeURIComponent(button.dataset.mdPin ?? '')}/pin`, {
        method: pinned ? 'DELETE' : 'PUT',
        credentials: 'same-origin',
      });
      if (response.status === 401) {
        window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(`요청이 실패했습니다 (${response.status}).`);
      button.setAttribute('aria-pressed', pinned ? 'false' : 'true');
      button.textContent = pinned ? '고정' : '고정 풀기';
    } catch (error) {
      window.alert(`${pinned ? '고정을 풀지' : '고정하지'} 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      button.disabled = false;
    }
  });
}

// md 뷰어 페이지에서 한 번 부른다
export function setupMdView(): void {
  setupFontMenu();
  setupPinButton();
  const pixel = document.querySelector<HTMLImageElement>('img[data-library-ticket]');
  whenTicketReady(pixel, () => {
    releaseDeferredMedia(
      document.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>(
        'img[data-src], video[data-src], video[data-poster], audio[data-src]',
      ),
    );
    // 영상·소리 안의 source: 주소를 옮긴 뒤 부모를 load()한다
    const sources = [
      ...document.querySelectorAll<HTMLSourceElement>('video > source[data-src], audio > source[data-src]'),
    ];
    releaseDeferredMedia(sources);
    reloadMediaOf(sources);
  });
}
