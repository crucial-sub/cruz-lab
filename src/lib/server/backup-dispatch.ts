// 백업 저장소 알림 (재건 2단계 Plan D7 B3)
// - 발행·삭제 뒤 비공개 저장소 crucial-sub/cruz-lab-content에 repository_dispatch(content-changed)를 보낸다.
//   그 저장소의 GitHub Action이 Firestore를 마크다운·JSON으로 커밋한다.
// - 토큰(BACKUP_DISPATCH_TOKEN)이 없으면 보내지 않고 'skipped'를 돌려준다(로컬, 설정 전).
// - 2초 안에 응답이 없거나 실패해도 발행은 성공이다. 'failed'를 돌려준다. 다음 예약 실행이 백업한다.

export type BackupResult = 'dispatched' | 'skipped' | 'failed';

const BACKUP_REPOSITORY = 'crucial-sub/cruz-lab-content';
const DISPATCH_EVENT_TYPE = 'content-changed';
const DISPATCH_TIMEOUT_MS = 2000;

export interface ContentChange {
  entryId: string;
  action: 'publish' | 'delete';
}

// 백업 저장소에 바뀐 내용을 알린다
export async function notifyContentChanged(change: ContentChange): Promise<BackupResult> {
  const token = import.meta.env.BACKUP_DISPATCH_TOKEN;
  if (typeof token !== 'string' || !token.trim()) return 'skipped';

  try {
    const response = await fetch(`https://api.github.com/repos/${BACKUP_REPOSITORY}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'cruz-lab-backup-dispatch',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: DISPATCH_EVENT_TYPE, client_payload: change }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (response.status === 204) return 'dispatched';
    console.error(`[backup-dispatch] 알림 실패: ${response.status}`);
    return 'failed';
  } catch (error) {
    console.error('[backup-dispatch] 알림 실패', error);
    return 'failed';
  }
}
