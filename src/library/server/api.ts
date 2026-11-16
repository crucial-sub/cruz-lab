// 서가 API 공용 (서가 1단계 T4, Plan 5.1·J16)
// - 쿠키 API(/api/admin/library/**): 기존 관리자 검사(withAdminApi)에 LIBRARY_ENABLED 검사를 더한다.
// - 토큰 API(/api/library/token/**): 미들웨어 검사에 더해 처리기가 서가 토큰을 한 번 더 확인한다.
//   쿠키를 보지 않는다. 그래서 Origin 검사가 필요 없다(5.1).
// - 요청 본문 스키마도 여기에 둔다.

import type { APIContext } from 'astro';
import { z } from 'zod';
import { ApiError, withAdminApi, withApiErrors } from '@/lib/server/api-response';
import { isLibraryEnabled } from '../host';
import { MAX_FILE_COUNT } from '../rules';
import { isDocId, verifyBearerToken } from '../ticket';

// 서가가 켜져 있는가 (LIBRARY_ENABLED)
export function libraryEnabled(): boolean {
  return isLibraryEnabled(import.meta.env.LIBRARY_ENABLED);
}

function assertEnabled(): void {
  if (!libraryEnabled()) throw new ApiError(404, 'NOT_FOUND', '없는 주소입니다.');
}

// 쿠키 API 처리기를 감싼다
export function withLibraryAdminApi(handler: (context: APIContext) => Promise<Response>) {
  return withAdminApi(async (context) => {
    assertEnabled();
    return handler(context);
  });
}

// 토큰 API 처리기를 감싼다 (미들웨어 판정이 빗나가도 처리기가 혼자 열리지 않게)
export function withLibraryTokenApi(handler: (context: APIContext) => Promise<Response>) {
  return withApiErrors(async (context: APIContext) => {
    assertEnabled();
    const ok = verifyBearerToken(context.request.headers.get('authorization'), import.meta.env.LIBRARY_TOKEN_SHA256);
    if (!ok || !context.locals.libraryToken) {
      throw new ApiError(401, 'UNAUTHENTICATED', '서가 토큰이 필요합니다.');
    }
    return handler(context);
  });
}

// 응답의 서가 문서 주소에 쓸 블로그 출처
export function siteOrigin(context: APIContext): string {
  return context.url.origin;
}

// 경로의 문서 id. 꼴이 틀리면 404
export function docIdParam(context: APIContext): string {
  const id = context.params.id;
  if (!isDocId(id)) throw new ApiError(404, 'NOT_FOUND', '서가 문서가 없습니다.');
  return id;
}

// ---------- 요청 본문 ----------

const manifestFileSchema = z.object({
  path: z.string().min(1).max(1024),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
});

const filesSchema = z.array(manifestFileSchema).min(1).max(MAX_FILE_COUNT + 1);
const formatSchema = z.enum(['md', 'html']);
const fileNameSchema = z.string().min(1).max(300);

// 서가 화면 올리기 시작: 프로젝트 + 올린 상대 경로
export const webStartSchema = z.object({
  format: formatSchema,
  project: z.string().min(1).max(64),
  relativePath: z.string().min(1).max(1024),
  fileName: fileNameSchema,
  files: filesSchema,
});

// 맥 입구 올리기 시작: 원본 경로(~/…)
export const macStartSchema = z.object({
  format: formatSchema,
  sourcePath: z.string().min(3).max(1024),
  fileName: fileNameSchema,
  files: filesSchema,
});

export const finalizeSchema = z.object({
  docId: z.string().refine(isDocId, { message: '문서 id 꼴이 틀렸습니다' }),
  rev: z.number().int().positive(),
});
