import { getAuth, GoogleAuthProvider, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { getClientFirebaseApp } from './firebase-app-client';

let auth: Auth | undefined;
let googleProvider: GoogleAuthProvider | undefined;
const ADMIN_EMAIL = import.meta.env.PUBLIC_ADMIN_EMAIL || '';

export function getClientAuth() {
  if (!auth) {
    auth = getAuth(getClientFirebaseApp());
  }

  return auth;
}

export function getClientGoogleProvider() {
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider();
  }

  return googleProvider;
}

export function initializeClientAuth() {
  return {
    auth: getClientAuth(),
    googleProvider: getClientGoogleProvider(),
  };
}

function isAdminClientUser(user: User | null | undefined) {
  return Boolean(user?.email && user.email === ADMIN_EMAIL);
}

export async function waitForClientAuthUser({
  timeoutMs = 4000,
  requireAdmin = false,
}: {
  timeoutMs?: number;
  requireAdmin?: boolean;
} = {}) {
  const auth = getClientAuth();
  const authWithReady = auth as Auth & { authStateReady?: () => Promise<void> };

  if (typeof authWithReady.authStateReady === 'function') {
    await authWithReady.authStateReady();
  }

  const existingUser = auth.currentUser;
  if (existingUser) {
    if (requireAdmin && !isAdminClientUser(existingUser)) {
      throw new Error('관리자 인증 정보를 확인할 수 없습니다.');
    }

    return existingUser;
  }

  return new Promise<User>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
      callback();
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('관리자 인증 정보를 확인할 수 없습니다.')));
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) return;

        if (requireAdmin && !isAdminClientUser(user)) {
          finish(() => reject(new Error('관리자 인증 정보를 확인할 수 없습니다.')));
          return;
        }

        finish(() => resolve(user));
      },
      (error) => {
        finish(() =>
          reject(error instanceof Error ? error : new Error('관리자 인증 정보를 확인할 수 없습니다.'))
        );
      }
    );
  });
}

export async function getClientIdToken({
  timeoutMs = 4000,
  forceRefresh = false,
  requireAdmin = false,
}: {
  timeoutMs?: number;
  forceRefresh?: boolean;
  requireAdmin?: boolean;
} = {}) {
  const user = await waitForClientAuthUser({ timeoutMs, requireAdmin });
  return user.getIdToken(forceRefresh);
}

export async function getClientAdminIdToken(options?: {
  timeoutMs?: number;
  forceRefresh?: boolean;
}) {
  return getClientIdToken({ ...options, requireAdmin: true });
}
