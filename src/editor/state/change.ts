// 열기 판정(D5)과 변경 판정(D1 b)의 순수 함수 (재건 3단계)
// - resolveOpenDoc: editorJson의 markdownSha256이 지금 draft.markdown의 해시와 같으면 JSON 문서를 연다. 아니면 마크다운을 파싱한다.
// - buildEditorJson: 저장할 때 { v: 1, markdownSha256, doc }를 만든다.
// - isSameMeta: 메타(제목·설명·slug·분류·태그·연재·표지)가 같은지. 태그는 순서까지 같아야 한다.
// - 해시는 Web Crypto(crypto.subtle)로 만든다. 브라우저와 Node 20+에서 같이 돈다.

import type { JSONContent } from '@tiptap/core';
import { markdownToDoc, type ConversionWarning } from '@/editor/markdown';
import { draftInputSchema, type DraftInput } from '@/lib/entry-rules';
import { MAX_TAGS, normalizeTags } from '@/lib/taxonomy';

// 초안의 메타 부분(본문·editorJson 제외)
export type DraftMeta = Omit<DraftInput, 'markdown' | 'editorJson'>;

// draft.editorJson 형식 (D5)
export interface EditorJsonV1 {
  v: 1;
  markdownSha256: string;
  doc: JSONContent;
}

// 문자열의 SHA-256 소문자 16진수
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// editorJson이 v1 형식인지
export function isEditorJsonV1(value: unknown): value is EditorJsonV1 {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    typeof candidate.markdownSha256 === 'string' &&
    typeof candidate.doc === 'object' &&
    candidate.doc !== null &&
    (candidate.doc as JSONContent).type === 'doc'
  );
}

// 저장용 editorJson
export async function buildEditorJson(doc: JSONContent, markdown: string): Promise<EditorJsonV1> {
  return { v: 1, markdownSha256: await sha256Hex(markdown), doc };
}

// Firestore가 받는 가장 긴 필드 경로 (리뷰 6.2 지적 1)
// - SDK 검사: 값의 경로 길이 - 1 > 20이면 "Input object is deeper than 20 levels"로 거부한다(@google-cloud/firestore serializer).
// - 경로는 문서 최상위 필드부터 센다. draft.editorJson은 경로 길이 2에서 시작한다.
export const FIRESTORE_MAX_PATH_SIZE = 21;
const EDITOR_JSON_PATH_SIZE = 2;

// 값 안의 가장 긴 경로 길이(키·배열 위치 하나가 1)가 한도 안인지
export function fitsFirestoreDepth(value: unknown, startSize: number): boolean {
  const walk = (current: unknown, size: number): boolean => {
    if (size > FIRESTORE_MAX_PATH_SIZE) return false;
    if (Array.isArray(current)) return current.every((item) => walk(item, size + 1));
    if (current !== null && typeof current === 'object') {
      return Object.values(current).every((item) => walk(item, size + 1));
    }
    return true;
  };
  return walk(value, startSize);
}

// 저장 요청에 넣을 editorJson. Firestore 깊이 한도를 넘으면 null이다(열 때 마크다운에서 다시 만든다, D5)
// - 3단 중첩 목록 안의 굵게·링크 같은 문서가 한도를 넘는다. editorJson은 없어도 되는 값이다(Plan 9.2).
export async function editorJsonForSave(
  doc: JSONContent,
  markdown: string,
): Promise<EditorJsonV1 | null> {
  const editorJson = await buildEditorJson(doc, markdown);
  return fitsFirestoreDepth(editorJson, EDITOR_JSON_PATH_SIZE) ? editorJson : null;
}

// 브라우저의 임시 주소(blob:http…) 패턴. 업로드가 끝나지 않은 이미지다. 서버에 저장하면 안 된다(리뷰 6.2 지적 2)
const BLOB_URL_PATTERN = /blob:https?:\/\//i;

export function containsBlobUrl(markdown: string): boolean {
  return BLOB_URL_PATTERN.test(markdown);
}

// 저장 요청을 보내기 전에 서버와 같은 규칙으로 검사한다 (리뷰 6.2 지적 8)
// - draftInputSchema(형식)와 태그 정규화 뒤 3개 한도. 서버가 400을 낼 값은 보내지 않는다.
// - 실패하면 칸별 이유(첫 경로 조각 → 문구)를 돌려준다.
export function validateDraftForSave(
  draft: DraftInput,
): { ok: true } | { ok: false; issues: Record<string, string> } {
  const issues: Record<string, string> = {};
  const parsed = draftInputSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'draft');
      if (!(field in issues)) issues[field] = SAVE_ISSUE_MESSAGES[field] ?? issue.message;
    }
  }
  if (!('tags' in issues) && normalizeTags(draft.tags).length > MAX_TAGS) {
    issues.tags = `태그는 ${MAX_TAGS}개까지입니다`;
  }
  return Object.keys(issues).length === 0 ? { ok: true } : { ok: false, issues };
}

// 칸별 안내 문구 (zod 기본 문구 대신)
const SAVE_ISSUE_MESSAGES: Record<string, string> = {
  series: '연재 key는 영문 소문자·숫자·-만 쓰고, 순서는 1 이상입니다',
  cover: '표지 이미지를 올리거나 "생성"을 고르세요',
  tags: `태그는 ${MAX_TAGS}개까지입니다`,
  category: '카테고리 값이 올바르지 않습니다',
};

export interface OpenedDoc {
  source: 'json' | 'markdown';
  doc: JSONContent;
  warnings: ConversionWarning[];
}

// 열 때 어느 쪽을 쓸지 정한다 (D5)
export async function resolveOpenDoc(draft: {
  markdown: string;
  editorJson: unknown;
}): Promise<OpenedDoc> {
  if (isEditorJsonV1(draft.editorJson)) {
    const hash = await sha256Hex(draft.markdown);
    if (hash === draft.editorJson.markdownSha256) {
      return { source: 'json', doc: draft.editorJson.doc, warnings: [] };
    }
  }
  const { doc, warnings } = markdownToDoc(draft.markdown);
  return { source: 'markdown', doc, warnings };
}

// 메타를 비교용 문자열로 바꾼다(키 순서를 고정한다)
function metaKey(meta: DraftMeta): string {
  return JSON.stringify({
    title: meta.title,
    description: meta.description,
    slug: meta.slug,
    category: meta.category,
    tags: meta.tags,
    series: meta.series ? { key: meta.series.key, order: meta.series.order } : null,
    cover:
      meta.cover.kind === 'image'
        ? { kind: 'image', url: meta.cover.url, assetId: meta.cover.assetId ?? null }
        : { kind: 'generated' },
  });
}

// 두 메타가 같은지
export function isSameMeta(a: DraftMeta, b: DraftMeta): boolean {
  return metaKey(a) === metaKey(b);
}
