// Server-Timing 응답 헤더 (재건 5단계 T13, Plan D16·D17)
// - 요청 하나의 단계별 시간을 모아 헤더 한 줄로 쓴다. 콜드 요청이 어디서 느린지 미리보기·운영에서 나눠 본다.
// - 항목 이름은 토큰(영문·숫자·-·_)이다. 설명(desc)은 ASCII만 쓴다. 헤더 값에 한글이 있으면 Headers가 거부한다.
// - total은 이 측정을 만든 때부터 헤더를 쓸 때까지다. 페이지 모듈을 처음 읽는 시간은 들어가지 않는다
//   (Astro가 페이지 모듈을 읽은 뒤에 페이지 코드가 돈다).
// - inst는 이 인스턴스의 상태다. desc에 이 인스턴스에서 몇 번째 측정인지(req 1이면 첫 측정)와 프로세스 나이(초)를
//   쓴다(예: "req 1 age 4.0s"). 콜드 요청인지 데운 요청인지 구별한다. dur는 쓰지 않는다(요청 안의 시간이 아니다, 리뷰 S4).
// - 병렬로 기다리는 항목(render·adj·series, assets·hl, imp-satori·imp-resvg·font)은 더하지 않는다.
//   같은 스레드라 CPU 단계가 다른 항목의 벽시계 시간을 늘린다.
// - 응답은 CDN이 저장한다. 저장본의 헤더는 처음 그린 요청의 값이다. 잴 때는 쿼리를 붙여 CDN을 건너뛴다.

export const SERVER_TIMING_HEADER = 'Server-Timing';

export interface TimingMetric {
  name: string;
  // 없으면 dur를 쓰지 않는다(inst)
  dur?: number;
  desc?: string;
}

const METRIC_NAME = /^[A-Za-z0-9_-]+$/;

// 설명 글자: 출력 가능한 ASCII만 남기고 따옴표·역슬래시는 뺀다(quoted-string 안)
function cleanDesc(desc: string): string {
  return desc.replace(/[^\x20-\x7e]/g, '?').replace(/["\\]/g, '');
}

// 항목 목록 → 헤더 값. 이름이 토큰이 아니면 그 항목을 뺀다(헤더 전체를 깨뜨리지 않는다)
export function formatServerTiming(metrics: readonly TimingMetric[]): string {
  return metrics
    .filter((metric) => METRIC_NAME.test(metric.name))
    .map((metric) => {
      const desc = metric.desc ? `;desc="${cleanDesc(metric.desc)}"` : '';
      if (metric.dur === undefined) return `${metric.name}${desc}`;
      const dur = Number.isFinite(metric.dur) ? Math.max(0, metric.dur) : 0;
      return `${metric.name}${desc};dur=${dur.toFixed(1)}`;
    })
    .join(', ');
}

// 이 인스턴스에서 만든 측정 수 (inst 항목의 desc)
let measuredInInstance = 0;

// 프로세스 나이(초, 소수 한 자리). Node가 아니면 0
function processAgeSeconds(): string {
  const seconds = typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() : 0;
  return seconds.toFixed(1);
}

// 요청 하나의 측정
export class ServerTiming {
  readonly metrics: TimingMetric[] = [];
  private readonly startedAt: number;
  private readonly sequence: number;

  constructor() {
    this.startedAt = performance.now();
    measuredInInstance += 1;
    this.sequence = measuredInInstance;
  }

  // 이미 잰 시간을 더한다
  add(name: string, dur: number, desc?: string) {
    this.metrics.push(desc ? { name, dur, desc } : { name, dur });
  }

  // 비동기 단계를 잰다. 실패해도 걸린 시간을 남긴다
  async measure<T>(name: string, run: () => Promise<T>, desc?: string): Promise<T> {
    const start = performance.now();
    try {
      return await run();
    } finally {
      this.add(name, performance.now() - start, desc);
    }
  }

  // 동기 단계를 잰다
  measureSync<T>(name: string, run: () => T, desc?: string): T {
    const start = performance.now();
    try {
      return run();
    } finally {
      this.add(name, performance.now() - start, desc);
    }
  }

  // 헤더 값: 모은 항목 + total + inst
  header(): string {
    return formatServerTiming([
      ...this.metrics,
      { name: 'total', dur: performance.now() - this.startedAt },
      { name: 'inst', desc: `req ${this.sequence} age ${processAgeSeconds()}s` },
    ]);
  }
}
