// Storage 버킷 CORS 보기·설정 (재건 3단계 Plan 10절 E2)
//
// 실행: node --env-file=.env scripts/ops/bucket-cors.mjs            # 지금 값만 보인다(읽기 전용)
//       node --env-file=.env scripts/ops/bucket-cors.mjs --apply    # Plan 10절의 값을 넣는다(사용자 확인 뒤에만)
//       node --env-file=.env scripts/ops/bucket-cors.mjs --reset    # 빈 배열로 되돌린다(Plan 9.3)
//
// - 브라우저가 서명 URL로 Storage에 직접 PUT하려면 사전 요청(OPTIONS)에 허용 origin·method·header가 필요하다(D11 5).
// - 공개 읽기(GET)는 지금도 *라서 영향이 없다(Plan 8.6).
// - 값을 바꾸기 전에 지금 값을 출력한다. 작업 문서 3절에 그대로 적는다.

import process from 'node:process';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

// Plan 10절 E2의 값 + http://localhost:4322
// - 4322는 사용자 결정(2026-11-09)으로 더했다. 4321을 다른 개발 서버가 쓰면 개발 서버가 4322에 뜬다.
export const STAGE3_CORS = [
  {
    origin: [
      'http://localhost:4321',
      'http://localhost:4322',
      'https://cruz-lab-git-rebuild-crucialsubs-projects.vercel.app',
      'https://www.cruzlab.dev',
    ],
    method: ['PUT'],
    responseHeader: ['Content-Type'],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  const args = parseArgs();
  const { bucket, bucketName } = initAdmin();
  const [metadata] = await bucket.getMetadata();
  const current = metadata.cors ?? [];
  console.log(`버킷: ${bucketName}`);
  console.log('지금 CORS:', JSON.stringify(current, null, 2));

  if (args.apply) {
    await bucket.setCorsConfiguration(STAGE3_CORS);
    const [after] = await bucket.getMetadata();
    console.log('설정 뒤 CORS:', JSON.stringify(after.cors ?? [], null, 2));
  } else if (args.reset) {
    await bucket.setCorsConfiguration([]);
    const [after] = await bucket.getMetadata();
    console.log('되돌린 뒤 CORS:', JSON.stringify(after.cors ?? [], null, 2));
  } else {
    console.log('변경 없음. --apply로 Plan 10절 값을 넣거나 --reset으로 비운다.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
