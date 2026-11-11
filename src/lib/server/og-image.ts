// OG 이미지 그리기 (재건 4단계 D13, 5단계 T13·D17)
// - 템플릿(og-template.ts)의 객체 트리 → satori(SVG) → resvg(PNG).
// - satori·resvg는 처음 그릴 때 import()로 받는다. 다른 페이지의 콜드 스타트에 넣지 않는다(D13).
// - resvg는 네이티브 판(@resvg/resvg-js)이다. 이 판은 Linux에서 불러올 때 glibc·musl을 가리려고
//   process.report.getReport()를 부른다. 진단 보고서는 열린 네트워크 연결마다 주소 이름(역방향 DNS)을 찾는다.
//   OG 요청은 Firestore를 먼저 읽어 연결이 열려 있으므로, 미리보기 첫 OG에서 이 단계가 약 10.4초였다(작업 문서 4.16).
//   그래서 불러오는 동안만 process.report.excludeNetwork를 켠다(5단계 D17, 사용자 결정 2026-11-11.
//   Plan의 2번 wasm 판은 그리기가 4배쯤 느려 첫 요청이 3초를 넘었다).
// - 글꼴은 서브셋 OTF 한 개(Pretendard Bold)다. satori는 woff2를 받지 않는다.
//   Vercel 함수는 astro.config.mjs의 includeFiles로 이 파일을 함수 폴더에 함께 싣는다. 함수의 작업 폴더가
//   함수 폴더라서 process.cwd() 기준 같은 경로로 읽는다. 개발 서버·빌드(prerender)는 저장소 루트가 작업 폴더다.
// - 한 인스턴스에서 글꼴은 한 번만 읽는다.
// - timing을 주면 단계별 시간을 남긴다(5단계 T13, D17): imp-satori, imp-resvg, font(세 가지는 함께 기다린다),
//   satori(SVG), resvg(PNG).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  OG_FONT_FAMILY,
  OG_HEIGHT,
  OG_WIDTH,
  buildOgTree,
  type OgCardInput,
} from '@/lib/og-template';
import type { ServerTiming } from './server-timing';

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

type ResvgModule = typeof import('@resvg/resvg-js');
// Node 22의 진단 보고서 설정 (excludeNetwork는 @types/node에 아직 없다)
type ProcessReport = NonNullable<NodeJS.Process['report']> & { excludeNetwork?: boolean };

let resvgPromise: Promise<ResvgModule> | null = null;

// resvg 네이티브 판 불러오기 (인스턴스마다 한 번)
// - 불러오는 동안만 진단 보고서의 네트워크 칸을 끈다. 끝나면 원래 값으로 돌린다.
// - excludeNetwork는 Node 22.13·23.3부터 있다. 없는 런타임이면 바꾸지 않고, Linux에서는 경고를 남긴다
//   (불러오기가 다시 느려질 수 있다, 리뷰 S6). 그 밖 운영체제는 isMusl()을 부르지 않는다.
// - 실패하면 다음 요청이 다시 부른다. 같은 인스턴스에서는 같은 오류일 수 있다(Node는 평가에 실패한 import를 기억한다).
function loadResvg(): Promise<ResvgModule> {
  resvgPromise ??= (async () => {
    const report = process.report as ProcessReport | undefined;
    const canExclude = !!report && 'excludeNetwork' in report;
    if (!canExclude && process.platform === 'linux') {
      console.warn('process.report.excludeNetwork가 없어 resvg 불러오기가 느릴 수 있다');
    }
    const previous = canExclude ? report.excludeNetwork : undefined;
    if (canExclude) report.excludeNetwork = true;
    try {
      return await import('@resvg/resvg-js');
    } finally {
      if (canExclude) report.excludeNetwork = previous;
    }
  })().catch((error: unknown) => {
    resvgPromise = null;
    throw error;
  });
  return resvgPromise;
}

// 카드 값 → PNG 바이트 (Response 본문에 그대로 넣을 수 있는 ArrayBuffer 기반 배열)
export async function renderOgPng(
  input: OgCardInput,
  timing?: ServerTiming,
): Promise<Uint8Array<ArrayBuffer>> {
  // 시간을 재지 않을 때는 그대로 부른다
  const step = <T>(name: string, run: () => Promise<T>, desc: string) =>
    timing ? timing.measure(name, run, desc) : run();
  const [{ default: satori }, { Resvg }, font] = await Promise.all([
    step('imp-satori', () => import('satori'), 'import satori'),
    step('imp-resvg', loadResvg, 'import resvg'),
    step('font', loadFont, 'read font'),
  ]);
  // satori의 타입은 React 요소다. 템플릿은 같은 모양의 객체({ type, props })를 만든다
  const svg = await step(
    'satori',
    () =>
      satori(buildOgTree(input) as unknown as Parameters<typeof satori>[0], {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: [{ name: OG_FONT_FAMILY, data: font, weight: 700, style: 'normal' }],
      }),
    'svg layout',
  );
  const draw = () => new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  const png = timing ? timing.measureSync('resvg', draw, 'png raster') : draw();
  return Uint8Array.from(png);
}

// OG 이미지 응답 캐시 (D13): 브라우저는 매번 확인, CDN은 하루, 그 뒤 일주일은 오래된 것을 먼저 준다.
// 재발행·숨김·삭제는 post-<id> 태그 퍼지(3단계 D7)가 이미지도 함께 비운다.
export const OG_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
