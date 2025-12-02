// 타이핑 애니메이션 컴포넌트
// Hero 섹션에서 역할/소개 문구를 순환하며 타이핑 효과 제공
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useState } from 'react';

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
  const [textIndex, setTextIndex] = useState(0);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const displayText = useTransform(rounded, (v) => texts[textIndex]?.slice(0, v) ?? '');
  const [currentText, setCurrentText] = useState('');

  useEffect(() => {
    // displayText 변경 시 currentText 업데이트
    const unsubscribe = displayText.on('change', (v) => setCurrentText(v));
    return () => unsubscribe();
  }, [displayText]);

  useEffect(() => {
    if (!texts[textIndex]) return;

    const controls = animate(count, texts[textIndex].length, {
      duration: typingSpeed,
      ease: 'easeInOut',
      onComplete: () => {
        // 타이핑 완료 후 일정 시간 대기
        setTimeout(() => {
          // 삭제 애니메이션
          animate(count, 0, { duration: deletingSpeed }).then(() => {
            setTextIndex((i) => (i + 1) % texts.length);
          });
        }, pauseDuration);
      },
    });

    return () => controls.stop();
  }, [textIndex, texts, typingSpeed, deletingSpeed, pauseDuration, count]);

  return (
    <span className={className}>
      {currentText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
        className="inline-block w-[3px] h-[1em] bg-brand ml-1 align-middle"
      />
    </span>
  );
}
