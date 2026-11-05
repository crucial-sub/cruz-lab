import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Props {
  size?: number;
  color?: string;
  trailSize?: number;
  trailColor?: string;
}

// 호버 효과를 줄 요소 선택자
const HOVERABLE_SELECTOR = 'a, button, [role="button"], label, summary, .cursor-pointer';

/**
 * CursorFollower - 커스텀 커서와 트레일 효과
 * 마우스를 따라다니는 원형 커서와 지연되는 트레일
 *
 * 성능 관련 변경
 * - mouseover마다 getComputedStyle()을 부르지 않는다. 스타일 재계산을 강제하기 때문이다.
 *   대신 closest()로 링크/버튼만 확인한다.
 * - mix-blend-mode: difference를 쓰지 않는다. 화면 전체와 섞는 합성을 매 프레임 하게 만든다.
 * - 크기는 width/height가 아니라 scale로 바꾼다. width/height는 Layout을 다시 하게 만든다.
 * - 상태(state)는 값이 바뀔 때만 바꾼다.
 */
export default function CursorFollower({
  size = 12,
  color = 'var(--color-brand)',
  trailSize = 32,
  trailColor = 'rgba(139, 92, 246, 0.25)',
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // 메인 커서 위치
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  // 트레일 커서 (부드럽게 따라옴)
  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const trailX = useSpring(cursorX, springConfig);
  const trailY = useSpring(cursorY, springConfig);

  useEffect(() => {
    // 마우스가 없는 기기(터치)에서는 켜지 않는다
    if (!window.matchMedia('(pointer: fine)').matches) return;
    setEnabled(true);

    let visible = false;
    let hovering = false;

    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      if (!visible) {
        visible = true;
        setIsVisible(true);
      }
    };

    const handleMouseLeave = () => {
      visible = false;
      setIsVisible(false);
    };

    // 호버 가능한 요소 감지 (값이 바뀔 때만 렌더링)
    const handleElementHover = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const next = Boolean(target?.closest?.(HOVERABLE_SELECTOR));
      if (next !== hovering) {
        hovering = next;
        setIsHovering(next);
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseover', handleElementHover, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseover', handleElementHover);
    };
  }, [cursorX, cursorY]);

  if (!enabled) return null;

  return (
    <>
      {/* 트레일 (큰 원) */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[9999] rounded-full"
        style={{
          x: trailX,
          y: trailY,
          width: trailSize,
          height: trailSize,
          marginLeft: -trailSize / 2,
          marginTop: -trailSize / 2,
          backgroundColor: trailColor,
        }}
        animate={{ scale: isHovering ? 1.8 : 1, opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* 메인 커서 (작은 점) */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[10000] rounded-full"
        style={{
          x: cursorX,
          y: cursorY,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          backgroundColor: color,
        }}
        animate={{ scale: isHovering ? 0.5 : 1, opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      />
    </>
  );
}
