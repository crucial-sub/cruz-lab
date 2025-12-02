// Glow 효과 카드 컴포넌트
// 마우스 위치를 추적하여 radial gradient로 빛나는 효과
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  glowSize?: number;
  glowOpacity?: number;
}

export default function GlowCard({
  children,
  className = '',
  glowColor = '16, 185, 129', // brand color RGB
  glowSize = 350,
  glowOpacity = 0.15,
}: Props) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const handleMouseLeave = () => {
    // 마우스가 떠나면 중앙으로 이동 (자연스러운 fade out)
    mouseX.set(-1000);
    mouseY.set(-1000);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative overflow-hidden ${className}`}
    >
      {/* Glow 효과 레이어 */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              ${glowSize}px circle at ${mouseX}px ${mouseY}px,
              rgba(${glowColor}, ${glowOpacity}),
              transparent 80%
            )
          `,
        }}
      />
      {/* 테두리 glow */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              ${glowSize / 2}px circle at ${mouseX}px ${mouseY}px,
              rgba(${glowColor}, 0.3),
              transparent 70%
            )
          `,
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'xor',
          WebkitMaskComposite: 'xor',
          padding: '1px',
        }}
      />
      {children}
    </motion.div>
  );
}
