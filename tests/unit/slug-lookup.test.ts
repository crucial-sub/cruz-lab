// 공개 slug 조회 판정 테스트 (slugHistory 301, Plan 4.1·7.4)
import { describe, expect, it } from 'vitest';
import { blogPath, chooseSlugLookup } from '@/lib/slug-lookup';

const post = (id: string, slug: string, kind = 'post') => ({ id, slug, kind });

describe('chooseSlugLookup', () => {
  it('현재 slug가 맞으면 그 글을 고른다. 같은 slug면 post를 먼저 고른다', () => {
    expect(chooseSlugLookup('a', [post('n1', 'a', 'note'), post('p1', 'a')], [])).toEqual({
      match: post('p1', 'a'),
    });
    expect(chooseSlugLookup('a', [post('n1', 'a', 'note')], [])).toEqual({ match: post('n1', 'a', 'note') });
  });

  it('현재 slug가 없으면 slugHistory로 찾아 새 slug를 돌려준다', () => {
    expect(chooseSlugLookup('old', [], [post('p1', '새-주소')])).toEqual({
      redirectTo: '새-주소',
      target: post('p1', '새-주소'),
    });
  });

  it('자기 자신으로는 보내지 않는다', () => {
    expect(chooseSlugLookup('same', [], [post('p1', 'same')])).toBeNull();
  });

  it('리다이렉트 대상의 kind를 그대로 돌려준다(호출하는 쪽이 post만 받는다)', () => {
    expect(chooseSlugLookup('old', [], [post('n1', 'note-1', 'note')])).toEqual({
      redirectTo: 'note-1',
      target: post('n1', 'note-1', 'note'),
    });
  });

  it('찾지 못하면 null', () => {
    expect(chooseSlugLookup('x', [], [])).toBeNull();
  });
});

describe('blogPath', () => {
  it('한글 slug를 ASCII Location으로 만든다', () => {
    expect(blogPath('알고리즘-다익스트라')).toBe('/blog/%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98-%EB%8B%A4%EC%9D%B5%EC%8A%A4%ED%8A%B8%EB%9D%BC');
    expect(blogPath('ai-agent-context')).toBe('/blog/ai-agent-context');
  });
});
