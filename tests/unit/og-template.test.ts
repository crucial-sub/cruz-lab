// OG 이미지 템플릿 테스트 (재건 4단계 D13)
import { describe, expect, it } from 'vitest';
import {
  OG_HEIGHT,
  OG_SITE_HOST,
  OG_TITLE_LARGE,
  OG_TITLE_SMALL,
  OG_WIDTH,
  buildOgTree,
  formatOgDate,
  isOgEntryId,
  ogDefaultInput,
  ogInputForEntry,
  ogText,
  ogTitleFontSize,
  type OgCardInput,
  type OgEntryLike,
  type OgNode,
} from '@/lib/og-template';
import { getCoverTheme } from '@/lib/post-cover';
import { renderOgPng } from '@/lib/server/og-image';

// 트리에서 글자 마디를 모두 찾는다 (스타일과 글자)
function textNodes(node: OgNode): { style: Record<string, string | number>; text: string }[] {
  const children = node.props.children;
  const list = Array.isArray(children) ? children : children === undefined ? [] : [children];
  const result: { style: Record<string, string | number>; text: string }[] = [];
  for (const child of list) {
    if (typeof child === 'string') result.push({ style: node.props.style ?? {}, text: child });
    else result.push(...textNodes(child));
  }
  return result;
}

const CARD: OgCardInput = {
  label: '자료구조',
  paletteKey: '자료구조',
  seed: '큐-queue',
  title: '큐(Queue)',
  description: '선입선출 방식으로 작동하는 자료구조',
  date: new Date('2025-12-04T15:30:00Z'), // 서울 12월 5일 00:30
};

describe('ogTitleFontSize', () => {
  it('24자(코드 포인트) 이하는 64px, 그 밖은 52px다', () => {
    expect(ogTitleFontSize('가'.repeat(24))).toBe(OG_TITLE_LARGE);
    expect(ogTitleFontSize('가'.repeat(25))).toBe(OG_TITLE_SMALL);
    expect(
      ogTitleFontSize('React Native의 New Architecture: 더 빠르고 효율적인 앱 개발의 미래 2편'),
    ).toBe(52);
  });
});

describe('ogText', () => {
  it('NFC로 맞추고 그림 문자를 빼고 공백을 줄인다', () => {
    expect(ogText('💡 비디오 플레이어')).toBe('비디오 플레이어');
    expect(ogText('최적화'.normalize('NFD'))).toBe('최적화');
    expect(ogText(' a \n  b ')).toBe('a b');
    expect(ogText('👩‍💻 코드')).toBe('코드');
    expect(ogText('⚠️ 주의')).toBe('주의');
  });

  it('글자로 보이는 기호는 남긴다(© ® ™ ↔ ▶ ✔)', () => {
    expect(ogText('Next.js™ 라우팅 ↔ 캐시 ▶ © ® ✔')).toBe(
      'Next.js™ 라우팅 ↔ 캐시 ▶ © ® ✔',
    );
  });
});

describe('isOgEntryId', () => {
  it('Firestore 문서 ID 규칙으로 받는다(한글 slug 프로젝트 글 포함)', () => {
    expect(isOgEntryId('LeFCqFhw9iubpp6OocVu')).toBe(true);
    expect(isOgEntryId('project-cruz-lab-한글-글')).toBe(true);
    for (const bad of ['', 'a/b', '.', '..', '__id__', 'x'.repeat(301)])
      expect(isOgEntryId(bad)).toBe(false);
  });
});

describe('buildOgTree', () => {
  it('1200×630, 카드 커버와 같은 바탕색, 라벨·제목·설명·날짜·주소를 그린다', () => {
    const tree = buildOgTree(CARD);
    expect(tree.props.style).toMatchObject({ width: OG_WIDTH, height: OG_HEIGHT });
    expect(tree.props.style?.backgroundColor).toBe(
      getCoverTheme('자료구조', [], '큐-queue').palette.base,
    );
    const texts = textNodes(tree);
    expect(texts.map((node) => node.text)).toEqual([
      '자료구조',
      '큐(Queue)',
      '선입선출 방식으로 작동하는 자료구조',
      `2025.12.05 · ${OG_SITE_HOST}`,
    ]);
  });

  it('제목은 최대 2줄, 설명은 1줄로 자른다. 제목 글자 크기는 길이로 정한다', () => {
    const long = buildOgTree({ ...CARD, title: '가'.repeat(40) });
    const [, title, description] = textNodes(long);
    expect(title.style).toMatchObject({ lineClamp: 2, fontSize: OG_TITLE_SMALL });
    expect(description.style).toMatchObject({ lineClamp: 1 });
    expect(textNodes(buildOgTree(CARD))[1].style.fontSize).toBe(OG_TITLE_LARGE);
  });

  it('날짜가 없으면 주소만, 설명이 없으면 빈 줄이다', () => {
    const texts = textNodes(buildOgTree({ ...CARD, date: null, description: '' }));
    expect(texts.at(-1)?.text).toBe(OG_SITE_HOST);
    expect(texts.at(-2)?.text).toBe(' ');
  });
});

describe('ogInputForEntry', () => {
  const base: OgEntryLike = {
    kind: 'post',
    title: '큐(Queue)',
    description: '설명',
    slug: '큐-queue',
    categoryLabel: '자료구조',
    tags: ['자료구조-기초'],
    series: null,
    publishedAt: new Date('2025-12-05T00:00:00Z'),
  };

  it('글: 라벨·색 계열은 카테고리 표시 이름(없으면 첫 태그)', () => {
    expect(ogInputForEntry(base)).toMatchObject({
      label: '자료구조',
      paletteKey: '자료구조',
      seed: '큐-queue',
    });
    expect(ogInputForEntry({ ...base, categoryLabel: '' })).toMatchObject({
      label: '자료구조-기초',
    });
  });

  it('노트: 라벨 "노트", 제목이 없으면 첫 줄이 제목이다', () => {
    const note = { ...base, kind: 'note' as const, title: '', description: '' };
    expect(ogInputForEntry(note, { noteFirstLine: '오늘 배운 것' })).toMatchObject({
      label: '노트',
      title: '오늘 배운 것',
      description: '',
    });
    expect(ogInputForEntry({ ...note, title: '제목' }, { noteFirstLine: '첫 줄' })).toMatchObject({
      title: '제목',
      description: '첫 줄',
    });
    expect(ogInputForEntry(note).title).toBe('노트 · 2025.12.05');
  });

  it('프로젝트 글: 라벨 "프로젝트 이름 · Part N", 블롭은 프로젝트 key(목록 카드와 같다)', () => {
    const project = { ...base, kind: 'project' as const, series: { key: 'cruz-lab', order: 2 } };
    expect(ogInputForEntry(project, { projectTitle: 'Cruz Lab' })).toMatchObject({
      label: 'Cruz Lab · Part 2',
      paletteKey: 'Cruz Lab',
      seed: 'cruz-lab',
    });
  });

  it('기본 카드', () => {
    expect(ogDefaultInput('Cruz Lab', '설명')).toMatchObject({
      title: 'Cruz Lab',
      label: OG_SITE_HOST,
      date: null,
    });
  });
});

describe('formatOgDate', () => {
  it('서울 날짜 YYYY.MM.DD', () => {
    expect(formatOgDate(new Date('2025-12-31T15:00:00Z'))).toBe('2026.01.01');
  });
});

describe('renderOgPng', () => {
  it('서브셋 글꼴로 1200×630 PNG를 그린다', async () => {
    const png = await renderOgPng(CARD);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([OG_WIDTH, OG_HEIGHT]);
  }, 20_000);
});
