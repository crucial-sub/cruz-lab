import type { APIRoute } from 'astro';
import { getEditablePostBySlug } from '@/lib/server/content-post-files';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug가 필요합니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const post = await getEditablePostBySlug(slug);

  if (!post) {
    return new Response(JSON.stringify({ message: '포스트를 찾을 수 없습니다.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(post), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
