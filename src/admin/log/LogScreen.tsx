// 출간 기록 화면 (재건 5단계 D11)
// - 최신순 50줄씩(GET /api/admin/publish-log?before=). "더 보기"로 다음 50줄.
// - 줄: 때 · 동작 · 제목(에디터 링크) · 리비전, 그 아래 부수 결과(실패만 빨간색). 결과 칸이 없는 옛 줄은 한 줄이다.
// - 제목은 지금 목록에서 찾는다. 글이 지워졌으면 기록된 title·slug를 쓰고 링크를 걸지 않는다.
// - 옛 줄(4단계까지)은 부수 결과·제목 칸이 없다. 없으면 비워 둔다.
// - PR-B: 분류·연재 줄(category·recategorize·retag·series)은 글 하나가 아니다. 기록된 설명과 대상 글 수를 보인다.
//   이전 판 가져오기(restore) 줄은 글 줄과 같고, 판 번호는 가져온 판이다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { classNames } from '@/editor/ui/class-names';
import { isGroupLogEntry, PUBLISH_LOG_ACTION_LABELS, type PublishLogItem } from '@/lib/publish-log';
import { appApi } from '../api';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { editPath } from '../router';
import { formatFullDate, secondaryButton } from '../ui';

const RESULT_TEXT = {
  purge: { label: '캐시', ok: '비움', skipped: '건너뜀', failed: '실패' },
  backup: { label: '백업', dispatched: '알림', skipped: '건너뜀', failed: '실패' },
  assetUsage: { label: '자산 기록', ok: '맞춤', failed: '실패' },
} as const;

type ResultKey = keyof typeof RESULT_TEXT;

function ResultChips({ item }: { item: PublishLogItem }) {
  const chips: Array<{ key: ResultKey; value: string }> = [];
  for (const key of ['purge', 'backup', 'assetUsage'] as const) {
    const value = item[key];
    if (value) chips.push({ key, value });
  }
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map(({ key, value }) => {
        const text = (RESULT_TEXT[key] as Record<string, string>)[value] ?? value;
        return (
          <span
            key={key}
            className={classNames(
              'rounded-pill px-2 py-0.5 text-xs',
              value === 'failed'
                ? 'bg-red-500/15 font-semibold text-red-400'
                : 'bg-bg-card text-text-secondary',
            )}
          >
            {RESULT_TEXT[key].label} {text}
          </span>
        );
      })}
    </span>
  );
}

function actionText(item: PublishLogItem): string {
  const base = PUBLISH_LOG_ACTION_LABELS[item.action] ?? item.action;
  if (item.action !== 'retry' || item.retried.length === 0) return base;
  const what = item.retried.map((target) => (target === 'purge' ? '캐시' : '백업')).join('·');
  return `${base}(${what})`;
}

export function LogScreen() {
  const { list, loadList } = useAdmin();
  const [items, setItems] = useState<PublishLogItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (before: string | null) => {
    const page = await appApi.publishLog(before);
    setItems((current) => (before ? [...current, ...page.items] : page.items));
    setNextBefore(page.nextBefore);
  }, []);

  useEffect(() => {
    void loadList();
    loadPage(null)
      .then(() => setPhase('ready'))
      .catch((loadError: unknown) => {
        if (redirectIfUnauthorized(loadError)) return;
        setError(errorMessage(loadError));
        setPhase('error');
      });
  }, [loadList, loadPage]);

  // 글 ID → 지금 제목
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    if (list.phase === 'ready')
      for (const item of list.items) map.set(item.id, item.title || '(제목 없음)');
    return map;
  }, [list]);

  const more = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextBefore);
    } catch (loadError) {
      // 401이면 로그인 화면. 그 밖은 "더 보기" 아래에 문구를 보인다
      if (!redirectIfUnauthorized(loadError)) setError(errorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  };

  const titleCell = (item: PublishLogItem) => {
    // 분류·연재 줄(그 줄의 다시 시도 줄 포함): 기록된 설명 + 대상 글 수. 글 줄이 아니므로 "(지운 글)"을 붙이지 않는다
    if (isGroupLogEntry(item.entryId)) {
      return (
        <span className="text-text-primary">
          {item.title || item.slug}
          {item.affected.length > 0 && <span className="ml-1 text-xs text-text-secondary">· 글 {item.affected.length}편</span>}
        </span>
      );
    }
    const current = titles.get(item.entryId);
    if (current !== undefined) {
      return (
        <a href={editPath(item.entryId)} className="font-medium text-text-primary hover:underline">
          {current}
        </a>
      );
    }
    // 목록을 아직 받지 못했거나 지운 글이다
    const recorded = item.title || item.slug || item.entryId;
    return (
      <span className="text-text-secondary">
        {recorded}
        {list.phase === 'ready' && <span className="ml-1 text-xs">(지운 글)</span>}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-xl font-bold">출간 기록</h1>
      <p className="mt-1 text-sm text-text-secondary">
        발행·숨김·삭제와 그 뒤 캐시 비우기·백업 알림 결과입니다. 최신순입니다.
      </p>

      <div className="mt-5">
        {phase === 'loading' && (
          <p className="py-12 text-center text-sm text-text-secondary">기록을 불러오는 중…</p>
        )}
        {phase === 'error' && (
          <p className="py-12 text-center text-sm text-text-secondary">
            기록을 받지 못했습니다. {error}
          </p>
        )}
        {phase === 'ready' && items.length === 0 && (
          <p className="py-12 text-center text-sm text-text-secondary">기록이 없습니다.</p>
        )}
        {phase === 'ready' && items.length > 0 && (
          <ul className="divide-y divide-border border-y border-border text-sm">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid gap-x-4 gap-y-1 py-2.5 md:grid-cols-[9.5rem_6.5rem_minmax(0,1fr)_3rem] md:items-center"
              >
                <time className="text-xs text-text-secondary md:text-sm" dateTime={item.at}>
                  {formatFullDate(item.at)}
                </time>
                <span className="font-semibold">{actionText(item)}</span>
                <span className="min-w-0 truncate">{titleCell(item)}</span>
                <span className="text-xs text-text-secondary md:text-sm">
                  {item.revision !== null ? `${item.revision}판` : ''}
                </span>
                <span className="md:col-span-2 md:col-start-3">
                  <ResultChips item={item} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {phase === 'ready' && nextBefore && (
          <div className="mt-4 text-center">
            <button
              type="button"
              className={secondaryButton}
              disabled={loadingMore}
              onClick={() => void more()}
            >
              {loadingMore ? '불러오는 중…' : '더 보기'}
            </button>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                더 받지 못했습니다. {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
