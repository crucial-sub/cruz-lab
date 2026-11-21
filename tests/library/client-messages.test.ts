// 맥 입구 공용 안내 글 (서가 1단계 T9)
// - lab push(scripts/lab.mjs)와 Raycast 확장이 같은 글로 계획 오류, 알림, API 오류를 알린다.

import { describe, expect, it } from 'vitest';
import {
  describeApiError,
  describeFolderChoice,
  describeNote,
  describePlanError,
  describePullOutcome,
  folderDialogText,
  folderRerunCommands,
  pickNumbered,
} from '@/library/client/messages';
import { PushError } from '@/library/client/push';
import { describeFolderEntryError, planCollection, planDrop } from '@/library/ui/upload-plan';

describe('describePlanError', () => {
  it('계획 오류 코드를 사용자 글로 바꾼다', () => {
    expect(describePlanError('NOT_FOUND')).toBe('경로가 없습니다');
    expect(describePlanError('OUTSIDE_HOME')).toBe('홈 폴더 밖 파일은 올릴 수 없습니다');
    expect(describePlanError('NOT_DOC')).toBe('md·html 파일이나 폴더가 아닙니다');
  });

  it('진입 파일 오류는 폴더 뿌리의 문서 개수가 있으면 서가 화면과 같은 글을 쓴다', () => {
    expect(describePlanError('NO_ENTRY_IN_FOLDER', { html: 0, md: 0 })).toBe(describeFolderEntryError({ html: 0, md: 0 }));
    expect(describePlanError('NO_ENTRY_IN_FOLDER', { html: 0, md: 0 })).toContain('폴더 뿌리에 md·html 문서가 없습니다');
  });

  it('진입 파일 오류에 개수가 없으면 규칙만 알린다', () => {
    expect(describePlanError('NO_ENTRY_IN_FOLDER')).toBe('폴더 뿌리에 md·html 문서가 없습니다');
  });

  it('고르기·한도 오류를 글로 바꾼다', () => {
    expect(describePlanError('NEEDS_CHOICE')).toContain('골라야');
    expect(describePlanError('FOLDER_TOO_LARGE')).toContain('2000개');
    expect(describePlanError('BAD_ENTRY')).toContain('폴더 뿌리의 문서');
  });
});

describe('describePlanError: 고르기 오류의 자세한 글', () => {
  it('한도 오류는 넘은 한도를 알린다', () => {
    expect(describePlanError('COLLECTION_LIMIT', undefined, { limit: 'TOO_MANY_DOCS' })).toContain('100편');
  });

  it('진입 파일 오류는 후보를 알린다', () => {
    expect(describePlanError('BAD_ENTRY', undefined, { entryOptions: ['a.html', 'b.md'] })).toContain('a.html, b.md');
  });
});

describe('describeFolderChoice: 맥 입구의 계획 글 (J75)', () => {
  async function lines(contents: Record<string, string>) {
    const plan = planDrop(Object.entries(contents).map(([path, text]) => ({ path, bytes: text.length })));
    if (plan.ok || plan.error !== 'NEEDS_CHOICE') throw new Error('NEEDS_CHOICE가 아닙니다');
    const collection = await planCollection(plan.choice, async (source) => contents[source]);
    return describeFolderChoice(plan.choice, collection);
  }

  it('문서 목록, 자산, 경고, 진입 파일 후보를 보인다', async () => {
    const text = (
      await lines({
        'x/a.html': '<a href="b.md">b</a><img src="s.png">',
        'x/b.md': '![s](s.png)',
        'x/s.png': 'p',
        'x/u.txt': 'u',
        'x/sub/c.md': '# c',
      })
    ).join('\n');
    expect(text).toContain('x 폴더는 문서가 여러 편입니다');
    expect(text).toContain('문서 모음: 문서 2편, 자산 1개 (함께 쓰는 자산 1개)');
    expect(text).toContain('  - a (html, 파일 2개)');
    expect(text).toContain('HTML에서 다른 문서로 가는 링크 1개는 서가에서 열리지 않습니다.');
    expect(text).toContain('안 올리는 파일 1개: u.txt');
    expect(text).toContain('하위 폴더 문서 1개는 올리지 않습니다.');
    expect(text).toContain('공유 범위에 들면 올리는 즉시 보입니다');
    expect(text).toContain('  [문서 모음] 안 올리는 파일 1개: u.txt');
    expect(text).toContain('문서 하나: 폴더 안 파일 5개를 모두 올립니다. 진입 파일 후보: a.html, b.md');
  });

  it('맥 확인 창도 문서 하나가 폴더 전체를 올린다고 알린다 (리뷰 I1)', async () => {
    const contents: Record<string, string> = { 'x/a.md': '# a', 'x/b.md': '# b', 'x/private.txt': 'p' };
    const plan = planDrop(Object.entries(contents).map(([path, text]) => ({ path, bytes: text.length })));
    if (plan.ok || plan.error !== 'NEEDS_CHOICE') throw new Error('NEEDS_CHOICE가 아닙니다');
    const collection = await planCollection(plan.choice, async (source) => contents[source]);
    const text = folderDialogText(plan.choice, collection);
    expect(text).toContain('[문서 모음] 안 올리는 파일 1개: private.txt');
    expect(text).toContain('문서 하나: 폴더 안 파일 3개를 모두 올립니다.');
  });

  it('문서가 많으면 목록을 줄인다', async () => {
    const contents: Record<string, string> = {};
    for (let i = 0; i < 25; i += 1) contents[`x/d${String(i).padStart(2, '0')}.md`] = '# d';
    const text = (await lines(contents)).join('\n');
    expect(text).toContain('  - d19 (md, 파일 1개)');
    expect(text).not.toContain('  - d20 (md');
    expect(text).toContain('그 밖 5편');
  });
});

describe('folderRerunCommands: 다시 실행할 명령', () => {
  it('경로를 작은따옴표로 감싼다. 따옴표가 든 이름도 안전하다', () => {
    const commands = folderRerunCommands("/Users/me/it's here", {});
    expect(commands.each).toBe("lab push --each '/Users/me/it'\\''s here'");
    expect(commands.entry).toBe("lab push --entry <진입 파일> '/Users/me/it'\\''s here'");
  });

  it('지정한 서버와 --force를 잇는다', () => {
    const commands = folderRerunCommands('/a', { server: 'http://localhost:4321', force: true });
    expect(commands.each).toBe("lab push --server 'http://localhost:4321' --force --each '/a'");
  });
});

describe('pickNumbered: 번호로 고르기', () => {
  it('번호에 맞는 항목을 돌려준다', () => {
    expect(pickNumbered(' 2 ', ['a', 'b'])).toBe('b');
  });

  it('범위 밖, 숫자 아님, 빈 답은 null이다', () => {
    for (const answer of ['0', '3', 'x', '', '1.5', '1x']) expect(pickNumbered(answer, ['a', 'b'])).toBeNull();
  });
});

describe('describeNote', () => {
  it('알림 종류 이름과 주소를 한 줄로 쓴다', () => {
    expect(describeNote({ kind: 'missing', ref: 'img/a.png' })).toBe('원본에 없음: img/a.png');
    expect(describeNote({ kind: 'outside', ref: '../x.png' })).toBe('문서 밖 주소(함께 올리지 않음): ../x.png');
  });
});

describe('describeApiError', () => {
  it('토큰이 틀리면 서버 메시지 뒤에 할 일을 붙인다 (기본: lab 안내)', () => {
    const error = new PushError('UNAUTHENTICATED', '서가 토큰이 틀렸습니다.', 401);

    expect(describeApiError(error, 'http://localhost:4341')).toBe(
      '서가 토큰이 틀렸습니다. 서버의 LIBRARY_TOKEN_SHA256이 키체인 토큰의 해시와 같은지 봅니다(lab token).',
    );
  });

  it('입구마다 토큰 안내를 바꿀 수 있다', () => {
    const error = new PushError('UNAUTHENTICATED', '서가 토큰이 틀렸습니다.', 401);

    expect(describeApiError(error, 'http://localhost:4341', 'Raycast 설정을 봅니다.')).toBe(
      '서가 토큰이 틀렸습니다. Raycast 설정을 봅니다.',
    );
  });

  it('404는 서가가 꺼졌거나 서버 주소가 틀렸다고 알린다', () => {
    const error = new PushError('HTTP_404', '서버가 404로 답했습니다', 404);

    expect(describeApiError(error, 'https://www.cruzlab.dev')).toBe(
      '서가가 꺼져 있거나 서버 주소가 틀렸습니다 (https://www.cruzlab.dev).',
    );
  });

  it('서가가 꺼진 서버의 404(NOT_FOUND 코드)도 같은 안내를 쓴다', () => {
    // 서버는 LIBRARY_ENABLED가 거짓이면 404 { code: 'NOT_FOUND', message: '없는 주소입니다.' }를 준다(server/api.ts)
    const error = new PushError('NOT_FOUND', '없는 주소입니다.', 404);

    expect(describeApiError(error, 'http://localhost:4341')).toBe(
      '서가가 꺼져 있거나 서버 주소가 틀렸습니다 (http://localhost:4341).',
    );
  });

  it('다른 오류는 메시지를 그대로 쓴다', () => {
    expect(describeApiError(new PushError('PUT_FAILED', '저장소가 파일을 받지 않았습니다', 412), 's')).toBe(
      '저장소가 파일을 받지 않았습니다',
    );
    expect(describeApiError(new Error('읽지 못함'), 's')).toBe('읽지 못함');
    expect(describeApiError('문자열 오류', 's')).toBe('문자열 오류');
  });
});

// 서가 2단계 T7: 되돌리기 결과(lab pull, Raycast "서가에서 가져오기")와 폰 판이 있을 때의 올리기 실패 (Plan J40·J42)
describe('describePullOutcome', () => {
  const home = '/Users/me';

  it('① 바꾼 원본과 백업 경로를 ~ 로 줄여 보인다', () => {
    expect(
      describePullOutcome(
        {
          kind: 'replaced',
          docId: 'd1',
          title: '노트',
          path: '/Users/me/projects/p/a.md',
          rev: 3,
          backupPath: '/Users/me/Library/Application Support/cruz-lab/pull-backup/x/projects/p/a.md',
        },
        home,
      ),
    ).toEqual([
      '되돌림: 노트',
      '  원본을 폰 판으로 바꿨습니다: ~/projects/p/a.md',
      '  앞 원본 백업: ~/Library/Application Support/cruz-lab/pull-backup/x/projects/p/a.md',
    ]);
  });

  it('③ 충돌: 원본을 두었다는 것, .phone.md, 차이, 할 일을 보인다', () => {
    const lines = describePullOutcome(
      {
        kind: 'conflict',
        docId: 'd1',
        title: '노트',
        path: '/Users/me/projects/p/a.md',
        rev: 3,
        reason: 'both-changed',
        phonePath: '/Users/me/projects/p/a.phone.md',
        diff: ['@@ 3번째 줄부터', '- 맥', '+ 폰'],
      },
      home,
    );
    expect(lines[0]).toBe('충돌: 노트');
    expect(lines).toContain('  맥 원본도 바뀌어 덮어쓰지 않았습니다: ~/projects/p/a.md');
    expect(lines).toContain('  폰 판: ~/projects/p/a.phone.md');
    expect(lines).toContain('    - 맥');
    expect(lines.at(-1)).toBe('  두 파일을 합친 뒤 lab push로 올립니다.');
  });

  it('④ 건너뛴 이유를 보인다', () => {
    expect(
      describePullOutcome({ kind: 'skipped', docId: 'd1', title: '노트', path: null, reason: 'no-source' }, home),
    ).toEqual(['건너뜀: 노트', '  서가 화면으로 올린 문서라 되돌릴 원본이 없습니다.']);
  });

  it('바꾼 뒤 경고가 있으면 덧붙인다', () => {
    const lines = describePullOutcome(
      { kind: 'same', docId: 'd1', title: '노트', path: '/Users/me/a.md', rev: 3, warning: '서버에 알리지 못했습니다.' },
      home,
    );
    expect(lines).toEqual(['같음: 노트', '  원본이 이미 폰 판입니다: ~/a.md', '  주의: 서버에 알리지 못했습니다.']);
  });
});

describe('describeApiError: 폰 판이 있을 때 (J42)', () => {
  it('PHONE_EDIT_PENDING이면 가져오기와 --force를 안내한다', () => {
    const message = describeApiError(new PushError('PHONE_EDIT_PENDING', '서버 글', 409), 'https://www.cruzlab.dev');
    expect(message).toContain('폰에서 고친 판');
    expect(message).toContain('lab pull');
    expect(message).toContain('--force');
  });
});
