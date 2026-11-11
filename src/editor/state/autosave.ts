// 자동저장 상태 기계 (재건 3단계 D6)
// - 순수 리듀서다. 타이머·fetch·IndexedDB는 EditorApp의 훅이 맡는다.
// - 상태: idle(변경 없음) → dirty(바뀜) → saving → saved. 실패는 error, 409는 conflict, 오프라인 보관은 offline.
//   retrying: 네트워크 오류·5xx 뒤 자동으로 다시 보내기를 기다린다(5단계 D15 1). 몇 번째인지와 오프라인 여부를 둔다.
// - blockers는 저장을 막는 요인의 수다(업로드 중인 이미지 노드). 0보다 크면 dirty라도 저장하지 않는다(D11 3).

import type { DraftInput } from '@/lib/entry-rules';

export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'error'
  | 'conflict'
  | 'retrying';

// 자동 재시도 대기 정보(5단계 D15 1)
export interface RetryInfo {
  attempt: number;
  max: number;
  delayMs: number;
  // 서버에 닿지 못했다(기기에 보관함)
  offline: boolean;
}

// 409 응답의 details
export interface ConflictInfo {
  version: number;
  device: string | null;
  updatedAt: string | null;
  // 서버 초안 전체(API details.draft). 테스트에서는 null을 쓴다
  draft: (DraftInput & { version: number; updatedAt: string | null; device: string | null }) | null;
}

export interface AutosaveState {
  status: SaveStatus;
  // 서버 초안 버전. 다음 저장 요청의 baseVersion이다
  version: number;
  // 마지막 저장 성공 시각(ISO). 없으면 이 세션에서 아직 저장하지 않았다
  savedAt: string | null;
  // 저장 중에 다시 바뀌었다. 저장이 끝나면 한 번 더 저장한다
  changedWhileSaving: boolean;
  blockers: number;
  error: string | null;
  conflict: ConflictInfo | null;
  // status가 retrying일 때만 값이 있다
  retry: RetryInfo | null;
}

export type AutosaveEvent =
  | { type: 'changed' }
  | { type: 'save-started' }
  | { type: 'save-succeeded'; version: number; updatedAt: string }
  | { type: 'save-unchanged' }
  | { type: 'save-conflicted'; conflict: ConflictInfo }
  | { type: 'save-failed'; message: string }
  | {
      type: 'save-retrying';
      attempt: number;
      max: number;
      delayMs: number;
      offline: boolean;
      message: string;
    }
  | { type: 'stored-offline' }
  | { type: 'came-online' }
  | { type: 'retry' }
  | { type: 'blockers-changed'; count: number }
  | { type: 'conflict-resolved'; version: number; keepLocal: boolean }
  | { type: 'reset'; version: number };

// 처음 상태: 서버 버전만 안다
export function initialAutosaveState(version: number): AutosaveState {
  return {
    status: 'idle',
    version,
    savedAt: null,
    changedWhileSaving: false,
    blockers: 0,
    error: null,
    conflict: null,
    retry: null,
  };
}

// 변경이 없을 때 돌아갈 깨끗한 상태
function cleanStatus(state: AutosaveState): SaveStatus {
  return state.savedAt ? 'saved' : 'idle';
}

// 상태 전이
export function autosaveReducer(state: AutosaveState, event: AutosaveEvent): AutosaveState {
  switch (event.type) {
    // 이미 같은 상태면 같은 객체를 돌려준다. 키 입력마다 화면 전체가 다시 그려지지 않게 한다
    case 'changed':
      if (state.status === 'saving') {
        return state.changedWhileSaving ? state : { ...state, changedWhileSaving: true };
      }
      if (
        state.status === 'dirty' ||
        state.status === 'conflict' ||
        state.status === 'offline' ||
        state.status === 'error' ||
        state.status === 'retrying'
      )
        return state;
      return { ...state, status: 'dirty' };
    case 'save-started':
      return { ...state, status: 'saving', changedWhileSaving: false, error: null, retry: null };
    case 'save-succeeded':
      return {
        ...state,
        status: state.changedWhileSaving ? 'dirty' : 'saved',
        version: event.version,
        savedAt: event.updatedAt,
        changedWhileSaving: false,
        error: null,
        retry: null,
      };
    case 'save-unchanged':
      // 재시도를 기다리다 내용이 원래대로 돌아간 경우도 깨끗한 상태다(리뷰 S4)
      return state.status === 'dirty' || state.status === 'retrying'
        ? { ...state, status: cleanStatus(state), error: null, retry: null }
        : state;
    case 'save-conflicted':
      return {
        ...state,
        status: 'conflict',
        conflict: event.conflict,
        changedWhileSaving: false,
        retry: null,
      };
    case 'save-failed':
      return {
        ...state,
        status: 'error',
        error: event.message,
        changedWhileSaving: false,
        retry: null,
      };
    case 'save-retrying':
      return {
        ...state,
        status: 'retrying',
        error: event.message,
        changedWhileSaving: false,
        retry: {
          attempt: event.attempt,
          max: event.max,
          delayMs: event.delayMs,
          offline: event.offline,
        },
      };
    case 'stored-offline':
      return { ...state, status: 'offline', changedWhileSaving: false, retry: null };
    case 'came-online':
      return state.status === 'offline' ? { ...state, status: 'dirty' } : state;
    case 'retry':
      return state.status === 'error' || state.status === 'offline' || state.status === 'retrying'
        ? { ...state, status: 'dirty', error: null, retry: null }
        : state;
    case 'blockers-changed':
      return state.blockers === event.count ? state : { ...state, blockers: event.count };
    case 'conflict-resolved':
      return {
        ...state,
        status: event.keepLocal ? 'dirty' : 'idle',
        version: event.version,
        conflict: null,
        changedWhileSaving: false,
      };
    case 'reset':
      return { ...initialAutosaveState(event.version), blockers: state.blockers };
    default:
      return state;
  }
}

// 지금 저장 요청을 보내도 되는지
export function canSaveNow(state: AutosaveState): boolean {
  return state.status === 'dirty' && state.blockers === 0;
}

// 상대 시각: 1분 안 '방금', 1시간 안 'N분 전', 그 밖 HH:MM
function relativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 60_000) return '방금';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}분 전`;
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 상단 바에 보이는 저장 상태 문구 (D13)
export function describeSaveStatus(
  state: AutosaveState,
  context: { device: string; now: Date },
): string {
  switch (state.status) {
    case 'idle':
      return '';
    case 'dirty':
      // 업로드 중, 실패한 업로드, 복사한 자리표시(blob:)가 모두 저장을 막는다
      return state.blockers > 0 ? '업로드가 끝나지 않은 이미지가 있어 저장 대기' : '변경됨';
    case 'saving':
      return '저장 중';
    case 'saved':
      return `저장됨 · ${state.savedAt ? relativeTime(state.savedAt, context.now) : '방금'} · ${context.device}`;
    case 'offline':
      return '오프라인 · 기기에 보관됨';
    case 'error':
      return `저장 실패 · ${state.error ?? '알 수 없는 오류'}`;
    case 'retrying': {
      const retry = state.retry;
      const count = retry ? ` (${retry.attempt}/${retry.max})` : '';
      return retry?.offline
        ? `오프라인 · 기기에 보관됨 · 잠시 뒤 다시 보냄${count}`
        : `저장 실패 · 잠시 뒤 다시 보냄${count}`;
    }
    case 'conflict':
      return '충돌 · 다른 기기가 먼저 저장함';
    default:
      return '';
  }
}
