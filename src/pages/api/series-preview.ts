import type { APIRoute } from 'astro';
import { getPublishedSeriesWithReadingTime } from '@/lib/series';
import { PUBLIC_PAGE_CACHE_CONTROL } from '@/lib/server/cache-headers';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    // 시리즈 목록과 글 목록을 한 번씩만 조회해서 읽기 시간을 계산한다
    const items = await getPublishedSeriesWithReadingTime();

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': PUBLIC_PAGE_CACHE_CONTROL },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : '시리즈 미리보기를 불러오는 중 오류가 발생했습니다.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
