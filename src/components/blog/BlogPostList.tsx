/**
 * 고급 블로그 포스트 리스트 컴포넌트
 *
 * 주요 기능:
 * - 멀티 태그 필터링 (OR 조건 - 선택한 태그 중 하나라도 포함하면 표시)
 * - AnimatePresence + LayoutGroup으로 부드러운 카드 재배열
 * - 그리드/리스트 뷰 모드 전환
 * - 정렬 옵션 (최신순, 읽기시간순, 제목순)
 * - 검색 디바운스
 * - 스켈레톤 로딩 UI
 * - 개선된 빈 상태 UI
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { getPublishedPosts, getAllTags, type Post } from '@/lib/posts';
import BlogCard from '../islands/BlogCard';

// 정렬 타입
type SortOption = 'latest' | 'oldest' | 'reading' | 'title';

// 뷰 모드 타입
type ViewMode = 'grid' | 'list';

// 디바운스 훅
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// 스켈레톤 카드 컴포넌트
function SkeletonCard({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-border bg-bg-surface overflow-hidden ${
        viewMode === 'list' ? 'flex flex-row h-48' : ''
      }`}
    >
      {/* 이미지 스켈레톤 */}
      <div
        className={`bg-bg-card ${
          viewMode === 'list' ? 'w-64 h-full' : 'aspect-video w-full'
        }`}
      >
        <div className="h-full w-full bg-gradient-to-r from-bg-card via-bg-surface to-bg-card animate-shimmer" />
      </div>
      {/* 콘텐츠 스켈레톤 */}
      <div className={`p-5 ${viewMode === 'list' ? 'flex-1' : ''}`}>
        <div className="mb-3 flex gap-2">
          <div className="h-5 w-16 rounded-full bg-bg-card" />
          <div className="h-5 w-12 rounded-full bg-bg-card" />
        </div>
        <div className="mb-2 h-6 w-3/4 rounded bg-bg-card" />
        <div className="mb-4 space-y-2">
          <div className="h-4 w-full rounded bg-bg-card" />
          <div className="h-4 w-2/3 rounded bg-bg-card" />
        </div>
        <div className="flex gap-4">
          <div className="h-4 w-24 rounded bg-bg-card" />
          <div className="h-4 w-16 rounded bg-bg-card" />
        </div>
      </div>
    </div>
  );
}

// 빈 상태 컴포넌트
function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      {/* 일러스트 */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 10 }}
        className="mb-6 rounded-full bg-bg-card p-8"
      >
        <svg
          className="h-16 w-16 text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
          />
        </svg>
      </motion.div>

      <h3 className="mb-2 text-xl font-semibold text-text-primary">
        {hasFilters ? '검색 결과가 없습니다' : '아직 작성된 포스트가 없습니다'}
      </h3>

      <p className="mb-6 max-w-md text-text-secondary">
        {hasFilters
          ? '다른 키워드로 검색하거나 필터를 조정해보세요.'
          : '곧 새로운 포스트가 올라올 예정입니다.'}
      </p>

      {hasFilters && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClearFilters}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-medium text-white transition-colors hover:brightness-110"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          필터 초기화
        </motion.button>
      )}
    </motion.div>
  );
}

// 애니메이션 카운터 컴포넌트
function AnimatedCounter({ count }: { count: number }) {
  return (
    <motion.span
      key={count}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-block tabular-nums"
    >
      {count}
    </motion.span>
  );
}

export default function BlogPostList() {
  // 데이터 상태
  const [posts, setPosts] = useState<Post[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 필터 상태
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  // UI 상태
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  // 데이터 로드
  useEffect(() => {
    async function fetchData() {
      try {
        const [postsData, tagsData] = await Promise.all([
          getPublishedPosts(),
          getAllTags(),
        ]);
        setPosts(postsData);
        setAllTags(tagsData);
      } catch (error) {
        console.error('포스트 로딩 오류:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // 필터링 및 정렬된 포스트
  const filteredPosts = useMemo(() => {
    let result = [...posts];

    // 태그 필터링 (OR 조건: 선택된 태그 중 하나라도 포함하면 표시)
    if (selectedTags.length > 0) {
      result = result.filter((post) =>
        selectedTags.some((tag) => post.tags.includes(tag))
      );
    }

    // 검색 필터링
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      result = result.filter(
        (post) =>
          post.title.toLowerCase().includes(searchLower) ||
          post.description.toLowerCase().includes(searchLower) ||
          post.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    // 정렬
    switch (sortBy) {
      case 'latest':
        result.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
        break;
      case 'oldest':
        result.sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
        break;
      case 'reading':
        result.sort((a, b) => (a.readingTime || 0) - (b.readingTime || 0));
        break;
      case 'title':
        result.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
        break;
    }

    return result;
  }, [posts, selectedTags, debouncedSearch, sortBy]);

  // 태그 토글
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  // 필터 초기화
  const clearFilters = useCallback(() => {
    setSelectedTags([]);
    setSearchInput('');
  }, []);

  // 필터가 활성화되었는지 확인
  const hasActiveFilters = selectedTags.length > 0 || debouncedSearch.length > 0;

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* 스켈레톤 필터 바 */}
        <div className="space-y-4">
          <div className="h-12 w-full animate-pulse rounded-xl bg-bg-card" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-bg-card" />
            ))}
          </div>
        </div>
        {/* 스켈레톤 카드 그리드 */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} viewMode="grid" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 검색 및 컨트롤 바 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* 검색창 */}
        <div className="relative flex-1 max-w-md">
          <motion.div
            initial={false}
            animate={{ scale: searchInput ? 1.02 : 1 }}
            className="relative"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="포스트 검색..."
              className="w-full rounded-xl border border-border bg-bg-card px-4 py-3 pl-12 text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
            />
            <svg
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {/* 검색어 지우기 버튼 */}
            <AnimatePresence>
              {searchInput && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-secondary hover:bg-bg-surface hover:text-text-primary transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* 뷰 모드 & 정렬 컨트롤 */}
        <div className="flex items-center gap-3">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-lg border border-border bg-bg-card p-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-2 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-brand text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="그리드 뷰"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z" />
              </svg>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode('list')}
              className={`rounded-md p-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-brand text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="리스트 뷰"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
              </svg>
            </motion.button>
          </div>

          {/* 정렬 드롭다운 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer"
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="reading">읽기 시간순</option>
            <option value="title">제목순</option>
          </select>

          {/* 필터 토글 버튼 */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              isFilterOpen || selectedTags.length > 0
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border bg-bg-card text-text-secondary hover:text-text-primary'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            필터
            {selectedTags.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs text-white">
                {selectedTags.length}
              </span>
            )}
          </motion.button>
        </div>
      </div>

      {/* 태그 필터 영역 */}
      <AnimatePresence>
        {isFilterOpen && allTags.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border bg-bg-card/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">태그로 필터링</span>
                {selectedTags.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-brand hover:underline"
                  >
                    모두 해제
                  </motion.button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  const postCount = posts.filter((p) => p.tags.includes(tag)).length;

                  return (
                    <motion.button
                      key={tag}
                      layout
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleTag(tag)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-brand text-white shadow-lg shadow-brand/25'
                          : 'bg-bg-surface text-text-secondary hover:bg-bg-card hover:text-text-primary'
                      }`}
                    >
                      {tag}
                      <span
                        className={`text-xs ${
                          isSelected ? 'text-white/70' : 'text-text-secondary'
                        }`}
                      >
                        ({postCount})
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 선택된 태그 표시 (필터가 닫혀있을 때) */}
      <AnimatePresence>
        {!isFilterOpen && selectedTags.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-sm text-text-secondary">필터:</span>
            {selectedTags.map((tag) => (
              <motion.button
                key={tag}
                layout
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                onClick={() => toggleTag(tag)}
                className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand"
              >
                {tag}
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 결과 카운터 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          총 <AnimatedCounter count={filteredPosts.length} />개의 포스트
          {hasActiveFilters && ` (전체 ${posts.length}개 중)`}
        </p>
      </div>

      {/* 포스트 그리드/리스트 */}
      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {filteredPosts.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
          ) : (
            <motion.div
              layout
              className={
                viewMode === 'grid'
                  ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3'
                  : 'flex flex-col gap-4'
              }
            >
              {filteredPosts.map((post, index) => (
                <motion.div
                  key={post.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -15 }}
                  transition={{
                    // 레이아웃 변경 시 부드러운 애니메이션
                    layout: {
                      type: 'spring',
                      stiffness: 200,
                      damping: 25,
                      mass: 0.8,
                    },
                    // 등장/퇴장 애니메이션
                    opacity: { duration: 0.4, ease: 'easeOut' },
                    scale: { duration: 0.4, ease: 'easeOut' },
                    y: { duration: 0.4, ease: 'easeOut' },
                    delay: index * 0.08,
                  }}
                >
                  <BlogCard
                    title={post.title}
                    description={post.description || ''}
                    pubDate={post.pubDate}
                    heroImage={post.heroImage || `https://picsum.photos/seed/${post.id}/600/400`}
                    tags={post.tags}
                    slug={post.slug}
                    index={0} // 이미 stagger가 motion.div에서 적용되므로 0으로 설정
                    readingTime={post.readingTime}
                    featured={viewMode === 'list'}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
