// 블로그 검색 컴포넌트
// 실시간 필터링 + 태그 필터 + 애니메이션
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import BlogCard from './BlogCard';

interface Post {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  heroImage?: string;
  tags?: string[];
  readingTime?: number; // 읽기 시간 (분)
}

interface Props {
  posts: Post[];
  allTags: string[];
}

export default function PostSearch({ posts, allTags }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 검색 및 태그 필터링
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 검색어 필터링
      const matchesSearch =
        searchQuery === '' ||
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.description.toLowerCase().includes(searchQuery.toLowerCase());

      // 태그 필터링
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => post.tags?.includes(tag));

      return matchesSearch && matchesTags;
    });
  }, [posts, searchQuery, selectedTags]);

  // 태그 토글
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // 필터 초기화
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
  };

  const hasActiveFilters = searchQuery !== '' || selectedTags.length > 0;

  return (
    <div className="space-y-8">
      {/* 검색 및 필터 UI */}
      <div className="space-y-4">
        {/* 검색 입력 */}
        <div className="relative">
          <input
            type="text"
            placeholder="포스트 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg-surface px-4 py-3 pl-12 text-fg-primary placeholder:text-fg-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
          />
          <svg
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted"
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
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 태그 필터 */}
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <motion.button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                selectedTags.includes(tag)
                  ? 'bg-brand text-white'
                  : 'bg-bg-surface border border-border text-fg-muted hover:border-brand hover:text-brand'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {tag}
            </motion.button>
          ))}
          {hasActiveFilters && (
            <motion.button
              onClick={clearFilters}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-brand transition-colors"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
            >
              필터 초기화
            </motion.button>
          )}
        </div>
      </div>

      {/* 검색 결과 정보 */}
      <motion.div
        className="text-sm text-fg-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {hasActiveFilters ? (
          <span>
            {filteredPosts.length}개의 포스트 검색됨
            {selectedTags.length > 0 && (
              <span className="ml-2">
                (태그: {selectedTags.join(', ')})
              </span>
            )}
          </span>
        ) : (
          <span>총 {posts.length}개의 포스트</span>
        )}
      </motion.div>

      {/* 포스트 그리드 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filteredPosts.map((post, index) => (
            <motion.div
              key={post.slug}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <BlogCard
                slug={post.slug}
                title={post.title}
                description={post.description}
                pubDate={post.pubDate}
                heroImage={post.heroImage}
                tags={post.tags || []}
                readingTime={post.readingTime}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 결과 없음 */}
      {filteredPosts.length === 0 && (
        <motion.div
          className="py-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-4 text-6xl">🔍</div>
          <h3 className="mb-2 text-lg font-semibold">검색 결과가 없습니다</h3>
          <p className="text-fg-muted">
            다른 검색어나 태그를 시도해보세요
          </p>
          <button
            onClick={clearFilters}
            className="mt-4 rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-hover transition-colors"
          >
            필터 초기화
          </button>
        </motion.div>
      )}
    </div>
  );
}
