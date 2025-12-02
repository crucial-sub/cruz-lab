// 관리자 인증 가드 컴포넌트
// 인증되지 않은 사용자에게 로그인 UI를 표시하고
// 관리자로 인증된 경우에만 children을 렌더링
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

// Google 아이콘 SVG
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// 로딩 스피너
function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p className="text-text-secondary">인증 확인 중...</p>
      </div>
    </div>
  );
}

// 로그인 페이지
function LoginPage({
  onLogin,
  error,
  isLoading
}: {
  onLogin: () => void;
  error: string | null;
  isLoading: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* 헤더 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary">
            관리자 로그인
          </h1>
          <p className="mt-2 text-text-secondary">
            관리자만 접근할 수 있습니다.
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="rounded-xl bg-red-500/10 p-4 text-center text-red-500">
            {error}
          </div>
        )}

        {/* 로그인 버튼 */}
        <button
          onClick={onLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 font-semibold text-gray-800 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          ) : (
            <>
              <GoogleIcon />
              <span>Google로 로그인</span>
            </>
          )}
        </button>

        {/* 안내 문구 */}
        <p className="text-center text-sm text-text-secondary">
          등록된 관리자 계정으로만 로그인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default function AdminGuard({ children }: Props) {
  const { isAdmin, isLoading, error, login } = useAdminAuth();

  // 로딩 중
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // 관리자가 아닌 경우 로그인 페이지 표시
  if (!isAdmin) {
    return (
      <LoginPage
        onLogin={login}
        error={error}
        isLoading={isLoading}
      />
    );
  }

  // 관리자인 경우 children 렌더링
  return <>{children}</>;
}
