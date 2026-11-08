// Astro 요청 단위 값의 타입 (재건 2단계 D5)
// - admin: 미들웨어가 세션 쿠키를 검증한 뒤 넣는다. 관리자 경로에서만 있다.

declare namespace App {
  interface Locals {
    admin?: import('./lib/server/admin-session').AdminSession;
  }
}
