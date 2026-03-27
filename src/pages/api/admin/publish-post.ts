import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeLocalPostFile, deleteLocalPostFile } from '@/lib/server/content-post-files';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { deletePostFile, upsertPostFile, upsertRepositoryAssetFile } from '@/lib/server/github-posts';
import { getPublicPostUrl } from '@/lib/server/site-url';
import { generateMarkdownContent, generateMarkdownFileName } from '@/lib/markdown-publish';

export const prerender = false;

function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

function collectLocalAssetPaths(markdown: string, heroImage?: string) {
  const found = new Set<string>();
  const patterns = [/\((\/uploads\/[^)\s]+)\)/g, /["'](\/uploads\/[^"']+)["']/g];

  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      if (match[1]) {
        found.add(match[1]);
      }
    }
  }

  if (heroImage?.startsWith('/uploads/')) {
    found.add(heroImage);
  }

  return Array.from(found);
}

async function syncLocalAssetsToGitHub(assetPaths: string[]) {
  for (const assetPath of assetPaths) {
    const repositoryPath = `public${assetPath}`;
    const localFilePath = path.join(process.cwd(), repositoryPath);
    const buffer = await readFile(localFilePath);

    await upsertRepositoryAssetFile({
      filePath: repositoryPath,
      contentBase64: buffer.toString('base64'),
      message: `🖼️ 포스트 자산 반영: ${path.basename(assetPath)}`,
    });
  }
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

    const markdown = generateMarkdownContent(body);
    const nextFileName = generateMarkdownFileName({
      slug: body.slug,
      pubDate: body.pubDate,
    });

    if (body.originalSlug && body.originalSlug !== body.slug) {
      const previousFileName = generateMarkdownFileName({
        slug: body.originalSlug,
        pubDate: body.pubDate,
      });

      await deletePostFile({
        fileName: previousFileName,
        message: `🔄 URL 변경으로 이전 파일 삭제: ${body.originalSlug}`,
      });
      await deleteLocalPostFile(previousFileName);
    }

    await syncLocalAssetsToGitHub(collectLocalAssetPaths(markdown, body.heroImage));

    const result = await upsertPostFile({
      fileName: nextFileName,
      content: markdown,
      message: body.isUpdate
        ? `📝 포스트 수정: ${body.title}`
        : `✨ 새 포스트 발행: ${body.title}`,
    });
    await writeLocalPostFile(nextFileName, markdown);

    const publicUrl = getPublicPostUrl(request, body.slug);

    return new Response(
      JSON.stringify({
        ok: true,
        filePath: result.filePath,
        slug: body.slug,
        title: body.title,
        publicUrl,
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
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '출간 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
