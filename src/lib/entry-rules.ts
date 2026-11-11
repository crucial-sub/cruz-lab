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
import {
  MAX_CATEGORY_KEY_LENGTH,
  CATEGORY_KEY_PATTERN,
  MAX_TAGS,
  buildNoteSlug,
  defaultTaxonomy,
  hasCategoryIn,
  isValidSlug,
  normalizeTagsIn,
  type TaxonomyData,
} from './taxonomy.ts';
import { calculateReadingTime, countWords } from '../utils/readingTime.ts';

// 초안 크기 상한 (Plan 4.1: 문서 한도 1 MiB, 초안은 900 KB를 넘으면 거부)
export const MAX_DRAFT_BYTES = 900 * 1024;
// 발행 제목 길이 (Plan 6.3)
export const MAX_TITLE_LENGTH = 120;
// 기기 이름 길이 상한
export const MAX_DEVICE_LENGTH = 60;

// API로 새로 만들 수 있는 kind (POST /api/admin/posts)
// - 5단계 D2: project를 더했다. 새 프로젝트 화면(POST /api/admin/projects)이 연재 key를 함께 넣어 만든다
export const CREATABLE_KINDS = ['post', 'note', 'project'] as const;

// 초안 저장 요청의 draft 값 (PUT /api/admin/posts/{id}/draft)
// - 형식만 검사한다. 필수 값은 발행할 때 검사한다.
// - 태그는 여기서 받은 뒤 normalizeDraftInput이 정규화하고 개수를 검사한다.
export const draftInputSchema = z.object({
  title: z.string().max(1000),
  description: z.string().max(5000),
  slug: z.string().max(300),
  // 형식만 본다. 목록에 있는 key인지는 API가 데이터(getTaxonomy)로 검사한다(5단계 D1)
  category: z.string().max(MAX_CATEGORY_KEY_LENGTH).regex(CATEGORY_KEY_PATTERN).nullable(),
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
// - 5단계 D1: 데이터 분류(taxonomy)의 동의어·별칭으로 정규화한다. taxonomy를 주지 않으면 코드 기본값이다.
// - 카테고리: 목록에 없고 옛 key 별칭이면 새 key로 바꾼다(key 바꾸기 뒤 열린 에디터·보관 초안, PR-B 리뷰 S5).
//   그래도 목록에 없으면 unknownCategory를 참으로 돌려준다. 거절은 저장 API가 버전 검사 뒤에 한다(409가 먼저다).
// - 직렬화한 크기가 900 KB를 넘으면 실패한다.
export function normalizeDraftInput(
  input: DraftInput,
  taxonomy: TaxonomyData = defaultTaxonomy(),
):
  | { ok: true; draft: NormalizedDraft; unknownCategory: boolean }
  | { ok: false; status: 400 | 413; issues: FieldIssue[] } {
  const tags = normalizeTagsIn(taxonomy, input.tags);
  if (tags.length > MAX_TAGS) {
    return { ok: false, status: 400, issues: [{ field: 'tags', message: `태그는 ${MAX_TAGS}개까지입니다` }] };
  }
  let category = input.category;
  if (category !== null && !hasCategoryIn(taxonomy, category)) {
    const alias = taxonomy.categoryAliases[category];
    if (alias && hasCategoryIn(taxonomy, alias)) category = alias;
  }
  const unknownCategory = category !== null && !hasCategoryIn(taxonomy, category);
  const draft: NormalizedDraft = {
    title: input.title,
    description: input.description,
    slug: input.slug,
    category,
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
  return { ok: true, draft, unknownCategory };
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
  // 5단계 D1: 카테고리 목록(데이터). 주면 카테고리가 목록에 있는지도 본다
  taxonomy?: TaxonomyData;
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
  taxonomy,
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
  if (taxonomy && draft.category && !hasCategoryIn(taxonomy, draft.category)) {
    issues.push({ field: 'category', message: '목록에 없는 카테고리입니다' });
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

// 분류·연재 일괄 바꾸기 뒤의 버전 (5단계 D1)
// - 초안 version을 1 올린다. 열린 에디터가 옛 값으로 덮어쓰지 않고 충돌(409)을 받는다.
// - "발행 뒤 변경"이 없던 글(draft.version == fromDraftVersion)은 발행본도 같이 바뀌므로 fromDraftVersion도 맞춘다.
//   변경이 있던 글은 fromDraftVersion을 그대로 둔다(여전히 변경 있음).
export function nextVersionsForBulkEdit(
  draftVersion: number,
  published: { fromDraftVersion: number } | null,
): { draftVersion: number; fromDraftVersion: number | null } {
  const next = draftVersion + 1;
  if (!published) return { draftVersion: next, fromDraftVersion: null };
  return {
    draftVersion: next,
    fromDraftVersion: published.fromDraftVersion === draftVersion ? next : published.fromDraftVersion,
  };
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

// 공개 주소 규칙 publicPathFor는 public-paths.ts에 있다(가져오는 모듈이 없어 관리자 앱 첫 청크가 zod를 받지 않는다, 5단계 PR-B).
// 이 파일을 쓰던 곳(발행 API·에디터·관리자 목록)을 위해 다시 내보낸다
export { publicPathFor } from './public-paths.ts';

// 주소의 판 번호(리비전, 5단계 D3)를 읽는다. 1 이상의 정수(6자리까지)가 아니면 null
export function parseRevisionNumber(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}
