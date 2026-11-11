// 제목 → slug 제안 테스트 (재건 3단계 D13 "slug(제목에서 제안 버튼)")
import { describe, expect, it } from 'vitest';
import { suggestSlug } from '@/editor/state/slug';
import { isValidSlug } from '@/lib/taxonomy';

describe('suggestSlug', () => {
  it('영문은 소문자, 공백은 -', () => {
    expect(suggestSlug('Hello World')).toBe('hello-world');
  });

  it('한글은 그대로 두고 기호는 뺀다', () => {
    expect(suggestSlug('React 19의 useOptimistic: 낙관적 업데이트!')).toBe(
      'react-19의-useoptimistic-낙관적-업데이트',
    );
  });

  it('제목 앞의 [접두사]는 뗀다. 연속 -는 하나로, 앞뒤 -는 지운다', () => {
    expect(suggestSlug('[크래프톤 정글] -- Week 1 --')).toBe('week-1');
  });

  it('결과는 늘 slug 형식이거나 빈 문자열이다', () => {
    for (const title of ['!!!', '', '   ', 'ok', 'A_B', 'é à ü']) {
      const slug = suggestSlug(title);
      expect(slug === '' || isValidSlug(slug)).toBe(true);
    }
  });
});
