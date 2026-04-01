import type { APIRoute } from 'astro';
import { getFirestorePostBySlug } from '@/lib/server/firestore-posts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug가 필요합니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const post = await getFirestorePostBySlug(slug);

  if (!post) {
    return new Response(JSON.stringify({ message: '포스트를 찾을 수 없습니다.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    title: post.title,
    description: post.description,
    content: post.content,
    heroImage: post.heroImage,
    heroVideo: post.heroVideo,
    tags: post.tags,
    slug: post.slug,
    pubDate: post.pubDate.toISOString(),
    updatedDate: post.updatedDate.toISOString(),
    readingTime: post.readingTime,
    isPublic: post.isPublic,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
