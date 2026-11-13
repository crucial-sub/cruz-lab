// 글 목록 여러 편 고르기·삭제 규칙 테스트 (2026-11-12 여러 편 삭제 작업)
// - 대상: src/admin/home/bulk-select.ts
// - 사용자 결정: 머리 칸은 지금 보이는 글만 고른다, 발행·숨김 글이 섞이면 한 번 더 확인,
//   일부가 실패해도 끝까지 지운다, 기존 DELETE를 한 번에 3편씩 부른다.
import { describe, expect, it } from 'vitest';
import {
  BULK_DELETE_CONCURRENCY,
  canConfirmBulkDelete,
  headerCheckState,
  runBulkDelete,
  selectionScopeKey,
  summarizeForDelete,
  toggleAllVisible,
  toggleId,
  visibleSelection,
} from '@/admin/home/bulk-select';
import { DEFAULT_LIST_STATE } from '@/admin/home/list-filter';
import type { AdminListItem } from '@/lib/server/admin-entries';

function item(patch: Partial<AdminListItem> & { id: string }): AdminListItem {
  return {
    kind: 'post',
    status: 'draft',
    title: '',
    slug: '',
    category: null,
    categoryLabel: null,
    tags: [],
    series: null,
    updatedAt: '2026-11-12T00:00:00.000Z',
    publishedAt: null,
    hasUnpublishedChanges: false,
    draftDevice: null,
    isEmptyDraft: false,
    readers30: null,
    publicPath: null,
    ...patch,
  };
}

// 다음 마이크로태스크·타이머까지 기다린다
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('visibleSelection', () => {
  it('고른 것 중 보이는 글만, 보이는 순서로 준다', () => {
    const selected = new Set(['c', 'x', 'a']);
    expect(visibleSelection(selected, ['a', 'b', 'c'])).toEqual(['a', 'c']);
  });

  it('고른 것이 없으면 빈 목록', () => {
    expect(visibleSelection(new Set(), ['a', 'b'])).toEqual([]);
  });
});

describe('toggleId', () => {
  it('없으면 더하고 있으면 뺀다', () => {
    const once = toggleId(new Set(['a']), 'b');
    expect([...once].sort()).toEqual(['a', 'b']);
    expect([...toggleId(once, 'a')]).toEqual(['b']);
  });

  it('받은 집합을 바꾸지 않는다', () => {
    const selected = new Set(['a']);
    toggleId(selected, 'b');
    toggleId(selected, 'a');
    expect([...selected]).toEqual(['a']);
  });
});

describe('headerCheckState', () => {
  it('보이는 글이 없으면 none', () => {
    expect(headerCheckState(new Set(['a']), [])).toBe('none');
  });

  it('보이는 글 중 고른 것이 없으면 none', () => {
    expect(headerCheckState(new Set(['x']), ['a', 'b'])).toBe('none');
  });

  it('일부만 고르면 some', () => {
    expect(headerCheckState(new Set(['a']), ['a', 'b'])).toBe('some');
  });

  it('보이는 글을 모두 고르면 all (보이지 않는 고른 것은 세지 않는다)', () => {
    expect(headerCheckState(new Set(['a', 'b', 'x']), ['a', 'b'])).toBe('all');
  });
});

describe('toggleAllVisible', () => {
  it('아무것도 고르지 않았으면 보이는 글을 모두 고른다', () => {
    expect([...toggleAllVisible(new Set(), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });

  it('일부만 골랐으면 보이는 글을 모두 고른다', () => {
    expect([...toggleAllVisible(new Set(['b']), ['a', 'b', 'c'])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('보이는 글을 모두 골랐으면 모두 푼다', () => {
    expect([...toggleAllVisible(new Set(['a', 'b']), ['a', 'b'])]).toEqual([]);
  });

  it('보이지 않는 고른 글은 결과에 남기지 않는다', () => {
    expect([...toggleAllVisible(new Set(['x']), ['a'])]).toEqual(['a']);
    expect([...toggleAllVisible(new Set(['a', 'x']), ['a'])]).toEqual([]);
  });

  it('보이는 글이 없으면 빈 집합', () => {
    expect([...toggleAllVisible(new Set(['x']), [])]).toEqual([]);
  });
});

describe('selectionScopeKey', () => {
  const key = (patch: Partial<typeof DEFAULT_LIST_STATE>, query = '', emptyOnly = false) =>
    selectionScopeKey({ ...DEFAULT_LIST_STATE, ...patch }, query, emptyOnly);

  it('상태 탭·종류·검색어·빈 초안 칩이 바뀌면 값이 바뀐다(고른 것을 비운다)', () => {
    const base = key({});
    expect(key({ status: 'draft' })).not.toBe(base);
    expect(key({ kind: 'note' })).not.toBe(base);
    expect(key({}, 'astro')).not.toBe(base);
    expect(key({}, '', true)).not.toBe(base);
  });

  it('정렬과 검색어 앞뒤 공백은 보이는 글을 바꾸지 않으므로 값이 같다', () => {
    expect(key({ sort: 'published' })).toBe(key({}));
    expect(key({}, '  astro ')).toBe(key({}, 'astro'));
  });

  it('검색어는 대소문자를 가리지 않는다(목록 검색과 같다)', () => {
    expect(key({}, 'Astro')).toBe(key({}, 'astro'));
  });
});

describe('summarizeForDelete', () => {
  it('초안만이면 발행·숨김 수가 0이다', () => {
    const summary = summarizeForDelete([item({ id: 'a' }), item({ id: 'b' })]);
    expect(summary).toEqual({
      count: 2,
      published: 0,
      hidden: 0,
      publicTitles: [],
      moreTitles: 0,
    });
  });

  it('발행·숨김 글을 따로 세고 그 제목을 고른 순서로 준다', () => {
    const summary = summarizeForDelete([
      item({ id: 'd1', title: '초안' }),
      item({ id: 'p1', status: 'published', title: '발행 하나' }),
      item({ id: 'h1', status: 'hidden', title: '숨김 하나' }),
      item({ id: 'p2', status: 'published', title: '' }),
    ]);
    expect(summary.count).toBe(4);
    expect(summary.published).toBe(2);
    expect(summary.hidden).toBe(1);
    expect(summary.publicTitles).toEqual(['발행 하나', '숨김 하나', '(제목 없음)']);
    expect(summary.moreTitles).toBe(0);
  });

  it('제목은 5편까지 주고 나머지는 수로 준다', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item({ id: `p${index}`, status: 'published', title: `글 ${index}` }),
    );
    const summary = summarizeForDelete(items);
    expect(summary.publicTitles).toEqual(['글 0', '글 1', '글 2', '글 3', '글 4']);
    expect(summary.moreTitles).toBe(3);
  });
});

describe('canConfirmBulkDelete', () => {
  const drafts = summarizeForDelete([item({ id: 'a' })]);
  const mixed = summarizeForDelete([item({ id: 'a' }), item({ id: 'p', status: 'published' })]);
  const hiddenOnly = summarizeForDelete([item({ id: 'h', status: 'hidden' })]);

  it('초안만이면 확인 칸 없이 지울 수 있다', () => {
    expect(canConfirmBulkDelete(drafts, false)).toBe(true);
  });

  it('발행·숨김 글이 섞이면 확인 칸을 체크해야 한다', () => {
    expect(canConfirmBulkDelete(mixed, false)).toBe(false);
    expect(canConfirmBulkDelete(mixed, true)).toBe(true);
    expect(canConfirmBulkDelete(hiddenOnly, false)).toBe(false);
  });

  it('고른 글이 없으면 지울 수 없다', () => {
    expect(canConfirmBulkDelete(summarizeForDelete([]), true)).toBe(false);
  });
});

// 시험용 오류: status를 가진 오류(ApiClientError 모양)
class FakeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const statusOf = (error: unknown) => (error instanceof FakeApiError ? error.status : null);
const options = {
  isFatal: (error: unknown) => statusOf(error) === 401,
  isAlreadyGone: (error: unknown) => statusOf(error) === 404,
  describe: (error: unknown) => (error instanceof Error ? error.message : String(error)),
};

describe('runBulkDelete', () => {
  it('한 번에 3편씩 보낸다(기본값)', async () => {
    expect(BULK_DELETE_CONCURRENCY).toBe(3);
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await runBulkDelete(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick(5);
        inFlight -= 1;
      },
      options,
    );
    expect(maxInFlight).toBe(3);
    expect(result.deleted).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(result.failed).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.fatal).toBeNull();
  });

  it('보낸 순서는 받은 순서이고, 결과도 받은 순서로 준다(끝난 순서와 상관없다)', async () => {
    const started: string[] = [];
    const delays: Record<string, number> = { a: 20, b: 1, c: 10, d: 1 };
    const result = await runBulkDelete(
      ['a', 'b', 'c', 'd'],
      async (id) => {
        started.push(id);
        await tick(delays[id]);
      },
      options,
    );
    expect(started).toEqual(['a', 'b', 'c', 'd']);
    expect(result.deleted).toEqual(['a', 'b', 'c', 'd']);
  });

  it('일부가 실패해도 끝까지 하고 실패한 글과 이유를 준다', async () => {
    const result = await runBulkDelete(
      ['a', 'b', 'c', 'd', 'e'],
      async (id) => {
        await tick(1);
        if (id === 'b') throw new FakeApiError(500, '서버 오류');
        if (id === 'd') throw new Error('서버에 연결하지 못했습니다');
      },
      options,
    );
    expect(result.deleted).toEqual(['a', 'c', 'e']);
    expect(result.failed).toEqual([
      { id: 'b', message: '서버 오류' },
      { id: 'd', message: '서버에 연결하지 못했습니다' },
    ]);
    expect(result.fatal).toBeNull();
  });

  it('이미 없는 글(404)은 지운 것으로 센다', async () => {
    const result = await runBulkDelete(
      ['a', 'b'],
      async (id) => {
        if (id === 'a') throw new FakeApiError(404, '글이 없습니다.');
      },
      options,
    );
    expect(result.deleted).toEqual(['a', 'b']);
    expect(result.failed).toEqual([]);
  });

  it('세션이 끝나면(401) 새로 보내지 않고, 보낸 것은 끝까지 기다린다', async () => {
    const started: string[] = [];
    const result = await runBulkDelete(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      async (id) => {
        started.push(id);
        if (id === 'a') {
          await tick(1);
          throw new FakeApiError(401, '로그인이 필요합니다.');
        }
        await tick(10);
      },
      options,
    );
    expect(started).toEqual(['a', 'b', 'c']);
    expect(result.deleted).toEqual(['b', 'c']);
    expect(result.failed).toEqual([]);
    // 멈춘 글(a)과 보내지 않은 글(d·e·f)은 지우지 않은 채 남는다
    expect(result.remaining).toEqual(['a', 'd', 'e', 'f']);
    expect(statusOf(result.fatal)).toBe(401);
  });

  it('한 편이 끝날 때마다 알린다(진행 수와 지운 글)', async () => {
    const progress: number[] = [];
    const removed: string[] = [];
    await runBulkDelete(
      ['a', 'b', 'c'],
      async (id) => {
        if (id === 'b') throw new FakeApiError(500, '서버 오류');
      },
      {
        ...options,
        onProgress: (done, total) => progress.push(done * 10 + total),
        onDeleted: (id) => removed.push(id),
      },
    );
    expect(progress).toEqual([13, 23, 33]);
    expect(removed.sort()).toEqual(['a', 'c']);
  });

  it('지운 뒤 알림(onDeleted)이 실패해도 그 글은 지운 것이다', async () => {
    const result = await runBulkDelete(['a'], async () => {}, {
      ...options,
      onDeleted: () => {
        throw new Error('화면 오류');
      },
    });
    expect(result.deleted).toEqual(['a']);
    expect(result.failed).toEqual([]);
  });

  it('빈 목록이면 아무것도 보내지 않는다', async () => {
    let calls = 0;
    const result = await runBulkDelete(
      [],
      async () => {
        calls += 1;
      },
      options,
    );
    expect(calls).toBe(0);
    expect(result).toEqual({ deleted: [], failed: [], remaining: [], fatal: null });
  });

  it('동시 수를 정할 수 있다(1이면 차례로)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runBulkDelete(
      ['a', 'b', 'c'],
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick(2);
        inFlight -= 1;
      },
      { ...options, concurrency: 1 },
    );
    expect(maxInFlight).toBe(1);
  });
});
