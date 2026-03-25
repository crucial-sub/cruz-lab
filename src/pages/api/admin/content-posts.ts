import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { getPublishedContentPosts } from '@/lib/content-posts';

export const prerender = false;

function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const idToken = getIdToken(request);
    const adminUser = idToken ? await verifyAdminIdToken(idToken) : null;

    if (!adminUser) {
      return new Response(JSON.stringify({ message: '관리자 인증에 실패했습니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const posts = await getPublishedContentPosts();

    return new Response(
      JSON.stringify({
        posts: posts.map((post) => ({
          id: post.slug,
          title: post.title,
          description: post.description,
          tags: post.tags,
          slug: post.slug,
          pubDate: post.pubDate.toISOString(),
          updatedDate: post.updatedDate.toISOString(),
          readingTime: post.readingTime,
          status: 'published' as const,
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '포스트 목록을 불러오는 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
