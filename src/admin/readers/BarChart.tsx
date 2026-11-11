// 날짜별 막대 (재건 5단계 D20)
// - 의존성 없이 div 막대로 그린다. 30·90일 모두 폭에 맞춰 늘거나 준다(390px에서 90칸이면 칸 하나가 약 3px).
// - 막대마다 title(날짜 · 값). 화면 읽기 프로그램에는 합계·가장 많은 날을 한 문장으로 읽힌다(role="img").
//   날짜별 값은 아래 "날짜별 값 보기"(details 안 표)로도 읽는다(터치 화면·키보드·화면 읽기 프로그램).
// - 0인 날은 바닥에 1px 선만 보인다(빈 날과 칸 자리를 구별한다).
// - 막대 색은 brand-hover(#059669)다. 라이트 배경(흰색)과 3:1이 넘는다(brand #10b981은 약 2.5:1).

import { countText, shortDayText } from './readers-api';

export interface BarPoint {
  day: string;
  value: number;
}

export function BarChart({
  points,
  label,
  unit = '방문',
}: {
  points: BarPoint[];
  label: string;
  unit?: string;
}) {
  const max = points.reduce((top, point) => Math.max(top, point.value), 0);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.find((point) => point.value === max && max > 0);
  const summary = peak
    ? `${label}: ${points.length}일 합계 ${countText(total)}, 가장 많은 날 ${shortDayText(peak.day)} ${countText(max)}`
    : `${label}: ${points.length}일 동안 기록이 없습니다`;
  const first = points[0]?.day;
  const last = points[points.length - 1]?.day;

  return (
    <figure className="m-0">
      <div className="flex items-baseline justify-between text-xs text-text-secondary">
        <span>
          {label} · 가장 많은 날 {countText(max)}
        </span>
        <span>합계 {countText(total)}</span>
      </div>
      <div
        role="img"
        aria-label={summary}
        className="mt-2 flex h-32 items-end gap-px border-b border-border"
      >
        {points.map((point) => (
          <div
            key={point.day}
            title={`${shortDayText(point.day)} · ${unit} ${countText(point.value)}`}
            className="min-w-0 flex-1 rounded-t-sm bg-brand-hover hover:bg-brand"
            style={{
              height:
                max > 0 && point.value > 0 ? `${Math.max(4, (point.value / max) * 100)}%` : '1px',
            }}
          />
        ))}
      </div>
      {first && last && (
        <figcaption className="mt-1 flex justify-between text-xs text-text-secondary">
          <span>{shortDayText(first)}</span>
          <span>{shortDayText(last)}</span>
        </figcaption>
      )}
      <details className="mt-2 text-xs text-text-secondary">
        <summary className="cursor-pointer">날짜별 값 보기</summary>
        <table className="mt-2 w-full max-w-xs tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="py-0.5 text-left font-medium">
                날짜
              </th>
              <th scope="col" className="py-0.5 text-right font-medium">
                {unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.day}>
                <td className="py-0.5">{shortDayText(point.day)}</td>
                <td className="py-0.5 text-right text-text-primary">{countText(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
