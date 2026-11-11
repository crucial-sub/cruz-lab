// 분류 규칙 테스트: 태그 정규화, 카테고리, slug, 접두사
import { describe, expect, it } from 'vitest';
import {
  buildNoteSlug,
  categoryForSynonymTag,
  extractTitlePrefix,
  getCategoryLabel,
  isCategoryKey,
  isNormalizedTag,
  isValidSlug,
  normalizeTag,
  normalizeTags,
  stripTitlePrefix,
} from '@/lib/taxonomy';

describe('normalizeTag', () => {
  it('공백을 지우고 소문자로 바꾸고 공백 묶음을 -로 바꾼다', () => {
    expect(normalizeTag('  CSAPP ')).toBe('csapp');
    expect(normalizeTag('proxy lab')).toBe('proxy-lab');
    expect(normalizeTag('최소   신장 트리')).toBe('최소-신장-트리');
    expect(normalizeTag('malloc lab')).toBe('malloc-lab');
  });

  it('별칭을 합친다', () => {
    expect(normalizeTag('크래프톤정글')).toBe('크래프톤-정글');
    expect(normalizeTag('크래프톤 정글')).toBe('크래프톤-정글');
  });

  it('한글을 NFC로 맞춘다', () => {
    const nfd = '크래프톤 정글'.normalize('NFD');
    expect(normalizeTag(nfd)).toBe('크래프톤-정글');
  });
});

describe('normalizeTags', () => {
  it('카테고리와 뜻이 같은 태그와 중복을 뺀다', () => {
    expect(normalizeTags(['운영체제', 'pintos', '크래프톤 정글'])).toEqual(['pintos', '크래프톤-정글']);
    expect(normalizeTags(['javascript', 'wesbos30'])).toEqual(['wesbos30']);
    expect(normalizeTags(['ReactNative'])).toEqual([]);
    expect(normalizeTags(['크래프톤 정글', '에세이'])).toEqual(['크래프톤-정글']);
    expect(normalizeTags(['AI', 'Agent', 'LLM'])).toEqual(['agent', 'llm']);
    expect(normalizeTags(['크래프톤정글', '크래프톤 정글', ''])).toEqual(['크래프톤-정글']);
  });

  it('개수 한도는 검사하지 않는다(호출하는 쪽 책임)', () => {
    expect(normalizeTags(['운영체제', 'CSAPP', '크래프톤 정글', 'malloc lab', 'C'])).toEqual([
      'csapp',
      '크래프톤-정글',
      'malloc-lab',
      'c',
    ]);
  });
});

describe('카테고리', () => {
  it('뜻이 같은 태그로 카테고리를 찾는다', () => {
    expect(categoryForSynonymTag('ReactNative')).toBe('react-native');
    expect(categoryForSynonymTag('에세이')).toBe('retrospective');
    expect(categoryForSynonymTag('pintos')).toBeNull();
  });

  it('key와 표시 이름', () => {
    expect(isCategoryKey('os')).toBe(true);
    expect(isCategoryKey('운영체제')).toBe(false);
    expect(getCategoryLabel('os')).toBe('운영체제');
    expect(getCategoryLabel('unknown')).toBe('unknown');
  });

  it('정규화된 태그인지 확인한다', () => {
    expect(isNormalizedTag('크래프톤-정글')).toBe(true);
    expect(isNormalizedTag('CSAPP')).toBe(false);
    expect(isNormalizedTag('javascript')).toBe(false);
    expect(isNormalizedTag('')).toBe(false);
  });
});

describe('slug 규칙', () => {
  it('새 slug 형식', () => {
    expect(isValidSlug('stage2-smoke-1')).toBe(true);
    expect(isValidSlug('알고리즘-다익스트라')).toBe(true);
    expect(isValidSlug('reactnative-flatlist-feat-')).toBe(false);
    expect(isValidSlug('Upper-case')).toBe(false);
    expect(isValidSlug('two--dashes')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('노트 slug는 한국 시간으로 만든다', () => {
    expect(buildNoteSlug(new Date('2026-11-08T15:04:00Z'))).toBe('note-20261109-0004');
  });
});

describe('제목 접두사', () => {
  it('접두사를 떼고 꺼낸다', () => {
    expect(stripTitlePrefix('[Pintos] Threads - Alarm Clock 구현')).toBe('Threads - Alarm Clock 구현');
    expect(extractTitlePrefix('[Proxy-lab] 소켓과 Tiny 웹 서버 분석')).toBe('Proxy-lab');
    expect(stripTitlePrefix('크래프톤 정글 0주차 에세이')).toBe('크래프톤 정글 0주차 에세이');
    expect(extractTitlePrefix('크래프톤 정글 0주차 에세이')).toBeNull();
  });
});
