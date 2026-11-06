import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { getFirestorePostBySlug } from '@/lib/server/firestore-posts';

export const prerender = false;

// Authorization 헤더에서 Firebase ID 토큰을 꺼낸다
function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

// 에디터가 글을 불러올 때 쓰는 API
// - 비공개 글 본문도 돌려주므로 관리자 토큰을 반드시 확인한다.
export const GET: APIRoute = async ({ url, request }) => {
  const idToken = getIdToken(request);
  const adminUser = idToken ? await verifyAdminIdToken(idToken) : null;

  if (!adminUser) {
    return new Response(JSON.stringify({ message: '관리자 인증에 실패했습니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

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
    // 관리자 전용 응답이므로 CDN·브라우저에 저장하지 않는다
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
