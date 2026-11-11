// Server-Timing 헤더 테스트 (재건 5단계 T13, Plan D16·D17)
import { describe, expect, it } from 'vitest';
import { formatServerTiming, ServerTiming } from '@/lib/server/server-timing';

describe('formatServerTiming', () => {
  it('이름·설명·시간(소수 한 자리)을 쉼표로 잇는다', () => {
    expect(
      formatServerTiming([
        { name: 'db', dur: 12.345, desc: 'firestore entry' },
        { name: 'md', dur: 3 },
      ]),
    ).toBe('db;desc="firestore entry";dur=12.3, md;dur=3.0');
  });

  it('설명의 ASCII 밖 글자는 ?로, 따옴표·역슬래시는 뺀다(헤더 값이 깨지지 않게)', () => {
    expect(formatServerTiming([{ name: 'a', dur: 1, desc: '글 "x"\\y' }])).toBe('a;desc="? xy";dur=1.0');
  });

  it('토큰이 아닌 이름은 그 항목만 뺀다', () => {
    expect(formatServerTiming([{ name: 'bad name', dur: 1 }, { name: 'ok-1_a', dur: 2 }])).toBe('ok-1_a;dur=2.0');
  });

  it('음수·NaN 시간은 0이다', () => {
    expect(formatServerTiming([{ name: 'a', dur: -5 }, { name: 'b', dur: Number.NaN }])).toBe('a;dur=0.0, b;dur=0.0');
  });

  it('dur가 없으면 쓰지 않는다', () => {
    expect(formatServerTiming([{ name: 'inst', desc: 'req 1 age 4.0s' }])).toBe('inst;desc="req 1 age 4.0s"');
  });

  it('결과는 Headers가 받는 값이다', () => {
    const header = formatServerTiming([{ name: 'a', dur: 1, desc: '한글' }]);
    expect(() => new Headers({ 'Server-Timing': header })).not.toThrow();
  });
});

describe('ServerTiming', () => {
  it('measure·measureSync는 실패해도 걸린 시간을 남긴다', async () => {
    const timing = new ServerTiming();
    await expect(
      timing.measure('db', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(() =>
      timing.measureSync('md', () => {
        throw new Error('y');
      }),
    ).toThrow('y');
    expect(timing.metrics.map((metric) => metric.name)).toEqual(['db', 'md']);
  });

  it('값을 돌려주고 header에 total·inst를 붙인다', async () => {
    const timing = new ServerTiming();
    expect(await timing.measure('db', async () => 7, 'firestore')).toBe(7);
    expect(timing.measureSync('md', () => 'html')).toBe('html');
    const header = timing.header();
    expect(header).toMatch(
      /^db;desc="firestore";dur=[\d.]+, md;dur=[\d.]+, total;dur=[\d.]+, inst;desc="req \d+ age [\d.]+s"$/,
    );
  });

  it('inst의 req는 이 인스턴스에서 만든 측정 순서다', () => {
    const first = new ServerTiming().header().match(/req (\d+)/)?.[1];
    const second = new ServerTiming().header().match(/req (\d+)/)?.[1];
    expect(Number(second)).toBe(Number(first) + 1);
  });
});
