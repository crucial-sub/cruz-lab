import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { getFirestorePostBySlug, upsertFirestorePost } from '@/lib/server/firestore-posts';
import { deletePostFile, upsertPostFile } from '@/lib/server/github-posts';
import { getPublicPostUrl } from '@/lib/server/site-url';
import { generateMarkdownContent, generateMarkdownFileName } from '@/lib/markdown-publish';

export const prerender = false;

function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

export const POST: APIRoute = async ({ request }) => {
  let currentStep = '관리자 인증';
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
    const targetSlug = body.originalSlug || body.slug;

    currentStep = '기존 포스트 확인';
    const existingPost = targetSlug ? await getFirestorePostBySlug(targetSlug) : null;
    const resolvedPubDate = body.pubDate || existingPost?.pubDate?.toISOString() || new Date().toISOString();
    const publishPayload = {
      ...body,
      pubDate: resolvedPubDate,
      updatedDate: body.updatedDate || new Date().toISOString(),
    };

    currentStep = 'markdown 백업 생성';
    const markdown = generateMarkdownContent(publishPayload);
    const nextFileName = generateMarkdownFileName({
      slug: publishPayload.slug,
      pubDate: resolvedPubDate,
    });

    currentStep = 'GitHub markdown 백업';
    const result = await upsertPostFile({
      fileName: nextFileName,
      content: markdown,
      message: publishPayload.isUpdate
        ? `포스트 백업 갱신: ${publishPayload.title}`
        : `새 포스트 백업: ${publishPayload.title}`,
    });

    try {
      currentStep = 'Firestore direct publish';
      await upsertFirestorePost({
        ...publishPayload,
        originalSlug: publishPayload.originalSlug,
      });
    } catch (firestoreError) {
      currentStep = 'Firestore 롤백 중';
      await deletePostFile({
        fileName: nextFileName,
        message: `Firestore 반영 실패로 백업 롤백: ${publishPayload.title}`,
      }).catch(() => null);

      throw firestoreError;
    }

    if (publishPayload.originalSlug && publishPayload.originalSlug !== publishPayload.slug) {
      currentStep = '이전 markdown 백업 정리';
      const previousFileName = generateMarkdownFileName({
        slug: publishPayload.originalSlug,
        pubDate: resolvedPubDate,
      });

      await deletePostFile({
        fileName: previousFileName,
        message: `URL 변경으로 이전 백업 삭제: ${publishPayload.originalSlug}`,
      }).catch(() => null);
    }

    currentStep = '공개 URL 생성';
    const publicUrl = getPublicPostUrl(request, publishPayload.slug);

    return new Response(
      JSON.stringify({
        ok: true,
        filePath: result.filePath,
        slug: publishPayload.slug,
        title: publishPayload.title,
        publicUrl,
        publishMode: 'firestore-direct',
        githubFileUrl: result.fileUrl,
        githubCommitUrl: result.commitUrl,
        githubCommitSha: result.commitSha,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[publish-post] failed at step:', currentStep, error);
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);

    return new Response(
      JSON.stringify({
        message: `${currentStep} 단계에서 실패했습니다.`,
        detail,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
