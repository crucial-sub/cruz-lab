// 알림 띠 계산 테스트 (재건 5단계 D11)
import { describe, expect, it } from 'vitest';
import {
  ALERT_WINDOW_MS,
  computePublishAlerts,
  isGroupLogEntry,
  readSideEffects,
  type PublishLogItem,
} from '@/lib/publish-log';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

let seq = 0;
function row(patch: Partial<PublishLogItem>): PublishLogItem {
  seq += 1;
  return {
    id: `log-${seq}`,
    entryId: 'a',
    action: 'publish',
    slug: 'a-slug',
    title: '글 A',
    at: minutesAgo(10),
    revision: 1,
    purge: null,
    backup: null,
    assetUsage: null,
    retried: [],
    op: null,
    from: null,
    to: null,
    affected: [],
    purged: [],
    ...patch,
  };
}

describe('computePublishAlerts', () => {
  it('정상이면 알림이 없다', () => {
    const alerts = computePublishAlerts(
      [row({ purge: 'ok', backup: 'dispatched' }), row({ entryId: 'b', purge: 'skipped', backup: 'skipped' })],
      NOW,
    );
    expect(alerts).toEqual({ purge: [], backup: [] });
  });

  it('옛 줄(칸 없음)은 무시한다', () => {
    expect(computePublishAlerts([row({ action: 'delete', revision: null })], NOW)).toEqual({ purge: [], backup: [] });
  });

  it('실패 뒤 같은 글의 성공 줄이 없으면 알린다', () => {
    const alerts = computePublishAlerts([row({ purge: 'failed', backup: 'failed', at: minutesAgo(30) })], NOW);
    expect(alerts.purge).toEqual([{ entryId: 'a', title: '글 A', slug: 'a-slug', at: minutesAgo(30) }]);
    expect(alerts.backup).toHaveLength(1);
  });

  it('그 뒤 성공 줄(다시 시도 포함)이 있으면 지운다', () => {
    const alerts = computePublishAlerts(
      [
        row({ purge: 'failed', backup: 'failed', at: minutesAgo(30) }),
        row({ action: 'retry', retried: ['purge'], purge: 'ok', at: minutesAgo(5) }),
      ],
      NOW,
    );
    expect(alerts.purge).toEqual([]);
    expect(alerts.backup).toHaveLength(1);
  });

  it('skipped는 성공이 아니다(로컬 다시 시도는 실패를 지우지 않는다)', () => {
    const alerts = computePublishAlerts(
      [row({ purge: 'failed', at: minutesAgo(30) }), row({ action: 'retry', purge: 'skipped', at: minutesAgo(5) })],
      NOW,
    );
    expect(alerts.purge).toHaveLength(1);
  });

  it('백업도 skipped는 성공이 아니다', () => {
    const alerts = computePublishAlerts(
      [row({ backup: 'failed', at: minutesAgo(30) }), row({ action: 'retry', backup: 'skipped', at: minutesAgo(5) })],
      NOW,
    );
    expect(alerts.backup).toHaveLength(1);
  });

  it('백업만 다시 한 줄은 캐시 비우기 실패를 지우지 않는다', () => {
    const alerts = computePublishAlerts(
      [
        row({ purge: 'failed', backup: 'failed', at: minutesAgo(30) }),
        row({ action: 'retry', retried: ['backup'], backup: 'dispatched', at: minutesAgo(5) }),
      ],
      NOW,
    );
    expect(alerts.purge).toHaveLength(1);
    expect(alerts.backup).toEqual([]);
  });

  it('숨김 줄의 실패는 그 뒤 같은 글의 발행 줄 성공이 지운다', () => {
    const alerts = computePublishAlerts(
      [
        row({ action: 'hide', purge: 'failed', at: minutesAgo(30) }),
        row({ action: 'publish', purge: 'ok', backup: 'dispatched', at: minutesAgo(5) }),
      ],
      NOW,
    );
    expect(alerts.purge).toEqual([]);
  });

  it('성공 뒤 다시 실패하면 다시 알린다(시각 순서로 본다)', () => {
    const alerts = computePublishAlerts(
      [
        row({ purge: 'failed', at: minutesAgo(1) }),
        row({ purge: 'ok', at: minutesAgo(20) }),
        row({ purge: 'failed', at: minutesAgo(40) }),
      ],
      NOW,
    );
    expect(alerts.purge.map((alert) => alert.at)).toEqual([minutesAgo(1)]);
  });

  it('다른 글의 성공은 이 글의 실패를 지우지 않는다', () => {
    const alerts = computePublishAlerts(
      [row({ purge: 'failed', at: minutesAgo(30) }), row({ entryId: 'b', purge: 'ok', at: minutesAgo(5) })],
      NOW,
    );
    expect(alerts.purge.map((alert) => alert.entryId)).toEqual(['a']);
  });

  it('7일보다 오래된 실패는 보이지 않는다', () => {
    const old = new Date(NOW - ALERT_WINDOW_MS - 1000).toISOString();
    expect(computePublishAlerts([row({ purge: 'failed', at: old })], NOW).purge).toEqual([]);
    const edge = new Date(NOW - ALERT_WINDOW_MS).toISOString();
    expect(computePublishAlerts([row({ purge: 'failed', at: edge })], NOW).purge).toHaveLength(1);
  });

  it('글마다 한 건이고 최근 실패가 먼저다', () => {
    const alerts = computePublishAlerts(
      [
        row({ entryId: 'a', backup: 'failed', at: minutesAgo(50) }),
        row({ entryId: 'a', backup: 'failed', at: minutesAgo(40) }),
        row({ entryId: 'b', title: null, slug: 'b', backup: 'failed', at: minutesAgo(10) }),
      ],
      NOW,
    );
    expect(alerts.backup.map((alert) => [alert.entryId, alert.at])).toEqual([
      ['b', minutesAgo(10)],
      ['a', minutesAgo(40)],
    ]);
  });
});

describe('readSideEffects', () => {
  it('아는 값만 읽고 나머지는 null', () => {
    expect(readSideEffects({ purge: 'ok', backup: 'nope', assetUsage: 'failed', retried: ['purge', 'x'] })).toEqual({
      purge: 'ok',
      backup: null,
      assetUsage: 'failed',
      retried: ['purge'],
    });
    expect(readSideEffects({})).toEqual({ purge: null, backup: null, assetUsage: null, retried: [] });
  });
});

describe('묶음 줄(분류·연재) 알림 (5단계 PR-B 리뷰 S3)', () => {
  it('뒤의 다른 분류 동작이 성공해도 앞 동작의 퍼지 실패는 남는다. 다시 시도 줄만 지운다', () => {
    const failed = row({ entryId: 'taxonomy', action: 'category', op: 'rename', purge: 'failed', at: minutesAgo(30), purged: ['a'] });
    const later = row({ entryId: 'taxonomy', action: 'retag', purge: 'ok', at: minutesAgo(20) });
    expect(computePublishAlerts([failed, later], NOW).purge.map((alert) => alert.entryId)).toEqual(['taxonomy']);
    const retried = row({ entryId: 'taxonomy', action: 'retry', retried: ['purge'], purge: 'ok', at: minutesAgo(10) });
    expect(computePublishAlerts([failed, later, retried], NOW).purge).toEqual([]);
  });

  it('isGroupLogEntry: taxonomy·series만 묶음이다', () => {
    expect(isGroupLogEntry('taxonomy')).toBe(true);
    expect(isGroupLogEntry('series')).toBe(true);
    expect(isGroupLogEntry('abc')).toBe(false);
  });
});
