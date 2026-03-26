import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { getGitHubPublishTarget, probeGitHubPublishTarget } from '@/lib/server/github-posts';
import { getPublishSiteInfo, probePublicSiteUrl } from '@/lib/server/site-url';

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
    const siteInfo = getPublishSiteInfo(request);
    const gitHubTargetCheck = await probeGitHubPublishTarget();
    const publicSiteCheck = await probePublicSiteUrl(siteInfo.publicSiteUrl);
    const checks = [
      {
        id: 'admin-session',
        label: '관리자 세션',
        kind: 'active' as const,
        ready: true,
        detail: `현재 세션은 ${adminUser.email} 계정 기준으로 관리자 인증을 통과했습니다.`,
      },
      {
        id: 'github-target',
        label: 'GitHub 반영 대상',
        kind: 'active' as const,
        ready: gitHubTargetCheck.ready,
        detail: gitHubTargetCheck.detail,
      },
      {
        id: 'public-site-origin',
        label: '공개 사이트 기준',
        kind: 'config' as const,
        ready: Boolean(siteInfo.publicSiteUrl),
        detail:
          siteInfo.publicSiteUrl === siteInfo.currentOrigin
            ? `현재 접속 origin과 공개 사이트 기준이 같습니다. (${siteInfo.publicSiteUrl})`
            : `현재 접속 origin은 ${siteInfo.currentOrigin}이고, 공개 링크는 ${siteInfo.publicSiteUrl} 기준으로 계산합니다.`,
      },
      {
        id: 'public-site-live',
        label: '공개 사이트 응답',
        kind: 'active' as const,
        ready: publicSiteCheck.ready,
        detail: publicSiteCheck.detail,
      },
    ];

    return new Response(
      JSON.stringify({
        ready: checks.every((check) => check.ready),
        verifiedAt: new Date().toISOString(),
        checks,
        target: {
          repository: target.repository,
          branch: target.branch,
          postsPath: target.postsPath,
          siteUrl: siteInfo.publicSiteUrl,
          currentOrigin: siteInfo.currentOrigin,
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
