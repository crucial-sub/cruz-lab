// 맥 입구 공용 안내 글 (서가 1단계 T8·T9)
// - lab push(scripts/lab.mjs)와 Raycast 확장이 같은 글로 계획 오류, 알림, API 오류를 알린다.
// - push.ts와 같은 규칙: 상대 가져오기에 .ts, 지울 수 있는 TS 문법만(tests/library/node-load.test.ts).
// - 서가 2단계 T7: 되돌리기 결과(lab pull, Raycast "서가에서 가져오기")의 글도 여기에 둔다.

import { toHomePath } from '../rules.ts';
import type { PullOutcome } from './pull.ts';
import { PushError, type PlanErrorCode, type PushNote } from './push.ts';

const PLAN_ERROR_MESSAGES: Record<PlanErrorCode, string> = {
  NOT_FOUND: '경로가 없습니다',
  OUTSIDE_HOME: '홈 폴더 밖 파일은 올릴 수 없습니다',
  NOT_DOC: 'md·html 파일이나 폴더가 아닙니다',
  NO_ENTRY_IN_FOLDER: '폴더 뿌리에서 진입 파일(index.html, 하나뿐인 html·md)을 정할 수 없습니다',
  EMPTY: '폴더에 올릴 파일이 없습니다',
};

const NOTE_LABELS: Record<PushNote['kind'], string> = {
  missing: '원본에 없음',
  outside: '문서 밖 주소(함께 올리지 않음)',
  type: '받지 않는 형식(함께 올리지 않음)',
  skipped: '뺀 파일',
};

// lab 명령의 토큰 안내 (Raycast는 자기 안내를 넘긴다)
const LAB_UNAUTHORIZED_HINT = '서버의 LIBRARY_TOKEN_SHA256이 키체인 토큰의 해시와 같은지 봅니다(lab token).';

// md를 다시 올릴 때 아직 되돌리지 않은 폰 판이 있다 (서가 2단계 J42)
export const PHONE_EDIT_PENDING_MESSAGE =
  '폰에서 고친 판이 맥 원본에 아직 없습니다. 먼저 lab pull(또는 Raycast "서가에서 가져오기")로 가져옵니다. 맥 원본으로 덮어쓰려면 lab push --force로 올립니다.';

// 계획 오류 코드 → 글
export function describePlanError(error: PlanErrorCode): string {
  return PLAN_ERROR_MESSAGES[error] ?? error;
}

// 알림 하나 → "종류: 주소"
export function describeNote(note: PushNote): string {
  return `${NOTE_LABELS[note.kind] ?? note.kind}: ${note.ref}`;
}

// 서가 토큰 API 실패 → 한 줄 글. 자주 겪는 원인은 할 일을 덧붙인다
// - unauthorizedHint: 토큰이 틀렸을 때 붙이는 할 일 (입구마다 다르다)
// - 404는 모두 "서가가 꺼짐"으로 알린다. 꺼진 서가도 404 NOT_FOUND를 주므로(server/api.ts) 없는 문서와 가를 수 없다.
//   내리기의 404(이미 내려간 문서)는 부르는 쪽이 따로 다룬다
export function describeApiError(error: unknown, server: string, unauthorizedHint: string = LAB_UNAUTHORIZED_HINT): string {
  if (!(error instanceof PushError)) return error instanceof Error ? error.message : String(error);
  if (error.code === 'UNAUTHENTICATED') return `${error.message} ${unauthorizedHint}`;
  if (error.code === 'PHONE_EDIT_PENDING') return PHONE_EDIT_PENDING_MESSAGE;
  if (error.status === 404) return `서가가 꺼져 있거나 서버 주소가 틀렸습니다 (${server}).`;
  return error.message;
}

// ---------- 되돌리기 결과 (서가 2단계 J40) ----------

const SKIP_REASONS: Record<Extract<PullOutcome, { kind: 'skipped' }>['reason'], string> = {
  missing: '맥 원본 파일이 없습니다',
  folder: '폴더째 문서는 되돌리지 않습니다',
  'no-source': '서가 화면으로 올린 문서라 되돌릴 원본이 없습니다.',
  'not-pending': '되돌릴 폰 판이 없습니다.',
};

// 문서 하나의 되돌리기 결과 → 줄 목록 (첫 줄: "되돌림/같음/충돌/건너뜀/실패: 제목", 나머지는 두 칸 들여 쓴다)
// - 경로는 홈 아래면 ~/… 로 줄인다
export function describePullOutcome(outcome: PullOutcome, home: string): string[] {
  const short = (path: string | null) => (path ? toHomePath(path, home) : '');
  const warning = 'warning' in outcome && outcome.warning ? [`  주의: ${outcome.warning}`] : [];
  switch (outcome.kind) {
    case 'replaced':
      return [
        `되돌림: ${outcome.title}`,
        `  원본을 폰 판으로 바꿨습니다: ${short(outcome.path)}`,
        `  앞 원본 백업: ${short(outcome.backupPath)}`,
        ...warning,
      ];
    case 'same':
      return [`같음: ${outcome.title}`, `  원본이 이미 폰 판입니다: ${short(outcome.path)}`, ...warning];
    case 'conflict':
      return [
        `충돌: ${outcome.title}`,
        outcome.reason === 'both-changed'
          ? `  맥 원본도 바뀌어 덮어쓰지 않았습니다: ${short(outcome.path)}`
          : `  서가가 맥 원본의 내용을 몰라 덮어쓰지 않았습니다: ${short(outcome.path)}`,
        `  폰 판: ${short(outcome.phonePath)}`,
        ...(outcome.diff.length > 0 ? ['  차이 앞부분 (- 맥 원본, + 폰 판):', ...outcome.diff.map((line) => `    ${line}`)] : []),
        '  두 파일을 합친 뒤 lab push로 올립니다.',
      ];
    case 'skipped': {
      const reason = SKIP_REASONS[outcome.reason];
      const where = outcome.path && (outcome.reason === 'missing' || outcome.reason === 'folder') ? `: ${short(outcome.path)}` : '';
      return [`건너뜀: ${outcome.title}`, `  ${reason}${where}`];
    }
    case 'failed':
      return [`실패: ${outcome.title}`, `  ${outcome.message}`];
  }
}
