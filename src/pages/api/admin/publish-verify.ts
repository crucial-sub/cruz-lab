import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { probeGitHubPostFile } from '@/lib/server/github-posts';
import { probePublicUrl } from '@/lib/server/site-url';

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

    const body = (await request.json()) as {
      slug?: string;
      filePath?: string;
      publicUrl?: string;
    };

    if (!body.slug || !body.publicUrl) {
      return new Response(JSON.stringify({ message: 'slug와 publicUrl이 필요합니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const githubFileCheck = await probeGitHubPostFile(body.filePath);
    const publicPageCheck = await probePublicUrl(body.publicUrl);

    const checks = [
      {
        id: 'github-file',
        label: 'GitHub 파일 반영',
        ready: githubFileCheck.ready,
        detail: githubFileCheck.detail,
      },
      {
        id: 'public-page',
        label: '공개 페이지 응답',
        ready: publicPageCheck.ready,
        detail: publicPageCheck.detail,
      },
    ];

    return new Response(
      JSON.stringify({
        ready: checks.every((check) => check.ready),
        verifiedAt: new Date().toISOString(),
        slug: body.slug,
        filePath: body.filePath,
        publicUrl: body.publicUrl,
        checks,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '출간 검증 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
