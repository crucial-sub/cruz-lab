// OG 이미지 템플릿 (재건 4단계 D13, U14)
// - 1200×630. 카드 커버(PostCover.astro)와 같은 디자인: post-cover.ts의 팔레트·블롭·격자.
// - 왼쪽 위 라벨(카테고리 표시 이름 / "노트" / 프로젝트 이름 · Part), 가운데 제목(최대 2줄),
//   아래 설명 1줄 · 날짜 · cruzlab.dev.
// - 순수 함수만 둔다. satori가 받는 객체 트리({ type, props })를 만든다. React를 쓰지 않는다.
//   그리기(satori + resvg)는 src/lib/server/og-image.ts가 한다. 단위 테스트 대상이다.
// - 글꼴 서브셋 스크립트(scripts/ops/og-font-subset.mjs)가 OG_STATIC_TEXT를 가져가므로 상대 경로 import에 .ts를 붙인다.
// - 필름 노이즈(카드 커버의 SVG feTurbulence)는 그리지 않는다. satori가 CSS 필터 배경을 그리지 못한다.
// - 격자는 기울이지 않는다(카드 커버는 -12~12도). 기울인 층에 mask를 씌우면 resvg가 한 장에 3초쯤 걸렸다.
//   기울이지 않으면 0.4초쯤이다(PR-C 리뷰 중요 4, 작업 문서 5절 64).

import { getCoverLabel, getCoverTheme } from './post-cover.ts';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_SITE_HOST = 'cruzlab.dev';
// 글꼴 이름 (og-image.ts가 satori에 같은 이름으로 넘긴다)
export const OG_FONT_FAMILY = 'Pretendard';

// 템플릿이 직접 쓰는 글자 (글꼴 서브셋이 반드시 담아야 한다)
export const OG_STATIC_TEXT = `노트 Part · … ${OG_SITE_HOST} 0123456789.`;

// OG에 쓰는 글자 정리
// - NFC로 맞춘다(분해된 한글 자모는 글꼴 서브셋에 없다. 운영 글 1편의 제목이 NFD다).
// - 그림으로 보이는 이모지(💡 등, Emoji_Presentation)와 변형 선택자(U+FE0F)가 붙은 기호, 그것을 잇는 ZWJ를 뺀다.
//   글꼴에 없어 빈 칸으로 그려진다(설명 10편이 💡로 시작한다).
//   글자로 보이는 기호(© ® ™ ↔ ▶ ✔ 등)는 남긴다. 서브셋이 담고 있다(PR-C 리뷰 경미 5).
// - 공백 묶음을 하나로 줄이고 앞뒤 공백을 지운다.
export function ogText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\p{Extended_Pictographic}\ufe0f|\p{Emoji_Presentation}|\u200d|\ufe0f/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// OG 주소의 글 ID 검사 (/og/<id>.png)
// - Firestore 문서 ID 규칙: 비지 않음, '/' 없음, '.'·'..' 아님, '__…__' 아님. 길이는 넉넉히 300자까지.
// - 프로젝트 글 ID(project-<key>-<slug>)는 한글 slug를 가질 수 있다(PR-C 리뷰 경미 6).
export function isOgEntryId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= 300 &&
    !id.includes('/') &&
    id !== '.' &&
    id !== '..' &&
    !/^__.*__$/.test(id)
  );
}

// 제목 글자 크기 2단계 (D13: 24자 이하 64px, 그 밖 52px). 글자 수는 코드 포인트로 센다
export const OG_TITLE_LARGE = 64;
export const OG_TITLE_SMALL = 52;
export function ogTitleFontSize(title: string): number {
  return [...title].length <= 24 ? OG_TITLE_LARGE : OG_TITLE_SMALL;
}

export interface OgCardInput {
  label: string; // 왼쪽 위 라벨
  paletteKey: string; // 색 계열을 정하는 값(카드 커버와 같은 규칙: 카테고리 표시 이름)
  seed: string; // 블롭 배치를 정하는 값(slug)
  title: string;
  description: string;
  date: Date | null;
}

// satori가 받는 요소 (React 요소와 같은 모양)
export interface OgNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: OgNode | string | (OgNode | string)[];
  };
}

const el = (
  type: string,
  style: Record<string, string | number>,
  children?: OgNode['props']['children'],
): OgNode => ({
  type,
  props: children === undefined ? { style } : { style, children },
});

// 서울 기준 YYYY.MM.DD
export function formatOgDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-');
  return parts.join('.');
}

// 카드 1장 트리. 글자는 ogText로 정리한다
export function buildOgTree(raw: OgCardInput): OgNode {
  const input = {
    ...raw,
    label: ogText(raw.label),
    title: ogText(raw.title),
    description: ogText(raw.description),
  };
  const { palette, blobPositions } = getCoverTheme(input.paletteKey, [], input.seed);
  const mesh = blobPositions
    .map(
      (blob, i) =>
        `radial-gradient(circle at ${blob.x}% ${blob.y}%, ${palette.blobs[i]}cc 0%, ${palette.blobs[i]}00 ${blob.r}%)`,
    )
    .join(', ');
  const titleSize = ogTitleFontSize(input.title);
  const footer = [input.date ? formatOgDate(input.date) : '', OG_SITE_HOST]
    .filter(Boolean)
    .join(' · ');

  return el(
    'div',
    {
      position: 'relative',
      display: 'flex',
      width: OG_WIDTH,
      height: OG_HEIGHT,
      overflow: 'hidden',
      backgroundColor: palette.base,
      fontFamily: OG_FONT_FAMILY,
      fontWeight: 700,
    },
    [
      // 메시 그라디언트 (카드 커버와 같이 가장자리 밖으로 넓힌다)
      el('div', {
        position: 'absolute',
        left: -180,
        top: -95,
        width: 1560,
        height: 820,
        backgroundImage: mesh,
      }),
      // 격자 (가장자리로 갈수록 흐려진다. 기울이지 않는다, 머리말 참고)
      el('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: OG_WIDTH,
        height: OG_HEIGHT,
        opacity: 0.18,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse at 70% 30%, black 10%, transparent 60%)',
      }),
      // 글자를 읽기 쉽게 아래쪽을 어둡게 한다
      el('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundImage:
          'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.2))',
      }),
      // 글자 층: 위 라벨 / 가운데 제목(남는 높이를 모두 쓴다) / 아래 설명·날짜. 바깥 여백 64·72px
      el(
        'div',
        {
          position: 'absolute',
          left: 72,
          top: 64,
          width: OG_WIDTH - 144,
          height: OG_HEIGHT - 128,
          display: 'flex',
          flexDirection: 'column',
        },
        [
          el(
            'div',
            {
              display: 'flex',
              color: palette.ink,
              fontSize: 30,
              letterSpacing: '-0.01em',
              opacity: 0.92,
            },
            input.label,
          ),
          el('div', { display: 'flex', flexGrow: 1, alignItems: 'center' }, [
            el(
              'div',
              {
                display: 'block',
                width: '100%',
                color: '#ffffff',
                fontSize: titleSize,
                lineHeight: 1.25,
                letterSpacing: '-0.03em',
                lineClamp: 2,
                wordBreak: 'keep-all',
              },
              input.title,
            ),
          ]),
          el('div', { display: 'flex', flexDirection: 'column', gap: 14 }, [
            el(
              'div',
              {
                display: 'block',
                width: '100%',
                color: 'rgba(255,255,255,0.86)',
                fontSize: 28,
                lineHeight: 1.4,
                lineClamp: 1,
              },
              input.description || ' ',
            ),
            el(
              'div',
              {
                display: 'flex',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 24,
                letterSpacing: '0.02em',
              },
              footer,
            ),
          ]),
        ],
      ),
    ],
  );
}

// ───────────── 글 → 카드 값 ─────────────

export interface OgEntryLike {
  kind: 'post' | 'note' | 'project';
  title: string;
  description: string;
  slug: string;
  categoryLabel: string;
  tags: string[];
  series: { key: string; order: number } | null;
  publishedAt: Date;
}

// 글·노트·프로젝트 글 → 카드 값
// - 글: 라벨과 색 계열은 카드 커버와 같다(카테고리 표시 이름, 없으면 첫 태그).
// - 노트: 라벨 "노트". 제목이 없으면 첫 줄을 제목으로 쓴다(D13 "노트는 '노트' 라벨 + 첫 줄").
// - 프로젝트 글: 라벨 "프로젝트 이름 · Part N", 색 계열은 프로젝트 이름(목록 카드와 같다).
export function ogInputForEntry(
  entry: OgEntryLike,
  extra: { noteFirstLine?: string; projectTitle?: string } = {},
): OgCardInput {
  if (entry.kind === 'note') {
    const firstLine = extra.noteFirstLine ?? '';
    return {
      label: '노트',
      paletteKey: '노트',
      seed: entry.slug,
      title: entry.title || firstLine || `노트 · ${formatOgDate(entry.publishedAt)}`,
      description: entry.title ? entry.description || firstLine : '',
      date: entry.publishedAt,
    };
  }
  if (entry.kind === 'project') {
    const projectTitle = extra.projectTitle || entry.series?.key || 'Project';
    return {
      label: entry.series ? `${projectTitle} · Part ${entry.series.order}` : projectTitle,
      paletteKey: projectTitle,
      seed: entry.series?.key ?? entry.slug,
      title: entry.title,
      description: entry.description,
      date: entry.publishedAt,
    };
  }
  const label = getCoverLabel(entry.categoryLabel, entry.tags);
  return {
    label,
    paletteKey: label,
    seed: entry.slug,
    title: entry.title,
    description: entry.description,
    date: entry.publishedAt,
  };
}

// 기본 카드 (홈·목록·카테고리·태그·연재·about·404)
export function ogDefaultInput(siteTitle: string, siteDescription: string): OgCardInput {
  return {
    label: OG_SITE_HOST,
    paletteKey: siteTitle,
    seed: 'default',
    title: siteTitle,
    description: siteDescription,
    date: null,
  };
}
