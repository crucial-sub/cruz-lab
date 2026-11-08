// 소스 모드 (재건 3단계 D8)
// - <textarea>, 모노스페이스, 내용에 맞춰 높이가 늘어난다. CodeMirror를 쓰지 않는다.
// - 편집 모드로 돌아갈 때 EditorApp이 다시 파싱한다. 지원하지 않는 HTML은 경고 목록으로 보인다.

import { useEffect, useRef } from 'react';

export function SourceMode({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 높이를 내용에 맞춘다
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.max(element.scrollHeight, 320)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="w-full resize-none rounded-md border border-border bg-bg-surface p-4 font-mono text-sm leading-6 text-text-primary focus:border-brand focus:outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      aria-label="마크다운 소스"
    />
  );
}
