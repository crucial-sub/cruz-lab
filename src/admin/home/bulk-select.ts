// 글 목록 여러 편 고르기·삭제 규칙 (2026-11-12 여러 편 삭제 작업)
// - 순수 함수만 둔다. 화면은 HomeScreen.tsx·EntryTable.tsx·BulkControls.tsx, 테스트는 tests/unit/admin-bulk-select.test.ts.
// - 사용자 결정(작업 문서 docs/blog-rebuilding/2026-11-12-admin-bulk-delete.md 2절):
//   1. 데스크톱은 고르는 칸이 늘 보인다. 휴대폰은 "선택" 단추로 켠다.
//   2. 발행·숨김 글도 고를 수 있다. 섞이면 확인 창의 확인 칸을 체크해야 지운다.
//   3. 일부가 실패해도 끝까지 지운다. 실패한 글은 고른 채로 남는다.
//   4. 서버에는 기존 DELETE /api/admin/posts/{id}를 한 번에 3편씩 부른다(서버 코드는 그대로).
// - 지울 대상은 "고른 글 ∩ 지금 보이는 글"이다. 탭·종류·검색·빈 초안 칩이 바뀌면 고른 것을 비운다.
// - 이 파일은 런타임 import가 없다. 스모크(scripts/smoke/admin-bulk-delete.mjs)가 Node로 그대로 불러 쓴다.

import type { AdminListItem } from '@/lib/server/admin-entries';
import type { ListState } from './list-filter';

// 한 번에 보내는 삭제 요청 수(사용자 결정 4)
export const BULK_DELETE_CONCURRENCY = 3;
// 확인 창에 보이는 발행·숨김 글 제목 수. 나머지는 "외 N편"
export const SUMMARY_TITLE_LIMIT = 5;

export type HeaderCheck = 'none' | 'some' | 'all';

// 고른 ID 중 지금 보이는 글만, 보이는 순서로
export function visibleSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): string[] {
  return visibleIds.filter((id) => selected.has(id));
}

// 한 편 고르기·풀기. 받은 집합은 바꾸지 않는다
export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// 머리 칸 모양: 보이는 글 중 고른 것이 없음 · 일부 · 전부
export function headerCheckState(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): HeaderCheck {
  if (visibleIds.length === 0) return 'none';
  const count = visibleSelection(selected, visibleIds).length;
  if (count === 0) return 'none';
  return count === visibleIds.length ? 'all' : 'some';
}

// 머리 칸을 누른 결과: 보이는 글을 모두 골랐으면 모두 풀고, 아니면 보이는 글을 모두 고른다.
// 보이지 않는 고른 글은 남기지 않는다(보이지 않는 글은 지우지 않는다)
export function toggleAllVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  return headerCheckState(selected, visibleIds) === 'all' ? new Set() : new Set(visibleIds);
}

// 보이는 글을 바꾸는 조건을 한 글자로. 이 값이 바뀌면 화면이 고른 것을 비운다.
// 정렬은 보이는 글을 바꾸지 않는다. 검색어는 목록 검색과 같게 앞뒤 공백을 떼고 소문자로 본다
export function selectionScopeKey(
  state: Pick<ListState, 'status' | 'kind'>,
  query: string,
  emptyOnly: boolean,
): string {
  return JSON.stringify([state.status, state.kind, query.trim().toLowerCase(), emptyOnly]);
}

export interface DeleteSummary {
  count: number;
  published: number;
  hidden: number;
  // 발행·숨김 글 제목(고른 순서, 최대 SUMMARY_TITLE_LIMIT편)
  publicTitles: string[];
  // 제목을 보이지 않은 발행·숨김 글 수
  moreTitles: number;
}

// 확인 창에 쓸 요약: 몇 편, 그중 발행·숨김 몇 편, 그 제목
export function summarizeForDelete(
  items: readonly AdminListItem[],
  titleLimit = SUMMARY_TITLE_LIMIT,
): DeleteSummary {
  const publicItems = items.filter((item) => item.status !== 'draft');
  return {
    count: items.length,
    published: publicItems.filter((item) => item.status === 'published').length,
    hidden: publicItems.filter((item) => item.status === 'hidden').length,
    publicTitles: publicItems.slice(0, titleLimit).map((item) => item.title || '(제목 없음)'),
    moreTitles: Math.max(0, publicItems.length - titleLimit),
  };
}

// 확인 창의 "지우기" 단추를 켤지. 발행·숨김 글이 섞이면 확인 칸(acknowledged)을 체크해야 한다
export function canConfirmBulkDelete(summary: DeleteSummary, acknowledged: boolean): boolean {
  if (summary.count === 0) return false;
  return summary.published + summary.hidden === 0 || acknowledged;
}

export interface BulkDeleteOptions {
  concurrency?: number;
  // 멈춰야 하는 오류(세션 끝남 401). 새로 보내지 않고, 이미 보낸 것은 끝까지 기다린다
  isFatal(error: unknown): boolean;
  // 이미 없는 글(404). 지운 것으로 센다
  isAlreadyGone(error: unknown): boolean;
  // 실패 이유 글자
  describe(error: unknown): string;
  // 한 편이 끝날 때마다(성공·실패 모두)
  onProgress?(done: number, total: number): void;
  // 한 편을 지운 직후(목록에서 빼기, 이 기기 보관 초안 지우기). 여기서 난 오류는 결과를 바꾸지 않는다
  onDeleted?(id: string): void;
}

export interface BulkDeleteResult {
  // 지운 글(받은 순서)
  deleted: string[];
  // 지우지 못한 글과 이유(받은 순서)
  failed: Array<{ id: string; message: string }>;
  // 멈춰서 지우지 않은 글: 멈춤 오류가 난 글과 보내지 않은 글(받은 순서)
  remaining: string[];
  // 멈춘 오류. 없으면 null
  fatal: unknown;
}

// 여러 편을 지운다. 한 번에 concurrency편씩 deleteOne을 부른다.
// - 보내는 순서는 받은 순서다. 결과도 받은 순서로 준다(끝난 순서와 상관없다).
// - 일부가 실패해도 끝까지 한다(사용자 결정 3). 멈추는 것은 isFatal 오류뿐이다.
export async function runBulkDelete(
  ids: readonly string[],
  deleteOne: (id: string) => Promise<unknown>,
  options: BulkDeleteOptions,
): Promise<BulkDeleteResult> {
  const total = ids.length;
  const outcome: Array<'deleted' | 'failed' | undefined> = new Array(total);
  const messages = new Map<number, string>();
  let fatal: unknown = null;
  let next = 0;
  let done = 0;

  // 일꾼 하나: 다음 글을 받아 지운다. 멈춤 오류가 나면 새 글을 받지 않는다
  const worker = async () => {
    while (fatal === null && next < total) {
      const index = next;
      next += 1;
      const id = ids[index];
      try {
        await deleteOne(id);
        outcome[index] = 'deleted';
      } catch (error) {
        if (options.isAlreadyGone(error)) {
          outcome[index] = 'deleted';
        } else if (options.isFatal(error)) {
          // 멈춘 글은 실패로 세지 않고 "남은 글"로 둔다(다시 로그인한 뒤 다시 고른다)
          if (fatal === null) fatal = error;
        } else {
          outcome[index] = 'failed';
          messages.set(index, options.describe(error));
        }
      }
      if (outcome[index] === 'deleted') {
        try {
          options.onDeleted?.(id);
        } catch {
          // 화면 쪽 뒷정리 실패는 서버 삭제 결과를 바꾸지 않는다
        }
      }
      done += 1;
      options.onProgress?.(done, total);
    }
  };

  const workers = Math.max(1, Math.min(options.concurrency ?? BULK_DELETE_CONCURRENCY, total));
  if (total > 0) await Promise.all(Array.from({ length: workers }, worker));

  const result: BulkDeleteResult = { deleted: [], failed: [], remaining: [], fatal };
  ids.forEach((id, index) => {
    if (outcome[index] === 'deleted') result.deleted.push(id);
    else if (outcome[index] === 'failed')
      result.failed.push({ id, message: messages.get(index) ?? '' });
    else result.remaining.push(id);
  });
  return result;
}
