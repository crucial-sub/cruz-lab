// 3D 틸트 카드 컴포넌트
// 마우스 위치에 따라 카드가 3D로 기울어지는 효과
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  tiltAmount?: number;
  perspective?: number;
}

export default function TiltCard({
  children,
  className = '',
  tiltAmount = 10,
  perspective = 1000,
}: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // 스프링으로 부드러운 움직임
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  // 마우스 위치를 회전 각도로 변환
  const rotateX = useTransform(
    mouseYSpring,
    [-0.5, 0.5],
    [`${tiltAmount}deg`, `-${tiltAmount}deg`]
  );
  const rotateY = useTransform(
    mouseXSpring,
    [-0.5, 0.5],
    [`-${tiltAmount}deg`, `${tiltAmount}deg`]
  );

  // 기울지 않는 바깥 래퍼의 사각형으로 포인터 위치를 잰다
  // - 예전에는 기울어진 요소 자신을 쟀다. 기울수록 사각형이 바뀌어 값이 흔들렸다.
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    // 원래 위치로 복귀
    x.set(0);
    y.set(0);
  };

  // perspective는 기우는 요소의 부모에 있어야 원근이 생긴다
  // - 예전에는 기우는 요소 자신에 있어 원근 없이 납작하게 기울었다 (대각선 방향이 반대로 보이는 원인).
  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: `${perspective}px` }}
      className={className}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="h-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
