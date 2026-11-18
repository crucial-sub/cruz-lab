// 확장 설정 읽기 (서가 1단계 T9, Plan J19)
// - 서가 토큰: 비밀번호형 설정. lab token --copy로 키체인 토큰을 복사해 넣는다. 화면에 보이지 않는다.
// - 서버 주소: 비면 운영 서가(https://www.cruzlab.dev). 운영 서가를 켜기 전(T11)에는 http://localhost:4341을 넣는다.
// - @raycast/api를 가져오지 않는다(루트 vitest가 시험한다. tests/library/raycast-lib.test.ts).

export const DEFAULT_SERVER = 'https://www.cruzlab.dev';

// 서버가 토큰을 받지 않을 때(401) Raycast에서 할 일 (두 명령이 같은 글을 쓴다)
export const RAYCAST_UNAUTHORIZED_HINT =
  'Raycast 설정의 서가 토큰을 lab token --copy로 다시 넣습니다. 그래도 같으면 서버의 LIBRARY_TOKEN_SHA256이 그 토큰의 해시인지 봅니다(lab token).';

export type Settings = { ok: true; server: string; token: string } | { ok: false; message: string };

export function readSettings(prefs: { server?: string; token?: string }): Settings {
  const token = prefs.token?.trim() ?? '';
  if (!token) {
    return { ok: false, message: '서가 토큰이 비어 있습니다. 터미널에서 lab token --copy를 실행하고 Raycast 설정에 붙여 넣습니다.' };
  }
  const server = prefs.server?.trim() || DEFAULT_SERVER;
  // lab push의 --server와 같은 검사 (scripts/lab.mjs)
  if (!/^https?:\/\/[^/]+/.test(server)) return { ok: false, message: `서버 주소가 틀렸습니다: ${server}` };
  return { ok: true, server: server.replace(/\/+$/, ''), token };
}
