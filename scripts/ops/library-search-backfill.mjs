// 서가 검색 색인 채우기 (문서 서가 2단계 Plan J28, 외부 변경 E2)
//
// 실행: node --env-file=.env scripts/ops/library-search-backfill.mjs           # 무엇을 쓸지 보인다(읽기 전용)
//       node --env-file=.env scripts/ops/library-search-backfill.mjs --apply   # library_search에 쓴다(사용자 확인 뒤에만)
//
// - 이미 올린 문서(색인이 생기기 전에 올린 문서)의 색인을 만든다. 새로 올리는 문서는 올리기 마무리가 색인을 쓴다.
// - 문서마다 지금 판의 진입 파일(index.md / index.html) 앞 5 MB를 읽어 검색 글자를 뽑는다(src/library/search.ts).
// - 쓰는 곳은 library_search 하나다. 문서 기록·판 기록·버킷 파일은 읽기만 한다. 여러 번 돌려도 결과가 같다.
// - 버킷 이름은 LIBRARY_BUCKET 환경 변수에서 읽는다.

import process from 'node:process';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';
import { SEARCH_ENTRY_READ_BYTES, searchTextOf } from '../../src/library/search.ts';

const DOCS_COLLECTION = 'library_docs';
const SEARCH_COLLECTION = 'library_search';
const FORMATS = ['md', 'html'];

// 진입 파일 앞 5 MB를 글자로 읽는다
async function readEntryHead(bucket, docId, state) {
  const end = Math.min(state.bytes, SEARCH_ENTRY_READ_BYTES) - 1;
  if (end < 0) return '';
  const [buffer] = await bucket.file(`${docId}/${state.rev}/${state.entry}`).download({ start: 0, end });
  return buffer.toString('utf8');
}

const kb = (text) => `${(new TextEncoder().encode(text).length / 1024).toFixed(1)} KB`;

async function main() {
  const args = parseArgs();
  const bucketName = process.env.LIBRARY_BUCKET?.trim();
  if (!bucketName) throw new Error('.env에 LIBRARY_BUCKET이 없습니다.');
  const { db, bucket: blogBucket } = initAdmin();
  const bucket = blogBucket.storage.bucket(bucketName);

  const [docs, existing] = await Promise.all([
    db.collection(DOCS_COLLECTION).get(),
    db.collection(SEARCH_COLLECTION).get(),
  ]);
  const indexed = new Set(existing.docs.map((docSnap) => docSnap.id));
  console.log(`버킷: ${bucketName}`);
  console.log(`서가 문서 ${docs.size}개, 지금 색인 ${existing.size}개`);
  console.log(args.apply ? '모드: 쓰기(--apply)' : '모드: 읽기 전용(쓰려면 --apply)');

  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (const docSnap of docs.docs) {
    const doc = docSnap.data();
    const formats = FORMATS.filter((format) => doc.formats?.[format]);
    // 올리다 만 문서(올린 형식 없음)는 목록에도 없다
    if (formats.length === 0) {
      skipped += 1;
      continue;
    }
    try {
      const entry = { title: doc.title, project: doc.project, updatedAt: new Date() };
      for (const format of formats) {
        entry[format] = searchTextOf(format, await readEntryHead(bucket, docSnap.id, doc.formats[format]));
      }
      const sizes = formats.map((format) => `${format} ${kb(entry[format])}`).join(', ');
      console.log(`${indexed.has(docSnap.id) ? '바꿈' : '새로'} ${docSnap.id} [${doc.project}] ${doc.title} — ${sizes}`);
      if (args.apply) await db.collection(SEARCH_COLLECTION).doc(docSnap.id).set(entry, { merge: true });
      written += 1;
    } catch (error) {
      failed += 1;
      console.error(`실패 ${docSnap.id} ${doc.title}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n${args.apply ? '썼음' : '쓸 것'} ${written}개, 건너뜀(올린 형식 없음) ${skipped}개, 실패 ${failed}개`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
