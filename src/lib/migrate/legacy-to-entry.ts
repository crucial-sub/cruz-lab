// 옛 posts 문서 → entries 문서 변환 (재건 2단계 Plan 5.2, 5.4)
// - 순수 함수만 둔다. Firestore를 읽거나 쓰지 않는다. 단위 테스트 대상이다.
// - 마이그레이션 스크립트(scripts/migrate/stage2-entries.mjs)가 Node로 직접 가져온다.
//   그래서 상대 경로 import에 `.ts`를 붙이고 '@/…' 별칭을 쓰지 않는다.

import { z } from 'zod';
import { collectContentStoragePaths } from '../asset-refs.ts';
import {
  CATEGORY_KEYS,
  MAX_TAGS,
  SERIES_KEY_PATTERN,
  extractTitlePrefix,
  isCategoryKey,
  normalizeTags,
  stripTitlePrefix,
  type CategoryKey,
} from '../taxonomy.ts';
import { calculateReadingTime, countWords } from '../../utils/readingTime.ts';
import { toMillisValue, type Cover, type EntryStatus, type SeriesRef, type TimestampLike } from '../entry-schema.ts';

// 매핑 표에 맞지 않는 글이 있을 때 던진다. 스크립트는 아무것도 쓰지 않고 멈춘다
export class MappingError extends Error {
  readonly postId: string | null;

  constructor(message: string, postId: string | null = null) {
    super(postId ? `[${postId}] ${message}` : message);
    this.name = 'MappingError';
    this.postId = postId;
  }
}

// 옛 posts 문서. 시각은 스크립트가 Date로 바꿔서 넘긴다
export interface LegacyPostData {
  title?: string;
  slug?: string;
  description?: string;
  content?: string;
  heroImage?: string;
  heroVideo?: string;
  tags?: unknown;
  status?: string;
  isPublic?: boolean;
  readingTime?: number;
  pubDate?: Date;
  updatedDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LegacyPost {
  id: string;
  data: LegacyPostData;
}

// 옛 series 문서 중 이 파일이 읽는 부분
export interface LegacySeries {
  id: string;
  slug: string | undefined;
  name: string;
  description: string;
  postIds: string[];
}

// scripts/migrate/stage2-mapping.json 형식
const categoryKeySchema = z.enum(CATEGORY_KEYS);

const seriesRuleSchema = z.union([
  // 옛 series 문서의 postIds로 글을 찾고, 제목 앞 번호로 순서를 정한다
  z.object({
    key: z.string().regex(SERIES_KEY_PATTERN),
    fromLegacySeries: z.string().min(1), // 옛 series 문서의 slug 또는 ID
    order: z.literal('titleNumber'),
  }),
  // 글 ID를 순서대로 적는다. title은 사람이 읽으려고 둔다(다르면 경고)
  z.object({
    key: z.string().regex(SERIES_KEY_PATTERN),
    title: z.string().min(1),
    description: z.string().optional(),
    members: z.array(z.object({ id: z.string().min(1), title: z.string().optional() })).min(1),
  }),
]);

const mappingSchema = z.object({
  mappingVersion: z.number().int().positive(),
  prefixToCategory: z.record(z.string(), categoryKeySchema),
  postOverrides: z.record(
    z.string(),
    z.object({
      title: z.string().optional(), // 사람이 읽으려고 둔다(다르면 경고)
      category: categoryKeySchema.optional(),
      tags: z.array(z.string()).max(MAX_TAGS).optional(),
    }),
  ),
  series: z.array(seriesRuleSchema),
  exclude: z.array(z.object({ id: z.string().min(1), title: z.string().optional(), reason: z.string().min(1) })),
});

export type StageMapping = z.infer<typeof mappingSchema>;

// 매핑 표를 검증한다. 틀리면 zod 오류를 던진다
export function parseMapping(raw: unknown): StageMapping {
  return mappingSchema.parse(raw);
}

// 옛 문서가 공개 글인지 (지금 공개 페이지와 같은 기준)
export function isLegacyPublic(data: LegacyPostData): boolean {
  return data.status === 'published' && data.isPublic !== false;
}

// 제목 앞 번호: "[wesbos30] 09. 개발자 도구" → 9
function titleNumber(title: string): number | null {
  const match = stripTitlePrefix(title).match(/^(\d+)\s*\./);
  return match ? Number(match[1]) : null;
}

export interface SeriesResolution {
  assignments: Map<string, SeriesRef>; // 글 ID → 연재
  meta: Map<string, { title: string; description: string }>; // 연재 key → seriesMeta
  warnings: string[];
}

// 매핑 표의 연재 규칙으로 글마다 연재를 정한다
// - fromLegacySeries: 옛 series 문서의 postIds가 문서 ID든 slug든 찾는다(A13).
// - members: 적은 순서대로 1부터 번호를 매긴다.
export function resolveSeriesAssignments(
  posts: LegacyPost[],
  legacySeries: LegacySeries[],
  mapping: StageMapping,
): SeriesResolution {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const bySlug = new Map(posts.filter((post) => post.data.slug).map((post) => [post.data.slug as string, post]));
  const assignments = new Map<string, SeriesRef>();
  const meta = new Map<string, { title: string; description: string }>();
  const warnings: string[] = [];

  const assign = (postId: string, ref: SeriesRef) => {
    const existing = assignments.get(postId);
    if (existing) {
      throw new MappingError(`연재가 두 번 배정됐습니다: ${existing.key}, ${ref.key}`, postId);
    }
    assignments.set(postId, ref);
  };

  for (const rule of mapping.series) {
    if (meta.has(rule.key)) throw new MappingError(`연재 key가 중복됩니다: ${rule.key}`);

    if ('fromLegacySeries' in rule) {
      const source = legacySeries.find(
        (series) => series.slug === rule.fromLegacySeries || series.id === rule.fromLegacySeries,
      );
      if (!source) throw new MappingError(`옛 series 문서를 찾지 못했습니다: ${rule.fromLegacySeries}`);
      meta.set(rule.key, { title: source.name, description: source.description });

      const usedOrders = new Map<number, string>();
      for (const ref of source.postIds) {
        const target = byId.get(ref) ?? bySlug.get(ref);
        if (!target) {
          warnings.push(`연재 ${rule.key}: 옛 postIds의 "${ref}"에 맞는 글이 없습니다`);
          continue;
        }
        const order = titleNumber(target.data.title ?? '');
        if (order === null || order < 1) {
          throw new MappingError(`연재 ${rule.key}: 제목에서 번호를 읽지 못했습니다`, target.id);
        }
        const clash = usedOrders.get(order);
        if (clash && clash !== target.id) {
          throw new MappingError(`연재 ${rule.key}: 순서 ${order}가 ${clash}와 겹칩니다`, target.id);
        }
        if (clash === target.id) continue; // 같은 글이 ID와 slug로 두 번 적힌 경우
        usedOrders.set(order, target.id);
        assign(target.id, { key: rule.key, order });
      }
      continue;
    }

    meta.set(rule.key, { title: rule.title, description: rule.description ?? '' });
    rule.members.forEach((member, index) => {
      const target = byId.get(member.id);
      if (!target) {
        warnings.push(`연재 ${rule.key}: 글 ${member.id}가 없습니다`);
        return;
      }
      if (member.title && member.title !== target.data.title) {
        warnings.push(`연재 ${rule.key}: 글 ${member.id}의 제목이 매핑 표와 다릅니다 ("${target.data.title}")`);
      }
      assign(target.id, { key: rule.key, order: index + 1 });
    });
  }

  return { assignments, meta, warnings };
}

// 카테고리: 글별 예외 → 접두사 매핑. 둘 다 없으면 실패한다
export function resolveCategory(post: LegacyPost, mapping: StageMapping): CategoryKey {
  const override = mapping.postOverrides[post.id]?.category;
  if (override) return override;
  const prefix = extractTitlePrefix(post.data.title ?? '');
  const mapped = prefix ? mapping.prefixToCategory[prefix] : undefined;
  if (mapped && isCategoryKey(mapped)) return mapped;
  throw new MappingError(
    prefix ? `알 수 없는 접두사입니다: [${prefix}]` : '접두사도 글별 예외도 없어 카테고리를 정할 수 없습니다',
    post.id,
  );
}

// 태그: 글별 예외 → D2 정규화. 3개를 넘으면 실패한다
export function resolveTags(post: LegacyPost, mapping: StageMapping): string[] {
  const override = mapping.postOverrides[post.id]?.tags;
  const rawTags = Array.isArray(post.data.tags)
    ? post.data.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const tags = normalizeTags(override ?? rawTags);
  if (tags.length > MAX_TAGS) {
    throw new MappingError(`정규화 뒤 태그가 ${tags.length}개입니다(최대 ${MAX_TAGS}): ${tags.join(', ')}`, post.id);
  }
  return tags;
}

export interface LegacyToEntryContext {
  mapping: StageMapping;
  series: SeriesRef | null;
  bucket: string; // Storage 버킷 이름 (표지 자산 ID를 찾을 때 쓴다)
  resolveAssetId: (storagePath: string) => string | null;
  now: Date;
  previous?: { draftVersion: number; revision: number }; // 갱신이면 지금 entries의 번호
}

// 변환 결과. 시각은 Date다. 스크립트가 그대로 Firestore에 쓴다(Timestamp로 저장된다)
export interface LegacyEntryData {
  kind: 'post';
  status: EntryStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  lastPublishedAt: Date | null;
  slugHistory: string[];
  draft: {
    title: string;
    description: string;
    slug: string;
    category: CategoryKey;
    tags: string[];
    series: SeriesRef | null;
    cover: Cover;
    markdown: string;
    version: number;
    updatedAt: Date;
    device: null;
    editorJson: null;
  };
  published: {
    title: string;
    description: string;
    slug: string;
    category: CategoryKey;
    tags: string[];
    series: SeriesRef | null;
    cover: Cover;
    markdown: string;
    revision: number;
    fromDraftVersion: number;
    readingTime: number;
    wordCount: number;
  } | null;
  legacy: {
    postId: string;
    sourceUpdatedAt: Date;
    syncedDraftVersion: number;
    syncedRevision: number;
    syncedStatus: EntryStatus;
    migratedAt: Date;
    mappingVersion: number;
  };
}

// 옛 문서의 "마지막 수정 시각" (updatedAt이 없으면 updatedDate)
export function legacySourceUpdatedAt(data: LegacyPostData): Date | null {
  return data.updatedAt ?? data.updatedDate ?? null;
}

// 옛 글 1편 → entries 문서 1개
export function legacyToEntry(post: LegacyPost, ctx: LegacyToEntryContext): LegacyEntryData {
  const { data } = post;
  const title = stripTitlePrefix(data.title ?? '').trim();
  const slug = data.slug ?? '';
  if (!title) throw new MappingError('제목이 비어 있습니다', post.id);
  if (!slug) throw new MappingError('slug가 비어 있습니다', post.id);

  const sourceUpdatedAt = legacySourceUpdatedAt(data);
  if (!sourceUpdatedAt) throw new MappingError('updatedAt과 updatedDate가 모두 없습니다', post.id);

  const category = resolveCategory(post, ctx.mapping);
  const tags = resolveTags(post, ctx.mapping);
  const markdown = data.content ?? '';

  // 표지: heroImage(영상 주소일 수도 있다) → 이미지 표지. 자산 ID는 Storage 경로로 찾는다
  const heroUrl = (data.heroVideo || data.heroImage || '').trim();
  let cover: Cover = { kind: 'generated' };
  if (heroUrl) {
    const [coverPath] = collectContentStoragePaths(
      { markdown: '', cover: { kind: 'image', url: heroUrl, assetId: null } },
      ctx.bucket,
    );
    cover = { kind: 'image', url: heroUrl, assetId: coverPath ? ctx.resolveAssetId(coverPath) : null };
  }

  const content = {
    title,
    description: data.description ?? '',
    slug,
    category,
    tags,
    series: ctx.series,
    cover,
    markdown,
  };

  const isPublic = isLegacyPublic(data);
  const status: EntryStatus = isPublic ? 'published' : 'draft';
  const draftVersion = (ctx.previous?.draftVersion ?? 0) + 1;
  const revision = isPublic ? (ctx.previous?.revision ?? 0) + 1 : 0;
  const createdAt = data.createdAt ?? data.pubDate ?? sourceUpdatedAt;
  const updatedAt = data.updatedAt ?? data.updatedDate ?? createdAt;
  // 스키마는 1 이상의 정수를 요구한다. 1분보다 작은 옛 값도 1분으로 둔다
  const readingTime =
    typeof data.readingTime === 'number' && data.readingTime > 0
      ? Math.max(1, Math.round(data.readingTime))
      : calculateReadingTime(markdown);

  return {
    kind: 'post',
    status,
    createdAt,
    updatedAt,
    // 발행한 적 없는 초안은 발행 시각이 없다(D4)
    publishedAt: isPublic ? (data.pubDate ?? createdAt) : null,
    lastPublishedAt: isPublic ? (data.updatedDate ?? data.pubDate ?? createdAt) : null,
    slugHistory: [],
    draft: {
      ...content,
      version: draftVersion,
      updatedAt,
      device: null,
      editorJson: null,
    },
    published: isPublic
      ? {
          ...content,
          revision,
          fromDraftVersion: draftVersion,
          readingTime,
          wordCount: countWords(markdown),
        }
      : null,
    legacy: {
      postId: post.id,
      sourceUpdatedAt,
      syncedDraftVersion: draftVersion,
      syncedRevision: revision,
      syncedStatus: status,
      migratedAt: ctx.now,
      mappingVersion: ctx.mapping.mappingVersion,
    },
  };
}

// 재동기화 판정 (Plan 5.4 표)
export type SyncDecision =
  | 'create'
  | 'skip'
  | 'update'
  | 'conflict'
  | 'skip-deleted-in-rebuild'
  | 'delete-candidate'
  | 'exclude';

export interface SyncEntryState {
  status: EntryStatus;
  draftVersion: number;
  revision: number; // 발행본이 없으면 0
  legacy: {
    sourceUpdatedAt: TimestampLike;
    syncedDraftVersion: number;
    syncedRevision: number;
    syncedStatus: string;
  } | null;
}

export interface SyncInput {
  legacyUpdatedAt: TimestampLike | null; // null이면 옛 문서가 없다(운영에서 지움)
  entry: SyncEntryState | null;
  tombstone: boolean; // rebuild에서 지운 글 표지
  excluded: boolean;
}

// 글 하나의 판정. 원칙: 어느 쪽 변경도 자동으로 덮지 않는다
export function decideSync({ legacyUpdatedAt, entry, tombstone, excluded }: SyncInput): SyncDecision {
  if (excluded) return 'exclude';

  if (legacyUpdatedAt === null) {
    // 옛 문서가 없다(운영에서 지움). 마이그레이션 출신 entries만 여기 온다(호출하는 쪽이 legacy 없는 글을 거른다)
    // - rebuild에서도 고쳤으면 양쪽이 바뀐 것이다. 사람이 정한다
    if (entry && isChangedInRebuild(entry)) return 'conflict';
    return 'delete-candidate';
  }

  if (!entry) return tombstone ? 'skip-deleted-in-rebuild' : 'create';

  // 같은 ID인데 마이그레이션 표지가 없다: 사람이 봐야 한다
  if (!entry.legacy) return 'conflict';

  const legacyChanged = toMillisValue(legacyUpdatedAt) !== toMillisValue(entry.legacy.sourceUpdatedAt);
  if (!legacyChanged) return 'skip';

  return isChangedInRebuild(entry) ? 'conflict' : 'update';
}

// 마이그레이션 뒤 새 관리자로 고쳤는지 (내용, 발행, 숨김 모두)
function isChangedInRebuild(entry: SyncEntryState): boolean {
  if (!entry.legacy) return true;
  return (
    entry.draftVersion !== entry.legacy.syncedDraftVersion ||
    entry.revision !== entry.legacy.syncedRevision ||
    entry.status !== entry.legacy.syncedStatus
  );
}

// 실행 뒤 legacy 표지가 있어야 하는 entries 수 (Plan 5.3의 8단계 수 맞추기)
// - 생성·갱신·건너뜀은 entries가 있다.
// - 충돌은 entries가 legacy 표지를 가진 경우만 센다.
// - 삭제 후보는 삭제 전파를 켰을 때만 빠진다.
export function expectedLegacyEntryCount(
  rows: { decision: SyncDecision; hasLegacyEntry: boolean }[],
  propagateDeletes: boolean,
): number {
  let count = 0;
  for (const { decision, hasLegacyEntry } of rows) {
    if (decision === 'create' || decision === 'update' || decision === 'skip') count += 1;
    else if (decision === 'conflict' && hasLegacyEntry) count += 1;
    else if (decision === 'delete-candidate' && !propagateDeletes) count += 1;
  }
  return count;
}
