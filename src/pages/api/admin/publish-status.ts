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
    const hasFirebasePublicConfig = Boolean(
      import.meta.env.PUBLIC_FIREBASE_PROJECT_ID &&
      import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET &&
      import.meta.env.PUBLIC_FIREBASE_API_KEY
    );
    const hasFirebaseAdminConfig = Boolean(
      (import.meta.env.FIREBASE_ADMIN_PROJECT_ID || import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) &&
      import.meta.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      import.meta.env.FIREBASE_ADMIN_PRIVATE_KEY
    );
    const checks = [
      {
        id: 'admin-session',
        label: '관리자 세션',
        kind: 'active' as const,
        ready: true,
        detail: `현재 세션은 ${adminUser.email} 계정 기준으로 관리자 인증을 통과했습니다.`,
      },
      {
        id: 'firebase-project',
        label: 'Firebase 공개 설정',
        kind: 'config' as const,
        ready: hasFirebasePublicConfig,
        detail: hasFirebasePublicConfig
          ? `Storage 업로드와 클라이언트 인증에 필요한 Firebase 공개 설정을 확인했습니다. (${import.meta.env.PUBLIC_FIREBASE_PROJECT_ID})`
          : 'Firebase 프로젝트/Storage 설정이 비어 있어 direct publish를 진행할 수 없습니다.',
      },
      {
        id: 'firebase-admin',
        label: 'Firebase 관리자 서버',
        kind: 'config' as const,
        ready: hasFirebaseAdminConfig,
        detail: hasFirebaseAdminConfig
          ? 'Firestore direct publish에 필요한 Firebase Admin SDK 설정을 확인했습니다.'
          : 'FIREBASE_ADMIN_CLIENT_EMAIL 또는 FIREBASE_ADMIN_PRIVATE_KEY가 없어 서버에서 Firestore direct publish를 수행할 수 없습니다.',
      },
      {
        id: 'github-target',
        label: 'Markdown 백업 대상',
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
          publishMode: 'firestore-direct' as const,
          repository: target.repository,
          branch: target.branch,
          backupPath: target.postsPath,
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
