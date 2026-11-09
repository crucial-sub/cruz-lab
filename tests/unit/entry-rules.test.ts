// 글 API 규칙 테스트 (재건 2단계 D4, Plan 6.3)
import { describe, expect, it } from 'vitest';
import {
  MAX_DRAFT_BYTES,
  applyVisibility,
  buildPublishedSnapshot,
  checkPublishable,
  emptyEntryContent,
  exceedsEntryDocLimit,
  hasUnpublishedChanges,
  nextSlugHistory,
  normalizeDraftInput,
  publicPathFor,
  reservesSlug,
  type DraftInput,
} from '@/lib/entry-rules';
import { entryDocSchema, type EntryContent } from '@/lib/entry-schema';

const NOW = new Date('2026-11-08T03:04:00Z'); // KST 12:04

function content(overrides: Partial<EntryContent> = {}): EntryContent {
  return {
    title: '시험 글',
    description: '설명',
    slug: 'stage2-smoke',
    category: 'retrospective',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: '본문 한 줄',
    ...overrides,
  };
}

function draftInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return { ...content(), editorJson: null, ...overrides };
}

describe('normalizeDraftInput', () => {
  it('태그를 정규화한다', () => {
    const result = normalizeDraftInput(draftInput({ tags: ['Proxy Lab', '크래프톤정글', 'JavaScript'] }));
    expect(result.ok && result.draft.tags).toEqual(['proxy-lab', '크래프톤-정글']);
  });

  it('정규화 뒤 태그가 3개를 넘으면 400', () => {
    const result = normalizeDraftInput(draftInput({ tags: ['a', 'b', 'c', 'd'] }));
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('900 KB를 넘는 초안은 413', () => {
    const result = normalizeDraftInput(draftInput({ markdown: 'a'.repeat(MAX_DRAFT_BYTES + 1) }));
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});

describe('emptyEntryContent', () => {
  it('빈 초안 문서가 스키마를 지킨다', () => {
    const now = new Date();
    const doc = {
      kind: 'post',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      lastPublishedAt: null,
      slugHistory: [],
      draft: { ...emptyEntryContent(), version: 1, updatedAt: now, device: null, editorJson: null },
      published: null,
      legacy: null,
    };
    expect(entryDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe('checkPublishable', () => {
  it('post는 제목·설명·slug·카테고리·본문이 필요하다', () => {
    const result = checkPublishable({
      kind: 'post',
      draft: content({ title: ' ', description: '', slug: '', category: null, markdown: '\n' }),
      currentPublishedSlug: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.field).sort()).toEqual(
        ['category', 'description', 'markdown', 'slug', 'title'].sort(),
      );
    }
  });

  it('제목은 120자까지다', () => {
    const result = checkPublishable({ kind: 'post', draft: content({ title: '가'.repeat(121) }), currentPublishedSlug: null, now: NOW });
    expect(result.ok).toBe(false);
  });

  it('통과하면 제목·설명·slug의 앞뒤 공백을 지운다', () => {
    const result = checkPublishable({
      kind: 'post',
      draft: content({ title: '  제목 ', description: ' 설명 ', slug: ' stage2-smoke ' }),
      currentPublishedSlug: null,
      now: NOW,
    });
    expect(result.ok && result.content).toMatchObject({ title: '제목', description: '설명', slug: 'stage2-smoke' });
  });

  it('새 slug는 형식을 지켜야 한다', () => {
    const result = checkPublishable({ kind: 'post', draft: content({ slug: 'Bad_Slug' }), currentPublishedSlug: null, now: NOW });
    expect(result.ok).toBe(false);
  });

  it('이미 쓰던 slug는 옛 형식이어도 받는다', () => {
    const legacySlug = 'reactnative-flatlist-feat-';
    const result = checkPublishable({ kind: 'post', draft: content({ slug: legacySlug }), currentPublishedSlug: legacySlug, now: NOW });
    expect(result.ok).toBe(true);
  });

  it('note는 본문만 필수이고 빈 slug를 note-YYYYMMDD-HHmm(KST)으로 채운다', () => {
    const result = checkPublishable({
      kind: 'note',
      draft: content({ title: '', description: '', slug: '', category: null }),
      currentPublishedSlug: null,
      now: NOW,
    });
    expect(result.ok && result.content.slug).toBe('note-20261108-1204');
  });

  it('project는 제목·설명·slug·본문·연재가 필요하고 카테고리는 없어도 된다(4단계 D1)', () => {
    const missing = checkPublishable({
      kind: 'project',
      draft: content({ title: '', description: '', slug: '', category: null, series: null, markdown: ' ' }),
      currentPublishedSlug: null,
      now: NOW,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues.map((issue) => issue.field).sort()).toEqual(
        ['description', 'markdown', 'series', 'slug', 'title'].sort(),
      );
    }

    const ok = checkPublishable({
      kind: 'project',
      draft: content({ category: null, slug: 'cruz-lab-operating-cms', series: { key: 'cruz-lab', order: 1 } }),
      currentPublishedSlug: null,
      now: NOW,
    });
    expect(ok.ok && ok.content).toMatchObject({ category: null, series: { key: 'cruz-lab', order: 1 } });
  });

  it('note를 다시 발행할 때 slug가 비어 있으면 지금 발행본의 slug를 다시 쓴다', () => {
    const result = checkPublishable({
      kind: 'note',
      draft: content({ title: '', description: '', slug: '', category: null }),
      currentPublishedSlug: 'note-20261101-0900',
      now: NOW,
    });
    expect(result.ok && result.content.slug).toBe('note-20261101-0900');
  });

  it('이 글의 예전 slug(slugHistory)는 옛 형식이어도 되돌릴 수 있다', () => {
    const legacySlug = 'reactnative-flatlist-feat-';
    const result = checkPublishable({
      kind: 'post',
      draft: content({ slug: legacySlug }),
      currentPublishedSlug: 'new-slug',
      ownSlugHistory: [legacySlug],
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('note도 본문이 없으면 실패한다', () => {
    const result = checkPublishable({ kind: 'note', draft: content({ markdown: '' }), currentPublishedSlug: null, now: NOW });
    expect(result.ok).toBe(false);
  });

  it('연재 순서는 양의 정수다', () => {
    const result = checkPublishable({
      kind: 'post',
      draft: content({ series: { key: 'pintos', order: 0 } }),
      currentPublishedSlug: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });
});

describe('buildPublishedSnapshot', () => {
  it('revision, fromDraftVersion, 읽기 시간, 단어 수를 채운다', () => {
    const snapshot = buildPublishedSnapshot(content({ markdown: 'hello world' }), { revision: 3, fromDraftVersion: 8 });
    expect(snapshot).toMatchObject({ revision: 3, fromDraftVersion: 8, readingTime: 1, wordCount: 2 });
  });
});

describe('nextSlugHistory', () => {
  it('slug가 바뀌면 이전 slug를 더한다', () => {
    expect(nextSlugHistory([], 'old', 'new')).toEqual(['old']);
  });

  it('같은 slug면 그대로 둔다', () => {
    expect(nextSlugHistory(['a'], 'b', 'b')).toEqual(['a']);
  });

  it('예전 slug로 되돌리면 기록에서 빼고 지금 slug를 더한다', () => {
    expect(nextSlugHistory(['a'], 'b', 'a')).toEqual(['b']);
  });

  it('처음 발행이면 기록이 비어 있다', () => {
    expect(nextSlugHistory([], null, 'first')).toEqual([]);
  });
});

describe('상태 변화 (Plan 6.3 표)', () => {
  it('published → visibility false → hidden', () => {
    expect(applyVisibility('published', true, false)).toEqual({ ok: true, next: 'hidden', changed: true });
  });

  it('hidden → visibility true → published', () => {
    expect(applyVisibility('hidden', true, true)).toEqual({ ok: true, next: 'published', changed: true });
  });

  it('draft → visibility는 409', () => {
    expect(applyVisibility('draft', false, true)).toEqual({ ok: false });
    expect(applyVisibility('draft', false, false)).toEqual({ ok: false });
  });

  it('이미 그 상태면 changed = false', () => {
    expect(applyVisibility('hidden', true, false)).toEqual({ ok: true, next: 'hidden', changed: false });
  });

  it('published·hidden만 slug를 차지한다', () => {
    expect(reservesSlug('published')).toBe(true);
    expect(reservesSlug('hidden')).toBe(true);
    expect(reservesSlug('draft')).toBe(false);
  });

  it('발행 뒤 고친 내용 여부는 버전으로 계산한다', () => {
    expect(hasUnpublishedChanges(3, { fromDraftVersion: 3 })).toBe(false);
    expect(hasUnpublishedChanges(4, { fromDraftVersion: 3 })).toBe(true);
    expect(hasUnpublishedChanges(4, null)).toBe(false);
  });
});

describe('publicPathFor', () => {
  it('post는 /blog, note는 /notes(4단계 D12), project는 /projects/<프로젝트 key>/<slug>(D1)', () => {
    expect(publicPathFor('post', 'abc')).toBe('/blog/abc');
    expect(publicPathFor('note', 'note-20261108-1204')).toBe('/notes/note-20261108-1204');
    expect(publicPathFor('project', 'cruz-lab-operating-cms', { key: 'cruz-lab' })).toBe(
      '/projects/cruz-lab/cruz-lab-operating-cms',
    );
  });

  it('연재(프로젝트 key)가 없는 project 글은 주소가 없다', () => {
    expect(publicPathFor('project', 'part-1')).toBeNull();
    expect(publicPathFor('project', 'part-1', null)).toBeNull();
    expect(publicPathFor('project', 'part-1', { key: '' })).toBeNull();
  });

  it('post·note는 연재가 있어도 주소가 같다', () => {
    expect(publicPathFor('post', 'abc', { key: 'pintos' })).toBe('/blog/abc');
  });
});

describe('exceedsEntryDocLimit', () => {
  it('초안과 발행본을 합쳐 1,000,000 바이트를 넘으면 true', () => {
    const half = 'a'.repeat(600_000);
    expect(exceedsEntryDocLimit({ draft: { markdown: half } })).toBe(false);
    expect(exceedsEntryDocLimit({ draft: { markdown: half }, published: { markdown: half } })).toBe(true);
  });
});
