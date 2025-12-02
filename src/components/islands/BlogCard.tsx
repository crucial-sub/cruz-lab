// 블로그 포스트 카드 컴포넌트
// TiltCard + GlowCard 효과를 결합한 인터랙티브 블로그 카드
import { motion } from 'framer-motion';
import GlowCard from './GlowCard';
import TiltCard from './TiltCard';

interface Props {
  title: string;
  description: string;
  pubDate: Date | string;
  heroImage?: string;
  tags: string[];
  slug: string;
  index?: number;
  featured?: boolean;
  readingTime?: number; // 서버에서 계산된 읽기 시간 (분)
}

export default function BlogCard({
  title,
  description,
  pubDate,
  heroImage,
  tags,
  slug,
  index = 0,
  featured = false,
  readingTime: propReadingTime,
}: Props) {
  // 날짜 객체로 변환 (문자열 또는 Date 모두 처리)
  const dateObj = typeof pubDate === 'string' ? new Date(pubDate) : pubDate;

  // 날짜 포맷팅
  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);

  // 읽기 시간 (서버에서 전달받거나 기본값 사용)
  const readingTime = propReadingTime || Math.ceil(description.length / 100) || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={featured ? 'md:col-span-2' : ''}
    >
      <TiltCard tiltAmount={6} className="h-full">
        <GlowCard className="h-full rounded-2xl border border-border bg-bg-surface">
        <a
          href={`/blog/${slug}`}
          className={`group flex h-full overflow-hidden rounded-2xl ${
            featured ? 'flex-col md:flex-row' : 'flex-col'
          }`}
        >
          {/* 이미지 영역 */}
          {heroImage && (
            <div
              className={`relative overflow-hidden ${
                featured ? 'md:w-1/2' : ''
              } ${featured ? 'aspect-video md:aspect-auto' : 'aspect-video'}`}
            >
              <img
                src={heroImage}
                alt={title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              {/* 호버 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-bg-surface/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
          )}

          {/* 콘텐츠 영역 */}
          <div className={`flex flex-1 flex-col p-5 ${featured ? 'md:w-1/2' : ''}`}>
            {/* 태그 */}
            {tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 제목 */}
            <h3
              className={`mb-2 font-bold text-text-primary transition-colors group-hover:text-brand ${
                featured ? 'text-2xl md:text-3xl' : 'text-xl'
              }`}
            >
              {title}
            </h3>

            {/* 설명 */}
            <p
              className={`mb-4 flex-1 leading-relaxed text-text-secondary ${
                featured ? 'text-base line-clamp-3' : 'text-sm line-clamp-2'
              }`}
            >
              {description}
            </p>

            {/* 메타 정보 */}
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <time dateTime={dateObj.toISOString()} className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {formattedDate}
              </time>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {readingTime}분 읽기
              </span>
            </div>
          </div>
        </a>
        </GlowCard>
      </TiltCard>
    </motion.div>
  );
}
