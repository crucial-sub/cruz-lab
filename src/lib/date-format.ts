// 공개 페이지 날짜 표기 (재건 4단계 D16)
// - 서울 시각 기준 날짜 YYYY-MM-DD. 서버(Vercel icn1)와 로컬의 시간대가 달라도 같은 값이 나온다.

const SEOUL_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// 날짜 → '2026-11-09' (서울)
export function formatSeoulDate(date: Date): string {
  return SEOUL_DATE.format(date);
}

// 두 시각이 서울 날짜로 같은 날인지
export function isSameSeoulDate(a: Date, b: Date): boolean {
  return formatSeoulDate(a) === formatSeoulDate(b);
}

// 날짜 → '11.09' (서울, 글 목록 행. 연도는 묶음 머리에 쓴다)
export function formatSeoulMonthDay(date: Date): string {
  return formatSeoulDate(date).slice(5).replace('-', '.');
}

// 날짜 → 서울 연도 (예: 2026)
export function seoulYear(date: Date): number {
  return Number(formatSeoulDate(date).slice(0, 4));
}
