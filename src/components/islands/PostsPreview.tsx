// Home 페이지용 블로그 포스트 미리보기 섹션
// Firebase에서 최신 포스트를 가져와 표시
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getPublishedPosts, type Post } from '@/lib/posts';
import BlogCard from './BlogCard';
import MagneticButton from './MagneticButton';
import TextReveal from './TextReveal';

export default function PostsPreview() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const allPosts = await getPublishedPosts();
        // 최신 3개만 표시
        setPosts(allPosts.slice(0, 3));
      } catch (error) {
        console.error('포스트 로딩 오류:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPosts();
  }, []);

  return (
    <section className="py-16">
      {/* 섹션 헤더 */}
      <div className="mb-12 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="mb-2 text-3xl font-bold md:text-4xl">
            <TextReveal text="Latest " type="chars" staggerChildren={0.05} />
            <span className="text-brand">
              <TextReveal text="Posts" type="chars" staggerChildren={0.05} delay={0.3} />
            </span>
          </h2>
          <p className="text-text-secondary">최근 작성한 블로그 포스트입니다</p>
        </div>
        <MagneticButton href="/blog" strength={0.2}>
          <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-surface/50 px-4 py-2 font-medium transition-colors hover:border-brand hover:text-brand">
            모든 포스트 보기
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </span>
        </MagneticButton>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}

      {/* 포스트 그리드 */}
      {!isLoading && posts.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <BlogCard
              key={post.id}
              title={post.title}
              description={post.description || ''}
              pubDate={post.pubDate}
              heroImage={post.heroImage || `https://picsum.photos/seed/${post.id}/600/400`}
              heroVideo={post.heroVideo}
              tags={post.tags}
              slug={post.slug}
              index={index}
              readingTime={post.readingTime}
            />
          ))}
        </div>
      )}

      {/* 포스트가 없을 경우 */}
      {!isLoading && posts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-8 text-center"
        >
          <p className="text-text-secondary">아직 작성된 포스트가 없습니다.</p>
        </motion.div>
      )}
    </section>
  );
}
