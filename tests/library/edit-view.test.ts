// 고치기 화면 보조 함수 (서가 2단계 T6, Plan J36, L9 "md 원문을 한 글자도 바꾸지 않는다")
// - 임시 저장 키: 문서 id + 판 번호. 다른 판의 임시 글은 "앞 판에서 고치던 글"로 따로 알린다.
// - 줄 끝: 글자 칸(textarea)의 값은 줄 끝이 늘 LF다. 원문이 CRLF였으면 저장할 때 CRLF로 되돌린다.
// - 글자 칸 첫 줄바꿈: HTML은 <textarea> 바로 뒤 줄바꿈 하나를 버린다. 그려 넣을 때 하나를 더 붙인다.
import { describe, expect, it } from 'vitest';
import { draftKey, olderDraftKeys, restoreLineEndings, textareaContent, usesCrlf } from '@/library/ui/edit-view';

describe('draftKey·olderDraftKeys: 기기 임시 저장 (J36)', () => {
  it('키는 문서 id와 판 번호로 정한다', () => {
    expect(draftKey('doc123', 4)).toBe('cruz-library:edit-draft:doc123:4');
  });

  it('같은 문서의 다른 판 키만 고른다', () => {
    const keys = [
      'cruz-library:edit-draft:doc123:3',
      'cruz-library:edit-draft:doc123:4',
      'cruz-library:edit-draft:doc1234:3',
      'cruz-library:font-scale',
      'theme',
    ];
    expect(olderDraftKeys(keys, 'doc123', 4)).toEqual(['cruz-library:edit-draft:doc123:3']);
  });
});

describe('usesCrlf·restoreLineEndings: 줄 끝을 원문과 같게 (L9)', () => {
  it('모든 줄 끝이 CRLF인 원문만 CRLF로 본다', () => {
    expect(usesCrlf('a\r\nb\r\n')).toBe(true);
    expect(usesCrlf('a\nb\n')).toBe(false);
    expect(usesCrlf('a\r\nb\n')).toBe(false);
    expect(usesCrlf('한 줄')).toBe(false);
  });

  it('CRLF 원문이면 글자 칸의 LF를 CRLF로 바꾼다', () => {
    expect(restoreLineEndings('a\nb\n', true)).toBe('a\r\nb\r\n');
  });

  it('이미 CRLF인 줄 끝은 겹치지 않는다', () => {
    expect(restoreLineEndings('a\r\nb\n', true)).toBe('a\r\nb\r\n');
  });

  it('LF 원문이면 그대로 둔다', () => {
    expect(restoreLineEndings('a\nb\n', false)).toBe('a\nb\n');
  });
});

describe('textareaContent: 글자 칸에 그려 넣을 글', () => {
  it('맨 앞에 줄바꿈 하나를 더 붙인다(HTML이 하나를 버린다)', () => {
    expect(textareaContent('\n\n# 제목')).toBe('\n\n\n# 제목');
    expect(textareaContent('# 제목')).toBe('\n# 제목');
  });

  it('CRLF는 LF로 그린다(HTML이 어차피 LF로 바꾼다)', () => {
    expect(textareaContent('a\r\nb')).toBe('\na\nb');
  });
});
