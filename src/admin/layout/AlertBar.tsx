// 알림 띠 (재건 5단계 D11, M2·M3)
// - 정상이면 아무것도 그리지 않는다. 문제가 있을 때만 띠 한 줄씩 보인다.
//   1. 최근 7일 캐시 비우기 실패(그 뒤 같은 글의 성공 줄이 없음) → "다시 비우기"
//   2. 최근 7일 백업 알림 실패 → "다시 알리기"
//   3. 이 브라우저의 오프라인 보관함(IndexedDB)에 초안이 있다 → "열기"
// - 1·2는 첫 화면이 받는 출간 기록 요청 하나(GET /api/admin/publish-log?alerts=1)로 계산한다. GitHub를 부르지 않는다.
// - 다시 시도에 성공하면 서버가 retry 줄을 남기고 띠가 사라진다. 로컬(Vercel 밖)의 퍼지는 skipped라 띠가 남는다.

import { useCallback, useEffect, useState } from 'react';
import { listOfflineDraftIds } from '@/editor/state/offline-store';
import type { PublishAlert, PublishAlerts, RetryTarget } from '@/lib/publish-log';
import { appApi } from '../api';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { editPath } from '../router';

const ALERT_TEXT: Record<RetryTarget, { label: string; action: string; done: string }> = {
  purge: { label: '캐시 비우기 실패', action: '다시 비우기', done: '캐시를 다시 비웠습니다.' },
  backup: {
    label: '백업 알림 실패',
    action: '다시 알리기',
    done: '백업 저장소에 다시 알렸습니다.',
  },
};

// 다시 시도 결과가 성공인지
function retrySucceeded(target: RetryTarget, result: { purge?: string; backup?: string }): boolean {
  return target === 'purge' ? result.purge === 'ok' : result.backup === 'dispatched';
}

// refreshKey가 바뀌면 알림을 다시 받는다(첫 화면의 숨김·삭제 뒤)
export function AlertBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const { list, showToast } = useAdmin();
  const [alerts, setAlerts] = useState<PublishAlerts | null>(null);
  const [offlineIds, setOfflineIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<RetryTarget | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await appApi.publishAlerts();
      setAlerts(response.alerts);
    } catch {
      // 알림을 읽지 못해도 첫 화면은 그대로 쓴다
      setAlerts(null);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
    listOfflineDraftIds()
      .then(setOfflineIds)
      .catch(() => setOfflineIds([]));
  }, [loadAlerts, refreshKey]);

  // 보관 초안 중 목록에 있는 글만 보인다. 다른 곳에서 지운 글은 열 곳이 없다(404)
  const shownOfflineIds =
    list.phase === 'ready'
      ? offlineIds.filter((id) => list.items.some((item) => item.id === id))
      : offlineIds;

  // 글 ID → 지금 제목(목록에서). 없으면 기록된 제목
  const titleOf = (id: string, fallback: string | null) => {
    const item = list.phase === 'ready' ? list.items.find((entry) => entry.id === id) : undefined;
    return item ? item.title || '(제목 없음)' : fallback || '(제목 없음)';
  };

  const retry = async (target: RetryTarget, entries: PublishAlert[]) => {
    setBusy(target);
    let succeeded = 0;
    let skipped = 0;
    try {
      for (const entry of entries) {
        const result = await appApi.retry(
          entry.entryId,
          target === 'purge' ? { purge: true } : { backup: true },
        );
        if (retrySucceeded(target, result)) succeeded += 1;
        else if ((target === 'purge' ? result.purge : result.backup) === 'skipped') skipped += 1;
      }
      if (succeeded === entries.length) showToast('success', ALERT_TEXT[target].done);
      else if (skipped > 0)
        showToast(
          'info',
          '이 환경에서는 실행하지 않았습니다(로컬이거나 토큰이 없음). 운영·미리보기 배포에서 다시 누르세요.',
        );
      else showToast('error', `${entries.length - succeeded}건이 다시 실패했습니다.`);
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      showToast('error', `다시 시도 실패 · ${errorMessage(error)}`);
    } finally {
      setBusy(null);
      await loadAlerts();
    }
  };

  const rows: React.ReactNode[] = [];
  for (const target of ['purge', 'backup'] as const) {
    const entries = alerts?.[target] ?? [];
    if (entries.length === 0) continue;
    rows.push(
      <li key={target} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">
          {ALERT_TEXT[target].label} {entries.length}건
        </span>
        <span
          className="min-w-0 flex-1 truncate text-text-secondary"
          title={entries.map((entry) => titleOf(entry.entryId, entry.title)).join(', ')}
        >
          {entries.map((entry) => titleOf(entry.entryId, entry.title)).join(', ')}
        </span>
        <button
          type="button"
          className="rounded-md border border-amber-500/60 px-2.5 py-1 text-xs font-semibold hover:bg-amber-500/10 disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => void retry(target, entries)}
        >
          {busy === target ? '보내는 중…' : ALERT_TEXT[target].action}
        </button>
      </li>,
    );
  }
  if (shownOfflineIds.length > 0) {
    rows.push(
      <li key="offline" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">이 기기에 보내지 않은 초안 {shownOfflineIds.length}편</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-x-3">
          {shownOfflineIds.slice(0, 3).map((id) => (
            <a
              key={id}
              href={editPath(id)}
              className="truncate font-semibold text-brand hover:underline"
            >
              열기: {titleOf(id, null)}
            </a>
          ))}
        </span>
      </li>,
    );
  }
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="알림"
      className="mb-5 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-text-primary"
    >
      <ul className="space-y-2">{rows}</ul>
    </section>
  );
}
