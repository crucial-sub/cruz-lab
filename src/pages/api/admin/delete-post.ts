import type { APIRoute } from 'astro';
import { deleteLocalPostFile } from '@/lib/server/content-post-files';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { deletePostFile } from '@/lib/server/github-posts';
import { generateMarkdownFileName } from '@/lib/markdown-publish';

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

    const body = await request.json();
    const fileName = generateMarkdownFileName({
      slug: body.slug,
      pubDate: body.pubDate,
    });

    const result = await deletePostFile({
      fileName,
      message: `🗑️ 포스트 삭제: ${body.title || body.slug}`,
    });
    await deleteLocalPostFile(fileName);

    return new Response(JSON.stringify({ ok: true, deleted: result.deleted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
