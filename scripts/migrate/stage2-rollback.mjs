// 재건 2단계 되돌리기: 새 컬렉션과 Storage assets/ 경로만 지운다 (Plan 5.7, 11.2)
//
// 실행:
//   node --env-file=.env scripts/migrate/stage2-rollback.mjs           # 시험 실행(기본). 지울 대상의 수만 보인다
//   node --env-file=.env scripts/migrate/stage2-rollback.mjs --apply   # B1 덤프를 쓴 뒤 지운다
//
// 지우는 것: entries(하위 revisions 포함), seriesMeta, assets, publishLog, entryTombstones, Storage assets/
// 지우지 않는 것: 옛 posts·series, Storage images/·series-covers/

import process from 'node:process';
import { ASSET_PATH_PREFIX } from '../../src/lib/asset-refs.ts';
import { NEW_COLLECTIONS, assertWritableCollection, initAdmin, parseArgs, writeDump } from './lib/admin.mjs';

const args = parseArgs();
const APPLY = args.apply === true;

async function main() {
  const { db, bucket } = initAdmin();

  console.log(`# 재건 2단계 되돌리기 (${APPLY ? '실제 실행' : '시험 실행'})\n`);
  const counts = {};
  for (const name of NEW_COLLECTIONS) {
    counts[name] = (await db.collection(name).count().get()).data().count;
    console.log(`- ${name}: 문서 ${counts[name]}개`);
  }
  const [assetFiles] = await bucket.getFiles({ prefix: ASSET_PATH_PREFIX });
  console.log(`- Storage ${ASSET_PATH_PREFIX}: 파일 ${assetFiles.length}개`);

  if (!APPLY) {
    console.log('\n시험 실행이다. 아무것도 지우지 않았다. 실제 실행은 `--apply`.');
    return;
  }

  // B1 덤프 (실패하면 예외로 멈춘다)
  const dump = await writeDump(db, NEW_COLLECTIONS, 'stage2-rollback');
  console.log(`\n- B1 덤프: ${dump.dir}`);

  for (const name of NEW_COLLECTIONS) {
    assertWritableCollection(name);
    await db.recursiveDelete(db.collection(name));
    console.log(`- ${name} 삭제 완료`);
  }
  // Storage는 assets/ 접두사만 지운다. 옛 이미지 경로는 건드리지 않는다
  await bucket.deleteFiles({ prefix: ASSET_PATH_PREFIX, force: true });
  console.log(`- Storage ${ASSET_PATH_PREFIX} 삭제 완료`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
