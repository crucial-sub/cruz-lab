import type { APIRoute } from 'astro';
import { verifyAdminIdToken } from '@/lib/server/admin-auth';
import {
  deleteAdminSeries,
  getAdminSeriesById,
  listAdminSeries,
  saveAdminSeries,
} from '@/lib/server/admin-series';

export const prerender = false;

function getIdToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}

async function verifyRequest(request: Request) {
  const idToken = getIdToken(request);
  return idToken ? verifyAdminIdToken(idToken) : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serializeSeries(series: Awaited<ReturnType<typeof getAdminSeriesById>>) {
  if (!series) return null;

  return {
    ...series,
    createdAt: series.createdAt.toISOString(),
    updatedAt: series.updatedAt.toISOString(),
  };
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const adminUser = await verifyRequest(request);
    if (!adminUser) {
      return json({ message: '관리자 인증에 실패했습니다.' }, 401);
    }

    const id = url.searchParams.get('id');

    if (id) {
      const series = await getAdminSeriesById(id);
      if (!series) {
        return json({ message: '시리즈를 찾을 수 없습니다.' }, 404);
      }

      return json({ series: serializeSeries(series) });
    }

    const seriesList = await listAdminSeries();
    return json({
      series: seriesList.map((series) => serializeSeries(series)),
    });
  } catch (error) {
    return json(
      { message: error instanceof Error ? error.message : '시리즈를 불러오는 중 오류가 발생했습니다.' },
      500
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const adminUser = await verifyRequest(request);
    if (!adminUser) {
      return json({ message: '관리자 인증에 실패했습니다.' }, 401);
    }

    const body = await request.json();
    const id = await saveAdminSeries(body);

    return json({ ok: true, id });
  } catch (error) {
    return json(
      { message: error instanceof Error ? error.message : '시리즈 저장 중 오류가 발생했습니다.' },
      500
    );
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const adminUser = await verifyRequest(request);
    if (!adminUser) {
      return json({ message: '관리자 인증에 실패했습니다.' }, 401);
    }

    const id = url.searchParams.get('id');
    if (!id) {
      return json({ message: '삭제할 시리즈 id가 없습니다.' }, 400);
    }

    await deleteAdminSeries(id);
    return json({ ok: true, id });
  } catch (error) {
    return json(
      { message: error instanceof Error ? error.message : '시리즈 삭제 중 오류가 발생했습니다.' },
      500
    );
  }
};
