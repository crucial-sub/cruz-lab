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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // -0.5 ~ 0.5 범위로 정규화
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    // 원래 위치로 복귀
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: `${perspective}px`,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
