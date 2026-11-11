// 관리자 세션 쿠키 (재건 2단계 D5)
// - 로그인: ID 토큰 검증 → 관리자 확인 → 로그인 5분 이내 확인 → 세션 쿠키 발급
// - 요청마다: 미들웨어가 세션 쿠키를 검증한다(checkRevoked = true)
// - 관리자는 ADMIN_UID 환경 변수와 email_verified로 식별한다.
// - 5단계 D4: 관리자가 아닌 계정이 로그인하면 그 Firebase 인증 기록을 바로 지운다(관리자 UID는 절대 아님).
//   그래서 Firebase 인증 사용자 목록에는 관리자만 남는다. 403 details.authRecordDeleted가 결과다.

import type { AstroCookieSetOptions } from 'astro';
import { isAdminClaims, isRecentLogin, shouldDeleteRejectedUser } from '@/lib/admin-guard';
import { ApiError } from './api-response';
import { getServerAuth } from './firebase-server';

export const ADMIN_SESSION_COOKIE = 'cruz_admin';
// 세션 만료 14일 (Firebase 최대값)
export const ADMIN_SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

// 검증된 관리자 정보. 미들웨어가 context.locals.admin에 둔다
export interface AdminSession {
  uid: string;
  email: string | null;
  expiresAt: string; // ISO 8601
}

// 관리자 UID. 설정이 없으면 null
export function getAdminUid(): string | null {
  const uid = import.meta.env.ADMIN_UID;
  return typeof uid === 'string' && uid.trim() ? uid.trim() : null;
}

// 쿠키 속성. https가 아닌 로컬 개발에서만 Secure를 뺀다
export function adminCookieOptions(requestUrl: URL): AstroCookieSetOptions {
  return {
    httpOnly: true,
    secure: requestUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

// ID 토큰으로 세션 쿠키 값을 만든다
// - 토큰이 틀리면 401, 관리자가 아니면 403, 로그인한 지 5분이 지났으면 401
export async function createAdminSessionCookie(idToken: string): Promise<string> {
  const adminUid = getAdminUid();
  if (!adminUid) {
    throw new ApiError(503, 'ADMIN_NOT_CONFIGURED', 'ADMIN_UID 설정이 없습니다.');
  }

  const auth = getServerAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    throw new ApiError(401, 'INVALID_ID_TOKEN', 'ID 토큰을 확인할 수 없습니다.');
  }

  if (!isAdminClaims(decoded, adminUid)) {
    const authRecordDeleted = await deleteRejectedUser(decoded.uid, adminUid);
    throw new ApiError(403, 'NOT_ADMIN', '관리자 계정이 아닙니다.', { authRecordDeleted });
  }
  if (!isRecentLogin(decoded.auth_time, Date.now())) {
    throw new ApiError(401, 'STALE_LOGIN', '로그인한 지 5분이 지났습니다. 다시 로그인해 주세요.');
  }

  return auth.createSessionCookie(idToken, { expiresIn: ADMIN_SESSION_MAX_AGE_SECONDS * 1000 });
}

// 거부한 로그인의 인증 기록을 지운다. 지웠으면 true
// - shouldDeleteRejectedUser가 거짓이면(관리자 UID, 설정 없음) 부르지 않는다.
// - ADMIN_UID가 실제 인증 사용자가 아니면 지우지 않는다. 설정값이 틀렸으면(오타, 따옴표)
//   진짜 관리자가 "관리자 아님"으로 판정된다. 그때 관리자 본인의 기록을 지우면 되돌리기 어렵다.
// - 지우기에 실패해도 로그인 거부는 그대로다. 로그만 남긴다.
async function deleteRejectedUser(uid: string, adminUid: string): Promise<boolean> {
  if (!shouldDeleteRejectedUser(uid, adminUid)) return false;
  const auth = getServerAuth();
  try {
    await auth.getUser(adminUid);
  } catch (error) {
    console.error('[admin-session] ADMIN_UID가 인증 사용자가 아니다. 거부한 계정을 지우지 않는다', error);
    return false;
  }
  try {
    await auth.deleteUser(uid);
    return true;
  } catch (error) {
    console.error('[admin-session] 거부한 계정의 인증 기록 삭제 실패', error);
    return false;
  }
}

// 세션 쿠키를 검증한다. 틀리거나 폐기됐거나 관리자가 아니면 null
// - ADMIN_UID가 없으면 오류를 던진다(설정 문제를 인증 실패로 숨기지 않는다)
export async function verifyAdminSessionCookie(cookieValue: string | undefined): Promise<AdminSession | null> {
  const adminUid = getAdminUid();
  if (!adminUid) {
    throw new Error('ADMIN_UID 설정이 없습니다.');
  }
  if (!cookieValue) return null;

  try {
    const decoded = await getServerAuth().verifySessionCookie(cookieValue, true);
    if (!isAdminClaims(decoded, adminUid)) return null;
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    };
  } catch (error) {
    // 만료·폐기·위조는 인증 실패다. 그 밖(네트워크 등)은 기록만 남긴다
    const code = (error as { code?: string })?.code ?? '';
    if (!code.startsWith('auth/')) {
      console.error('[admin-session] 세션 쿠키 검증 오류', error);
    }
    return null;
  }
}

// 모든 기기의 refresh token을 폐기한다 (DELETE ?all=1)
// - Firebase Auth 프로젝트가 하나라 운영 관리자 화면의 로그인도 끊긴다.
export async function revokeAdminTokens(uid: string): Promise<void> {
  await getServerAuth().revokeRefreshTokens(uid);
}
