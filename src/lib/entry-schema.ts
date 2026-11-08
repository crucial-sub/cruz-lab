// entries·assets·seriesMeta 문서 스키마 (재건 2단계 Plan 4절)
// - 저장된 문서를 검증한다. 마이그레이션 뒤 전수 검사와 API 응답 직전 검사에 쓴다.
// - Node 스크립트도 가져오므로 상대 경로 import에 `.ts`를 붙인다.

import { z } from 'zod';
import { CATEGORY_KEYS, isNormalizedTag, MAX_TAGS, SERIES_KEY_PATTERN } from './taxonomy.ts';

// Firestore Timestamp 또는 Date
// - 읽은 문서는 Timestamp(toDate가 있음), 쓰기 전 값은 Date다.
export type TimestampLike = Date | { toDate(): Date; toMillis(): number };

export function isTimestampLike(value: unknown): value is TimestampLike {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === 'function' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  );
}

// TimestampLike → Date
export function toDateValue(value: TimestampLike): Date {
  return value instanceof Date ? value : value.toDate();
}

// TimestampLike → 밀리초 (같은 시각인지 비교할 때 쓴다)
export function toMillisValue(value: TimestampLike): number {
  return value instanceof Date ? value.getTime() : value.toMillis();
}

const timestampSchema = z.custom<TimestampLike>(isTimestampLike, { message: '시각 값이 아닙니다' });

export const ENTRY_KINDS = ['post', 'note', 'project'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_STATUSES = ['draft', 'published', 'hidden'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const categoryKeySchema = z.enum(CATEGORY_KEYS);

export const tagsSchema = z
  .array(z.string().refine(isNormalizedTag, { message: '정규화되지 않은 태그입니다' }))
  .max(MAX_TAGS, { message: `태그는 ${MAX_TAGS}개까지입니다` });

export const seriesRefSchema = z.object({
  key: z.string().regex(SERIES_KEY_PATTERN, { message: '연재 key는 영문 소문자, 숫자, -만 씁니다' }),
  order: z.number().int().positive(),
});
export type SeriesRef = z.infer<typeof seriesRefSchema>;

export const coverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generated') }),
  z.object({ kind: z.literal('image'), url: z.string().min(1), assetId: z.string().nullable() }),
]);
export type Cover = z.infer<typeof coverSchema>;

// 글 내용 (초안과 발행본이 함께 쓴다)
// - category는 빈 초안에서 null일 수 있다. 발행할 때 post는 반드시 있어야 한다(D4).
export const entryContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  slug: z.string(),
  category: categoryKeySchema.nullable(),
  tags: tagsSchema,
  series: seriesRefSchema.nullable(),
  cover: coverSchema,
  markdown: z.string(),
});
export type EntryContent = z.infer<typeof entryContentSchema>;

export const draftSchema = entryContentSchema.extend({
  version: z.number().int().positive(),
  updatedAt: timestampSchema,
  device: z.string().nullable(),
  editorJson: z.record(z.string(), z.unknown()).nullable(),
});
export type EntryDraft = z.infer<typeof draftSchema>;

export const publishedSchema = entryContentSchema.extend({
  revision: z.number().int().positive(),
  fromDraftVersion: z.number().int().positive(),
  readingTime: z.number().int().positive(),
  wordCount: z.number().int().nonnegative(),
});
export type EntryPublished = z.infer<typeof publishedSchema>;

// 마이그레이션 출처와 재동기화 표지 (Plan 5.4)
export const legacyInfoSchema = z.object({
  postId: z.string().min(1),
  sourceUpdatedAt: timestampSchema,
  syncedDraftVersion: z.number().int().positive(),
  syncedRevision: z.number().int().nonnegative(), // 발행본이 없었으면 0
  syncedStatus: z.enum(ENTRY_STATUSES),
  migratedAt: timestampSchema,
  mappingVersion: z.number().int().positive(),
});
export type LegacyInfo = z.infer<typeof legacyInfoSchema>;

export const entryDocSchema = z
  .object({
    kind: z.enum(ENTRY_KINDS),
    status: z.enum(ENTRY_STATUSES),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    publishedAt: timestampSchema.nullable(),
    lastPublishedAt: timestampSchema.nullable(),
    slugHistory: z.array(z.string()),
    draft: draftSchema,
    published: publishedSchema.nullable(),
    legacy: legacyInfoSchema.nullable(),
  })
  .superRefine((entry, ctx) => {
    // draft ⇔ 발행본 없음 (Plan 4.1 규칙)
    if (entry.status === 'draft' && entry.published !== null) {
      ctx.addIssue({ code: 'custom', path: ['published'], message: 'draft 상태인데 발행본이 있습니다' });
    }
    if (entry.status !== 'draft' && entry.published === null) {
      ctx.addIssue({ code: 'custom', path: ['published'], message: `${entry.status} 상태인데 발행본이 없습니다` });
    }
    if (entry.published) {
      if (!entry.published.slug) {
        ctx.addIssue({ code: 'custom', path: ['published', 'slug'], message: '발행본에 slug가 없습니다' });
      }
      if (entry.kind === 'post' && entry.published.category === null) {
        ctx.addIssue({ code: 'custom', path: ['published', 'category'], message: 'post 발행본에 카테고리가 없습니다' });
      }
      if (entry.publishedAt === null) {
        ctx.addIssue({ code: 'custom', path: ['publishedAt'], message: '발행본이 있는데 publishedAt이 없습니다' });
      }
    }
  });
export type EntryDoc = z.infer<typeof entryDocSchema>;

// seriesMeta/{key}
export const seriesMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
});
export type SeriesMeta = z.infer<typeof seriesMetaSchema>;

// assets/{id}
const assetVariantSchema = z.object({
  path: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
});
export type AssetVariant = z.infer<typeof assetVariantSchema>;

export const ASSET_VARIANT_WIDTHS = [480, 960, 1600] as const;

export const assetDocSchema = z.object({
  storagePath: z.string().min(1),
  url: z.string(), // pending이면 빈 문자열
  contentType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sha256: z.string().nullable(),
  variants: z
    .object({
      w480: assetVariantSchema.optional(),
      w960: assetVariantSchema.optional(),
      w1600: assetVariantSchema.optional(),
      max: assetVariantSchema,
    })
    .nullable(),
  status: z.enum(['pending', 'ready']),
  legacy: z.boolean(),
  usedBy: z.array(z.string()),
  orphanedAt: timestampSchema.nullable(),
  uploadedAt: timestampSchema,
});
export type AssetDoc = z.infer<typeof assetDocSchema>;
