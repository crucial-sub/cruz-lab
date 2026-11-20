// 서가 id 꼴과 쿠키 수명 (서가 2단계 T9)
// - ticket.ts는 node:crypto를 쓴다. 화면 스크립트(list-view.ts → share.ts)도 id 꼴을 보아야 하므로 I/O·Node 모듈이 없는
//   이 파일에 둔다. ticket.ts가 같은 값을 다시 내보낸다.
// - Node가 바로 읽는다(지울 수 있는 TS만, tests/library/node-load.test.ts).

// 문서 쿠키 수명 12시간 (서가 1단계 J4). 공유 쿠키도 이보다 길지 않다(2단계 J47)
export const DOC_COOKIE_TTL_SEC = 12 * 60 * 60;

const DOC_ID = /^[A-Za-z0-9_-]{6,64}$/;
// 공유 id 꼴: 무작위 18바이트의 base64url 24자 (2단계 J44)
const SHARE_ID = /^[A-Za-z0-9_-]{24}$/;

// 문서 id 꼴: 영문·숫자·-·_ 6~64자 (주소 경로와 쿠키 경로에 그대로 들어간다)
export function isDocId(value: unknown): value is string {
  return typeof value === 'string' && DOC_ID.test(value);
}

export function isShareId(value: unknown): value is string {
  return typeof value === 'string' && SHARE_ID.test(value);
}
