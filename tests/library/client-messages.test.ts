// 맥 입구 공용 안내 글 (서가 1단계 T9)
// - lab push(scripts/lab.mjs)와 Raycast 확장이 같은 글로 계획 오류, 알림, API 오류를 알린다.

import { describe, expect, it } from 'vitest';
import { describeApiError, describeNote, describePlanError } from '@/library/client/messages';
import { PushError } from '@/library/client/push';

describe('describePlanError', () => {
  it('계획 오류 코드를 사용자 글로 바꾼다', () => {
    expect(describePlanError('NOT_FOUND')).toBe('경로가 없습니다');
    expect(describePlanError('OUTSIDE_HOME')).toBe('홈 폴더 밖 파일은 올릴 수 없습니다');
    expect(describePlanError('NOT_DOC')).toBe('md·html 파일이나 폴더가 아닙니다');
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
