// 서가 아이콘 PNG 만들기 (문서 서가 2단계 Plan J25)
//
// 실행: node scripts/ops/library-icons.mjs
//
// - 원본: public/icons/library-icon.svg (모서리가 둥근 초록 바탕)
// - 만드는 파일 (public/icons/):
//   library-192.png, library-512.png   앱 설정 파일의 보통 아이콘(purpose any). 모서리가 둥글고 바깥은 투명하다
//   library-maskable.png               안드로이드 마스크 아이콘(purpose maskable). 바탕이 꽉 찬 사각형이다
//   library-180.png                    아이폰 홈 화면(apple-touch-icon). 바탕이 꽉 찬 사각형이다
//                                      (iOS가 모서리를 깎는다. 투명 픽셀은 검게 보인다)
// - 아이콘 그림을 바꾸면 이 스크립트를 다시 돌리고 PNG를 함께 커밋한다.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ICON_DIR = path.join(import.meta.dirname, '..', '..', 'public', 'icons');
const SOURCE = path.join(ICON_DIR, 'library-icon.svg');

// 바탕 사각형의 둥근 모서리를 없앤 판 (마스크 아이콘·아이폰용)
function fullBleed(svg) {
  const next = svg.replace(/(<rect id="library-bg-shape"[^>]*?) rx="\d+"/, '$1 rx="0"');
  if (next === svg)
    throw new Error(
      'library-icon.svg에서 바탕 사각형(id="library-bg-shape")의 rx를 찾지 못했습니다.',
    );
  return next;
}

// SVG 글자 → 정사각 PNG 파일
async function render(svg, size, fileName) {
  // density: SVG를 목표 크기로 바로 그리게 한다(작게 그린 뒤 키우지 않는다)
  const density = Math.ceil((72 * size) / 512);
  const target = path.join(ICON_DIR, fileName);
  await sharp(Buffer.from(svg), { density })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(target);
  console.log(`만듦: public/icons/${fileName} (${size}×${size})`);
}

async function main() {
  const rounded = await readFile(SOURCE, 'utf8');
  const square = fullBleed(rounded);
  await render(rounded, 192, 'library-192.png');
  await render(rounded, 512, 'library-512.png');
  await render(square, 512, 'library-maskable.png');
  await render(square, 180, 'library-180.png');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
