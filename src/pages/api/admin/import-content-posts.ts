import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { listEditableMarkdownPosts } from '@/lib/server/content-post-files';
import { upsertFirestorePost } from '@/lib/server/firestore-posts';
import { calculateReadingTime } from '@/utils/readingTime';

export const prerender = false;

function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const idToken = getIdToken(request);
    const adminUser = idToken ? await verifyAdminIdToken(idToken) : null;

    if (!adminUser) {
      return new Response(JSON.stringify({ message: '관리자 인증에 실패했습니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const markdownPosts = await listEditableMarkdownPosts();
    let importedCount = 0;

    for (const post of markdownPosts) {
      await upsertFirestorePost({
        title: post.title,
        description: post.description,
        content: post.content,
        heroImage: post.heroImage,
        heroVideo: post.heroVideo,
        tags: post.tags,
        slug: post.slug,
        readingTime: post.readingTime || calculateReadingTime(post.content),
        isPublic: post.isPublic !== false,
        pubDate: post.pubDate,
        updatedDate: post.updatedDate || post.pubDate,
      });
      importedCount += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        importedCount,
        totalCount: markdownPosts.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '기존 markdown 포스트 이관 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
