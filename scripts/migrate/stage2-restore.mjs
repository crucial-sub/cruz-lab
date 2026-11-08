// 재건 2단계 복원: B1 덤프의 새 컬렉션 문서를 그대로 다시 쓴다 (Plan 5.7, 11.2)
//
// 실행:
//   node --env-file=.env scripts/migrate/stage2-restore.mjs --from <덤프 폴더>                 # 시험 실행(기본)
//   node --env-file=.env scripts/migrate/stage2-restore.mjs --from <덤프 폴더> --apply
//   --collection entries --ids <id1,id2>   특정 컬렉션의 특정 문서만 되살린다
//
// 옛 posts·series는 덤프에 있어도 쓰지 않는다. Storage 파일은 되살리지 않는다(덤프에 없다).

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ChunkedBatch, NEW_COLLECTIONS, deserializeValue, initAdmin, parseArgs, readDumpCollection } from './lib/admin.mjs';

const args = parseArgs();
const APPLY = args.apply === true;
const FROM = typeof args.from === 'string' ? path.resolve(args.from) : null;
const ONLY_COLLECTION = typeof args.collection === 'string' ? args.collection : null;
const ONLY_IDS = typeof args.ids === 'string' ? new Set(args.ids.split(',').map((id) => id.trim()).filter(Boolean)) : null;

// 문서와 하위 컬렉션을 쓰기 목록에 더한다
async function queueDoc(batch, ref, dumped) {
  await batch.op('set', ref, deserializeValue(dumped.data));
  for (const [subName, docs] of Object.entries(dumped.subcollections ?? {})) {
    for (const [subId, subDumped] of Object.entries(docs)) {
      await queueDoc(batch, ref.collection(subName).doc(subId), subDumped);
    }
  }
}

async function main() {
  if (!FROM) throw new Error('--from <덤프 폴더>가 필요합니다.');
  if (ONLY_COLLECTION && !NEW_COLLECTIONS.includes(ONLY_COLLECTION)) {
    throw new Error(`되살릴 수 있는 컬렉션은 ${NEW_COLLECTIONS.join(', ')}뿐입니다.`);
  }
  await fs.access(path.join(FROM, 'manifest.json'));

  const { db } = initAdmin();
  const targets = ONLY_COLLECTION ? [ONLY_COLLECTION] : NEW_COLLECTIONS;
  console.log(`# 재건 2단계 복원 (${APPLY ? '실제 실행' : '시험 실행'})\n\n- 덤프: ${FROM}`);

  const batch = new ChunkedBatch(db);
  const plan = [];
  for (const name of targets) {
    let dumped;
    try {
      dumped = await readDumpCollection(FROM, name);
    } catch {
      console.log(`- ${name}: 덤프 파일 없음`);
      continue;
    }
    const ids = Object.keys(dumped).filter((id) => !ONLY_IDS || ONLY_IDS.has(id));
    plan.push({ name, ids, dumped });
    console.log(`- ${name}: 되살릴 문서 ${ids.length}개${ids.length <= 10 ? ` (${ids.join(', ')})` : ''}`);
  }

  if (!APPLY) {
    console.log('\n시험 실행이다. 아무것도 쓰지 않았다. 실제 실행은 `--apply`.');
    return;
  }

  for (const { name, ids, dumped } of plan) {
    for (const id of ids) await queueDoc(batch, db.collection(name).doc(id), dumped[id]);
  }
  await batch.flush();
  console.log(`\n- 쓴 문서 ${batch.total}개 (하위 컬렉션 포함)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
