// 인터랙티브 Hero 컴포넌트
// 타이핑 애니메이션 + 3D 프로필 이미지 + 배경 효과
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import TypeWriter from './TypeWriter';
import MagneticButton from './MagneticButton';
import RippleButton from './RippleButton';

interface Props {
  name: string;
  roles: string[];
  tagline: string;
  description: string;
  photoSrc: string;
  photoAlt?: string;
}

export default function InteractiveHero({
  name,
  roles,
  tagline,
  description,
  photoSrc,
  photoAlt = 'Profile photo',
}: Props) {
  // 프로필 이미지 3D 틸트
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 200, damping: 20 });
  const mouseYSpring = useSpring(y, { stiffness: 200, damping: 20 });
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['15deg', '-15deg']);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-15deg', '15deg']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <section className="relative">
      {/* 배경 그라디언트 - 부드럽게 페이드아웃 */}
      <div className="absolute inset-0 -z-10 animated-gradient opacity-30 [mask-image:linear-gradient(to_bottom,white_60%,transparent_100%)]" />

      <div className="grid items-center gap-8 md:grid-cols-2 py-8">
        {/* 왼쪽: 텍스트 영역 */}
        <motion.div
          className="space-y-5"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <motion.h1
            className="text-4xl font-extrabold md:text-5xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Hi There{' '}
            <motion.span
              aria-hidden="true"
              animate={{ rotate: [0, 20, -10, 20, 0] }}
              transition={{ duration: 1.5, delay: 1, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block origin-bottom-right"
            >
              👋
            </motion.span>
            ,<br />
            I'm <span className="text-brand">{name}</span>
          </motion.h1>

          <motion.div
            className="text-xl md:text-2xl text-text-secondary font-medium"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <TypeWriter
              texts={roles}
              className="text-brand font-semibold"
              typingSpeed={1.2}
              pauseDuration={2500}
            />
          </motion.div>

          <motion.h2
            className="text-2xl md:text-3xl font-bold text-text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            {tagline}
          </motion.h2>

          <motion.div
            className="text-lg text-text-secondary leading-relaxed space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            {description.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </motion.div>

          {/* CTA 버튼들 - MagneticButton + RippleButton 적용 */}
          <motion.div
            className="flex flex-wrap gap-4 pt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <a href="/projects">
              <MagneticButton strength={0.2}>
                <RippleButton
                  className="inline-flex items-center gap-2 whitespace-nowrap px-6 py-3 rounded-xl bg-brand text-white font-semibold transition-colors hover:bg-brand-hover"
                  rippleColor="rgba(255, 255, 255, 0.5)"
                >
                  프로젝트 보기
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </RippleButton>
              </MagneticButton>
            </a>
            <a href="/blog">
              <MagneticButton strength={0.2}>
                <RippleButton
                  className="inline-flex items-center gap-2 whitespace-nowrap px-6 py-3 rounded-xl border border-border bg-bg-surface/50 font-semibold transition-colors hover:border-brand hover:text-brand"
                  rippleColor="rgba(139, 92, 246, 0.3)"
                >
                  블로그 읽기
                </RippleButton>
              </MagneticButton>
            </a>
          </motion.div>
        </motion.div>

        {/* 오른쪽: 프로필 이미지 (3D 틸트) */}
        <motion.div
          className="relative ml-auto h-[260px] w-[260px] shrink-0 md:h-[320px] md:w-[320px]"
          initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, delay: 0.3, type: 'spring' }}
        >
          <motion.div
            className="h-full w-full cursor-pointer"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              rotateX,
              rotateY,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* 배경 장식 */}
            <motion.div
              className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-brand/20 to-brand-tint"
              style={{ transform: 'translateZ(-20px)' }}
              animate={{
                rotate: [3, 5, 3],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* 이미지 컨테이너 */}
            <div
              className="relative h-full w-full overflow-hidden rounded-[24px] bg-brand shadow-xl"
              style={{ transform: 'translateZ(20px)' }}
            >
              <img
                src={photoSrc}
                alt={photoAlt}
                className="h-full w-full object-cover"
                loading="eager"
              />

              {/* 광택 효과 */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
