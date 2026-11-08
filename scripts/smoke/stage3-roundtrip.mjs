// 재건 3단계 마크다운 왕복 검사 (Plan 8.2, D1)
//
// 실행: node --env-file=.env scripts/smoke/stage3-roundtrip.mjs [--report <경로>] [--out <폴더>] [--dump <posts.json>] [--verbose]
//
// - 기본: Admin SDK로 `entries`를 읽는다(읽기만 한다. 아무것도 쓰지 않는다). 글마다 draft.markdown을 검사한다.
// - --dump: B1 덤프의 posts.json(옛 `posts` 컬렉션의 `content`)을 대신 읽는다(오프라인 반복용. `.env`가 없어도 된다). 중복 글 1편(2단계 D3)은 뺀다.
// - --out: 실패한 글의 원문(<id>.orig.md)과 다시 쓴 마크다운(<id>.rewritten.md)을 그 폴더에 쓴다(디버깅용).
// - 판정: markdownToDoc → (스키마 검사) → docToMarkdown → normalizeForCompare(원문) === normalizeForCompare(결과).
//   경고 0건, 두 번 왕복 안정성(결과를 다시 넣어도 같은 마크다운)도 본다.
// - 보고서: 통과 수, 실패 글의 첫 차이 위치와 양쪽 조각, 표기 변화 수(글머리 `*`, 구분선 `***`, ZWSP), 수식으로 읽힌 `$` 수,
//   판단에 쓰는 집계(ZWSP만 있는 단락, ZWSP 옆 줄바꿈, 겹친 마크 순서 패턴, `<br`가 있는 표 행).
// - 하나라도 실패하면 종료 코드 1.

import fs from 'node:fs/promises';
import process from 'node:process';
import { getSchema } from '@tiptap/core';
import { createEditorExtensions } from '../../src/editor/extensions/index.ts';
import { docToMarkdown, markdownToDoc } from '../../src/editor/markdown/index.ts';
import { normalizeForCompare, parseMarkdown } from '../../src/lib/content/markdown.ts';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

const args = parseArgs();
const VERBOSE = Boolean(args.verbose);
// 2단계 마이그레이션이 뺀 중복 글
const DUPLICATE_LEGACY_IDS = new Set(['hah2lSGUxneSHRSDhm1r']);

const schema = getSchema(createEditorExtensions());

// ───────────── 입력 ─────────────

// B1 덤프(posts.json) → [{ id, title, markdown }]
async function loadFromDump(path) {
  const raw = JSON.parse(await fs.readFile(path, 'utf8'));
  return Object.entries(raw)
    .filter(([id]) => !DUPLICATE_LEGACY_IDS.has(id))
    .map(([id, doc]) => ({ id, title: doc.data?.title ?? '', markdown: doc.data?.content ?? '' }));
}

// Firestore entries → [{ id, title, markdown }] (읽기만)
async function loadFromEntries() {
  const { db } = initAdmin();
  const snapshot = await db.collection('entries').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.draft?.title ?? '',
      markdown: data.draft?.markdown ?? '',
      kind: data.kind,
      status: data.status,
    };
  });
}

// ───────────── 판정 ─────────────

// 첫 차이 위치와 양쪽 조각
function firstDifference(a, b, context = 80) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  const start = Math.max(0, index - context);
  return {
    index,
    expected: a.slice(start, index + context),
    actual: b.slice(start, index + context),
  };
}

// mdast에서 수식으로 읽힌 노드 수 (기존 글에 `$`가 있으면 에디터가 수식으로 볼 수 있다)
function countMathNodes(markdown) {
  let count = 0;
  const walk = (node) => {
    if (node.type === 'math' || node.type === 'inlineMath') count += 1;
    for (const child of node.children ?? []) walk(child);
  };
  walk(parseMarkdown(markdown));
  return count;
}

function countMatches(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

// 글 하나 검사
function checkEntry(entry) {
  const original = entry.markdown;
  const result = {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    status: entry.status,
    ok: true,
    reasons: [],
    warnings: [],
    bytesBefore: Buffer.byteLength(original),
    bytesAfter: 0,
    starBullets: countMatches(original, /^\s*\*\s+/gm),
    starRules: countMatches(original, /^\s*\*\*\*\s*$/gm),
    zwsp: original.split('\u200b').length - 1,
    mathNodes: countMathNodes(original),
    // 판단용 집계 (리뷰 6.1): ZWSP만 있는 단락, ZWSP 옆 줄바꿈, 겹친 마크 순서 패턴, <br가 있는 표 행
    zwspOnlyParagraphs: countMatches(
      original,
      new RegExp('(^|\\n\\n)[\u200b \\t]+(?=\\n\\n|$)', 'g'),
    ),
    zwspSoftBreaks: countMatches(original, new RegExp('\u200b\\n|\\n\u200b', 'g')),
    nestedMarkPatterns: countMatches(original, /\*\*\[|\*\*_|~~\*\*|_\*\*|\[\*\*/g),
    tableRowsWithBreak: countMatches(original, /^\|.*<br.*\|\s*$/gim),
  };

  let doc;
  try {
    const converted = markdownToDoc(original);
    doc = converted.doc;
    result.warnings = converted.warnings;
    if (converted.warnings.length > 0) {
      result.ok = false;
      result.reasons.push(
        `경고 ${converted.warnings.length}건: ${converted.warnings.map((w) => `${w.code} ${JSON.stringify(w.detail)}`).join('; ')}`,
      );
    }
  } catch (error) {
    result.ok = false;
    result.reasons.push(`markdownToDoc 오류: ${error.message}`);
    return result;
  }

  try {
    schema.nodeFromJSON(doc).check();
  } catch (error) {
    result.ok = false;
    result.reasons.push(`스키마 검사 실패: ${error.message}`);
  }

  let rewritten;
  try {
    rewritten = docToMarkdown(doc);
  } catch (error) {
    result.ok = false;
    result.reasons.push(`docToMarkdown 오류: ${error.message}`);
    return result;
  }
  result.bytesAfter = Buffer.byteLength(rewritten);
  result.rewritten = rewritten;

  const expected = normalizeForCompare(original);
  const actual = normalizeForCompare(rewritten);
  if (expected !== actual) {
    result.ok = false;
    result.diff = firstDifference(expected, actual);
    result.reasons.push(`렌더 결과가 다르다 (첫 차이 위치 ${result.diff.index})`);
  }

  const twice = docToMarkdown(markdownToDoc(rewritten).doc);
  if (twice !== rewritten) {
    result.ok = false;
    result.stabilityDiff = firstDifference(rewritten, twice);
    result.reasons.push(`두 번째 왕복이 다르다 (첫 차이 위치 ${result.stabilityDiff.index})`);
  }

  return result;
}

// ───────────── 보고서 ─────────────

function buildReport(results, source) {
  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const sum = (key) => results.reduce((total, r) => total + (r[key] ?? 0), 0);
  const lines = [];
  lines.push(`# 3단계 왕복 검사 보고서`);
  lines.push('');
  lines.push(`- 시각: ${new Date().toISOString()}`);
  lines.push(`- 입력: ${source}`);
  lines.push(`- 결과: **${passed.length}/${results.length} 통과**`);
  lines.push(`- 경고: ${results.reduce((n, r) => n + r.warnings.length, 0)}건`);
  lines.push(
    `- 표기 변화: 글머리 \`*\` ${sum('starBullets')}개 → \`-\`, 구분선 \`***\` ${sum('starRules')}개 → \`---\`, ZWSP ${sum('zwsp')}개 삭제`,
  );
  lines.push(`- 수식으로 읽힌 \`$\` 노드: ${sum('mathNodes')}개 (0이어야 기존 글이 그대로 보인다)`);
  lines.push(
    `- 본문 크기: ${sum('bytesBefore').toLocaleString()} → ${sum('bytesAfter').toLocaleString()} 바이트`,
  );
  lines.push(
    `- 판단용 집계: ZWSP만 있는 단락 ${sum('zwspOnlyParagraphs')}, ZWSP 옆 줄바꿈 ${sum('zwspSoftBreaks')}, 겹친 마크 순서 패턴(\`**[\` \`**_\` \`~~**\` 등) ${sum('nestedMarkPatterns')}, \`<br\`가 있는 표 행 ${sum('tableRowsWithBreak')}`,
  );
  lines.push('');
  if (failed.length > 0) {
    lines.push(`## 실패 ${failed.length}편`);
    lines.push('');
    for (const r of failed) {
      lines.push(`### ${r.id} — ${r.title}`);
      for (const reason of r.reasons) lines.push(`- ${reason}`);
      if (r.diff) {
        lines.push('');
        lines.push('원문 렌더:');
        lines.push('```');
        lines.push(r.diff.expected);
        lines.push('```');
        lines.push('다시 쓴 렌더:');
        lines.push('```');
        lines.push(r.diff.actual);
        lines.push('```');
      }
      if (r.stabilityDiff) {
        lines.push('');
        lines.push('1회차 마크다운:');
        lines.push('```');
        lines.push(r.stabilityDiff.expected);
        lines.push('```');
        lines.push('2회차 마크다운:');
        lines.push('```');
        lines.push(r.stabilityDiff.actual);
        lines.push('```');
      }
      lines.push('');
    }
  }
  const withMath = results.filter((r) => r.mathNodes > 0);
  if (withMath.length > 0) {
    lines.push(`## \`$\`가 수식으로 읽힌 글 ${withMath.length}편`);
    lines.push('');
    for (const r of withMath) lines.push(`- ${r.id} — ${r.title}: ${r.mathNodes}개`);
    lines.push('');
  }
  lines.push(`## 글별 결과`);
  lines.push('');
  lines.push('| id | 제목 | kind | status | 결과 | `*` 글머리 | `***` | ZWSP | 바이트 전 → 후 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    lines.push(
      `| ${r.id} | ${r.title.replace(/\|/g, '\\|')} | ${r.kind ?? '-'} | ${r.status ?? '-'} | ${r.ok ? '통과' : '실패'} | ${r.starBullets} | ${r.starRules} | ${r.zwsp} | ${r.bytesBefore} → ${r.bytesAfter} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

// ───────────── 실행 ─────────────

async function main() {
  const source =
    typeof args.dump === 'string' ? `B1 덤프 ${args.dump}` : 'Firestore entries (읽기 전용)';
  const entries =
    typeof args.dump === 'string' ? await loadFromDump(args.dump) : await loadFromEntries();
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const results = entries.map(checkEntry);
  const report = buildReport(results, source);
  if (typeof args.report === 'string') {
    await fs.writeFile(args.report, report, 'utf8');
    console.log(`보고서: ${args.report}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (typeof args.out === 'string' && failed.length > 0) {
    await fs.mkdir(args.out, { recursive: true });
    for (const r of failed) {
      const entry = entries.find((item) => item.id === r.id);
      await fs.writeFile(`${args.out}/${r.id}.orig.md`, entry?.markdown ?? '', 'utf8');
      await fs.writeFile(`${args.out}/${r.id}.rewritten.md`, r.rewritten ?? '', 'utf8');
    }
    console.log(`실패 글 마크다운: ${args.out}`);
  }
  console.log(`왕복 검사: ${results.length - failed.length}/${results.length} 통과`);
  for (const r of failed) {
    console.log(`- 실패 ${r.id} (${r.title}): ${r.reasons.join(' / ')}`);
    if (VERBOSE && r.diff) {
      console.log(`  원문 렌더: ${JSON.stringify(r.diff.expected)}`);
      console.log(`  다시 쓴 렌더: ${JSON.stringify(r.diff.actual)}`);
    }
    if (VERBOSE && r.stabilityDiff) {
      console.log(`  1회차: ${JSON.stringify(r.stabilityDiff.expected)}`);
      console.log(`  2회차: ${JSON.stringify(r.stabilityDiff.actual)}`);
    }
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
