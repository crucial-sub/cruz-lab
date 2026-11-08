// 옛 posts 문서 → entries 문서 변환 테스트 (A13의 두 postIds 형식 포함)
import { describe, expect, it } from 'vitest';
import { entryDocSchema } from '@/lib/entry-schema';
import {
  decideSync,
  legacyToEntry,
  MappingError,
  parseMapping,
  resolveSeriesAssignments,
  type LegacyPost,
  type LegacySeries,
} from '@/lib/migrate/legacy-to-entry';

const BUCKET = 'cruz-lab.firebasestorage.app';
const t = (iso: string) => new Date(iso);

function post(id: string, data: Partial<LegacyPost['data']>): LegacyPost {
  return {
    id,
    data: {
      title: '[운영체제] 가상화',
      slug: `slug-${id}`,
      description: '설명',
      content: '본문',
      heroImage: '',
      heroVideo: '',
      tags: [],
      status: 'published',
      isPublic: true,
      readingTime: 4,
      pubDate: t('2025-01-01T00:00:00Z'),
      updatedDate: t('2025-01-02T00:00:00Z'),
      createdAt: t('2025-01-01T00:00:00Z'),
      updatedAt: t('2025-01-03T00:00:00Z'),
      ...data,
    },
  };
}

const mapping = parseMapping({
  mappingVersion: 1,
  prefixToCategory: {
    wesbos30: 'javascript',
    운영체제: 'os',
    Pintos: 'os',
  },
  postOverrides: {
    essay: { title: '크래프톤 정글 0주차 에세이', category: 'retrospective' },
    malloc: { title: '[운영체제] CSAPP 9.9장 Malloc-lab', tags: ['csapp', '크래프톤-정글', 'malloc-lab'] },
  },
  series: [
    { key: 'wesbos30', fromLegacySeries: 'wesbos', order: 'titleNumber' },
    {
      key: 'pintos',
      title: 'Pintos',
      members: [
        { id: 'p1', title: '[Pintos] Threads - 핀토스 시작하기' },
        { id: 'p2', title: '[Pintos] Threads - Alarm Clock 구현' },
      ],
    },
  ],
  exclude: [{ id: 'dup', reason: 'D3 중복 글' }],
});

describe('parseMapping', () => {
  it('모르는 카테고리 key를 거부한다', () => {
    expect(() =>
      parseMapping({ mappingVersion: 1, prefixToCategory: { X: 'nope' }, postOverrides: {}, series: [], exclude: [] }),
    ).toThrow();
  });
});

describe('resolveSeriesAssignments', () => {
  const posts = [
    post('w1', { title: '[wesbos30] 01. Drum kit', slug: 'wesbos30-01-drum-kit' }),
    post('w2', { title: '[wesbos30] 09. 개발자 도구 활용', slug: 'wesbos30-09' }),
    post('p1', { title: '[Pintos] Threads - 핀토스 시작하기' }),
    post('p2', { title: '[Pintos] Threads - Alarm Clock 구현' }),
  ];

  it('옛 시리즈의 postIds가 문서 ID든 slug든 찾는다(A13). 순서는 제목 번호다', () => {
    const legacySeries: LegacySeries[] = [
      { id: 'S1', slug: 'wesbos', name: 'WesBos Vanilla JS 30 Challenge', description: '챌린지', postIds: ['wesbos30-09', 'w1'] },
    ];
    const result = resolveSeriesAssignments(posts, legacySeries, mapping);
    expect(result.assignments.get('w1')).toEqual({ key: 'wesbos30', order: 1 });
    expect(result.assignments.get('w2')).toEqual({ key: 'wesbos30', order: 9 });
    expect(result.assignments.get('p1')).toEqual({ key: 'pintos', order: 1 });
    expect(result.assignments.get('p2')).toEqual({ key: 'pintos', order: 2 });
    expect(result.meta.get('wesbos30')).toEqual({ title: 'WesBos Vanilla JS 30 Challenge', description: '챌린지' });
    expect(result.meta.get('pintos')).toEqual({ title: 'Pintos', description: '' });
    expect(result.warnings).toEqual([]);
  });

  it('옛 시리즈를 찾지 못하면 실패한다', () => {
    expect(() => resolveSeriesAssignments(posts, [], mapping)).toThrow(MappingError);
  });

  it('postIds에 없는 글이 있으면 경고한다', () => {
    const legacySeries: LegacySeries[] = [
      { id: 'S1', slug: 'wesbos', name: 'W', description: '', postIds: ['w1', 'missing'] },
    ];
    const result = resolveSeriesAssignments(posts, legacySeries, mapping);
    expect(result.warnings.some((warning) => warning.includes('missing'))).toBe(true);
  });
});

describe('legacyToEntry', () => {
  const now = t('2026-11-08T00:00:00Z');
  const heroUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/images%2Fheroes%2Fh.webp?alt=media&token=x`;

  it('발행 글을 변환한다: 접두사 제거, 카테고리, 태그 정규화, 표지 자산, 날짜', () => {
    const source = post('a1', {
      title: '[운영체제] 가상화',
      tags: ['크래프톤 정글', '운영체제'],
      heroImage: heroUrl,
      content: '가상화 virtual memory 123',
    });
    const entry = legacyToEntry(source, {
      mapping,
      series: null,
      bucket: BUCKET,
      resolveAssetId: (path) => (path === 'images/heroes/h.webp' ? 'legacy-abc' : null),
      now,
    });

    expect(entry.kind).toBe('post');
    expect(entry.status).toBe('published');
    expect(entry.draft.title).toBe('가상화');
    expect(entry.draft.category).toBe('os');
    expect(entry.draft.tags).toEqual(['크래프톤-정글']);
    expect(entry.draft.cover).toEqual({ kind: 'image', url: heroUrl, assetId: 'legacy-abc' });
    expect(entry.draft.version).toBe(1);
    expect(entry.published?.revision).toBe(1);
    expect(entry.published?.fromDraftVersion).toBe(1);
    expect(entry.published?.readingTime).toBe(4);
    expect(entry.published?.wordCount).toBeGreaterThan(0);
    expect(entry.publishedAt).toEqual(t('2025-01-01T00:00:00Z'));
    expect(entry.lastPublishedAt).toEqual(t('2025-01-02T00:00:00Z'));
    expect(entry.updatedAt).toEqual(t('2025-01-03T00:00:00Z'));
    expect(entry.slugHistory).toEqual([]);
    expect(entry.legacy).toMatchObject({
      postId: 'a1',
      sourceUpdatedAt: t('2025-01-03T00:00:00Z'),
      syncedDraftVersion: 1,
      syncedRevision: 1,
      syncedStatus: 'published',
      migratedAt: now,
      mappingVersion: 1,
    });
    expect(entryDocSchema.safeParse(entry).success).toBe(true);
  });

  it('비공개·초안 글은 draft이고 발행본과 발행일이 없다. 글별 예외 카테고리를 쓴다', () => {
    const source = post('essay', {
      title: '크래프톤 정글 0주차 에세이',
      status: 'draft',
      isPublic: false,
      tags: ['크래프톤 정글', '에세이'],
    });
    const entry = legacyToEntry(source, { mapping, series: null, bucket: BUCKET, resolveAssetId: () => null, now });
    expect(entry.status).toBe('draft');
    expect(entry.published).toBeNull();
    expect(entry.publishedAt).toBeNull();
    expect(entry.lastPublishedAt).toBeNull();
    expect(entry.draft.category).toBe('retrospective');
    expect(entry.draft.tags).toEqual(['크래프톤-정글']);
    expect(entry.legacy?.syncedRevision).toBe(0);
    expect(entryDocSchema.safeParse(entry).success).toBe(true);
  });

  it('글별 예외 태그를 쓴다(태그 4개 → 3개)', () => {
    const source = post('malloc', {
      title: '[운영체제] CSAPP 9.9장 Malloc-lab',
      tags: ['운영체제', 'CSAPP', '크래프톤 정글', 'malloc lab', 'C'],
    });
    const entry = legacyToEntry(source, { mapping, series: null, bucket: BUCKET, resolveAssetId: () => null, now });
    expect(entry.draft.tags).toEqual(['csapp', '크래프톤-정글', 'malloc-lab']);
  });

  it('카테고리를 정할 수 없으면 실패한다(조용히 넘어가지 않는다)', () => {
    const source = post('x', { title: '[모르는접두사] 글' });
    expect(() =>
      legacyToEntry(source, { mapping, series: null, bucket: BUCKET, resolveAssetId: () => null, now }),
    ).toThrow(MappingError);
  });

  it('정규화 뒤 태그가 3개를 넘으면 실패한다', () => {
    const source = post('y', { tags: ['a', 'b', 'c', 'd'] });
    expect(() =>
      legacyToEntry(source, { mapping, series: null, bucket: BUCKET, resolveAssetId: () => null, now }),
    ).toThrow(MappingError);
  });

  it('갱신이면 버전 번호를 1씩 올린다', () => {
    const source = post('a1', {});
    const entry = legacyToEntry(source, {
      mapping,
      series: { key: 'pintos', order: 2 },
      bucket: BUCKET,
      resolveAssetId: () => null,
      now,
      previous: { draftVersion: 3, revision: 2 },
    });
    expect(entry.draft.version).toBe(4);
    expect(entry.published?.revision).toBe(3);
    expect(entry.published?.fromDraftVersion).toBe(4);
    expect(entry.draft.series).toEqual({ key: 'pintos', order: 2 });
    expect(entry.legacy).toMatchObject({ syncedDraftVersion: 4, syncedRevision: 3 });
  });
});

describe('decideSync (Plan 5.4)', () => {
  const legacyUpdatedAt = t('2025-01-03T00:00:00Z');
  const synced = {
    status: 'published' as const,
    draftVersion: 1,
    revision: 1,
    legacy: {
      postId: 'a1',
      sourceUpdatedAt: legacyUpdatedAt,
      syncedDraftVersion: 1,
      syncedRevision: 1,
      syncedStatus: 'published',
    },
  };

  it('제외 목록이면 exclude', () => {
    expect(decideSync({ legacyUpdatedAt, entry: null, tombstone: false, excluded: true })).toBe('exclude');
  });

  it('entries에 없으면 create, 표지가 있으면 skip-deleted-in-rebuild', () => {
    expect(decideSync({ legacyUpdatedAt, entry: null, tombstone: false, excluded: false })).toBe('create');
    expect(decideSync({ legacyUpdatedAt, entry: null, tombstone: true, excluded: false })).toBe(
      'skip-deleted-in-rebuild',
    );
  });

  it('옛 문서가 그대로면 skip', () => {
    expect(decideSync({ legacyUpdatedAt, entry: synced, tombstone: false, excluded: false })).toBe('skip');
  });

  it('옛 문서만 바뀌었으면 update, 양쪽이 바뀌었으면 conflict', () => {
    const changed = t('2025-02-01T00:00:00Z');
    expect(decideSync({ legacyUpdatedAt: changed, entry: synced, tombstone: false, excluded: false })).toBe('update');
    expect(
      decideSync({ legacyUpdatedAt: changed, entry: { ...synced, draftVersion: 2 }, tombstone: false, excluded: false }),
    ).toBe('conflict');
    expect(
      decideSync({ legacyUpdatedAt: changed, entry: { ...synced, status: 'hidden' }, tombstone: false, excluded: false }),
    ).toBe('conflict');
  });

  it('rebuild에서만 바뀌었으면 skip(덮지 않는다)', () => {
    expect(
      decideSync({ legacyUpdatedAt, entry: { ...synced, revision: 2 }, tombstone: false, excluded: false }),
    ).toBe('skip');
  });

  it('옛 문서가 없고 entries만 있으면 delete-candidate', () => {
    expect(decideSync({ legacyUpdatedAt: null, entry: synced, tombstone: false, excluded: false })).toBe(
      'delete-candidate',
    );
  });
});
