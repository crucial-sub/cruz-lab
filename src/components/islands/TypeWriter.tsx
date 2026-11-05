// 타이핑 애니메이션 컴포넌트
// Hero 섹션에서 역할/소개 문구를 순환하며 타이핑 효과 제공
// - 예전: 글자 수가 바뀔 때마다 setState로 React 렌더링을 다시 했다 (타이핑 중 매 프레임).
// - 지금: 글자 수가 바뀔 때만 span의 textContent를 직접 바꾼다. React 렌더링은 일어나지 않는다.
// - 커서 깜빡임은 CSS(caret-blink)로 처리한다.
import { animate, useMotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface Props {
  texts: string[];
  className?: string;
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

export default function TypeWriter({
  texts,
  className = '',
  typingSpeed = 1.5,
  deletingSpeed = 0.5,
  pauseDuration = 2000,
}: Props) {
  const textRef = useRef<HTMLSpanElement>(null);
  const count = useMotionValue(0);

  useEffect(() => {
    let index = 0;
    let lastLength = -1;
    let cancelled = false;
    let stopCurrent: (() => void) | null = null;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;

    // 글자 수가 실제로 바뀐 경우에만 DOM을 고친다
    const unsubscribe = count.on('change', (v) => {
      const length = Math.round(v);
      if (length === lastLength || !textRef.current) return;
      lastLength = length;
      textRef.current.textContent = texts[index]?.slice(0, length) ?? '';
    });

    // 한 문구를 타이핑 → 대기 → 삭제한 뒤 다음 문구로 넘어간다
    const runCycle = () => {
      if (cancelled || !texts[index]) return;
      const typing = animate(count, texts[index].length, { duration: typingSpeed, ease: 'easeInOut' });
      stopCurrent = () => typing.stop();
      typing.then(() => {
        if (cancelled) return;
        pauseTimer = setTimeout(() => {
          const deleting = animate(count, 0, { duration: deletingSpeed });
          stopCurrent = () => deleting.stop();
          deleting.then(() => {
            if (cancelled) return;
            index = (index + 1) % texts.length;
            runCycle();
          });
        }, pauseDuration);
      });
    };
    runCycle();

    return () => {
      cancelled = true;
      stopCurrent?.();
      clearTimeout(pauseTimer);
      unsubscribe();
    };
  }, [texts, typingSpeed, deletingSpeed, pauseDuration, count]);

  return (
    <span className={className}>
      <span ref={textRef} />
      <span aria-hidden="true" className="caret-blink ml-1 inline-block h-[1em] w-[3px] bg-brand align-middle" />
    </span>
  );
}
