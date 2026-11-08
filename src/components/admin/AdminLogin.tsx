// 관리자 로그인 화면 (재건 2단계 D5)
// 1. Google 팝업으로 로그인한다(Firebase 클라이언트 SDK).
// 2. 새 ID 토큰을 POST /api/admin/session에 보내 세션 쿠키를 받는다.
// 3. next 경로로 이동한다. next는 서버가 /admin 아래 경로로 검사해서 넘긴다.
import { signInWithPopup, signOut } from 'firebase/auth';
import { useState } from 'react';
import { getClientAuth, getClientGoogleProvider } from '@/lib/firebase-auth-client';

interface Props {
  nextPath: string;
}

// 세션 API 오류 응답에서 사람이 읽을 문구를 꺼낸다
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error?.message === 'string') return body.error.message;
  } catch {
    // 본문이 JSON이 아니면 기본 문구를 쓴다
  }
  return `로그인에 실패했습니다 (${response.status}).`;
}

export default function AdminLogin({ nextPath }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 로그인 버튼: 매번 팝업으로 새로 로그인한다(서버는 로그인 5분 이내 토큰만 받는다)
  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    const auth = getClientAuth();
    try {
      const result = await signInWithPopup(auth, getClientGoogleProvider());
      const idToken = await result.user.getIdToken(true);
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        // 관리자가 아니면 클라이언트 로그인 상태도 지운다
        if (response.status === 403) await signOut(auth);
        throw new Error(message);
      }
      window.location.assign(nextPath);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '로그인 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary">관리자 로그인</h1>
          <p className="mt-2 text-text-secondary">관리자만 접근할 수 있습니다.</p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-center text-red-500">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 font-semibold text-gray-800 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <span className="size-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          ) : (
            <span>Google로 로그인</span>
          )}
        </button>
      </div>
    </div>
  );
}
