/**
 * MiniSeriesCard - 블로그 페이지 Featured Series 섹션용 작은 카드
 *
 * 특징:
 * - 간결한 디자인 (3D 효과 없음)
 * - 읽기 진행률 표시
 * - 호버 시 부드러운 전환 효과
 */
import { useEffect, useState } from 'react';

interface MiniSeriesCardProps {
  id: string;
  name: string;
  slug: string;
  description: string;
  postCount: number;
}

export default function MiniSeriesCard({
  id,
  name,
  slug,
  description,
  postCount,
}: MiniSeriesCardProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const readPosts = JSON.parse(localStorage.getItem(`series-${slug}-read`) || '[]');
    const calculatedProgress = postCount > 0 ? (readPosts.length / postCount) * 100 : 0;
    setProgress(calculatedProgress);
  }, [slug, postCount]);

  return (
    <a
      href={`/series/${slug}`}
      className="group block rounded-xl border border-border bg-bg-card p-5 transition-all hover:border-brand hover:shadow-lg hover:shadow-brand/10"
    >
      {/* 헤더 */}
      <div className="mb-3 flex items-start justify-between">
        <h3 className="flex-1 font-bold text-text-primary transition-colors group-hover:text-brand">
          {name}
        </h3>
        <svg
          className="h-5 w-5 flex-shrink-0 text-text-secondary opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
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

      {/* 설명 */}
      <p className="mb-3 line-clamp-2 text-sm text-text-secondary">{description}</p>

      {/* 메타 정보 */}
      <div className="mb-2 flex items-center gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          {postCount}개 포스트
        </span>
        {progress > 0 && (
          <span className="font-medium text-brand">· {Math.round(progress)}% 완료</span>
        )}
      </div>

      {/* 진행률 바 */}
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-surface">
        <div
          className="h-full bg-gradient-to-r from-brand to-brand/80 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </a>
  );
}
