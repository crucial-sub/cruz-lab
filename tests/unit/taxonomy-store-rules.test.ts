// 분류 데이터 규칙 테스트 (재건 5단계 D1·D3, Plan 8.1 "분류 규칙")
// - 카테고리 key 형식·지우기 조건(서버)·별칭·동의어·태그 3개 한도, 일괄 바꾸기 뒤 버전, 이전 판의 분류 맞추기, 판 번호
import { describe, expect, it } from 'vitest';
import {
  checkPublishable,
  nextVersionsForBulkEdit,
  normalizeDraftInput,
  parseRevisionNumber,
  type DraftInput,
} from '@/lib/entry-rules';
import { categoryKeySchema, tagsSchema, taxonomyDocSchema } from '@/lib/entry-schema';
import {
  addAlias,
  alignContentTaxonomy,
  CATEGORIES,
  categoryForSynonymTagIn,
  categoryLabelIn,
  checkCategoryKey,
  checkCategoryLabel,
  defaultTaxonomy,
  hasCategoryIn,
  normalizeTagIn,
  normalizeTagsIn,
  removeAliasesTo,
  removeAliasFrom,
  replaceTag,
  type TaxonomyData,
} from '@/lib/taxonomy';

// 기본값에서 회고를 지우고, os를 operating-system으로 바꾸고, 새 카테고리 database를 더한 분류
function changedTaxonomy(): TaxonomyData {
  const base = defaultTaxonomy();
  return {
    categories: [
      ...base.categories
        .filter((category) => category.key !== 'retrospective')
        .map((category) => (category.key === 'os' ? { ...category, key: 'operating-system' } : category)),
      { key: 'database', label: '데이터베이스', synonymTags: [] },
    ],
    categoryAliases: { os: 'operating-system' },
    tagAliases: { 'csapp-lab': 'csapp' },
  };
}

function draftInput(patch: Partial<DraftInput> = {}): DraftInput {
  return {
    title: '제목',
    description: '설명',
    slug: 'a-slug',
    category: 'ai',
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: '본문',
    editorJson: null,
    ...patch,
  };
}

describe('defaultTaxonomy', () => {
  it('첫 저장 값은 코드 카테고리 10개 그대로다(순서·이름·동의어). 별칭은 비었다', () => {
    const taxonomy = defaultTaxonomy();
    expect(taxonomy.categories).toEqual(
      CATEGORIES.map((category) => ({ key: category.key, label: category.label, synonymTags: [...category.synonymTags] })),
    );
    expect(taxonomy.categories).toHaveLength(10);
    expect(taxonomy.categoryAliases).toEqual({});
    expect(taxonomy.tagAliases).toEqual({});
  });

  it('돌려준 값을 고쳐도 코드 상수가 바뀌지 않는다', () => {
    defaultTaxonomy().categories[0].synonymTags.push('x');
    expect(defaultTaxonomy().categories[0].synonymTags).toEqual(['ai']);
  });

  it('스키마를 통과한다', () => {
    expect(taxonomyDocSchema.safeParse({ ...defaultTaxonomy(), version: 1, updatedAt: new Date() }).success).toBe(true);
  });
});

describe('카테고리 찾기', () => {
  it('목록의 이름을 준다. 목록에 없으면 key 그대로', () => {
    const taxonomy = changedTaxonomy();
    expect(categoryLabelIn(taxonomy, 'operating-system')).toBe('운영체제');
    expect(categoryLabelIn(taxonomy, 'database')).toBe('데이터베이스');
    expect(categoryLabelIn(taxonomy, 'os')).toBe('os');
    expect(hasCategoryIn(taxonomy, 'os')).toBe(false);
    expect(hasCategoryIn(taxonomy, 'database')).toBe(true);
  });
});

describe('태그 정규화(데이터)', () => {
  it('코드 규칙 뒤 데이터 별칭을 따른다', () => {
    const taxonomy = changedTaxonomy();
    expect(normalizeTagIn(taxonomy, ' CSAPP lab ')).toBe('csapp');
    expect(normalizeTagIn(taxonomy, '크래프톤정글')).toBe('크래프톤-정글');
  });

  it('데이터 동의어를 뺀다. 지운 카테고리의 동의어는 보통 태그다. 중복을 뺀다', () => {
    const taxonomy = changedTaxonomy();
    expect(categoryForSynonymTagIn(taxonomy, '운영체제')).toBe('operating-system');
    expect(categoryForSynonymTagIn(taxonomy, '회고')).toBeNull();
    expect(normalizeTagsIn(taxonomy, ['운영체제', '회고', 'csapp-lab', 'CSAPP', ''])).toEqual(['회고', 'csapp']);
  });
});

describe('별칭 표', () => {
  it('from → to를 더한다', () => {
    expect(addAlias({}, 'os', 'operating-system')).toEqual({ os: 'operating-system' });
  });

  it('from으로 가던 줄은 to로 잇는다(두 번 건너지 않는다)', () => {
    expect(addAlias({ a: 'b' }, 'b', 'c')).toEqual({ a: 'c', b: 'c' });
  });

  it('되돌리기: to가 원래 별칭이면 그 줄을 지운다', () => {
    expect(addAlias({ a: 'b' }, 'b', 'a')).toEqual({ b: 'a' });
  });

  it('같은 값이면 더하지 않는다', () => {
    expect(addAlias({ x: 'y' }, 'k', 'k')).toEqual({ x: 'y' });
  });

  it('지운 카테고리로 가던 줄, 다시 살아난 값의 줄을 지운다', () => {
    expect(removeAliasesTo({ a: 'z', b: 'y', c: 'z' }, 'z')).toEqual({ b: 'y' });
    expect(removeAliasFrom({ a: 'z', b: 'y' }, 'a')).toEqual({ b: 'y' });
  });
});

describe('replaceTag', () => {
  it('자리를 지키며 바꾼다', () => {
    expect(replaceTag(['a', 'b', 'c'], 'b', 'x')).toEqual(['a', 'x', 'c']);
  });

  it('이미 있으면 합친다(앞의 자리를 지킨다)', () => {
    expect(replaceTag(['x', 'b', 'c'], 'b', 'x')).toEqual(['x', 'c']);
    expect(replaceTag(['b', 'c', 'x'], 'b', 'x')).toEqual(['x', 'c']);
  });

  it('없는 태그면 그대로', () => {
    expect(replaceTag(['a'], 'b', 'x')).toEqual(['a']);
  });
});

describe('카테고리 입력 검사', () => {
  const taxonomy = defaultTaxonomy();

  it('key 형식: 영문 소문자·숫자 묶음을 -로 잇는다', () => {
    expect(checkCategoryKey(taxonomy, 'database')).toBeNull();
    expect(checkCategoryKey(taxonomy, 'web-3')).toBeNull();
    expect(checkCategoryKey(taxonomy, '')?.field).toBe('key');
    expect(checkCategoryKey(taxonomy, 'Database')).not.toBeNull();
    expect(checkCategoryKey(taxonomy, '-a')).not.toBeNull();
    expect(checkCategoryKey(taxonomy, 'a--b')).not.toBeNull();
    expect(checkCategoryKey(taxonomy, '운영')).not.toBeNull();
    expect(checkCategoryKey(taxonomy, 'a'.repeat(41))).not.toBeNull();
  });

  it('이미 있는 key는 받지 않는다', () => {
    expect(checkCategoryKey(taxonomy, 'os')?.message).toContain('이미');
    expect(checkCategoryKey(taxonomy, 'os', { allowExisting: true })).toBeNull();
  });

  it('이름: 비지 않고 30자까지, 다른 카테고리와 겹치지 않는다(대소문자 무시). 자기 이름은 된다', () => {
    expect(checkCategoryLabel(taxonomy, '데이터베이스')).toBeNull();
    expect(checkCategoryLabel(taxonomy, '  ')?.field).toBe('label');
    expect(checkCategoryLabel(taxonomy, 'x'.repeat(31))).not.toBeNull();
    expect(checkCategoryLabel(taxonomy, 'javascript')?.message).toContain('같은 이름');
    expect(checkCategoryLabel(taxonomy, 'JavaScript', 'javascript')).toBeNull();
  });
});

describe('저장 스키마(형식만)', () => {
  it('카테고리 key는 형식만 본다(목록에 없는 key도 읽는다)', () => {
    expect(categoryKeySchema.safeParse('database').success).toBe(true);
    expect(categoryKeySchema.safeParse('os').success).toBe(true);
    expect(categoryKeySchema.safeParse('Data Base').success).toBe(false);
  });

  it('태그는 정규화 형식만 본다. 동의어 검사는 저장 API가 데이터로 한다', () => {
    expect(tagsSchema.safeParse(['회고', 'pintos']).success).toBe(true);
    expect(tagsSchema.safeParse(['Proxy Lab']).success).toBe(false);
    expect(tagsSchema.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
  });
});

describe('초안 저장·발행 검사(데이터 분류)', () => {
  const taxonomy = changedTaxonomy();

  it('옛 key는 별칭으로 새 key가 된다. 그래도 목록에 없으면 unknownCategory(거절은 API가 버전 검사 뒤에 한다)', () => {
    const aliased = normalizeDraftInput(draftInput({ category: 'os' }), taxonomy);
    expect(aliased).toMatchObject({ ok: true, unknownCategory: false });
    expect(aliased.ok && aliased.draft.category).toBe('operating-system');
    expect(normalizeDraftInput(draftInput({ category: 'retrospective' }), taxonomy)).toMatchObject({ ok: true, unknownCategory: true });
    expect(normalizeDraftInput(draftInput({ category: 'database' }), taxonomy)).toMatchObject({ ok: true, unknownCategory: false });
    expect(normalizeDraftInput(draftInput({ category: null }), taxonomy)).toMatchObject({ ok: true, unknownCategory: false });
  });

  it('태그는 데이터 동의어·별칭으로 정규화하고 3개 한도를 지킨다', () => {
    const result = normalizeDraftInput(draftInput({ tags: ['운영체제', 'CSAPP lab', '회고'] }), taxonomy);
    expect(result.ok && result.draft.tags).toEqual(['csapp', '회고']);
    expect(normalizeDraftInput(draftInput({ tags: ['a', 'b', 'c', 'd'] }), taxonomy)).toMatchObject({ ok: false, status: 400 });
  });

  it('taxonomy를 주지 않으면 코드 기본값이다(os를 받는다)', () => {
    expect(normalizeDraftInput(draftInput({ category: 'os' }))).toMatchObject({ ok: true, unknownCategory: false });
  });

  it('발행: 카테고리가 목록에 없으면 항목별 이유를 준다', () => {
    const draft = { ...draftInput({ category: 'os' }), tags: [] };
    const check = checkPublishable({ kind: 'post', draft, currentPublishedSlug: null, now: new Date(), taxonomy });
    expect(check.ok).toBe(false);
    expect(!check.ok && check.issues.map((issue) => issue.field)).toContain('category');
    expect(checkPublishable({ kind: 'post', draft, currentPublishedSlug: null, now: new Date() }).ok).toBe(true);
  });
});

describe('nextVersionsForBulkEdit', () => {
  it('발행본이 없으면 초안 버전만 올린다', () => {
    expect(nextVersionsForBulkEdit(3, null)).toEqual({ draftVersion: 4, fromDraftVersion: null });
  });

  it('발행 뒤 변경이 없던 글은 fromDraftVersion도 맞춘다(변경 있음이 생기지 않는다)', () => {
    expect(nextVersionsForBulkEdit(3, { fromDraftVersion: 3 })).toEqual({ draftVersion: 4, fromDraftVersion: 4 });
  });

  it('변경이 있던 글은 fromDraftVersion을 그대로 둔다(변경 있음이 남는다)', () => {
    expect(nextVersionsForBulkEdit(5, { fromDraftVersion: 3 })).toEqual({ draftVersion: 6, fromDraftVersion: 3 });
  });
});

describe('alignContentTaxonomy (이전 판 가져오기)', () => {
  const taxonomy = changedTaxonomy();

  it('옛 key 별칭은 새 key로, 지운 카테고리는 null로, 목록에 있으면 그대로', () => {
    expect(alignContentTaxonomy({ category: 'os', tags: [] }, taxonomy).category).toBe('operating-system');
    expect(alignContentTaxonomy({ category: 'retrospective', tags: [] }, taxonomy).category).toBeNull();
    expect(alignContentTaxonomy({ category: 'ai', tags: [] }, taxonomy).category).toBe('ai');
    expect(alignContentTaxonomy({ category: null, tags: [] }, taxonomy).category).toBeNull();
  });

  it('태그를 지금 별칭·동의어로 정규화하고 3개까지 남긴다. 다른 칸은 그대로다', () => {
    const result = alignContentTaxonomy({ category: 'ai', tags: ['csapp-lab', '운영체제', 'a', 'b', 'c'], title: 't' }, taxonomy);
    expect(result.tags).toEqual(['csapp', 'a', 'b']);
    expect(result.title).toBe('t');
  });
});

describe('parseRevisionNumber', () => {
  it('1 이상의 정수 6자리까지만 받는다', () => {
    expect(parseRevisionNumber('1')).toBe(1);
    expect(parseRevisionNumber('42')).toBe(42);
    for (const bad of [undefined, '', '0', '01', '-1', '1.5', 'a', '1234567', ' 1']) {
      expect(parseRevisionNumber(bad)).toBeNull();
    }
  });
});
