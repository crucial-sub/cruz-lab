// 스크롤 프로그레스 바 컴포넌트
// 페이지 스크롤 진행률을 상단에 표시
import { motion, useScroll, useSpring } from 'framer-motion';

export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed left-0 right-0 top-0 z-[1000] h-1 origin-left bg-brand"
      style={{ scaleX }}
    />
  );
}
