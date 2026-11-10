// 관리자 로그인 화면 (재건 2단계 D5, 5단계 D4)
// 1. 사전 안내를 보인다: 관리자 전용, 관리자가 아니면 로그인되지 않고 기록도 남기지 않는다.
// 2. Google 팝업으로 로그인한다(Firebase 클라이언트 SDK).
// 3. 새 ID 토큰을 POST /api/admin/session에 보내 세션 쿠키를 받는다. 성공하면 next 경로로 간다.
// 4. 관리자가 아니면(403 NOT_ADMIN) 거부 화면을 보인다. 서버가 그 계정의 인증 기록을 이미 지웠다
//    (details.authRecordDeleted). 클라이언트 로그인 상태도 지운다. 날것의 오류(403 JSON)는 보이지 않는다.
// - 거부 화면의 "이 관리자 앱을 만든 과정 보기" 링크는 그 글을 쓴 뒤 넣는다(5단계 Plan 14절).
import { signInWithPopup, signOut } from 'firebase/auth';
import { useState } from 'react';
import { getClientAuth, getClientGoogleProvider } from '@/lib/firebase-auth-client';

interface Props {
  nextPath: string;
}

type ScreenState =
  | { kind: 'ready'; error: string | null }
  | { kind: 'loading' }
  | { kind: 'rejected'; recordDeleted: boolean };

interface SessionError {
  status: number;
  code: string;
  message: string;
  details: unknown;
}

// 세션 API 오류 응답을 읽는다
async function readSessionError(response: Response): Promise<SessionError> {
  try {
    const body = await response.json();
    return {
      status: response.status,
      code: typeof body?.error?.code === 'string' ? body.error.code : '',
      message:
        typeof body?.error?.message === 'string'
          ? body.error.message
          : `로그인에 실패했습니다 (${response.status}).`,
      details: body?.error?.details,
    };
  } catch {
    return {
      status: response.status,
      code: '',
      message: `로그인에 실패했습니다 (${response.status}).`,
      details: null,
    };
  }
}

// Firebase 팝업 오류를 사람이 읽을 문구로. 사용자가 창을 닫은 경우는 문구 없이 돌아간다
function popupErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (code === 'auth/popup-blocked')
    return '로그인 창이 막혔습니다. 이 사이트의 팝업을 허용한 뒤 다시 누르세요.';
  if (code === 'auth/network-request-failed')
    return '네트워크에 연결할 수 없습니다. 연결을 확인한 뒤 다시 누르세요.';
  return '로그인 중 오류가 났습니다. 잠시 뒤 다시 누르세요.';
}

const cardClass =
  'w-full max-w-sm rounded-lg border border-border bg-bg-surface px-6 py-8 text-center shadow-card';

export default function AdminLogin({ nextPath }: Props) {
  const [state, setState] = useState<ScreenState>({ kind: 'ready', error: null });

  // 로그인 버튼: 매번 팝업으로 새로 로그인한다(서버는 로그인 5분 이내 토큰만 받는다)
  const handleLogin = async () => {
    setState({ kind: 'loading' });
    const auth = getClientAuth();
    let idToken: string;
    try {
      const result = await signInWithPopup(auth, getClientGoogleProvider());
      idToken = await result.user.getIdToken(true);
    } catch (error) {
      setState({ kind: 'ready', error: popupErrorMessage(error) });
      return;
    }

    let response: Response;
    try {
      response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ idToken }),
      });
    } catch {
      await signOut(auth).catch(() => {});
      setState({
        kind: 'ready',
        error: '서버에 연결할 수 없습니다. 연결을 확인한 뒤 다시 누르세요.',
      });
      return;
    }
    if (response.ok) {
      window.location.assign(nextPath);
      return;
    }

    const sessionError = await readSessionError(response);
    // 세션을 받지 못했으면 클라이언트 로그인 상태도 지운다
    await signOut(auth).catch(() => {});
    if (sessionError.status === 403 && sessionError.code === 'NOT_ADMIN') {
      const details = sessionError.details as { authRecordDeleted?: unknown } | null;
      setState({ kind: 'rejected', recordDeleted: details?.authRecordDeleted === true });
      return;
    }
    setState({ kind: 'ready', error: sessionError.message });
  };

  if (state.kind === 'rejected') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className={cardClass} aria-labelledby="rejected-title" role="alert">
          <h1 id="rejected-title" className="text-xl font-bold text-text-primary">
            관리자 계정이 아닙니다
          </h1>
          <p className="mt-3 text-sm text-text-secondary">이 계정으로는 들어갈 수 없습니다.</p>
          {state.recordDeleted && (
            <p className="mt-1 text-sm text-text-secondary">방금 로그인 기록은 지웠습니다.</p>
          )}
          <a
            href="/"
            className="mt-6 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            블로그로 돌아가기
          </a>
        </section>
      </main>
    );
  }

  const loading = state.kind === 'loading';
  const error = state.kind === 'ready' ? state.error : null;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className={cardClass} aria-labelledby="login-title">
        <h1 id="login-title" className="text-xl font-bold text-text-primary">
          Cruz Lab 관리자
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          블로그 관리자 전용 화면입니다. 관리자 계정이 아니면 로그인되지 않고, 로그인 기록도 남기지
          않습니다.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
                aria-hidden="true"
              />
              <span>로그인 중…</span>
            </>
          ) : (
            <span>Google로 로그인</span>
          )}
        </button>
        <a
          href="/"
          className="mt-4 inline-block text-sm text-text-secondary hover:text-text-primary"
        >
          블로그로 돌아가기
        </a>
      </section>
    </main>
  );
}
