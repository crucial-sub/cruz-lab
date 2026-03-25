import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { ContentPost } from '@/lib/content-posts';

interface Props {
  post: Omit<ContentPost, 'pubDate' | 'updatedDate'> & {
    pubDate: string | Date;
    updatedDate: string | Date;
  };
}

export default function MarkdownPostView({ post }: Props) {
  const pubDate = post.pubDate instanceof Date ? post.pubDate : new Date(post.pubDate);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);

  return (
    <div className="py-8">
      <a
        href="/blog"
        className="group mb-8 inline-flex items-center gap-2 text-text-secondary transition-colors hover:text-brand"
      >
        <svg
          className="h-4 w-4 transition-transform group-hover:-translate-x-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        블로그로 돌아가기
      </a>

      <div className="relative mx-auto max-w-4xl">
        <article className="min-w-0">
          <header className="mb-8">
            {post.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <a
                    key={tag}
                    href={`/blog/tag/${tag}`}
                    className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand transition-colors hover:bg-brand/20"
                  >
                    {tag}
                  </a>
                ))}
              </div>
            )}

            <h1 className="mb-6 text-3xl font-extrabold leading-tight text-text-primary md:text-4xl lg:text-5xl">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-text-secondary">
              <time dateTime={pubDate.toISOString()} className="flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {formatDate(pubDate)}
              </time>

              <span className="flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                약 {post.readingTime}분 소요
              </span>
            </div>
          </header>

          {(post.heroVideo || post.heroImage) && (
            <div className="mb-12 overflow-hidden rounded-2xl border border-border">
              {post.heroVideo ? (
                <video
                  src={post.heroVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ viewTransitionName: `post-hero-${post.slug}` }}
                  className="w-full object-cover"
                />
              ) : (
                <img
                  src={post.heroImage}
                  alt={post.title}
                  style={{ viewTransitionName: `post-hero-${post.slug}` }}
                  className="w-full object-cover"
                />
              )}
            </div>
          )}

          <div className="prose prose-lg mx-auto max-w-none dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, rehypeRaw]}
              components={{
                img: ({ src, alt, ...props }) => {
                  const videoExtensions = ['.webm', '.mp4', '.mov'];
                  const isVideo = src && videoExtensions.some((ext) => src.toLowerCase().endsWith(ext));

                  if (isVideo) {
                    return (
                      <video
                        src={src}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full rounded-lg"
                        title={alt}
                      />
                    );
                  }

                  return <img src={src} alt={alt} {...props} className="rounded-lg" loading="lazy" />;
                },
                a: ({ href, children, ...props }) => {
                  const isExternal = href?.startsWith('http');
                  return (
                    <a
                      href={href}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noopener noreferrer' : undefined}
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  return isInline ? (
                    <code className="rounded bg-bg-card px-1.5 py-0.5 text-sm" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>
        </article>
      </div>
    </div>
  );
}
