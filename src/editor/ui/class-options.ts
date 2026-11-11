// 메타 패널의 분류 선택지 (재건 5단계 D1·D2)
// - 카테고리 목록과 태그 제안은 분류 API(GET /api/admin/taxonomy), 연재 key 제안은 연재 API(GET /api/admin/series)에서 받는다.
// - 에디터를 열 때 한 번 받는다. 연재 목록을 받지 못해도 분류는 쓴다. 분류를 받지 못하면 호출하는 쪽이 코드 기본값으로 연다.
// - "+ 새 카테고리"는 분류 API로 만들고 선택지를 다시 받는다.

import { seriesApi } from '@/admin/series/series-api';
import { ApiClientError } from '@/editor/state/api';
import { taxonomyApi } from '@/admin/taxonomy/taxonomy-api';
import type { TaxonomyData } from '@/lib/taxonomy';

export interface ClassOptions {
  version: number; // 분류 version(새 카테고리 만들기에 쓴다)
  taxonomy: TaxonomyData; // 태그 정규화(동의어·별칭)에 쓴다
  categories: Array<{ key: string; label: string }>;
  tags: string[]; // 쓰는 글이 많은 순
  series: Array<{ key: string; title: string | null; project: boolean }>;
}

export async function loadClassOptions(): Promise<ClassOptions> {
  const [view, series] = await Promise.all([taxonomyApi.read(), seriesApi.list().catch(() => ({ items: [] }))]);
  return {
    version: view.version,
    taxonomy: { categories: view.categories, categoryAliases: view.categoryAliases, tagAliases: view.tagAliases },
    categories: view.categories.map(({ key, label }) => ({ key, label })),
    tags: view.tags.map((row) => row.tag),
    series: series.items.map((row) => ({ key: row.key, title: row.title, project: row.project !== null })),
  };
}

// 새 카테고리를 만들고 새 선택지를 돌려준다 (PR-B 리뷰 B3)
// - 만들기가 실패하면 오류를 던진다. 다른 곳에서 분류를 먼저 바꿨으면(409) 새 선택지와 함께 CategoryConflict를 던진다.
// - 만든 뒤 다시 받기만 실패하면 지금 선택지에 새 카테고리를 더해 돌려준다(만들기는 성공이다).
export class CategoryConflict extends Error {
  constructor(readonly options: ClassOptions | null) {
    super('다른 곳에서 분류가 바뀌어 목록을 다시 받았습니다. 다시 만드세요.');
  }
}

export async function createCategory(options: ClassOptions, label: string, key: string): Promise<ClassOptions> {
  let version: number;
  try {
    version = (await taxonomyApi.changeCategory({ op: 'create', label, key }, options.version, false)).version;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'TAXONOMY_CONFLICT') {
      throw new CategoryConflict(await loadClassOptions().catch(() => null));
    }
    throw error;
  }
  try {
    return await loadClassOptions();
  } catch {
    const created = { key, label: label.trim(), synonymTags: [] };
    return {
      ...options,
      version,
      taxonomy: { ...options.taxonomy, categories: [...options.taxonomy.categories, created] },
      categories: [...options.categories, { key, label: created.label }],
    };
  }
}
