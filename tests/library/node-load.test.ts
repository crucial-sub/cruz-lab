// 맥 입구가 서가 모듈을 Node로 바로 가져오는지 (서가 1단계 T8, Plan J15·J16)
// - scripts/lab.mjs는 빌드 없이 Node(타입 지우기)로 src/library/client/push.ts를 가져온다.
// - 그래서 그 모듈과 그것이 가져오는 모듈은 상대 경로에 .ts 확장자를 쓰고, 지울 수 있는 TS 문법만 쓴다
//   (생성자 매개변수 속성, enum, namespace를 쓰지 않는다).
// - 누가 확장자 없는 가져오기를 더하면 이 테스트가 실패한다.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// 새 Node 프로세스에서 모듈 하나를 가져오고 내보낸 이름을 돌려받는다
function exportsOf(relativePath: string): string[] {
  const url = new URL(relativePath, `file://${ROOT}`).href;
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); console.log(JSON.stringify(Object.keys(m).sort()));`],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(output.trim()) as string[];
}

describe('Node가 서가 모듈을 바로 가져온다', () => {
  it('refs.ts', () => {
    expect(exportsOf('src/library/refs.ts')).toContain('findHtmlRefs');
  });

  it('ui/upload-plan.ts', () => {
    expect(exportsOf('src/library/ui/upload-plan.ts')).toContain('planDrop');
  });

  it('client/push.ts', () => {
    expect(exportsOf('src/library/client/push.ts')).toEqual(expect.arrayContaining(['planPush', 'pushJob']));
  });

  // T9: Raycast 확장과 lab.mjs가 함께 쓴다
  it('client/docs.ts', () => {
    expect(exportsOf('src/library/client/docs.ts')).toEqual(expect.arrayContaining(['listDocs', 'removeDoc']));
  });

  it('client/messages.ts', () => {
    expect(exportsOf('src/library/client/messages.ts')).toEqual(
      expect.arrayContaining(['describeApiError', 'describeNote', 'describePlanError']),
    );
  });

  // T10: smoke:library가 만료 입장권·쿠키를 서명한다 (Plan 8.1 2)
  it('ticket.ts', () => {
    expect(exportsOf('src/library/ticket.ts')).toEqual(
      expect.arrayContaining(['createDocCookie', 'createTicket', 'verifyDocCookie', 'DOC_COOKIE_NAME']),
    );
  });

  it('host.ts', () => {
    expect(exportsOf('src/library/host.ts')).toEqual(expect.arrayContaining(['rawDocPath', 'rawOpenUrl']));
  });
});
