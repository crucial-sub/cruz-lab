// 링크 공유 순수 함수 (서가 2단계 T8, Plan L7·J44~J47·J49)
// - 공유 범위 판정은 이 파일의 shareCoversDoc 하나다. 공유 주소 페이지, 문서 출처의 공유 쿠키 확인, 서가 목록의
//   "공유 중" 표시, 올리기 결과의 경고 줄이 모두 이 함수를 거친다(Plan 10절 위험 3).
// - 폴더는 문서 키에서 계산한다(J45). 문서 기록에 칸을 더하지 않는다. 그래서 이미 올린 문서에도 바로 쓴다.
// - I/O가 없다. 서버·화면·점검 스크립트가 함께 쓴다. Node가 바로 읽게 상대 가져오기에 .ts를 붙인다
//   (tests/library/node-load.test.ts).

import { isProjectName } from './rules.ts';
import { DOC_COOKIE_TTL_SEC, isDocId, isShareId } from './ids.ts';

export { isShareId };

// 공유 범위 (J44): 문서 하나 / 프로젝트 전체 / 프로젝트 안 폴더 하나
export type ShareScope =
  | { kind: 'doc'; docId: string }
  | { kind: 'project'; project: string }
  | { kind: 'folder'; project: string; folder: string };

// 공유 기간 (L7): 1일 / 7일(기본) / 30일 / 끌 때까지
const DAY_MS = 24 * 60 * 60 * 1000;
export const SHARE_DURATIONS = {
  '1d': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  forever: null,
} as const satisfies Record<string, number | null>;
export type ShareDuration = keyof typeof SHARE_DURATIONS;
export const DEFAULT_SHARE_DURATION: ShareDuration = '7d';

// 기간 단추의 글
export const SHARE_DURATION_LABELS: Readonly<Record<ShareDuration, string>> = {
  '1d': '1일',
  '7d': '7일',
  '30d': '30일',
  forever: '끌 때까지',
};

export function isShareDuration(value: unknown): value is ShareDuration {
  return typeof value === 'string' && Object.hasOwn(SHARE_DURATIONS, value);
}

// 끝나는 시각(밀리초). 끌 때까지는 null
export function shareExpiresAt(duration: ShareDuration, nowMs: number): number | null {
  const length = SHARE_DURATIONS[duration];
  return length === null ? null : nowMs + length;
}

// ---------- 공유 id (J44) ----------

// 무작위 18바이트 = 144비트. base64url로 24자다(= 없음)
// 공유 id 꼴 검사(isShareId)는 ids.ts에 있다(공유 쿠키 서명이 함께 쓴다). 위에서 다시 내보낸다
export const SHARE_ID_BYTES = 18;

// 바이트 → base64url (Node·브라우저 모두에 있는 btoa를 쓴다)
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 새 공유 id. random은 시험이 바꾼다(기본: 암호용 난수)
export function newShareId(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  return base64url(random(SHARE_ID_BYTES));
}

// ---------- 상태 ----------

export type ShareState = 'live' | 'expired' | 'revoked';

// 공유 하나의 상태. 끄면(revokedAt) 기간과 상관없이 꺼짐이다
export function shareState(share: { expiresAtMs: number | null; revokedAtMs: number | null }, nowMs: number): ShareState {
  if (share.revokedAtMs !== null) return 'revoked';
  if (share.expiresAtMs !== null && share.expiresAtMs <= nowMs) return 'expired';
  return 'live';
}

// 공유 쿠키 수명(초): 12시간과 남은 공유 기간 중 짧은 쪽 (J47). 1초 안에 끝나면 0
export function shareCookieTtlSec(expiresAtMs: number | null, nowMs: number): number {
  if (expiresAtMs === null) return DOC_COOKIE_TTL_SEC;
  const remaining = Math.floor((expiresAtMs - nowMs) / 1000);
  return Math.max(0, Math.min(DOC_COOKIE_TTL_SEC, remaining));
}

// ---------- 폴더 (J45) ----------

// 문서 키 → 프로젝트 뿌리 기준 폴더 경로. 뿌리에 있으면 ''
// - 맥 입구: ~/projects/{p}/ 뒤, 바탕화면 문서는 ~/Desktop/docs/ 뒤, 그 밖(프로젝트 other)은 ~/ 뒤
// - 서가 화면: web:{프로젝트}/ 뒤 (올린 상대 경로)
// - 키는 문서 파일 경로에서 확장자를 뺀 것이다(J8). 마지막 조각이 문서 이름이고, 그 앞이 폴더다
export function docFolder(key: string): string {
  let rest: string | null = null;
  const mac = key.match(/^mac:~\/(.+)$/);
  if (mac) {
    const path = mac[1];
    const project = path.match(/^projects\/[^/]+\/(.+)$/);
    const desktop = path.match(/^Desktop\/docs\/(.+)$/);
    rest = project ? project[1] : desktop ? desktop[1] : path;
  }
  const web = key.match(/^web:[^/]+\/(.+)$/);
  if (web) rest = web[1];
  if (!rest) return '';
  const parts = rest.split('/');
  return parts.slice(0, -1).join('/');
}

// 공유 폴더가 문서 폴더를 덮는가: 같은 폴더이거나 하위 폴더 (bundles는 bundles2를 덮지 않는다)
export function folderCovers(shareFolder: string, folder: string): boolean {
  if (!shareFolder) return false;
  return folder === shareFolder || folder.startsWith(`${shareFolder}/`);
}

// 제어 문자 (rules.ts의 원본 경로 검사와 같은 규칙)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_FOLDER_LENGTH = 512;

// 공유 만들기 요청의 폴더 이름을 맞춘다: 앞뒤 /를 떼고 NFC. 틀리면 null
export function normalizeShareFolder(value: string): string | null {
  const folder = value.normalize('NFC').replace(/^\/+|\/+$/g, '');
  if (!folder || folder.length > MAX_FOLDER_LENGTH || CONTROL_CHARS.test(folder)) return null;
  const ok = folder.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  return ok ? folder : null;
}

// ---------- 범위 판정 (J46) ----------

// 판정에 필요한 문서 정보: 문서 id, 프로젝트, 폴더(docFolder로 계산한 값)
export interface ShareDocInfo {
  id: string;
  project: string;
  folder: string;
}

// 공유 범위가 이 문서를 덮는가
export function shareCoversDoc(scope: ShareScope, doc: ShareDocInfo): boolean {
  switch (scope.kind) {
    case 'doc':
      return doc.id === scope.docId;
    case 'project':
      return doc.project === scope.project;
    case 'folder':
      return doc.project === scope.project && folderCovers(scope.folder, doc.folder);
  }
}

// 요청 본문(또는 저장된 값)의 공유 범위를 읽는다. 꼴이 틀리면 null
export function parseShareScope(value: unknown): ShareScope | null {
  if (typeof value !== 'object' || value === null) return null;
  const input = value as Record<string, unknown>;
  if (input.kind === 'doc') return isDocId(input.docId) ? { kind: 'doc', docId: input.docId } : null;
  if (typeof input.project !== 'string' || !isProjectName(input.project)) return null;
  const project = input.project.normalize('NFC');
  if (input.kind === 'project') return { kind: 'project', project };
  if (input.kind === 'folder' && typeof input.folder === 'string') {
    const folder = normalizeShareFolder(input.folder);
    return folder ? { kind: 'folder', project, folder } : null;
  }
  return null;
}

// ---------- 글 ----------

// 공유 이름: 문서 제목, 프로젝트 이름, "프로젝트 · 폴더" (J49 og:title, 공유 중 칸, 올리기 경고 줄)
export function shareLabel(scope: ShareScope, docTitle: string | null = null): string {
  if (scope.kind === 'doc') return docTitle || '문서';
  if (scope.kind === 'project') return scope.project;
  return `${scope.project} · ${scope.folder}`;
}

// 남은 기간 글 (공유 중 칸)
export function shareRemainingLabel(expiresAtMs: number | null, nowMs: number): string {
  if (expiresAtMs === null) return '끌 때까지';
  const remaining = expiresAtMs - nowMs;
  if (remaining <= 0) return '끝남';
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 1) return '1분 안에 끝남';
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 남음`;
  return `${Math.floor(hours / 24)}일 남음`;
}

// ---------- 올리기 결과의 경고 줄 (J52) ----------

// 이 문서를 덮는 살아 있는 공유 하나 (올리기 마무리 응답의 sharedBy)
export interface SharedByEntry {
  id: string;
  kind: ShareScope['kind'];
  label: string;
}

function isSharedByEntry(value: unknown): value is SharedByEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.label === 'string' && ['doc', 'project', 'folder'].includes(entry.kind as string);
}

// sharedBy → 경고 줄. 서가 화면·lab push·Raycast·Finder 알림이 같은 글을 쓴다
// - 묶음(프로젝트·폴더)은 나중에 올린 문서도 보인다(L7). 비공개로 둘 문서를 실수로 올렸는지 바로 알게 한다
// - 값이 없거나 꼴이 틀리면 빈 목록이다(옛 서버 응답에는 sharedBy가 없다)
export function sharedByLines(sharedBy: unknown): string[] {
  if (!Array.isArray(sharedBy)) return [];
  return sharedBy
    .filter(isSharedByEntry)
    .map((entry) =>
      entry.kind === 'doc'
        ? '공유 중인 문서입니다. 공유 주소로 이 판이 보입니다.'
        : `공유 중인 묶음 '${entry.label}'에 들어갔습니다. 주소를 아는 사람이 읽습니다.`,
    );
}
