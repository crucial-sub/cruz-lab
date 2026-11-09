// 기본 OG 이미지 /og/default.png (재건 4단계 D13, prerender)
// - 홈·목록·카테고리·태그·연재·about·404처럼 글이 아닌 페이지가 쓴다(BaseHead 기본값).
// - 빌드 때 한 번 그려 정적 파일로 낸다. 함수를 거치지 않는다.
import type { APIRoute } from 'astro';
import { ogDefaultInput } from '@/lib/og-template';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/public-paths';
import { renderOgPng } from '@/lib/server/og-image';

export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderOgPng(ogDefaultInput(SITE_TITLE, SITE_DESCRIPTION));
  return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
};
