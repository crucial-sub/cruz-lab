/**
 * 시리즈 위젯 컴포넌트
 *
 * 포스트 상세 페이지에서 시리즈 정보 표시
 * 기능:
 * - 시리즈 목록 펼침/접힘
 * - 현재 포스트 하이라이트
 * - 진행률 표시
 * - 이전/다음 네비게이션
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SeriesPost {
  id: string;
  title: string;
  slug: string;
  order: number;
}

interface SeriesWidgetProps {
  seriesName: string;
  seriesSlug: string;
  currentPostId: string;
  posts: SeriesPost[];
}

export default function SeriesWidget({
  seriesName,
  seriesSlug,
  currentPostId,
  posts,
}: SeriesWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentIndex = posts.findIndex((p) => p.id === currentPostId);
  const progress = posts.length > 0 ? ((currentIndex + 1) / posts.length) * 100 : 0;

  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  return (
    <div className="sticky top-20 rounded-2xl border border-border bg-gradient-to-br from-bg-card to-bg-surface p-6 shadow-xl">
      {/* 시리즈 헤더 */}
      <div className="mb-4">
        <a
          href={`/series/${seriesSlug}`}
          className="group mb-2 flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-brand"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <span className="font-medium transition-all group-hover:translate-x-0.5">시리즈</span>
        </a>

        <h3 className="text-lg font-bold text-text-primary">{seriesName}</h3>

        <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          <span>
            {currentIndex + 1} / {posts.length}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-surface">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-brand to-brand/80"
            />
          </div>
          <span className="font-medium text-brand">{Math.round(progress)}%</span>
        </div>
      </div>

      {/* 토글 버튼 */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="mb-4 flex w-full items-center justify-between rounded-lg bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-card"
      >
        <span>{isExpanded ? '목록 접기' : '전체 목록 보기'}</span>
        <motion.svg
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </motion.svg>
      </motion.button>

      {/* 포스트 목록 (펼쳤을 때) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 overflow-hidden"
          >
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg bg-bg-surface p-3">
              {posts.map((post, index) => {
                const isCurrent = post.id === currentPostId;
                return (
                  <a
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className={`group block rounded-md px-3 py-2 text-sm transition-all ${
                      isCurrent
                        ? 'bg-brand/10 text-brand shadow-sm'
                        : 'text-text-secondary hover:bg-bg-card hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 순서 또는 체크 아이콘 */}
                      <span
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isCurrent
                            ? 'bg-brand text-white'
                            : 'bg-bg-card text-text-secondary group-hover:bg-brand/20 group-hover:text-brand'
                        }`}
                      >
                        {isCurrent ? (
                          <svg
                            className="h-3.5 w-3.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </span>

                      {/* 포스트 제목 */}
                      <span
                        className={`flex-1 truncate font-medium ${
                          isCurrent ? '' : 'group-hover:translate-x-0.5'
                        } transition-transform`}
                      >
                        {post.title}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 이전/다음 네비게이션 */}
      <div className="grid grid-cols-2 gap-2">
        {prevPost ? (
          <a
            href={`/blog/${prevPost.slug}`}
            className="group flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-3 transition-all hover:border-brand hover:shadow-md"
          >
            <span className="text-xs text-text-secondary">이전</span>
            <span className="truncate text-sm font-medium text-text-primary transition-colors group-hover:text-brand">
              {prevPost.title}
            </span>
            <div className="flex items-center gap-1 text-xs text-brand opacity-0 transition-opacity group-hover:opacity-100">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>이동</span>
            </div>
          </a>
        ) : (
          <div className="rounded-lg border border-border bg-bg-surface/30 p-3 opacity-50">
            <span className="text-xs text-text-secondary">이전 글 없음</span>
          </div>
        )}

        {nextPost ? (
          <a
            href={`/blog/${nextPost.slug}`}
            className="group flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-3 text-right transition-all hover:border-brand hover:shadow-md"
          >
            <span className="text-xs text-text-secondary">다음</span>
            <span className="truncate text-sm font-medium text-text-primary transition-colors group-hover:text-brand">
              {nextPost.title}
            </span>
            <div className="flex items-center justify-end gap-1 text-xs text-brand opacity-0 transition-opacity group-hover:opacity-100">
              <span>이동</span>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </a>
        ) : (
          <div className="rounded-lg border border-border bg-bg-surface/30 p-3 text-right opacity-50">
            <span className="text-xs text-text-secondary">다음 글 없음</span>
          </div>
        )}
      </div>
    </div>
  );
}
