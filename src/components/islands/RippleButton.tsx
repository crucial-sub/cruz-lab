import { motion, AnimatePresence } from 'framer-motion';
import { useState, type ReactNode, type MouseEvent } from 'react';

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface Props {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  rippleColor?: string;
}

/**
 * RippleButton - 클릭 시 물결 효과가 퍼지는 버튼
 * Material Design 스타일의 리플 이펙트
 */
export default function RippleButton({
  children,
  className = '',
  href,
  onClick,
  rippleColor = 'rgba(255, 255, 255, 0.4)'
}: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const createRipple = (e: MouseEvent<HTMLElement>) => {
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();

    // 클릭 위치 계산
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 리플 크기 (버튼의 대각선 길이의 2배)
    const size = Math.max(rect.width, rect.height) * 2;

    const newRipple: Ripple = {
      id: Date.now(),
      x: x - size / 2,
      y: y - size / 2,
      size
    };

    setRipples((prev) => [...prev, newRipple]);

    // 애니메이션 완료 후 리플 제거
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  };

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    createRipple(e);
    onClick?.();
  };

  // className에서 flex 관련 클래스 추출하여 inner span에 적용
  const flexClasses = className
    .split(' ')
    .filter(c => c.includes('flex') || c.includes('items-') || c.includes('gap-') || c.includes('justify-') || c.includes('whitespace-'))
    .join(' ');

  const buttonContent = (
    <>
      <span className={`relative z-10 ${flexClasses}`}>{children}</span>
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
              backgroundColor: rippleColor
            }}
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </>
  );

  const baseClass = `relative overflow-hidden ${className}`;

  if (href) {
    return (
      <a href={href} className={baseClass} onClick={createRipple}>
        {buttonContent}
      </a>
    );
  }

  return (
    <button className={baseClass} onClick={handleClick}>
      {buttonContent}
    </button>
  );
}
