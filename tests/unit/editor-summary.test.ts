// 개요·글자 수·읽기 시간 테스트 (재건 3단계 D13 패널 요약, 2.1 "읽기 시간(공식 하나)")
import { describe, expect, it } from 'vitest';
import { countCharacters, extractOutline, summarizeDoc } from '@/editor/state/summary';
import { calculateReadingTime } from '@/utils/readingTime';

const text = (value: string, marks?: { type: string }[]) => ({ type: 'text', text: value, marks });

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('첫 '), text('제목', [{ type: 'bold' }])],
    },
    { type: 'paragraph', content: [text('본문 한 줄'), { type: 'hardBreak' }, text('둘째')] },
    {
      type: 'blockquote',
      content: [{ type: 'heading', attrs: { level: 3 }, content: [text('인용 안 제목')] }],
    },
    { type: 'heading', attrs: { level: 4 }, content: [] },
    {
      type: 'paragraph',
      content: [text('수식 '), { type: 'inlineMath', attrs: { latex: 'x^2' } }],
    },
    { type: 'codeBlock', attrs: { language: 'js' }, content: [text('const a = 1;')] },
  ],
};

describe('extractOutline', () => {
  it('문서 순서대로 모든 제목을 모은다(중첩 포함). index는 문서 안 제목 순번이다', () => {
    expect(extractOutline(doc)).toEqual([
      { index: 0, level: 2, text: '첫 제목' },
      { index: 1, level: 3, text: '인용 안 제목' },
      { index: 2, level: 4, text: '' },
    ]);
  });

  it('제목이 없으면 빈 배열이다', () => {
    expect(extractOutline({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([]);
  });
});

describe('countCharacters', () => {
  it('글자 노드의 글자 수를 공백 포함·제외로 센다. 코드 블록도 센다', () => {
    // '첫 제목'(4) + '본문 한 줄'(6) + '둘째'(2) + '인용 안 제목'(7) + '수식 '(3) + 'const a = 1;'(12)
    expect(countCharacters(doc)).toEqual({ withSpaces: 34, withoutSpaces: 25 });
  });

  it('이모지 같은 서로게이트 쌍은 한 글자다', () => {
    const emoji = { type: 'doc', content: [{ type: 'paragraph', content: [text('💡 a')] }] };
    expect(countCharacters(emoji)).toEqual({ withSpaces: 3, withoutSpaces: 2 });
  });
});

describe('summarizeDoc', () => {
  it('읽기 시간은 서버와 같은 함수(calculateReadingTime)로 마크다운에서 계산한다', () => {
    const markdown = '## 첫 **제목**\n\n본문 한 줄';
    const summary = summarizeDoc(doc, markdown);
    expect(summary.readingMinutes).toBe(calculateReadingTime(markdown));
    expect(summary.outline).toHaveLength(3);
    expect(summary.characters.withSpaces).toBe(34);
  });
});
