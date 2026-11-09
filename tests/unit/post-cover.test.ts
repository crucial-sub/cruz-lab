// 코드 커버 테마 테스트 (재건 4단계 D19: 카테고리별 팔레트 표)
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_PALETTES,
  getCoverLabel,
  getCoverPalette,
  getCoverTheme,
  hashString,
  PALETTES,
} from '@/lib/post-cover';
import { CATEGORIES } from '@/lib/taxonomy';

describe('getCoverPalette (D19)', () => {
  it('카테고리 10개가 서로 다른 팔레트를 갖는다', () => {
    const bases = CATEGORIES.map((category) => CATEGORY_PALETTES[category.key].base);
    expect(new Set(bases).size).toBe(CATEGORIES.length);
  });

  it('카테고리 표시 이름과 key가 같은 팔레트를 준다 (OG 템플릿은 어느 쪽을 넘겨도 된다)', () => {
    for (const category of CATEGORIES) {
      expect(getCoverPalette(category.label)).toBe(CATEGORY_PALETTES[category.key]);
      expect(getCoverPalette(category.key)).toBe(CATEGORY_PALETTES[category.key]);
    }
    // 대소문자를 가리지 않는다
    expect(getCoverPalette('javascript')).toBe(PALETTES.magenta);
    expect(getCoverPalette('JAVASCRIPT')).toBe(PALETTES.magenta);
  });

  it('3단계까지 보이던 색을 지킨다: JavaScript 자홍, 운영체제 주황, React Native 라임', () => {
    expect(getCoverPalette('JavaScript')).toBe(PALETTES.magenta);
    expect(getCoverPalette('운영체제')).toBe(PALETTES.orange);
    expect(getCoverPalette('React Native')).toBe(PALETTES.lime);
  });

  it('카테고리가 아닌 라벨(첫 태그, Note)은 이름 해시로 6개 중 하나를 고른다', () => {
    const hashed = [
      PALETTES.violet,
      PALETTES.emerald,
      PALETTES.orange,
      PALETTES.sky,
      PALETTES.magenta,
      PALETTES.lime,
    ];
    expect(getCoverPalette('pintos')).toBe(hashed[hashString('pintos') % 6]);
    expect(getCoverPalette('Note')).toBe(hashed[hashString('note') % 6]);
    // 같은 입력은 같은 결과
    expect(getCoverPalette('pintos')).toBe(getCoverPalette('pintos'));
  });
});

describe('getCoverTheme', () => {
  it('라벨은 카테고리 → 첫 태그 → Note 순이고, 블롭 위치는 slug로 정해 같은 slug면 같다', () => {
    expect(getCoverLabel(null, ['rag', 'llm'])).toBe('rag');
    expect(getCoverLabel('', [])).toBe('Note');
    const a = getCoverTheme('운영체제', ['pintos'], 'pintos-threads-01');
    const b = getCoverTheme('운영체제', ['pintos'], 'pintos-threads-01');
    const c = getCoverTheme('운영체제', ['pintos'], 'pintos-threads-02');
    expect(a.label).toBe('운영체제');
    expect(a.palette).toBe(PALETTES.orange);
    expect(a.blobPositions).toEqual(b.blobPositions);
    expect(a.angle).toBe(b.angle);
    expect(a.blobPositions).not.toEqual(c.blobPositions);
    for (const blob of a.blobPositions) {
      expect(blob.x).toBeGreaterThanOrEqual(10);
      expect(blob.x).toBeLessThanOrEqual(90);
      expect(blob.r).toBeGreaterThanOrEqual(45);
      expect(blob.r).toBeLessThanOrEqual(75);
    }
    expect(Math.abs(a.angle)).toBeLessThanOrEqual(12);
  });

  it('hashString은 32비트 양의 정수를 돌려주고 입력이 같으면 같다', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
  });
});
