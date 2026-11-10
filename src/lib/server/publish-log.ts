// 출간 기록(publishLog) 읽기·쓰기 (재건 5단계 D11)
// - 읽기: 최신순 쪽 단위(출간 기록 화면), 최근 7일(알림 띠).
// - 쓰기: 발행·숨김·삭제 뒤 부수 작업 결과를 같은 줄에 적는다(트랜잭션 뒤 update). 다시 시도하면 retry 줄을 더한다.
// - 칸 더하기만 한다. 옛 줄은 칸이 없어도 읽힌다(src/lib/publish-log.ts).
// - 부수 결과 기록이 실패해도 요청은 성공으로 끝낸다(발행은 이미 커밋됐다). 로그만 남긴다.

import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { isTimestampLike, toDateValue } from '@/lib/entry-schema';
import {
  ALERT_WINDOW_MS,
  computePublishAlerts,
  readSideEffects,
  type AssetUsageOutcome,
  type BackupOutcome,
  type PublishAlerts,
  type PublishLogItem,
  type PurgeOutcome,
  type RetryTarget,
} from '@/lib/publish-log';
import { ApiError } from './api-response';
import { PUBLISH_LOG_COLLECTION } from './entries';
import { getServerDb } from './firebase-server';

// 한 쪽의 줄 수(D11 "50줄씩")
export const PUBLISH_LOG_PAGE_SIZE = 50;

function logRef() {
  return getServerDb().collection(PUBLISH_LOG_COLLECTION);
}

// 저장된 줄 → 화면용 줄
export function serializeLogRow(docSnap: QueryDocumentSnapshot<DocumentData>): PublishLogItem {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    entryId: typeof data.entryId === 'string' ? data.entryId : '',
    action: typeof data.action === 'string' ? data.action : '',
    slug: typeof data.slug === 'string' ? data.slug : '',
    title: typeof data.title === 'string' ? data.title : null,
    at: isTimestampLike(data.at) ? toDateValue(data.at).toISOString() : new Date(0).toISOString(),
    revision: typeof data.revision === 'number' ? data.revision : null,
    ...readSideEffects(data),
  };
}

// 최신순 한 쪽. before는 앞 쪽 마지막 줄의 ID다(같은 시각의 줄도 건너뛰지 않게 문서로 이어 읽는다)
export async function readPublishLogPage(input: { before: string | null; limit: number }) {
  let query = logRef().orderBy('at', 'desc');
  if (input.before) {
    const cursor = await logRef().doc(input.before).get();
    if (!cursor.exists) throw new ApiError(400, 'INVALID_CURSOR', '이어 읽을 기록이 없습니다.');
    query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(input.limit + 1).get();
  const docs = snapshot.docs.slice(0, input.limit);
  return {
    items: docs.map(serializeLogRow),
    nextBefore: snapshot.docs.length > input.limit ? (docs.at(-1)?.id ?? null) : null,
  };
}

// 알림 띠: 최근 7일 줄로 계산한다(GitHub를 부르지 않는다, M3)
export async function readPublishAlerts(nowMs = Date.now()): Promise<PublishAlerts> {
  const since = Timestamp.fromMillis(nowMs - ALERT_WINDOW_MS);
  const snapshot = await logRef().where('at', '>=', since).get();
  return computePublishAlerts(snapshot.docs.map(serializeLogRow), nowMs);
}

// 한 글의 가장 최근 줄(다시 시도 줄의 제목·slug를 채운다. 글이 지워졌을 때 쓴다)
export async function readLatestLogForEntry(entryId: string): Promise<PublishLogItem | null> {
  const snapshot = await logRef().where('entryId', '==', entryId).get();
  const items = snapshot.docs.map(serializeLogRow);
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return items[0] ?? null;
}

export interface SideEffectResults {
  purge?: PurgeOutcome;
  backup?: BackupOutcome;
  assetUsage?: AssetUsageOutcome;
}

// 부수 작업 결과를 그 줄에 적는다. 실패해도 던지지 않는다
export async function recordSideEffects(
  logId: string | null,
  results: SideEffectResults,
): Promise<void> {
  if (!logId) return;
  const fields = Object.fromEntries(
    Object.entries(results).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(fields).length === 0) return;
  try {
    await logRef().doc(logId).update(fields);
  } catch (error) {
    console.error(`[publish-log] 부수 결과 기록 실패: ${logId}`, error);
  }
}

// 다시 시도 줄을 더한다(action: retry). 실패하면 null
export async function addRetryLog(input: {
  entryId: string;
  slug: string;
  title: string | null;
  retried: RetryTarget[];
  results: SideEffectResults;
}): Promise<string | null> {
  try {
    const ref = await logRef().add({
      entryId: input.entryId,
      action: 'retry',
      slug: input.slug,
      ...(input.title !== null ? { title: input.title } : {}),
      at: Timestamp.now(),
      retried: input.retried,
      ...Object.fromEntries(
        Object.entries(input.results).filter(([, value]) => value !== undefined),
      ),
    });
    return ref.id;
  } catch (error) {
    console.error(`[publish-log] 다시 시도 기록 실패: ${input.entryId}`, error);
    return null;
  }
}
