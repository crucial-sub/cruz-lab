import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { getGitHubPublishTarget } from '@/lib/server/github-posts';

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

    const target = getGitHubPublishTarget();
    const checks = [
      {
        id: 'github-token',
        label: 'GitHub 토큰',
        ready: Boolean(import.meta.env.GITHUB_TOKEN),
        detail: import.meta.env.GITHUB_TOKEN
          ? '서버에서 GitHub API 호출에 필요한 토큰을 읽을 수 있습니다.'
          : 'GITHUB_TOKEN이 없어 markdown 파일을 GitHub에 반영할 수 없습니다.',
      },
      {
        id: 'firebase-api-key',
        label: 'Firebase 인증 키',
        ready: Boolean(import.meta.env.PUBLIC_FIREBASE_API_KEY),
        detail: import.meta.env.PUBLIC_FIREBASE_API_KEY
          ? '관리자 인증 확인용 Firebase API 키가 설정돼 있습니다.'
          : 'PUBLIC_FIREBASE_API_KEY가 없어 관리자 인증 확인이 불안정합니다.',
      },
      {
        id: 'admin-email',
        label: '관리자 이메일',
        ready: Boolean(import.meta.env.PUBLIC_ADMIN_EMAIL),
        detail: import.meta.env.PUBLIC_ADMIN_EMAIL
          ? `관리자 계정은 ${import.meta.env.PUBLIC_ADMIN_EMAIL} 기준으로 확인됩니다.`
          : 'PUBLIC_ADMIN_EMAIL이 없어 관리자 권한 검증 기준이 없습니다.',
      },
    ];

    return new Response(
      JSON.stringify({
        ready: checks.every((check) => check.ready),
        checks,
        target: {
          repository: target.repository,
          branch: target.branch,
          postsPath: target.postsPath,
          siteUrl: new URL('/', request.url).toString(),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '출간 상태 확인 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
