// md 뷰어 보조 스크립트 테스트 (서가 1단계 T7, Plan J12)
// - 본문의 문서 그림·영상은 data-src에 주소가 있다. 입장권 그림이 끝난 뒤(성공·실패·시간 초과) src로 옮긴다.
// - DOM 없이 시험한다. 요소와 타이머는 가짜다.
import { describe, expect, it } from 'vitest';
import { releaseDeferredMedia, whenTicketReady, type TicketPixel } from '@/library/ui/md-view';

function media(src?: string) {
  return { src: '', dataset: (src === undefined ? {} : { src }) as Record<string, string | undefined> };
}

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
