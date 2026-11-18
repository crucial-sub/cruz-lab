// 서가 문서 주소 QR 코드 API — 서가 화면 (서가 1단계 T6, Plan J20)
// - GET /api/admin/library/docs/{id}/qr → image/svg+xml. 읽기만 한다
// - 문서가 있는지 보지 않는다. 문서 id 꼴만 보고 서가 문서 주소를 그린다(Firestore를 읽지 않는다)

import type { APIRoute } from 'astro';
import { docIdParam, siteOrigin, withLibraryAdminApi } from '@/library/server/api';
import { libraryDocQrSvg } from '@/library/server/qr';

export const prerender = false;

export const GET: APIRoute = withLibraryAdminApi(async (context) => {
  const svg = await libraryDocQrSvg(siteOrigin(context), docIdParam(context));
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
