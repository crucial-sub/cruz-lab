import type { APIRoute } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import { getPublishSiteInfo } from '@/lib/server/site-url';

export const prerender = false;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
]);

function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

function sanitizeSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildAssetFilePath(scope: string, fileName: string) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const extension = fileName.split('.').pop()?.toLowerCase() || 'bin';
  const baseName = sanitizeSegment(fileName.replace(/\.[^/.]+$/, '')).slice(0, 40) || 'asset';
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const normalizedScope = sanitizeSegment(scope) || 'cms';

  return `public/uploads/${normalizedScope}/${year}/${month}/${baseName}-${timestamp}-${random}.${extension}`;
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

    const formData = await request.formData();
    const file = formData.get('file');
    const scope = String(formData.get('scope') || 'cms');

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ message: '업로드할 파일이 없습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return new Response(JSON.stringify({ message: `지원하지 않는 파일 형식입니다: ${file.type}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const filePath = buildAssetFilePath(scope, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const localFilePath = path.join(process.cwd(), filePath);
    await mkdir(path.dirname(localFilePath), { recursive: true });
    await writeFile(localFilePath, buffer);

    const { publicSiteUrl, currentOrigin } = getPublishSiteInfo(request);
    const publicPath = `/${filePath.replace(/^public\//, '')}`;
    const publicUrl = new URL(publicPath, publicSiteUrl).toString();
    const previewUrl = new URL(publicPath, currentOrigin).toString();

    return new Response(
      JSON.stringify({
        ok: true,
        filePath,
        publicPath,
        publicUrl,
        previewUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '자산 업로드 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
