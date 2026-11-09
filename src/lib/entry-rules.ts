// 글 API 규칙 (재건 2단계 D4, Plan 6.3)
// - 순수 함수만 둔다. Firestore를 읽거나 쓰지 않는다. 단위 테스트 대상이다.
// - 초안 저장 입력, 발행 검사, 발행본 만들기, slug 기록, 숨김 전이를 정한다.
// - 상대 경로 import에 `.ts`를 붙인다(다른 공유 모듈과 같은 규칙).

import { z } from 'zod';
import {
  coverSchema,
  seriesRefSchema,
  type EntryContent,
  type EntryKind,
  type EntryPublished,
  type EntryStatus,
} from './entry-schema.ts';
import { CATEGORY_KEYS, MAX_TAGS, buildNoteSlug, isValidSlug, normalizeTags } from './taxonomy.ts';
import { calculateReadingTime, countWords } from '../utils/readingTime.ts';

// 초안 크기 상한 (Plan 4.1: 문서 한도 1 MiB, 초안은 900 KB를 넘으면 거부)
export const MAX_DRAFT_BYTES = 900 * 1024;
// 발행 제목 길이 (Plan 6.3)
export const MAX_TITLE_LENGTH = 120;
// 기기 이름 길이 상한
export const MAX_DEVICE_LENGTH = 60;

// API로 새로 만들 수 있는 kind. project는 4단계에서 옮긴다(D11)
export const CREATABLE_KINDS = ['post', 'note'] as const;

// 초안 저장 요청의 draft 값 (PUT /api/admin/posts/{id}/draft)
// - 형식만 검사한다. 필수 값은 발행할 때 검사한다.
// - 태그는 여기서 받은 뒤 normalizeDraftInput이 정규화하고 개수를 검사한다.
export const draftInputSchema = z.object({
  title: z.string().max(1000),
  description: z.string().max(5000),
  slug: z.string().max(300),
  category: z.enum(CATEGORY_KEYS).nullable(),
  tags: z.array(z.string().max(100)).max(20),
  series: seriesRefSchema.nullable(),
  cover: coverSchema,
  markdown: z.string(),
  editorJson: z.record(z.string(), z.unknown()).nullable(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

// 검사 실패 항목
export interface FieldIssue {
  field: string;
  message: string;
}

export type NormalizedDraft = EntryContent & { editorJson: Record<string, unknown> | null };

// 초안 입력을 저장할 값으로 바꾼다
// - 태그를 정규화한다(D2 규칙 1~6). 3개를 넘으면 실패한다.
// - 직렬화한 크기가 900 KB를 넘으면 실패한다.
export function normalizeDraftInput(
  input: DraftInput,
): { ok: true; draft: NormalizedDraft } | { ok: false; status: 400 | 413; issues: FieldIssue[] } {
  const tags = normalizeTags(input.tags);
  if (tags.length > MAX_TAGS) {
    return { ok: false, status: 400, issues: [{ field: 'tags', message: `태그는 ${MAX_TAGS}개까지입니다` }] };
  }
  const draft: NormalizedDraft = {
    title: input.title,
    description: input.description,
    slug: input.slug,
    category: input.category,
    tags,
    series: input.series,
    cover: input.cover,
    markdown: input.markdown,
    editorJson: input.editorJson,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(draft)).length;
  if (bytes > MAX_DRAFT_BYTES) {
    return {
      ok: false,
      status: 413,
      issues: [{ field: 'draft', message: `초안이 ${MAX_DRAFT_BYTES} 바이트를 넘습니다 (${bytes})` }],
    };
  }
  return { ok: true, draft };
}

// 빈 초안 내용 (POST /api/admin/posts)
export function emptyEntryContent(): EntryContent {
  return {
    title: '',
    description: '',
    slug: '',
    category: null,
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: '',
  };
}

// 문서의 내용 필드만 꺼낸다 (draft·published 공통)
export function pickEntryContent(source: EntryContent): EntryContent {
  return {
    title: source.title,
    description: source.description,
    slug: source.slug,
    category: source.category,
    tags: [...source.tags],
    series: source.series ? { ...source.series } : null,
    cover: { ...source.cover },
    markdown: source.markdown,
  };
}

export interface PublishCheckInput {
  kind: EntryKind;
  draft: EntryContent;
  currentPublishedSlug: string | null; // 지금 발행본의 slug
  ownSlugHistory?: readonly string[]; // 이 글의 예전 slug
  now: Date;
}

// 발행 검사 (Plan 6.3 2단계, D4 kind별 규칙)
// - 성공하면 발행할 내용을 돌려준다. 제목·설명·slug는 앞뒤 공백을 지운다.
// - post는 제목·설명·slug·카테고리·본문이 필수다.
// - note는 본문만 필수다. slug가 비면 지금 발행본의 slug를 다시 쓴다. 처음 발행이면 note-YYYYMMDD-HHmm으로 만든다.
// - project(4단계 D1)는 제목·설명·slug·본문·연재(프로젝트 key와 Part 번호)가 필수다. 카테고리는 고르지 않아도 된다.
// - 이 글이 쓰던 slug(지금 발행본, slugHistory)는 옛 형식이어도 받는다(Plan 4.1 "바꾸지 않으면 검사하지 않는다").
// - slug 유일성은 Firestore를 봐야 하므로 여기서 검사하지 않는다(호출하는 쪽이 한다).
export function checkPublishable({
  kind,
  draft,
  currentPublishedSlug,
  ownSlugHistory = [],
  now,
}: PublishCheckInput): { ok: true; content: EntryContent } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const title = draft.title.trim();
  const description = draft.description.trim();
  let slug = draft.slug.trim();
  const isNote = kind === 'note';

  if (isNote) {
    if (title.length > MAX_TITLE_LENGTH) {
      issues.push({ field: 'title', message: `제목은 ${MAX_TITLE_LENGTH}자까지입니다` });
    }
    if (!slug) slug = currentPublishedSlug ?? buildNoteSlug(now);
  } else {
    if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
      issues.push({ field: 'title', message: `제목은 1~${MAX_TITLE_LENGTH}자입니다` });
    }
    if (!description) issues.push({ field: 'description', message: '설명이 필요합니다' });
    if (kind === 'project') {
      if (!draft.series) issues.push({ field: 'series', message: '프로젝트 글은 연재(프로젝트 key)가 필요합니다' });
    } else if (!draft.category) {
      issues.push({ field: 'category', message: '카테고리가 필요합니다' });
    }
    if (!slug) issues.push({ field: 'slug', message: 'slug가 필요합니다' });
  }

  // 이미 쓰던 slug는 옛 형식이어도 그대로 둔다(Plan 4.1)
  const isOwnSlug = slug === currentPublishedSlug || ownSlugHistory.includes(slug);
  if (slug && !isOwnSlug && !isValidSlug(slug)) {
    issues.push({ field: 'slug', message: 'slug는 영문 소문자·숫자·한글 묶음을 -로 잇습니다' });
  }
  if (draft.tags.length > MAX_TAGS) {
    issues.push({ field: 'tags', message: `태그는 ${MAX_TAGS}개까지입니다` });
  }
  if (draft.series) {
    const series = seriesRefSchema.safeParse(draft.series);
    if (!series.success) issues.push({ field: 'series', message: '연재 key 형식이나 순서가 올바르지 않습니다' });
  }
  if (!draft.markdown.trim()) issues.push({ field: 'markdown', message: '본문이 필요합니다' });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, content: { ...pickEntryContent(draft), title, description, slug } };
}

// 글 문서 크기 상한 (Firestore 문서 한도 1 MiB보다 여유를 둔다)
// - 초안 900 KB 검사는 초안만 센다. 발행하면 발행본이 더해져 문서가 두 배 가까이 된다.
export const MAX_ENTRY_DOC_BYTES = 1_000_000;

// 문서를 JSON으로 바꾼 UTF-8 크기가 상한을 넘는지 (Firestore 계산과 다르지만 가까운 어림값이다)
export function exceedsEntryDocLimit(doc: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(doc)).length > MAX_ENTRY_DOC_BYTES;
}

// 발행본 만들기 (Plan 6.3 3단계)
export function buildPublishedSnapshot(
  content: EntryContent,
  options: { revision: number; fromDraftVersion: number },
): EntryPublished {
  return {
    ...pickEntryContent(content),
    revision: options.revision,
    fromDraftVersion: options.fromDraftVersion,
    readingTime: calculateReadingTime(content.markdown),
    wordCount: countWords(content.markdown),
  };
}

// 발행 뒤의 slugHistory
// - slug가 바뀌면 이전 slug를 더한다(공개 페이지가 301로 보낸다).
// - 새 slug가 자기 기록에 있으면 뺀다(예전 slug로 되돌린 경우).
export function nextSlugHistory(history: readonly string[], previousSlug: string | null, nextSlug: string): string[] {
  const result = history.filter((slug) => slug !== nextSlug);
  if (previousSlug && previousSlug !== nextSlug && !result.includes(previousSlug)) {
    result.push(previousSlug);
  }
  return result;
}

// 발행 뒤 고친 내용이 있는지 (D4: draft.version != published.fromDraftVersion)
export function hasUnpublishedChanges(
  draftVersion: number,
  published: { fromDraftVersion: number } | null,
): boolean {
  return published !== null && draftVersion !== published.fromDraftVersion;
}

// 숨김 / 다시 보임 전이 (Plan 6.3 상태 변화 표)
// - 발행본이 없으면(draft) 바꿀 수 없다(409).
// - 이미 그 상태면 changed = false.
export function applyVisibility(
  status: EntryStatus,
  hasPublished: boolean,
  visible: boolean,
): { ok: true; next: EntryStatus; changed: boolean } | { ok: false } {
  if (status === 'draft' || !hasPublished) return { ok: false };
  const next: EntryStatus = visible ? 'published' : 'hidden';
  return { ok: true, next, changed: next !== status };
}

// slug를 차지하는 상태인지 (published·hidden 글의 발행본 slug는 다른 글이 쓰지 못한다)
export function reservesSlug(status: EntryStatus): boolean {
  return status === 'published' || status === 'hidden';
}

// 공개 주소를 만든다 (인코딩하지 않은 경로)
// - post: /blog/<slug> (2단계 D4)
// - note: /notes/<slug> (4단계 D12)
// - project: /projects/<프로젝트 key>/<slug> (4단계 D1). 프로젝트 key는 연재 key다. 연재가 없으면 주소가 없다(null)
export function publicPathFor(
  kind: EntryKind,
  slug: string,
  series: { key: string } | null = null,
): string | null {
  if (kind === 'post') return `/blog/${slug}`;
  if (kind === 'note') return `/notes/${slug}`;
  if (kind === 'project') return series?.key ? `/projects/${series.key}/${slug}` : null;
  return null;
}
