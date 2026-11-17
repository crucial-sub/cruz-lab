// 서가 버킷 점검·CORS 설정 (문서 서가 1단계 Plan 10절 E1, L4)
//
// 실행: node --env-file=.env scripts/ops/library-bucket.mjs                  # 버킷 설정과 CORS를 보인다(읽기 전용)
//       node --env-file=.env scripts/ops/library-bucket.mjs --check-access   # 시험 파일 하나를 쓰고 읽고 지운다
//       node --env-file=.env scripts/ops/library-bucket.mjs --apply-cors     # 아래 CORS 값을 넣는다(사용자 확인 뒤에만)
//       node --env-file=.env scripts/ops/library-bucket.mjs --reset-cors     # CORS를 빈 배열로 되돌린다
//
// - 버킷 이름은 LIBRARY_BUCKET 환경 변수에서 읽는다.
// - 서가 버킷은 Firebase 규칙과 잇지 않는다. 서버(Admin SDK)와 단기 서명 주소로만 읽고 쓴다.
// - 브라우저(서가 화면)는 서명 주소로 버킷에 바로 PUT한다. 그래서 사전 요청(OPTIONS)에 맞는 CORS가 필요하다.
//   영상 읽기(302 → 서명 GET)는 <video>가 CORS 없이 부르므로 GET은 넣지 않는다.

import process from 'node:process';
import { initAdmin, parseArgs } from '../migrate/lib/admin.mjs';

// 서가 버킷 CORS: 서명 PUT, 블로그 출처와 개발 서버만
// - 4341·4342: 서가 작업 워크트리의 개발 서버 포트(4341을 다른 서버가 쓰면 4342에 뜬다)
// - 미리보기: feat/library-stage1 브랜치의 Vercel 미리보기 주소
export const LIBRARY_CORS = [
  {
    origin: [
      'http://localhost:4341',
      'http://localhost:4342',
      'https://cruz-lab-git-feat-library-stage1-crucialsubs-projects.vercel.app',
      'https://www.cruzlab.dev',
    ],
    method: ['PUT'],
    responseHeader: ['Content-Type'],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  const args = parseArgs();
  const name = process.env.LIBRARY_BUCKET?.trim();
  if (!name) throw new Error('.env에 LIBRARY_BUCKET이 없습니다.');
  const { bucket: blogBucket } = initAdmin();
  const bucket = blogBucket.storage.bucket(name);

  const [metadata] = await bucket.getMetadata();
  console.log(`버킷: ${name}`);
  console.log(`위치: ${metadata.location} (${metadata.locationType})`);
  console.log(`공개 액세스 방지: ${metadata.iamConfiguration?.publicAccessPrevention ?? '알 수 없음'}`);
  console.log(`균일한 버킷 수준 액세스: ${metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled ?? '알 수 없음'}`);
  console.log('지금 CORS:', JSON.stringify(metadata.cors ?? [], null, 2));

  if (args['check-access']) {
    // 쓰기 → 읽기 → 지우기. 이름은 서가 문서 id 꼴(소문자 16진수 20자)과 겹치지 않게 밑줄로 시작한다
    const file = bucket.file(`_access-check/${Date.now()}.txt`);
    await file.save('서가 버킷 접근 점검', { contentType: 'text/plain; charset=utf-8', resumable: false });
    const [content] = await file.download();
    await file.delete();
    console.log(`쓰기·읽기·지우기: 통과 (${content.toString('utf8')})`);
  }

  if (args['apply-cors']) {
    await bucket.setCorsConfiguration(LIBRARY_CORS);
    const [after] = await bucket.getMetadata();
    console.log('설정 뒤 CORS:', JSON.stringify(after.cors ?? [], null, 2));
  } else if (args['reset-cors']) {
    await bucket.setCorsConfiguration([]);
    const [after] = await bucket.getMetadata();
    console.log('되돌린 뒤 CORS:', JSON.stringify(after.cors ?? [], null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
