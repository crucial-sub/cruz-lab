// 관리자 API fetch 래퍼 (재건 3단계 Plan 4.1 state/api.ts, 5절 API 대응표)
// - 모든 요청은 같은 origin, 세션 쿠키(credentials: same-origin), JSON이다.
// - 오류 응답 { error: { code, message, details } }는 ApiClientError로 던진다. 네트워크 실패는 NetworkError다.
// - 401이면 로그인 페이지로 보낸다(세션 만료). 호출하는 쪽이 redirectToLogin()을 부른다.

import type { DraftInput } from '@/lib/entry-rules';
import type { EntryKind, EntryPublished, EntryStatus } from '@/lib/entry-schema';
import type { UploadedAsset } from '@/editor/upload/image-size';
import type {
  UploadTransport,
  UploadUrlRequest,
  UploadUrlResponse,
} from '@/editor/upload/upload-client';

// 서버가 돌려준 오류
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// 요청이 서버에 닿지 못했다(오프라인, DNS, 중단)
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('서버에 연결할 수 없습니다.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

// GET /api/admin/posts/{id} 응답
export interface EntryResponse {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  lastPublishedAt: string | null;
  slugHistory: string[];
  hasUnpublishedChanges: boolean;
  draft: DraftInput & { version: number; updatedAt: string | null; device: string | null };
  published: EntryPublished | null;
  legacy: { postId: string } | null;
}

export interface SaveDraftResponse {
  version: number;
  updatedAt: string;
  assetUsage: 'ok' | 'failed';
}

export interface PublishResponse {
  revision: number;
  status: 'published';
  publicUrl: string | null;
  purge: 'ok' | 'skipped' | 'failed';
  backup: 'ok' | 'skipped' | 'failed';
  assetUsage: 'ok' | 'failed';
}

export interface VisibilityResponse {
  status: EntryStatus;
  changed: boolean;
  purge: 'ok' | 'skipped' | 'failed';
}

export interface FieldIssue {
  field: string;
  message: string;
}

// 응답 본문을 JSON으로 읽는다. 비어 있으면 null
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// fetch 한 번. 오류 응답은 ApiClientError, 연결 실패는 NetworkError
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new NetworkError(error);
  }
  const json = (await readJson(response)) as {
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      json?.error?.code ?? 'HTTP_ERROR',
      json?.error?.message ?? `요청이 실패했습니다 (${response.status}).`,
      json?.error?.details,
    );
  }
  return json as T;
}

// 관리자 앱(src/admin)도 같은 요청 함수를 쓴다(5단계 D9). 에디터 청크를 끌어오지 않도록 이 파일은 타입만 가져온다
export const apiRequest = request;

export const adminApi = {
  getEntry: (id: string) =>
    request<EntryResponse>('GET', `/api/admin/posts/${encodeURIComponent(id)}`),
  saveDraft: (
    id: string,
    body: { baseVersion: number; device: string | null; draft: DraftInput },
  ) => request<SaveDraftResponse>('PUT', `/api/admin/posts/${encodeURIComponent(id)}/draft`, body),
  discardDraft: (id: string, baseVersion: number) =>
    request<SaveDraftResponse>('POST', `/api/admin/posts/${encodeURIComponent(id)}/draft/discard`, {
      baseVersion,
    }),
  publish: (id: string, draftVersion: number) =>
    request<PublishResponse>('POST', `/api/admin/posts/${encodeURIComponent(id)}/publish`, {
      draftVersion,
    }),
  setVisibility: (id: string, visible: boolean) =>
    request<VisibilityResponse>('POST', `/api/admin/posts/${encodeURIComponent(id)}/visibility`, {
      visible,
    }),
  deleteEntry: (id: string) =>
    request<{ deleted: true }>('DELETE', `/api/admin/posts/${encodeURIComponent(id)}`, {
      confirm: id,
    }),
  logout: () => request<null>('DELETE', '/api/admin/session'),
};

// 422 details([{ field, message }])를 항목별 문구로 바꾼다
export function fieldIssuesOf(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError) || !Array.isArray(error.details)) return {};
  const issues: Record<string, string> = {};
  for (const item of error.details as Partial<FieldIssue>[]) {
    if (
      typeof item.field === 'string' &&
      typeof item.message === 'string' &&
      !(item.field in issues)
    ) {
      issues[item.field] = item.message;
    }
  }
  return issues;
}

// 세션이 끝났다. 지금 주소로 돌아오도록 로그인 페이지로 보낸다
export function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/admin/login?next=${encodeURIComponent(next)}`);
}

// Storage에 PUT한다. XMLHttpRequest라 진행률을 받을 수 있다(D11 5). 헤더는 requiredHeaders만 보낸다
function putWithProgress(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage 업로드가 실패했습니다 (${xhr.status}).`));
    };
    // 버킷 CORS(E2)가 없으면 여기로 온다
    xhr.onerror = () =>
      reject(new Error('Storage에 올리지 못했습니다. 버킷 CORS 설정을 확인하세요.'));
    xhr.onabort = () => reject(new Error('업로드가 중단되었습니다.'));
    xhr.send(blob);
  });
}

// 실제 전송 (upload-client의 UploadTransport 구현)
export const uploadTransport: UploadTransport = {
  requestUploadUrl: (input: UploadUrlRequest) =>
    request<UploadUrlResponse>('POST', '/api/admin/assets/upload-url', input),
  put: putWithProgress,
  finalize: (assetId: string) =>
    request<{ asset: UploadedAsset }>(
      'POST',
      `/api/admin/assets/${encodeURIComponent(assetId)}/finalize`,
    ),
};
