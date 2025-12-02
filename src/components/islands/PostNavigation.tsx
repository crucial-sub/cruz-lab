// 이전/다음 포스트 네비게이션 컴포넌트
// 애니메이션과 함께 이전/다음 포스트로 이동
import { motion } from 'framer-motion';

interface NavigationPost {
  slug: string;
  title: string;
}

interface Props {
  prevPost?: NavigationPost;
  nextPost?: NavigationPost;
}

export default function PostNavigation({ prevPost, nextPost }: Props) {
  if (!prevPost && !nextPost) return null;

  return (
    <motion.nav
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mt-12 grid gap-4 sm:grid-cols-2"
      aria-label="포스트 네비게이션"
    >
      {/* 이전 포스트 */}
      {prevPost ? (
        <motion.a
          href={`/blog/${prevPost.slug}`}
          className="group flex flex-col rounded-xl border border-border bg-bg-surface p-5 transition-all hover:border-brand hover:shadow-lg"
          whileHover={{ x: -4 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
            <svg
              className="h-4 w-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            이전 포스트
          </span>
          <span className="font-semibold text-text-primary line-clamp-2 transition-colors group-hover:text-brand">
            {prevPost.title}
          </span>
        </motion.a>
      ) : (
        <div /> // 그리드 레이아웃 유지용
      )}

      {/* 다음 포스트 */}
      {nextPost ? (
        <motion.a
          href={`/blog/${nextPost.slug}`}
          className="group flex flex-col items-end rounded-xl border border-border bg-bg-surface p-5 text-right transition-all hover:border-brand hover:shadow-lg"
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
            다음 포스트
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </span>
          <span className="font-semibold text-text-primary line-clamp-2 transition-colors group-hover:text-brand">
            {nextPost.title}
          </span>
        </motion.a>
      ) : (
        <div /> // 그리드 레이아웃 유지용
      )}
    </motion.nav>
  );
}
