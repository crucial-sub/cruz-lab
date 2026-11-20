// md 뷰어 보조 스크립트 테스트 (서가 1단계 T7, Plan J12)
// - 본문의 문서 그림·영상은 data-src에 주소가 있다. 입장권 그림이 끝난 뒤(성공·실패·시간 초과) src로 옮긴다.
// - DOM 없이 시험한다. 요소와 타이머는 가짜다.
import { describe, expect, it } from 'vitest';
import {
  FONT_SCALES,
  mdMetaLine,
  parseFontScale,
  releaseDeferredMedia,
  reloadMediaOf,
  whenTicketReady,
  type TicketPixel,
} from '@/library/ui/md-view';

function media(src?: string) {
  return { src: '', dataset: (src === undefined ? {} : { src }) as Record<string, string | undefined> };
}

// PR #36 리뷰(Codex): 영상의 poster, 영상·소리 안의 <source>
describe('poster와 <source>', () => {
  it('data-poster를 poster로 옮기고 data-poster를 지운다', () => {
    const video = { src: '', poster: '', dataset: { poster: 'https://raw.example/d/x/c.jpg' } as Record<string, string | undefined> };
    expect(releaseDeferredMedia([video])).toBe(1);
    expect(video.poster).toBe('https://raw.example/d/x/c.jpg');
    expect(video.dataset.poster).toBeUndefined();
    expect(video.src).toBe('');
  });

  it('주소를 옮긴 <source>의 영상·소리를 한 번씩 load()한다(source의 src만 바꾸면 브라우저가 다시 고르지 않는다)', () => {
    let loads = 0;
    const video = { load: () => (loads += 1) };
    const sources = [{ parentElement: video }, { parentElement: video }, { parentElement: null }, { parentElement: {} }];
    expect(reloadMediaOf(sources)).toBe(1);
    expect(loads).toBe(1);
  });
});

describe('releaseDeferredMedia', () => {
  it('data-src를 src로 옮기고 data-src를 지운다', () => {
    const a = media('https://raw.example/d/x/a.png');
    const b = media('https://raw.example/d/x/b.mp4');
    expect(releaseDeferredMedia([a, b])).toBe(2);
    expect(a.src).toBe('https://raw.example/d/x/a.png');
    expect(b.src).toBe('https://raw.example/d/x/b.mp4');
    expect(a.dataset.src).toBeUndefined();
  });

  it('data-src가 없는 요소는 건드리지 않는다', () => {
    const a = media();
    a.src = 'https://cdn.example/a.png';
    expect(releaseDeferredMedia([a])).toBe(0);
    expect(a.src).toBe('https://cdn.example/a.png');
  });
});

// 가짜 입장권 그림: 사건을 손으로 일으킨다
function pixel(complete = false) {
  const listeners = new Map<string, () => void>();
  const value: TicketPixel = {
    complete,
    addEventListener: (type, listener) => {
      listeners.set(type, listener);
    },
  };
  return { value, fire: (type: 'load' | 'error') => listeners.get(type)?.() };
}

// 가짜 타이머: 부른 함수를 모아 두었다가 손으로 돌린다
function timers() {
  const pending: Array<{ fn: () => void; ms: number }> = [];
  return {
    set: (fn: () => void, ms: number) => {
      pending.push({ fn, ms });
      return 0;
    },
    run: () => pending.forEach((timer) => timer.fn()),
    pending,
  };
}

describe('whenTicketReady', () => {
  it('입장권 그림이 이미 끝났거나 없으면 바로 부른다', () => {
    for (const p of [pixel(true).value, null]) {
      let calls = 0;
      whenTicketReady(p, () => (calls += 1), timers().set);
      expect(calls).toBe(1);
    }
  });

  it('입장권 그림을 다 받으면 부른다', () => {
    const p = pixel();
    const t = timers();
    let calls = 0;
    whenTicketReady(p.value, () => (calls += 1), t.set);
    expect(calls).toBe(0);
    p.fire('load');
    expect(calls).toBe(1);
  });

  it('입장권 그림이 실패해도 부른다(쿠키가 이미 있으면 그림이 열린다)', () => {
    const p = pixel();
    let calls = 0;
    whenTicketReady(p.value, () => (calls += 1), timers().set);
    p.fire('error');
    expect(calls).toBe(1);
  });

  it('입장권 그림이 늦으면 3초 뒤에 부른다. 그 뒤 사건이 와도 다시 부르지 않는다', () => {
    const p = pixel();
    const t = timers();
    let calls = 0;
    whenTicketReady(p.value, () => (calls += 1), t.set);
    expect(t.pending.map((timer) => timer.ms)).toEqual([3000]);
    t.run();
    p.fire('load');
    expect(calls).toBe(1);
  });
});

// 서가 2단계 T4: 글자 크기 (Plan J35). 기기마다 localStorage에 5단계 중 하나를 둔다
describe('parseFontScale', () => {
  it('5단계 값만 받는다. 없거나 틀리면 100이다', () => {
    expect(FONT_SCALES).toEqual([90, 100, 112, 125, 140]);
    for (const scale of FONT_SCALES) expect(parseFontScale(String(scale))).toBe(scale);
    for (const value of [null, '', 'abc', '113', '1e2', ' 112']) expect(parseFontScale(value)).toBe(100);
  });
});

// T12 의견 4 (사용자 결정 2026-11-20): 문서 하나 공유의 md 화면에는 프로젝트 이름(맥 폴더 이름, desktop, other)을 보이지 않는다.
// 묶음 공유는 프로젝트가 공유 범위 이름이므로 그대로 둔다.
describe('mdMetaLine: 제목 위의 "프로젝트 · 날짜" 줄', () => {
  const doc = { project: 'cruz-lab-docs', docDate: '2026-11-19' };

  it('관리자 화면과 묶음 공유는 프로젝트 · 날짜', () => {
    expect(mdMetaLine(doc)).toBe('cruz-lab-docs · 2026-11-19');
    expect(mdMetaLine(doc, { bundle: true })).toBe('cruz-lab-docs · 2026-11-19');
  });

  it('문서 하나 공유는 날짜만', () => {
    expect(mdMetaLine(doc, { bundle: false })).toBe('2026-11-19');
  });

  it('값이 없으면 뺀다', () => {
    expect(mdMetaLine({ project: '', docDate: null })).toBe('');
    expect(mdMetaLine({ project: 'other', docDate: null }, { bundle: false })).toBe('');
  });
});
