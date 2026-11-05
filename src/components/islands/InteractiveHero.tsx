// 인터랙티브 Hero 컴포넌트
// 타이핑 애니메이션 + 3D 프로필 이미지 + 배경 효과
// - 진입 애니메이션은 CSS(hero-rise 등)로 처리한다. JS 하이드레이션 전에 시작되어 첫 화면이 빨리 보인다.
// - 프로필 틸트만 framer-motion 스프링을 쓴다.
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import MagneticButton from './MagneticButton';
import RippleButton from './RippleButton';
import TypeWriter from './TypeWriter';

interface Props {
  name: string;
  roles: string[];
  tagline: string;
  description: string;
  photoSrc: string;
  photoAlt?: string;
}

// 틸트 최대 각도 (도)
const MAX_TILT = 14;
// 틸트 스프링: 빠르게 따라가되 끝에서 튀지 않도록 감쇠를 충분히 준다
const TILT_SPRING = { stiffness: 170, damping: 22, mass: 0.6 };

export default function InteractiveHero({
  name,
  roles,
  tagline,
  description,
  photoSrc,
  photoAlt = 'Profile photo',
}: Props) {
  const reduceMotion = useReducedMotion();

  // 포인터 위치 (카드 기준 -0.5 ~ 0.5). 0이면 가운데
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  // 호버 정도 (0 ~ 1). 광택과 확대에 쓴다
  const hover = useMotionValue(0);

  const sx = useSpring(px, TILT_SPRING);
  const sy = useSpring(py, TILT_SPRING);
  const sHover = useSpring(hover, { stiffness: 220, damping: 26 });

  // 포인터가 있는 쪽이 화면 안쪽으로 눌리도록 회전한다
  // - 위쪽(py<0)에 있으면 rotateX가 +가 되어 위 모서리가 뒤로 간다
  // - 오른쪽(px>0)에 있으면 rotateY가 +가 되어 오른쪽 모서리가 뒤로 간다
  // - 부모에 perspective가 있어야 뒤로 간 모서리가 실제로 작아 보인다.
  //   예전에는 perspective가 없어 왼쪽 아래와 오른쪽 위가 똑같은 모양이 되었고, 아래쪽 동작이 반대로 보였다.
  const rotateX = useTransform(sy, (v) => -v * 2 * MAX_TILT);
  const rotateY = useTransform(sx, (v) => v * 2 * MAX_TILT);
  const scale = useTransform(sHover, [0, 1], [1, 1.035]);

  // 광택: 포인터 위치를 따라가는 밝은 원
  const glareX = useTransform(sx, (v) => `${(v + 0.5) * 100}%`);
  const glareY = useTransform(sy, (v) => `${(v + 0.5) * 100}%`);
  const glareOpacity = useTransform(sHover, [0, 1], [0, 1]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)`;

  // 그림자: 카드가 기운 반대쪽으로 떨어진다
  const shadowX = useTransform(sx, (v) => -v * 28);
  const shadowY = useTransform(sy, (v) => 18 - v * 20);
  const shadow = useMotionTemplate`${shadowX}px ${shadowY}px 40px -12px rgba(0,0,0,0.45)`;

  // 포인터 위치 계산
  // - 기울지 않는 바깥 래퍼의 사각형을 기준으로 잰다.
  //   예전에는 기울어진 요소 자신의 getBoundingClientRect()를 썼다. 기울수록 사각형이 바뀌어 값이 흔들렸다.
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    px.set(Math.max(-0.5, Math.min(0.5, nx)));
    py.set(Math.max(-0.5, Math.min(0.5, ny)));
  };

  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType !== 'mouse') return;
    hover.set(1);
  };

  // 포인터가 나가면 스프링으로 부드럽게 제자리로 돌아온다
  const handlePointerLeave = () => {
    px.set(0);
    py.set(0);
    hover.set(0);
  };

  return (
    <section className="relative">
      {/* 배경 그라디언트 - opacity만 바뀌는 층 두 개 (global.css .animated-gradient) */}
      <div className="animated-gradient absolute inset-0 -z-10 opacity-30 [mask-image:linear-gradient(to_bottom,white_60%,transparent_100%)]" />

      <div className="grid items-center gap-8 py-8 md:grid-cols-2">
        {/* 왼쪽: 텍스트 영역 (CSS 진입 애니메이션) */}
        <div className="hero-slide space-y-5">
          <h1
            className="hero-rise text-4xl font-extrabold md:text-5xl"
            style={{ '--hero-delay': '0.2s' } as React.CSSProperties}
          >
            Hi There{' '}
            <span aria-hidden="true" className="hero-wave">
              👋
            </span>
            ,<br />
            I&apos;m <span className="text-brand">{name}</span>
          </h1>

          <div
            className="hero-rise text-xl font-medium text-text-secondary md:text-2xl"
            style={{ '--hero-delay': '0.4s' } as React.CSSProperties}
          >
            <TypeWriter
              texts={roles}
              className="font-semibold text-brand"
              typingSpeed={1.2}
              pauseDuration={2500}
            />
          </div>

          <h2
            className="hero-rise mb-4 text-2xl font-bold text-text-primary md:text-3xl"
            style={{ '--hero-delay': '0.5s' } as React.CSSProperties}
          >
            {tagline}
          </h2>

          <div
            className="hero-rise space-y-4 text-lg leading-relaxed text-text-secondary"
            style={{ '--hero-delay': '0.6s' } as React.CSSProperties}
          >
            {description.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {/* CTA 버튼들 - MagneticButton + RippleButton 적용 */}
          <div
            className="hero-rise flex flex-wrap gap-4 pt-4"
            style={{ '--hero-delay': '0.8s' } as React.CSSProperties}
          >
            <a href="/projects">
              <MagneticButton strength={0.2}>
                <RippleButton
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-hover"
                  rippleColor="rgba(255, 255, 255, 0.5)"
                >
                  프로젝트 보기
                  <svg
                    className="h-4 w-4 shrink-0"
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
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-bg-surface/50 px-6 py-3 font-semibold transition-colors hover:border-brand hover:text-brand"
                  rippleColor="rgba(139, 92, 246, 0.3)"
                >
                  블로그 읽기
                </RippleButton>
              </MagneticButton>
            </a>
          </div>
        </div>

        {/* 오른쪽: 프로필 이미지 (3D 틸트)
            - 바깥 div: 기울지 않는다. perspective를 주고 포인터 위치를 잰다.
            - 안쪽 motion.div: 실제로 기운다. */}
        <div
          className="hero-pop relative ml-auto h-[260px] w-[260px] shrink-0 md:h-[320px] md:w-[320px]"
          style={{ perspective: '900px' }}
          onPointerEnter={handlePointerEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <motion.div
            className="relative h-full w-full"
            style={{
              rotateX,
              rotateY,
              scale,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* 배경 장식 (뒤쪽 층) */}
            <div
              aria-hidden="true"
              className="hero-sway absolute -inset-4 rounded-[32px] bg-gradient-to-br from-brand/20 to-brand-tint"
            />

            {/* 이미지 카드 (앞쪽 층) */}
            <motion.div
              className="relative h-full w-full overflow-hidden rounded-[24px] border border-gray-200/50 bg-brand dark:border-transparent"
              style={{ transform: 'translateZ(24px)', boxShadow: shadow }}
            >
              <img
                src={photoSrc}
                alt={photoAlt}
                className="h-full w-full object-cover"
                loading="eager"
                fetchPriority="high"
                draggable={false}
              />

              {/* 광택: 포인터 위치를 따라 움직인다 */}
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                style={{ background: glare, opacity: glareOpacity }}
              />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
