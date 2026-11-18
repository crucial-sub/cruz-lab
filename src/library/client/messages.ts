// 맥 입구 공용 안내 글 (서가 1단계 T8·T9)
// - lab push(scripts/lab.mjs)와 Raycast 확장이 같은 글로 계획 오류, 알림, API 오류를 알린다.
// - push.ts와 같은 규칙: 상대 가져오기에 .ts, 지울 수 있는 TS 문법만(tests/library/node-load.test.ts).

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
  if (error.status === 404) return `서가가 꺼져 있거나 서버 주소가 틀렸습니다 (${server}).`;
  return error.message;
}
