// 블로그 포스트 카드 컴포넌트
// TiltCard + GlowCard 효과를 결합한 인터랙티브 블로그 카드
import { motion } from 'framer-motion';
import PostCover from '@/components/blog/PostCover';
import GlowCard from './GlowCard';
import TiltCard from './TiltCard';

interface Props {
  title: string;
  description: string;
  pubDate: Date | string;
  tags: string[];
  slug: string;
  index?: number;
  featured?: boolean;
  readingTime?: number; // 서버에서 계산된 읽기 시간 (분)
  categoryLabel?: string | null; // 카테고리 표시 이름 (커버 큰 글자)
  series?: { key: string; order: number } | null; // 연재 (있으면 연재 배지 표시)
}

export default function BlogCard({
  title,
  description,
  pubDate,
  tags,
  slug,
  index = 0,
  featured = false,
  readingTime: propReadingTime,
  categoryLabel,
  series,
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
      className={`h-full ${featured ? 'md:col-span-2' : ''}`}
    >
      <TiltCard tiltAmount={6} className="h-full">
        <GlowCard className="h-full rounded-2xl border border-border bg-bg-surface">
        <a
          href={`/blog/${slug}`}
          className={`group flex h-full overflow-hidden rounded-2xl ${
            featured ? 'flex-row h-[220px]' : 'flex-col min-h-[420px]'
          }`}
        >
          {/* 커버 영역
              - 예전: 업로드한 단색 배경 + 텍스트 이미지를 그대로 보여 줬다.
              - 지금: 카테고리별 색으로 코드가 그린 커버를 보여 준다 (PostCover). */}
          <div
            className={`relative overflow-hidden ${
              featured ? 'h-full w-2/5 flex-shrink-0' : 'aspect-video'
            }`}
          >
            <PostCover categoryLabel={categoryLabel} tags={tags} slug={slug} date={dateObj} compact={featured} />
          </div>

          {/* 콘텐츠 영역 */}
          <div className={`flex flex-1 flex-col ${featured ? 'w-3/5 p-4' : 'p-5'}`}>
            {/* 연재 배지 */}
            {series && (
              <div className={`flex items-center gap-1 text-xs text-brand ${featured ? 'mb-1' : 'mb-2'}`}>
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
                <span className="font-medium">시리즈</span>
              </div>
            )}

            {/* 태그 - 태그가 없어도 동일한 높이 유지 */}
            <div className={`flex min-h-[24px] flex-wrap gap-2 ${featured ? 'mb-1' : 'mb-3'}`}>
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* 제목 - 최대 2줄로 제한 */}
            <h3 className={`font-bold text-text-primary transition-colors group-hover:text-brand line-clamp-2 ${featured ? 'mb-1 text-xl' : 'mb-2 text-xl'}`}>
              {title}
            </h3>

            {/* 설명 - 고정 높이로 일관된 레이아웃 유지 */}
            <p className={`leading-relaxed text-text-secondary line-clamp-2 ${featured ? 'mb-2 text-base' : 'mb-4 text-sm'}`}>
              {description}
            </p>

            {/* 여백 확보 - 날짜를 하단에 고정하기 위한 spacer */}
            <div className="flex-1" />

            {/* 메타 정보 - 항상 카드 하단에 위치, 양쪽 끝 정렬 */}
            <div className="flex items-center justify-between text-sm text-text-secondary mt-auto">
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
                약 {readingTime}분
              </span>
            </div>
          </div>
        </a>
        </GlowCard>
      </TiltCard>
    </motion.div>
  );
}
