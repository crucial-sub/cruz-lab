// 개요·글자 수·읽기 시간 (재건 3단계 D13 메타 패널)
// - 요약은 EditorApp이 입력을 300ms 디바운스한 뒤 만든다(state/summary.ts).
// - 제목을 누르면 그 제목으로 간다(onJump). 들여쓰기는 제목 단계를 따른다.

import type { DocSummary } from '@/editor/state/summary';

export function Outline({
  summary,
  onJump,
}: {
  summary: DocSummary;
  onJump: (index: number) => void;
}) {
  const minLevel = Math.min(...summary.outline.map((item) => item.level), 6);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold text-text-secondary">개요</div>
        {summary.outline.length === 0 ? (
          <p className="text-text-secondary/70 text-xs">제목이 없습니다.</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {summary.outline.map((item) => (
              <li key={item.index} style={{ paddingLeft: `${(item.level - minLevel) * 12}px` }}>
                <button
                  type="button"
                  className="w-full truncate text-left text-text-secondary hover:text-text-primary"
                  onClick={() => onJump(item.index)}
                >
                  {item.text || '(빈 제목)'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-text-secondary">
        글자 {summary.characters.withSpaces.toLocaleString('ko-KR')}자 · 공백 제외{' '}
        {summary.characters.withoutSpaces.toLocaleString('ko-KR')}자 · {summary.readingMinutes}분
        읽기
      </p>
    </div>
  );
}
