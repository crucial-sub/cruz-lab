/**
 * PWA 아이콘 생성 스크립트
 * sharp를 사용하여 favicon.svg에서 다양한 크기의 PNG 아이콘 생성
 *
 * 실행: node scripts/generate-pwa-icons.js
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const inputSvg = join(projectRoot, 'src/assets/img/favicon.svg');
const outputDir = join(projectRoot, 'public/icons');

// 출력 디렉토리 생성
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable.png', size: 512 }, // maskable 아이콘 (패딩 포함)
];

async function generateIcons() {
  console.log('PWA 아이콘 생성 시작...');

  for (const { name, size } of sizes) {
    const outputPath = join(outputDir, name);

    if (name === 'icon-maskable.png') {
      // Maskable 아이콘: 10% 패딩 추가 (safe zone)
      const padding = Math.round(size * 0.1);
      const innerSize = size - padding * 2;

      await sharp(inputSvg)
        .resize(innerSize, innerSize)
        .extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background: '#10b981', // 브랜드 컬러 배경
        })
        .png()
        .toFile(outputPath);
    } else {
      await sharp(inputSvg)
        .resize(size, size)
        .png()
        .toFile(outputPath);
    }

    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  console.log('PWA 아이콘 생성 완료!');
}

generateIcons().catch(console.error);
