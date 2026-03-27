import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

  const diskPath = path.join(process.cwd(), 'public', assetPath.replace(/^\/+/, ''));

  try {
    const buffer = await readFile(diskPath);
    const extension = path.extname(diskPath).toLowerCase();
    const contentType = MIME_BY_EXTENSION[extension] || 'application/octet-stream';

    return new Response(buffer, {
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

