// 관리자 인증 가드 (재건 2단계 D5)
// - 인증은 서버 미들웨어가 세션 쿠키로 검사한다. 이 컴포넌트에 오기 전에 이미 관리자다.
// - 클라이언트 검사는 지웠다. 옛 화면이 이 컴포넌트로 감싸므로 자리만 남긴다.
//   3단계(에디터)와 5단계(관리자 화면)에서 옛 화면과 함께 지운다.
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function AdminGuard({ children }: Props) {
  return <>{children}</>;
}
