// 관련 포스트 추천 컴포넌트
// 태그 기반으로 유사한 포스트를 추천
import { motion } from 'framer-motion';
import BlogCard from './BlogCard';

interface Post {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  heroImage?: string;
  tags: string[];
  readingTime?: number;
}

interface Props {
  posts: Post[];
}

export default function RelatedPosts({ posts }: Props) {
  if (posts.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mt-16"
    >
      <h2 className="mb-8 text-2xl font-bold">
        <span className="text-brand">관련</span> 포스트
      </h2>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, index) => (
          <motion.div
            key={post.slug}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <BlogCard
              slug={post.slug}
              title={post.title}
              description={post.description}
              pubDate={post.pubDate}
              heroImage={post.heroImage}
              tags={post.tags}
              readingTime={post.readingTime}
            />
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
