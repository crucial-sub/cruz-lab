// 프로젝트 카드 컴포넌트
// TiltCard + GlowCard 효과를 결합한 인터랙티브 프로젝트 카드
import { motion } from 'framer-motion';
import GlowCard from './GlowCard';
import TiltCard from './TiltCard';

interface Props {
  title: string;
  description: string;
  image: string;
  tags: string[];
  tech: string[];
  github?: string;
  demo?: string;
  slug: string;
  featured?: boolean;
  index?: number;
}

export default function ProjectCard({
  title,
  description,
  image,
  tags,
  tech,
  github,
  demo,
  slug,
  featured = false,
  index = 0,
}: Props) {
  // 카드 클릭 시 상세 페이지로 이동 (링크 버튼 클릭 제외)
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // GitHub/Demo 링크 클릭 시에는 카드 네비게이션 방지
    if (target.closest('[data-external-link]')) {
      return;
    }
    window.location.href = `/projects/${slug}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <TiltCard tiltAmount={8} className="h-full">
        <GlowCard className="h-full rounded-2xl border border-border bg-bg-surface">
          <div
            onClick={handleCardClick}
            className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.location.href = `/projects/${slug}`;
              }
            }}
          >
            {/* 이미지 영역 */}
            <div className="relative aspect-video overflow-hidden">
              <img
                src={image}
                alt={title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              {/* Featured 배지 */}
              {featured && (
                <div className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                  Featured
                </div>
              )}
              {/* 호버 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-bg-surface/90 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>

            {/* 콘텐츠 영역 */}
            <div className="flex flex-1 flex-col p-5">
              {/* 태그 */}
              <div className="mb-2 flex flex-wrap gap-2">
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* 제목 */}
              <h3 className="mb-2 text-xl font-bold text-text-primary transition-colors group-hover:text-brand">
                {title}
              </h3>

              {/* 설명 */}
              <p className="mb-4 flex-1 text-sm leading-relaxed text-text-secondary line-clamp-2">
                {description}
              </p>

              {/* 기술 스택 */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {tech.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    className="rounded border border-border bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
                {tech.length > 5 && (
                  <span className="rounded border border-border bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary">
                    +{tech.length - 5}
                  </span>
                )}
              </div>

              {/* 링크 버튼들 */}
              <div className="flex gap-3">
                {github && (
                  <motion.a
                    href={github}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-external-link
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-brand"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    GitHub
                  </motion.a>
                )}
                {demo && (
                  <motion.a
                    href={demo}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-external-link
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-brand"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    Demo
                  </motion.a>
                )}
              </div>
            </div>
          </div>
        </GlowCard>
      </TiltCard>
    </motion.div>
  );
}
