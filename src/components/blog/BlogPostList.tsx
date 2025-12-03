// Firebase에서 포스트를 가져와 렌더링하는 블로그 컴포넌트
import { useEffect, useState } from 'react';
import { getPublishedPosts, getAllTags, type Post } from '@/lib/posts';

export default function BlogPostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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

  // 필터링된 포스트
  const filteredPosts = posts.filter((post) => {
    const matchesTag = !selectedTag || post.tags.includes(selectedTag);
    const matchesSearch =
      !searchQuery ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  // 날짜 포맷
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 검색 및 태그 필터 */}
      <div className="space-y-4">
        {/* 검색창 */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="포스트 검색..."
            className="w-full rounded-xl border border-border bg-bg-card px-4 py-3 pl-12 text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none"
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
        </div>

        {/* 태그 필터 */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                !selectedTag
                  ? 'bg-brand text-white'
                  : 'bg-bg-card text-text-secondary hover:text-text-primary'
              }`}
            >
              전체
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedTag === tag
                    ? 'bg-brand text-white'
                    : 'bg-bg-card text-text-secondary hover:text-text-primary'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 포스트 목록 */}
      {filteredPosts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-text-secondary">
            {posts.length === 0
              ? '아직 작성된 포스트가 없습니다.'
              : '검색 결과가 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredPosts.map((post) => (
            <a
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group overflow-hidden rounded-2xl border border-border bg-bg-card transition-all hover:border-brand hover:shadow-lg"
            >
              {/* 썸네일 */}
              <div className="aspect-video overflow-hidden">
                <img
                  src={post.heroImage || `https://picsum.photos/seed/${post.id}/600/400`}
                  alt={post.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>

              {/* 컨텐츠 */}
              <div className="flex h-[180px] flex-col p-5">
                {/* 태그 - 항상 고정 높이 유지 */}
                <div className="mb-2 flex h-6 flex-wrap gap-2">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* 제목 */}
                <h3 className="mb-2 text-lg font-bold text-text-primary group-hover:text-brand">
                  {post.title}
                </h3>

                {/* 설명 - 항상 2줄 높이 유지 */}
                <p className="mb-4 line-clamp-2 min-h-[40px] text-sm text-text-secondary">
                  {post.description || '\u00A0'}
                </p>

                {/* 메타 정보 - 항상 하단 고정 */}
                <div className="mt-auto flex items-center justify-between text-xs text-text-secondary">
                  <span>{formatDate(post.pubDate)}</span>
                  <span>약 {post.readingTime}분</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
