// 글 상세 보조 스크립트 (재건 4단계 D16, D9)
// - 코드 복사: 코드 블록 틀(rehype-shiki)의 숨은 복사 버튼을 보이고, 누르면 코드를 클립보드에 넣는다.
// - 제목 앵커: 누르면 그 제목으로 가고(기본 동작) 주소를 클립보드에 넣는다.
// - 목차 스크롤 스파이: 화면 위쪽 기준선(120px)을 지난 마지막 제목의 목차 항목에 aria-current="location"을 둔다.
// - JS가 없어도 글은 읽힌다. 복사 버튼은 숨은 채이고, 앵커와 목차는 보통 링크다.
// - 4단계 PR-A 동안은 ClientRouter(ViewTransitions)가 남아 있다. 페이지를 바꿔도 이 모듈은 다시 돌지 않으므로
//   astro:page-load에서 다시 붙인다. 문서 단위 클릭 처리는 한 번만 붙인다(PR-B가 ClientRouter를 지운다).

const COPIED_MS = 2000;
// 이 줄(화면 위에서 px)을 지난 제목을 "현재"로 본다
const SPY_OFFSET_PX = 120;

let documentBound = false;
// 지금 붙어 있는 스크롤 스파이를 떼는 함수 (페이지가 바뀌면 다시 붙인다)
let stopScrollSpy: (() => void) | null = null;

// 화면 읽기 프로그램에 알린다 (글 상세의 role="status" 요소)
function announce(message: string) {
  const status = document.querySelector<HTMLElement>('[data-post-status]');
  if (!status) return;
  status.textContent = '';
  // 같은 문구를 다시 읽게 비웠다가 넣는다
  window.setTimeout(() => {
    status.textContent = message;
  }, 50);
}

// 클립보드 API가 없거나 권한이 거부되면(일부 내장 브라우저·iframe) 숨은 textarea + execCommand('copy')로 한 번 더 해 본다
function copyWithSelection(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.append(textarea);
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  previousFocus?.focus({ preventScroll: true });
  return copied;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 대체 경로로 간다
  }
  return copyWithSelection(text);
}

async function copyCode(button: HTMLButtonElement) {
  const code = button.closest('figure.code-block')?.querySelector('pre code');
  if (!code) return;
  const copied = await writeClipboard(code.textContent ?? '');
  const label = button.dataset.label ?? button.textContent ?? '복사';
  button.dataset.label = label;
  button.dataset.state = copied ? 'copied' : 'failed';
  button.textContent = copied ? '복사됨' : '복사 실패';
  announce(copied ? '코드를 복사했습니다' : '코드를 복사하지 못했습니다');
  window.setTimeout(() => {
    button.textContent = label;
    delete button.dataset.state;
  }, COPIED_MS);
}

async function copyAnchor(anchor: HTMLAnchorElement) {
  const copied = await writeClipboard(anchor.href);
  if (copied) announce('제목 링크를 복사했습니다');
}

// 문서 단위 클릭 처리 (이벤트 위임, 한 번만)
function bindDocument() {
  if (documentBound) return;
  documentBound = true;
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('button.code-copy');
    if (button) {
      void copyCode(button);
      return;
    }
    const anchor = target?.closest<HTMLAnchorElement>('a.heading-anchor');
    // 기본 동작(그 제목으로 이동)은 막지 않는다
    if (anchor) void copyAnchor(anchor);
  });
}

// 복사 버튼을 보인다 (JS가 돌 때만. 클립보드 API가 없어도 대체 경로가 있다)
function revealCopyButtons() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('button.code-copy[hidden]')) {
    button.hidden = false;
  }
}

// 목차 항목과 본문 제목을 짝 짓고 현재 항목을 표시한다
// - 스크롤마다 다음 프레임에 한 번 계산한다(passive). IntersectionObserver만 쓰면 한 번에 멀리 건너뛰는 이동
//   (목차 클릭, End 키)에서 콜백이 오지 않아 강조가 낡는다(4단계 리뷰 경미 8).
// - 문서 끝에 닿으면 마지막 제목이다(끝 절이 짧으면 그 제목이 기준선까지 올라오지 못한다).
function startScrollSpy() {
  stopScrollSpy?.();
  stopScrollSpy = null;
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-toc-link]')];
  if (links.length === 0) return;
  const ids = [...new Set(links.map((link) => link.dataset.tocLink ?? ''))];
  const headings = ids
    .map((id) => document.getElementById(id))
    .filter((heading): heading is HTMLElement => heading !== null);
  if (headings.length === 0) return;

  let frame = 0;
  const update = () => {
    frame = 0;
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let current = headings[0];
    if (atEnd) {
      current = headings[headings.length - 1];
    } else {
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= SPY_OFFSET_PX) current = heading;
        else break;
      }
    }
    for (const link of links) {
      if (link.dataset.tocLink === current.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  stopScrollSpy = () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame) window.cancelAnimationFrame(frame);
  };
  schedule();
}

function enhance() {
  revealCopyButtons();
  startScrollSpy();
}

export function setupPostPage() {
  bindDocument();
  enhance();
  // ClientRouter가 페이지를 바꾼 뒤에도 다시 붙인다 (PR-B에서 ClientRouter를 지우면 이 이벤트는 오지 않는다)
  document.addEventListener('astro:page-load', enhance);
}
