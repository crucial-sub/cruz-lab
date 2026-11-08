// 관리자 API 응답 도구 (재건 2단계 Plan 6.1)
// - 모든 응답에 Cache-Control: no-store를 붙인다.
// - 오류 형식: { "error": { "code", "message", "details" } }
// - 요청 본문은 JSON이고 zod로 검증한다. 틀리면 400.

import type { APIContext } from 'astro';
import type { z } from 'zod';
import { isSameOrigin, isWriteMethod } from '@/lib/admin-guard';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

// 성공 응답 (JSON)
export function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...NO_STORE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

// 본문 없는 성공 응답 (204)
export function noContentResponse(extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

// 오류 응답
export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  const error: { code: string; message: string; details?: unknown } = { code, message };
  if (details !== undefined) error.details = details;
  return jsonResponse({ error }, status);
}

// API 처리 중 던지는 오류. 경로 처리기가 errorResponse로 바꾼다
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// 요청 본문을 JSON으로 읽고 스키마로 검증한다. 실패하면 ApiError(400)
export async function parseJsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '요청 본문이 JSON이 아닙니다.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, 'INVALID_REQUEST', '요청 값이 올바르지 않습니다.', zodIssues(result.error));
  }
  return result.data;
}

// zod 오류 → [{ path, message }]
export function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

// 경로 처리기를 감싼다. ApiError는 그 응답으로, 그 밖의 오류는 500으로 바꾼다
export function withApiErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error.status, error.code, error.message, error.details);
      }
      console.error('[admin-api] 처리 중 오류', error);
      return errorResponse(500, 'INTERNAL_ERROR', '서버 오류가 났습니다.');
    }
  };
}

// 관리자 API 처리기를 감싼다 (미들웨어 검사에 더한 2차 검사)
// - 세션이 없으면(context.locals.admin) 401. 쓰기 요청의 Origin이 다르면 403.
// - 미들웨어 판정이 어떤 이유로 빗나가도 처리기가 혼자 열리지 않게 한다.
export function withAdminApi(handler: (context: APIContext) => Promise<Response>) {
  return withApiErrors(async (context: APIContext) => {
    if (!context.locals.admin) {
      throw new ApiError(401, 'UNAUTHENTICATED', '관리자 로그인이 필요합니다.');
    }
    assertSameOriginWrite(context.request);
    return handler(context);
  });
}

// 쓰기 요청이면 Origin이 요청 주소와 같은지 확인한다. 다르면 ApiError(403)
export function assertSameOriginWrite(request: Request) {
  if (isWriteMethod(request.method) && !isSameOrigin(request.headers.get('origin'), request.url)) {
    throw new ApiError(403, 'ORIGIN_MISMATCH', '요청 출처가 이 사이트가 아닙니다.');
  }
}
