// 맥 입구 공용 안내 글 (서가 1단계 T9)
// - lab push(scripts/lab.mjs)와 Raycast 확장이 같은 글로 계획 오류, 알림, API 오류를 알린다.

import { describe, expect, it } from 'vitest';
import { describeApiError, describeNote, describePlanError, describePullOutcome } from '@/library/client/messages';
import { PushError } from '@/library/client/push';
import { describeFolderEntryError } from '@/library/ui/upload-plan';

describe('describePlanError', () => {
  it('계획 오류 코드를 사용자 글로 바꾼다', () => {
    expect(describePlanError('NOT_FOUND')).toBe('경로가 없습니다');
    expect(describePlanError('OUTSIDE_HOME')).toBe('홈 폴더 밖 파일은 올릴 수 없습니다');
    expect(describePlanError('NOT_DOC')).toBe('md·html 파일이나 폴더가 아닙니다');
  });

  it('진입 파일 오류는 폴더 뿌리의 문서 개수가 있으면 막힌 이유와 할 일을 알린다 (서가 화면과 같은 글)', () => {
    expect(describePlanError('NO_ENTRY_IN_FOLDER', { html: 9, md: 9 })).toBe(
      describeFolderEntryError({ html: 9, md: 9 }),
    );
    expect(describePlanError('NO_ENTRY_IN_FOLDER', { html: 9, md: 9 })).toContain('index.html이 없습니다');
  });

  it('진입 파일 오류에 개수가 없으면 규칙만 알린다', () => {
    expect(describePlanError('NO_ENTRY_IN_FOLDER')).toBe(
      '폴더 뿌리에서 진입 파일(index.html, 하나뿐인 html·md)을 정할 수 없습니다',
    );
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
