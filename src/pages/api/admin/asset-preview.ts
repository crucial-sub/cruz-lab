import type { APIRoute } from 'astro';
import { getGitHubRawFileUrl } from '@/lib/server/github-posts';

export const prerender = false;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function sanitizeAssetPath(rawPath: string | null) {
  if (!rawPath || !rawPath.startsWith('/uploads/')) {
    return null;
  }

  if (rawPath.includes('..')) {
    return null;
  }

  return rawPath;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const assetPath = sanitizeAssetPath(url.searchParams.get('path'));

  if (!assetPath) {
    return new Response('잘못된 자산 경로입니다.', { status: 400 });
  }

  const repositoryPath = `public${assetPath}`;
  const rawUrl = getGitHubRawFileUrl(repositoryPath);

  try {
    const upstream = await fetch(rawUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      return new Response('자산을 찾을 수 없습니다.', { status: upstream.status });
    }

    const extension = assetPath.slice(assetPath.lastIndexOf('.')).toLowerCase();
    const contentType =
      upstream.headers.get('content-type') ||
      MIME_BY_EXTENSION[extension] ||
      'application/octet-stream';

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('자산을 찾을 수 없습니다.', { status: 404 });
  }
};
