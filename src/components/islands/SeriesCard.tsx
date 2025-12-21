/**
 * 시리즈 카드 컴포넌트
 *
 * 기능:
 * - 3D Tilt 효과 (마우스 추적)
 * - 읽기 진행률 표시 (localStorage 기반)
 * - Hover 시 Glow 효과
 * - 부드러운 애니메이션
 */
import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface SeriesCardProps {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage?: string;
  postCount: number;
  totalReadingTime: number; // 분 단위
  updatedAt: Date;
  index?: number;
}

export default function SeriesCard({
  id,
  name,
  slug,
  description,
  coverImage,
  postCount,
  totalReadingTime,
  updatedAt,
  index = 0,
}: SeriesCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [readProgress, setReadProgress] = useState(0); // 읽은 포스트 비율 (0-100)

  // 3D Tilt 효과를 위한 motion values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), {
    stiffness: 300,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), {
    stiffness: 300,
    damping: 20,
  });

  // localStorage에서 읽기 진행률 가져오기
  useEffect(() => {
    const readPosts = JSON.parse(localStorage.getItem(`series-${id}-read`) || '[]');
    const progress = postCount > 0 ? (readPosts.length / postCount) * 100 : 0;
    setReadProgress(progress);
  }, [id, postCount]);

  // 마우스 이동 핸들러
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);

    mouseX.set(deltaX);
    mouseY.set(deltaY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // 날짜 포맷팅
  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    if (days < 365) return `${Math.floor(days / 30)}개월 전`;
    return `${Math.floor(days / 365)}년 전`;
  };

  return (
    <motion.a
      href={`/series/${slug}`}
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      className="group relative block overflow-hidden rounded-2xl border border-border bg-bg-card shadow-lg transition-all duration-300 hover:shadow-2xl hover:shadow-brand/20"
    >
      {/* Glow 효과 (호버 시) */}
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/20 via-transparent to-brand/20 blur-xl" />
      </div>

      {/* 커버 이미지 또는 그라데이션 */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-brand/20 via-brand/10 to-transparent">
        {coverImage ? (
          <img
            src={coverImage}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          // 기본 그라데이션 패턴
          <div className="flex h-full items-center justify-center">
            <svg
              className="h-20 w-20 text-brand/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
        )}

        {/* 읽기 진행률 바 */}
        {readProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-bg-surface/80">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${readProgress}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-brand to-brand/80"
            />
          </div>
        )}
      </div>

      {/* 카드 콘텐츠 */}
      <div className="relative p-5">
        {/* 시리즈 제목 */}
        <h3 className="mb-2 text-xl font-bold text-text-primary transition-colors group-hover:text-brand">
          {name}
        </h3>

        {/* 시리즈 설명 */}
        <p className="mb-4 line-clamp-2 text-sm text-text-secondary">
          {description}
        </p>

        {/* 메타 정보 */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          {/* 포스트 수 */}
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>{postCount}개 포스트</span>
          </div>

          {/* 총 읽기 시간 */}
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>약 {totalReadingTime}분</span>
          </div>

          {/* 마지막 업데이트 */}
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{formatDate(updatedAt)}</span>
          </div>
        </div>

        {/* 읽기 진행률 텍스트 */}
        {readProgress > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-2 text-xs"
          >
            <div className="flex-1 rounded-full bg-bg-surface p-0.5">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-brand to-brand/80 transition-all"
                style={{ width: `${readProgress}%` }}
              />
            </div>
            <span className="font-medium text-brand">
              {Math.round(readProgress)}%
            </span>
          </motion.div>
        )}

        {/* 화살표 아이콘 */}
        <div className="absolute right-5 top-5 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">
          <svg
            className="h-5 w-5 text-brand"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </div>
      </div>
    </motion.a>
  );
}
