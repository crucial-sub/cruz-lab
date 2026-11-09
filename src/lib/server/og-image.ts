// OG 이미지 그리기 (재건 4단계 D13)
// - 템플릿(og-template.ts)의 객체 트리 → satori(SVG) → resvg(PNG).
// - satori·resvg는 처음 그릴 때 import()로 받는다. 다른 페이지의 콜드 스타트에 넣지 않는다(D13).
// - 글꼴은 서브셋 OTF 한 개(Pretendard Bold)다. satori는 woff2를 받지 않는다.
//   Vercel 함수는 astro.config.mjs의 includeFiles로 이 파일을 함수 폴더에 함께 싣는다. 함수의 작업 폴더가
//   함수 폴더라서 process.cwd() 기준 같은 경로로 읽는다. 개발 서버·빌드(prerender)는 저장소 루트가 작업 폴더다.
// - 한 인스턴스에서 글꼴은 한 번만 읽는다.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  OG_FONT_FAMILY,
  OG_HEIGHT,
  OG_WIDTH,
  buildOgTree,
  type OgCardInput,
} from '@/lib/og-template';

// 저장소 기준 경로 (astro.config.mjs의 includeFiles와 같은 값)
export const OG_FONT_FILE = 'src/assets/fonts/og/Pretendard-Bold.subset.otf';

let fontPromise: Promise<Buffer> | null = null;

function loadFont(): Promise<Buffer> {
  if (!fontPromise) {
    fontPromise = readFile(path.join(process.cwd(), OG_FONT_FILE)).catch((error) => {
      // 실패를 기억하지 않는다. 다음 요청이 다시 읽는다
      fontPromise = null;
      throw error;
    });
  }
  return fontPromise;
}

// 카드 값 → PNG 바이트 (Response 본문에 그대로 넣을 수 있는 ArrayBuffer 기반 배열)
export async function renderOgPng(input: OgCardInput): Promise<Uint8Array<ArrayBuffer>> {
  const [{ default: satori }, { Resvg }, font] = await Promise.all([
    import('satori'),
    import('@resvg/resvg-js'),
    loadFont(),
  ]);
  // satori의 타입은 React 요소다. 템플릿은 같은 모양의 객체({ type, props })를 만든다
  const svg = await satori(buildOgTree(input) as unknown as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [{ name: OG_FONT_FAMILY, data: font, weight: 700, style: 'normal' }],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return Uint8Array.from(png);
}

// OG 이미지 응답 캐시 (D13): 브라우저는 매번 확인, CDN은 하루, 그 뒤 일주일은 오래된 것을 먼저 준다.
// 재발행·숨김·삭제는 post-<id> 태그 퍼지(3단계 D7)가 이미지도 함께 비운다.
export const OG_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
