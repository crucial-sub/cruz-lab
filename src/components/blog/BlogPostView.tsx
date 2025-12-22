// Firebase에서 개별 포스트를 가져와 렌더링
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { getPostBySlug, type Post } from '@/lib/posts';
import { getSeriesByPostId, getPostsBySeries } from '@/lib/series';
import SeriesWidget from '../islands/SeriesWidget';

interface Props {
  slug: string;
}

interface SeriesData {
  seriesName: string;
  seriesSlug: string;
  posts: { id: string; title: string; slug: string; order: number }[];
}

export default function BlogPostView({ slug }: Props) {
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesData, setSeriesData] = useState<SeriesData | null>(null);

  useEffect(() => {
    async function fetchPost() {
      try {
        const postData = await getPostBySlug(slug);
        if (!postData) {
          setError('포스트를 찾을 수 없습니다.');
        } else {
          setPost(postData);
        }
      } catch (err) {
        console.error('포스트 로딩 오류:', err);
        setError('포스트를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchPost();
  }, [slug]);

  // 시리즈 데이터 가져오기
  useEffect(() => {
    async function fetchSeriesData() {
      if (!post || !post.seriesId) return;

      try {
        const series = await getSeriesByPostId(post.id);
        if (!series) return;

        const posts = await getPostsBySeries(series.id);
        setSeriesData({
          seriesName: series.name,
          seriesSlug: series.slug,
          posts: posts.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            order: p.order,
          })),
        });

        // 포스트를 읽은 것으로 표시 (localStorage)
        const readPosts = JSON.parse(localStorage.getItem(`series-${series.slug}-read`) || '[]');
        if (!readPosts.includes(post.id)) {
          readPosts.push(post.id);
          localStorage.setItem(`series-${series.slug}-read`, JSON.stringify(readPosts));
        }
      } catch (err) {
        console.error('시리즈 데이터 로딩 오류:', err);
      }
    }
    fetchSeriesData();
  }, [post]);

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
      <div className="flex items-center justify-center py-32">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="py-32 text-center">
        <h1 className="mb-4 text-2xl font-bold text-text-primary">404</h1>
        <p className="mb-8 text-text-secondary">{error || '포스트를 찾을 수 없습니다.'}</p>
        <a
          href="/blog"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:brightness-110"
        >
          블로그로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <div className="py-8">
      {/* 뒤로가기 링크 */}
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

      {/* 2열 레이아웃 제거 -> 중앙 정렬 컨테이너 + 플로팅 사이드바 전략 */}
      <div className="relative mx-auto max-w-4xl">
        {/* 메인 콘텐츠 */}
        <article className="min-w-0">
          {/* 헤더 영역 */}
          <header className="mb-8">
            {/* 태그 */}
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

            {/* 제목 */}
            <h1 className="mb-6 text-3xl font-extrabold leading-tight md:text-4xl lg:text-5xl text-text-primary">
              {post.title}
            </h1>

            {/* 메타 정보 */}
            <div className="flex flex-wrap items-center gap-4 text-text-secondary">
              <time dateTime={post.pubDate.toISOString()} className="flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {formatDate(post.pubDate)}
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

          {/* 대표 미디어 (동영상 우선, 없으면 이미지) */}
          {(post.heroVideo || post.heroImage) && (
            <div className="mb-12 overflow-hidden rounded-2xl border border-border">
              {post.heroVideo ? (
                // 자동재생 무한반복 동영상
                <video
                  src={post.heroVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full object-cover"
                />
              ) : (
                <img src={post.heroImage} alt={post.title} className="w-full object-cover" />
              )}
            </div>
          )}

          {/* 본문 콘텐츠 */}
          <div className="prose prose-lg mx-auto max-w-none dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, rehypeRaw]}
              components={{
                // 이미지/동영상 커스텀 렌더링
                // .webm, .mp4, .mov 확장자는 자동재생 무한반복 동영상으로 처리
                img: ({ node, src, alt, ...props }) => {
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
                        className="rounded-lg w-full"
                        title={alt}
                      />
                    );
                  }

                  return <img src={src} alt={alt} {...props} className="rounded-lg" loading="lazy" />;
                },
                // 링크 새 탭에서 열기 (외부 링크)
                a: ({ node, href, children, ...props }) => {
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
                // 코드 블록
                code: ({ node, className, children, ...props }) => {
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

          {/* 하단 시리즈 위젯 (모바일/데스크톱 공통) */}
          {seriesData && (
            <div className="mt-16 border-t border-border pt-8">
              <SeriesWidget
                seriesName={seriesData.seriesName}
                seriesSlug={seriesData.seriesSlug}
                currentPostId={post.id}
                posts={seriesData.posts}
              />
            </div>
          )}

          {/* 모든 글 보기 링크 */}
          <div className="mt-16 flex justify-center border-t border-border pt-8">
            <a
              href="/blog"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-6 py-3 font-semibold text-text-primary transition-colors hover:border-brand hover:text-brand"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
              모든 글 보기
            </a>
          </div>
        </article>

        {/* 플로팅 시리즈 위젯 (초대형 화면 전용) */}
        {seriesData && (
          <div className="absolute left-full top-0 hidden h-full 2xl:block">
            <div className="sticky top-20 ml-8 w-[320px]">
              <SeriesWidget
                seriesName={seriesData.seriesName}
                seriesSlug={seriesData.seriesSlug}
                currentPostId={post.id}
                posts={seriesData.posts}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
