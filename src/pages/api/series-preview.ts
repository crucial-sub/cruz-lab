import type { APIRoute } from 'astro';
import { getPublishedSeries, getSeriesReadingTime } from '@/lib/series';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const seriesList = await getPublishedSeries();
    const items = await Promise.all(
      seriesList.map(async (series) => ({
        ...series,
        totalReadingTime: await getSeriesReadingTime(series.id),
      }))
    );

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
