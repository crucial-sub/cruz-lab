// 독자 화면 두 개가 함께 쓰는 조각 (재건 5단계 D20)
// - 기간 고르기(30·90일), 수 칸, 목록 상자, 데이터 받기 훅, 글 제목 찾기.

import { useEffect, useMemo, useState } from 'react';
import { classNames } from '@/editor/ui/class-names';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import type { ReaderDays } from './readers-api';

export function PeriodToggle({
  days,
  onChange,
}: {
  days: ReaderDays;
  onChange: (days: ReaderDays) => void;
}) {
  return (
    <div
      role="group"
      aria-label="기간"
      className="inline-flex rounded-md border border-border p-0.5 text-sm"
    >
      {([30, 90] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={days === value}
          onClick={() => onChange(value)}
          className={classNames(
            'rounded px-3 py-1',
            days === value
              ? 'bg-bg-card font-semibold text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {value}일
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface px-3 py-2.5">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">{value}</dd>
      {note && <dd className="text-xs text-text-secondary">{note}</dd>}
    </div>
  );
}

export function Section({
  title,
  note,
  empty,
  children,
}: {
  title: string;
  note?: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-bg-surface p-4">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-text-secondary">{note}</p>}
      {empty ? (
        <p className="mt-3 text-sm text-text-secondary">기록이 없습니다.</p>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </section>
  );
}

// 한 줄: 왼쪽 글자(말줄임) · 오른쪽 수
export function CountRow({ children, count }: { children: React.ReactNode; count: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="shrink-0 tabular-nums text-text-secondary">{count}</span>
    </li>
  );
}

export type Load<T> =
  | { phase: 'loading' }
  | { phase: 'ready'; data: T }
  | { phase: 'error'; message: string };

// 기간이 바뀌면 다시 받는다. 늦게 온 옛 응답은 버린다. 401이면 로그인 화면
export function useReaderData<T>(load: () => Promise<T>, deps: readonly unknown[]): Load<T> {
  const [state, setState] = useState<Load<T>>({ phase: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ phase: 'loading' });
    load()
      .then((data) => current && setState({ phase: 'ready', data }))
      .catch((error: unknown) => {
        if (!current || redirectIfUnauthorized(error)) return;
        setState({ phase: 'error', message: errorMessage(error) });
      });
    return () => {
      current = false;
    };
    // 부르는 쪽이 넘긴 deps(기간·글 ID)만 본다. load는 그 값으로 만든 새 함수라 deps에 넣지 않는다
  }, deps);
  return state;
}

// 글 ID → 제목(관리자 목록). 목록에 없으면 null
export function useEntryTitles(): (id: string) => string | null {
  const { list, loadList } = useAdmin();
  useEffect(() => {
    void loadList();
  }, [loadList]);
  return useMemo(() => {
    const titles = new Map<string, string>();
    if (list.phase === 'ready')
      for (const item of list.items) titles.set(item.id, item.title || '(제목 없음)');
    return (id: string) => titles.get(id) ?? null;
  }, [list]);
}
