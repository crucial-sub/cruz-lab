// 관리자 표시 (재건 5단계 D4)
// - 관리자 앱이 열리면 이 브라우저의 localStorage에 'cruz-admin-hint'를 남긴다. 값은 만료 시각(ms)이다.
//   만료 시각은 세션 쿠키 만료와 같다(최대 14일). 로그아웃하면 지운다.
// - 공개 페이지의 인라인 스크립트(BaseLayout)가 이 값을 보고 hidden인 관리자 전용 요소([data-admin-only])를 드러낸다.
// - 표시는 권한이 아니다. 흉내 내면 그 사람 화면에 "고치기"가 보일 뿐이다. 누르면 로그인 화면이다.
//   권한은 서버가 요청마다 세션 쿠키로 확인한다(2단계 D5).
// - 같은 표시로 독자 흐름에서 관리자 본인 방문을 뺀다(D20, PR-D).

export const ADMIN_HINT_KEY = 'cruz-admin-hint';
// 세션 최대 수명과 같다(admin-session.ts ADMIN_SESSION_MAX_AGE_SECONDS)
export const ADMIN_HINT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type HintStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// 표시를 남긴다. 만료 시각이 틀리거나 지났으면 지금부터 최대 수명으로 둔다
export function writeAdminHint(
  storage: HintStorage,
  expiresAt: string | null,
  nowMs: number,
): void {
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const limit = nowMs + ADMIN_HINT_MAX_AGE_MS;
  const value = Number.isFinite(parsed) && parsed > nowMs ? Math.min(parsed, limit) : limit;
  try {
    storage.setItem(ADMIN_HINT_KEY, String(value));
  } catch {
    // 저장 공간을 쓸 수 없으면(시크릿 창 등) 표시 없이 지낸다
  }
}

// 표시를 지운다(로그아웃)
export function clearAdminHint(storage: HintStorage): void {
  try {
    storage.removeItem(ADMIN_HINT_KEY);
  } catch {
    // 지울 수 없으면 만료 시각이 지나면 사라진다
  }
}

// 표시가 살아 있는지. 공개 페이지 인라인 스크립트와 같은 규칙이다(값 > 지금)
export function hasAdminHint(storage: HintStorage, nowMs: number): boolean {
  try {
    const value = Number(storage.getItem(ADMIN_HINT_KEY));
    return Number.isFinite(value) && value > nowMs;
  } catch {
    return false;
  }
}
