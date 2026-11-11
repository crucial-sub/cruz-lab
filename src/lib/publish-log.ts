// 출간 기록(publishLog) 한 줄의 모양과 알림 띠 계산 (재건 5단계 D11)
// - 서버(src/lib/server/publish-log.ts)와 관리자 앱이 함께 쓴다. 순수 함수만 둔다.
// - 발행·숨김·삭제 뒤 부수 작업 결과를 같은 줄에 적는다: purge, backup, assetUsage, title(그때 제목).
//   옛 줄(2·3·4단계)은 이 칸이 없다. 없으면 null로 읽는다.
// - 알림 띠: 정상이면 없다. 최근 7일 안에 실패가 있고 그 뒤 같은 글의 성공 줄이 없을 때만 보인다.

export type PurgeOutcome = 'ok' | 'skipped' | 'failed';
export type BackupOutcome = 'dispatched' | 'skipped' | 'failed';
export type AssetUsageOutcome = 'ok' | 'failed';

// 다시 시도할 수 있는 부수 작업
export const RETRY_TARGETS = ['purge', 'backup'] as const;
export type RetryTarget = (typeof RETRY_TARGETS)[number];

// 동작 이름과 화면 글자. PR-B가 retag·recategorize·category(D1)·series(D2)·restore(D3)를 더했다
export const PUBLISH_LOG_ACTION_LABELS: Readonly<Record<string, string>> = {
  publish: '발행',
  hide: '숨김',
  unhide: '다시 보임',
  delete: '삭제',
  retry: '다시 시도',
  restore: '이전 판 가져오기',
  category: '카테고리',
  recategorize: '글 옮기기',
  retag: '태그',
  series: '연재',
};

// 글 하나가 아니라 여러 글을 함께 바꾼 줄(분류·연재)의 entryId. affected에 대상 글 ID가 있다.
// 그 줄의 다시 시도(retry) 줄도 같은 entryId다
export const GROUP_LOG_ENTRY_IDS: readonly string[] = ['taxonomy', 'series'];

// 묶음 줄인지(동작과 상관없이 entryId로 본다. 다시 시도 줄도 묶음이다)
export function isGroupLogEntry(entryId: string): boolean {
  return GROUP_LOG_ENTRY_IDS.includes(entryId);
}

// 화면·API용 한 줄 (시각은 ISO 문자열)
export interface PublishLogItem {
  id: string;
  entryId: string;
  action: string;
  slug: string;
  title: string | null;
  at: string;
  revision: number | null;
  purge: PurgeOutcome | null;
  backup: BackupOutcome | null;
  assetUsage: AssetUsageOutcome | null;
  retried: RetryTarget[]; // action === 'retry'일 때 다시 시도한 작업
  // 분류·연재 줄(PR-B): 세부 동작(create·rename·rekey·merge·delete·move …), 바꾸기 전·뒤 값, 대상 글 ID
  op: string | null;
  from: string | null;
  to: string | null;
  affected: string[];
  // 묶음 줄이 공개 캐시를 비운 글 ID(이름 바꾸기처럼 글은 안 바뀌어도 비운 글을 포함). 다시 비우기가 이 값을 쓴다
  purged: string[];
}

// 알림 띠의 글 하나
export interface PublishAlert {
  entryId: string;
  title: string | null;
  slug: string;
  at: string; // 마지막 실패 시각
}

export interface PublishAlerts {
  purge: PublishAlert[];
  backup: PublishAlert[];
}

// 알림 띠가 보는 기간(D11 "최근 7일")
export const ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PURGE_OUTCOMES: readonly PurgeOutcome[] = ['ok', 'skipped', 'failed'];
const BACKUP_OUTCOMES: readonly BackupOutcome[] = ['dispatched', 'skipped', 'failed'];
const ASSET_USAGE_OUTCOMES: readonly AssetUsageOutcome[] = ['ok', 'failed'];

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

// 저장된 줄의 부수 결과 칸을 읽는다. 모르는 값이나 없는 칸은 null
export function readSideEffects(data: Record<string, unknown>): {
  purge: PurgeOutcome | null;
  backup: BackupOutcome | null;
  assetUsage: AssetUsageOutcome | null;
  retried: RetryTarget[];
} {
  const retried = Array.isArray(data.retried)
    ? data.retried.filter((value): value is RetryTarget => oneOf(RETRY_TARGETS, value) !== null)
    : [];
  return {
    purge: oneOf(PURGE_OUTCOMES, data.purge),
    backup: oneOf(BACKUP_OUTCOMES, data.backup),
    assetUsage: oneOf(ASSET_USAGE_OUTCOMES, data.assetUsage),
    retried,
  };
}

// 부수 작업 하나가 성공했는지. skipped(로컬, 토큰 없음)는 성공이 아니다(실패를 지우지 않는다)
function succeeded(item: PublishLogItem, target: RetryTarget): boolean {
  return target === 'purge' ? item.purge === 'ok' : item.backup === 'dispatched';
}

function failed(item: PublishLogItem, target: RetryTarget): boolean {
  return item[target] === 'failed';
}

// 알림 띠를 계산한다
// 1. 최근 7일(nowMs 기준) 줄만 본다.
// 2. 오래된 줄부터 훑는다. 실패면 그 글을 "실패 중"으로 두고, 그 뒤 같은 글의 성공 줄이 있으면 지운다.
// 3. 남은 글을 마지막 실패가 새로운 순으로 돌려준다.
export function computePublishAlerts(
  items: readonly PublishLogItem[],
  nowMs: number,
): PublishAlerts {
  const since = nowMs - ALERT_WINDOW_MS;
  const recent = items
    .filter((item) => {
      const at = Date.parse(item.at);
      return Number.isFinite(at) && at >= since;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));

  const collect = (target: RetryTarget): PublishAlert[] => {
    const open = new Map<string, PublishAlert>();
    for (const item of recent) {
      if (failed(item, target)) {
        open.set(item.entryId, {
          entryId: item.entryId,
          title: item.title,
          slug: item.slug,
          at: item.at,
        });
      } else if (succeeded(item, target) && (!isGroupLogEntry(item.entryId) || item.action === 'retry')) {
        // 묶음 줄(분류·연재)은 다른 동작의 성공이 앞 동작의 실패를 지우지 않는다. 다시 시도 줄만 지운다
        // (다시 시도는 실패한 묶음 줄들의 대상 글을 모두 비운다, PR-B 리뷰 S3)
        open.delete(item.entryId);
      }
    }
    return [...open.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  };

  return { purge: collect('purge'), backup: collect('backup') };
}
