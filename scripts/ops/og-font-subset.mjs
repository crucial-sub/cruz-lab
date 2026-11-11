// OG 이미지 글꼴 서브셋 만들기·검사 (재건 4단계 D13, Plan 11절)
//
// 실행 (저장소 루트에서):
//   node --env-file=.env scripts/ops/og-font-subset.mjs --source <Pretendard-Bold.otf>   # 서브셋을 만들고 검사한다
//   node --env-file=.env scripts/ops/og-font-subset.mjs                                  # 검사만 한다(커밋한 서브셋 기준)
//   --report <파일>  보고서를 파일에도 쓴다
//
// - 원본: npm pretendard@1.3.9의 dist/public/static/Pretendard-Bold.otf (SIL OFL 1.1). 원본은 저장소에 두지 않는다.
// - 서브셋 범위: 기본 범위(ASCII, 라틴-1, 일반 구두점, 화살표·수학 기호 일부, KS X 1001 한글 2,350자, 호환 자모)
//   + 지금 entries 모든 글(초안 포함)의 제목·설명·노트 첫 줄, seriesMeta 제목, 카테고리 이름, OG 템플릿 글자.
//   그중 원본 글꼴에 있는 글자만 넣는다.
// - 결과: src/assets/fonts/og/Pretendard-Bold.subset.otf + LICENSE.txt. 결과를 커밋한다(한 번 만든다).
// - Firestore는 읽기만 한다. 서브셋 밖 글자가 있으면 보고서에 적는다(satori는 그 글자를 빈 칸으로 그린다).
// - 글자는 OG 템플릿과 같은 규칙(ogText: NFC, 그림 문자 제거)으로 정리한 뒤 센다.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { firstLineExcerpt } from '../../src/lib/content/excerpt.ts';
import { OG_STATIC_TEXT, ogText } from '../../src/lib/og-template.ts';
import { SITE_DESCRIPTION, SITE_TITLE } from '../../src/lib/public-paths.ts';
import { CATEGORIES } from '../../src/lib/taxonomy.ts';
import { ENTRIES, SERIES_META, initAdmin, parseArgs } from '../migrate/lib/admin.mjs';
import { readCmapCodePoints } from './lib/font-cmap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'src/assets/fonts/og');
const OUT_FONT = path.join(OUT_DIR, 'Pretendard-Bold.subset.otf');
const LICENSE_SOURCE = path.join(ROOT, 'public/fonts/pretendard/LICENSE.txt');

const args = parseArgs();
const SOURCE = typeof args.source === 'string' ? path.resolve(args.source) : null;
const REPORT_FILE = typeof args.report === 'string' ? args.report : null;

const lines = [];
const out = (line = '') => lines.push(line);

// 코드 포인트 범위 → 배열
function range(start, end) {
  const result = [];
  for (let code = start; code <= end; code += 1) result.push(code);
  return result;
}

// KS X 1001 완성형 한글 2,350자 (EUC-KR 0xB0A1~0xC8FE)
function ksx1001Hangul() {
  const decoder = new TextDecoder('euc-kr');
  const result = [];
  for (let lead = 0xb0; lead <= 0xc8; lead += 1) {
    for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
      const char = decoder.decode(Uint8Array.of(lead, trail));
      const code = char.codePointAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) result.push(code);
    }
  }
  return result;
}

// 기본 범위
function baseCodePoints() {
  return new Set([
    ...range(0x20, 0x7e), // ASCII
    ...range(0xa0, 0xff), // 라틴-1 보충(· × ÷ © 등)
    ...range(0x2010, 0x2027), // 일반 구두점(‐ – — ‘ ’ “ ” • …)
    ...range(0x2030, 0x203e), // ‰ ′ ″ ‹ › ※ 등
    0x20a9, // ₩
    0x2122, // ™
    ...range(0x2190, 0x2199), // ← ↑ → ↓ ↔ ↕ 등
    ...range(0x21d0, 0x21d4), // ⇐ ⇒ ⇔
    0x2200,
    0x2202,
    0x2205,
    0x2208,
    0x2211,
    0x2212,
    0x221a,
    0x221e,
    0x2227,
    0x2228,
    0x2229,
    0x222a, // 수학 기호 일부
    0x2248,
    0x2260,
    0x2261,
    0x2264,
    0x2265, // ≈ ≠ ≡ ≤ ≥
    ...range(0x2460, 0x2473), // ① ~ ⑳
    0x25a0,
    0x25a1,
    0x25b2,
    0x25b6,
    0x25bc,
    0x25c0,
    0x25cb,
    0x25cf, // ■ □ ▲ ▶ ▼ ◀ ○ ●
    0x2605,
    0x2606,
    0x2713,
    0x2714,
    0x2715, // ★ ☆ ✓ ✔ ✕
    ...range(0x3000, 0x3011), // 한중일 구두점(、 。 〈 〉 《 》 「 」 『 』 【 】)
    ...range(0x3131, 0x318e), // 한글 호환 자모(ㄱ ㅏ …)
    ...ksx1001Hangul(),
  ]);
}

// 글자 집합에 문자열의 코드 포인트를 더한다(OG와 같은 정리 규칙 ogText. 제어 문자는 뺀다)
function addText(set, text) {
  for (const char of ogText(String(text ?? ''))) {
    const code = char.codePointAt(0);
    if (code >= 0x20) set.add(code);
  }
}

// 지금 글들의 제목·설명·노트 첫 줄과 연재·프로젝트 이름 (읽기만)
async function contentTexts() {
  const { db } = initAdmin();
  const [entries, seriesMeta] = await Promise.all([
    db.collection(ENTRIES).get(),
    db.collection(SERIES_META).get(),
  ]);
  const texts = [];
  for (const docSnap of entries.docs) {
    const data = docSnap.data();
    for (const content of [data.draft, data.published]) {
      if (!content) continue;
      texts.push({ id: docSnap.id, text: content.title });
      texts.push({ id: docSnap.id, text: content.description });
      if (data.kind === 'note')
        texts.push({ id: docSnap.id, text: firstLineExcerpt(content.markdown ?? '') });
    }
  }
  for (const docSnap of seriesMeta.docs)
    texts.push({ id: `seriesMeta/${docSnap.id}`, text: docSnap.get('title') });
  return { texts, entryCount: entries.size, seriesCount: seriesMeta.size };
}

const describe = (code) =>
  `U+${code.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(code)}`;

async function main() {
  const { texts, entryCount, seriesCount } = await contentTexts();
  const contentSet = new Set();
  for (const { text } of texts) addText(contentSet, text);
  const fixedSet = new Set();
  for (const text of [
    SITE_TITLE,
    SITE_DESCRIPTION,
    OG_STATIC_TEXT,
    ...CATEGORIES.map((category) => category.label),
  ]) {
    addText(fixedSet, text);
  }

  out(`# OG 글꼴 서브셋 ${SOURCE ? '생성' : '검사'} 보고서`);
  out();
  out(`- 시각: ${new Date().toISOString()}`);
  out(
    `- 글자 출처: entries ${entryCount}개(초안 포함)의 제목·설명·노트 첫 줄, seriesMeta ${seriesCount}개 제목, 카테고리 이름, 사이트 이름·설명, OG 템플릿 글자`,
  );
  out(`- 출처 글자 수: 글 ${contentSet.size}, 고정 ${fixedSet.size}`);

  if (SOURCE) {
    const sourceBuffer = await fs.readFile(SOURCE);
    const sourceCodes = readCmapCodePoints(sourceBuffer);
    const wanted = new Set([...baseCodePoints(), ...contentSet, ...fixedSet]);
    const included = [...wanted].filter((code) => sourceCodes.has(code)).sort((a, b) => a - b);
    const notInSource = [...new Set([...contentSet, ...fixedSet])].filter(
      (code) => !sourceCodes.has(code),
    );
    const subset = await subsetFont(sourceBuffer, String.fromCodePoint(...included), {
      targetFormat: 'sfnt',
    });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_FONT, subset);
    await fs.copyFile(LICENSE_SOURCE, path.join(OUT_DIR, 'LICENSE.txt'));
    out(
      `- 원본: \`${path.basename(SOURCE)}\` ${sourceBuffer.length.toLocaleString('en-US')}바이트, 글자 ${sourceCodes.size}`,
    );
    out(
      `- 서브셋: \`${path.relative(ROOT, OUT_FONT)}\` ${subset.length.toLocaleString('en-US')}바이트, 글자 ${included.length}(기본 범위 ${baseCodePoints().size} 중 원본에 있는 것 + 글 글자)`,
    );
    out(
      `- 글에 있지만 원본 글꼴에도 없는 글자 ${notInSource.length}개${notInSource.length ? `: ${notInSource.map(describe).join(', ')}` : ''}`,
    );
  }

  // 검사: 커밋한(또는 방금 만든) 서브셋이 지금 글의 글자를 모두 그리는지
  const subsetCodes = readCmapCodePoints(await fs.readFile(OUT_FONT));
  const missing = new Map(); // 코드 포인트 → 글 ID 목록
  for (const { id, text } of texts) {
    for (const char of ogText(String(text ?? ''))) {
      const code = char.codePointAt(0);
      if (code < 0x20 || subsetCodes.has(code)) continue;
      if (!missing.has(code)) missing.set(code, new Set());
      missing.get(code).add(id);
    }
  }
  const fixedMissing = [...fixedSet].filter((code) => !subsetCodes.has(code));
  out(`- 서브셋 글자 수: ${subsetCodes.size}`);
  out(`- 서브셋 밖 글자(글): ${missing.size}개`);
  for (const [code, ids] of missing) out(`  - ${describe(code)}: ${[...ids].join(', ')}`);
  out(
    `- 서브셋 밖 글자(고정 글자): ${fixedMissing.length}개${fixedMissing.length ? `: ${fixedMissing.map(describe).join(', ')}` : ''}`,
  );
  out();
  out(
    missing.size === 0 && fixedMissing.length === 0
      ? '결과: 모든 글자를 그릴 수 있다.'
      : '결과: 서브셋 밖 글자가 있다. OG 이미지에서 빈 칸으로 그려진다.',
  );

  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (REPORT_FILE) await fs.writeFile(REPORT_FILE, text, 'utf8');
  process.exitCode = fixedMissing.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
