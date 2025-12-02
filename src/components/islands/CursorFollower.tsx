import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Props {
  size?: number;
  color?: string;
  trailSize?: number;
  trailColor?: string;
}

/**
 * CursorFollower - 커스텀 커서와 트레일 효과
 * 마우스를 따라다니는 원형 커서와 지연되는 트레일
 */
export default function CursorFollower({
  size = 12,
  color = 'var(--color-brand)',
  trailSize = 32,
  trailColor = 'rgba(139, 92, 246, 0.3)'
}: Props) {
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
    // 모바일 기기에서는 표시하지 않음
    if (window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    const handleMouseEnter = () => {
      setIsVisible(true);
    };

    // 호버 가능한 요소 감지
    const handleElementHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isHoverable =
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.closest('a') ||
        target.closest('button') ||
        target.closest('[role="button"]') ||
        window.getComputedStyle(target).cursor === 'pointer';

      setIsHovering(isHoverable);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mouseover', handleElementHover);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseover', handleElementHover);
    };
  }, [cursorX, cursorY]);

  // 모바일에서는 렌더링하지 않음
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
    return null;
  }

  return (
    <>
      {/* 트레일 (큰 원) */}
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[9999] rounded-full mix-blend-difference"
        style={{
          x: trailX,
          y: trailY,
          width: isHovering ? trailSize * 1.5 : trailSize,
          height: isHovering ? trailSize * 1.5 : trailSize,
          backgroundColor: trailColor,
          translateX: '-50%',
          translateY: '-50%',
          opacity: isVisible ? 1 : 0
        }}
        animate={{
          scale: isHovering ? 1.2 : 1
        }}
        transition={{ duration: 0.2 }}
      />

      {/* 메인 커서 (작은 점) */}
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[10000] rounded-full"
        style={{
          x: cursorX,
          y: cursorY,
          width: isHovering ? size * 0.5 : size,
          height: isHovering ? size * 0.5 : size,
          backgroundColor: color,
          translateX: '-50%',
          translateY: '-50%',
          opacity: isVisible ? 1 : 0
        }}
        transition={{ duration: 0.1 }}
      />
    </>
  );
}
