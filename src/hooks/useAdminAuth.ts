// 관리자 인증 훅
// Google OAuth + 이메일 화이트리스트 방식으로 단일 관리자 인증
import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { auth, googleProvider, initializeFirebase } from '@/lib/firebase';

// 관리자 이메일 (환경 변수에서 로드, 클라이언트에서도 검증)
const ADMIN_EMAIL = import.meta.env.PUBLIC_ADMIN_EMAIL || '';

interface AdminAuthState {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
}

interface UseAdminAuthReturn extends AdminAuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    isAdmin: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // Firebase 초기화 확인
    if (typeof window === 'undefined') {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Firebase 서비스 초기화
    initializeFirebase();

    // 인증 상태 변경 리스너
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const isAdmin = user.email === ADMIN_EMAIL;
        setState({
          user,
          isAdmin,
          isLoading: false,
          error: null
        });

        // 관리자가 아닌 경우 자동 로그아웃
        if (!isAdmin) {
          await signOut(auth);
          setState({
            user: null,
            isAdmin: false,
            isLoading: false,
            error: '관리자 권한이 없습니다.',
          });
        }
      } else {
        setState({
          user: null,
          isAdmin: false,
          isLoading: false,
          error: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Google 로그인
  const login = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const result = await signInWithPopup(auth, googleProvider);

      // 관리자 이메일 검증
      if (result.user.email !== ADMIN_EMAIL) {
        await signOut(auth);
        throw new Error('관리자 권한이 없습니다.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그인 중 오류가 발생했습니다.';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message
      }));
      throw error;
    }
  }, []);

  // 로그아웃
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  }, []);

  return { ...state, login, logout };
}
