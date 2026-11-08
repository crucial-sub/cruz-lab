# 재건 2단계: 데이터 모델과 서버 (작업 문서)

- 날짜: 2026-11-08
- Plan: [2026-11-07-stage2-data-model-and-server-plan.md](./2026-11-07-stage2-data-model-and-server-plan.md) (2026-11-08 승인)
- 기준: `rebuild` `04e2425`
- 브랜치·PR:
  - PR-A `stage2/a-data-model` → [PR #4](https://github.com/crucial-sub/cruz-lab/pull/4). `rebuild`에 병합됨(2026-11-08 18:53 KST, 병합 커밋 `bf55696`). 병합 전에 주석 태그 `rebuild-pre-stage2`(대상 `04e2425`)를 달았다.
  - PR-B `stage2/b-api` → [PR #5](https://github.com/crucial-sub/cruz-lab/pull/5). `rebuild`에 병합됨(2026-11-08 19:47 KST, 병합 커밋 `e232b94`).
  - PR-C `stage2/c-backup` → [PR #6](https://github.com/crucial-sub/cruz-lab/pull/6). PR-B 위에 쌓았고, PR-B 병합 뒤 대상을 `rebuild`로 바꿨다. `rebuild`에 병합됨(2026-11-08 19:57 KST, 병합 커밋 `814e7b3`).
- 상태: **2단계 완료(2026-11-08).** T1~T6, T8, T9를 구현·검증하고 PR 3개를 모두 `rebuild`에 병합했다. 사용자 설정(E3, E4, E5) 뒤 미리보기 관리자 로그인, 발행 퍼지, 백업 알림을 확인했다(4절). 다음은 3단계 에디터 Plan이다(7절).

## 1. 현재 상황

1. 새 컬렉션 `entries`, `seriesMeta`, `assets`가 운영 Firestore에 있다. 옛 `posts`·`series`는 그대로다.
2. `rebuild`의 공개 페이지는 `entries`를 읽는다. 운영(main)은 옛 `posts`를 계속 읽는다. 운영 사이트는 바뀌지 않았다.
3. `rebuild`에는 세션 인증, 글 API, 자산 API, 백업 알림이 있다. 옛 출간 경로는 지웠다.
4. 옛 관리자 화면은 로그인과 미들웨어만 새 방식으로 동작한다. 목록·저장·출간은 실패한다(D10).
5. 백업 저장소 `crucial-sub/cruz-lab-content`(비공개)의 Action이 동작한다. 매일 03:00 KST, 수동 실행, 발행·삭제 알림 때 돈다. 첫 백업 커밋은 `9f87c37`이다.
6. `rebuild` 미리보기에서 관리자 Google 로그인과 API 쓰기가 된다. 발행·삭제 응답은 `purge: ok`, `backup: dispatched`다.

## 2. 한 일

### 2.1 T1: 분류 상수, 스키마, vitest, 변환 함수

| 파일 | 내용 |
|---|---|
| `src/lib/taxonomy.ts` | 카테고리 10개(Plan 4.3), 태그 정규화(D2 규칙 1~6), 별칭, slug·연재 key 형식, 노트 slug |
| `src/lib/entry-schema.ts` | `entries`·`assets`·`seriesMeta` zod 스키마(Plan 4절). 상태와 발행본의 관계를 검사한다 |
| `src/lib/asset-refs.ts` | 본문·표지에서 Storage 경로 추출. legacy 자산 ID(`legacy-` + 경로 SHA-1 앞 20자) |
| `src/lib/migrate/legacy-to-entry.ts` | 옛 글 → `entries` 문서(순수 함수). 연재 배정(A13의 두 형식), 재동기화 판정(5.4 표) |
| `src/lib/slug-lookup.ts` | 공개 slug 조회 판정(현재 slug, slugHistory 301). 리뷰 반영으로 분리했다 |
| `vitest.config.ts`, `tests/unit/` | `pnpm test`. 테스트 53개 |

공유 모듈은 상대 경로에 `.ts`를 붙인다. Node 24가 타입을 지우고 바로 실행하므로 마이그레이션 스크립트가 새 도구 없이 이 파일을 가져온다.

### 2.2 T2: 마이그레이션

| 파일 | 내용 |
|---|---|
| `scripts/migrate/stage2-mapping.json` | 접두사 → 카테고리, 글별 예외 2건, 연재 3개, 제외 1건(부록 A 그대로) |
| `scripts/migrate/stage2-entries.mjs` | 시험 실행(기본), `--apply`, `--propagate-deletes`, `--report <파일>` |
| `scripts/migrate/stage2-rollback.mjs` | 새 컬렉션과 Storage `assets/`만 지운다. 시험 실행이 기본 |
| `scripts/migrate/stage2-restore.mjs` | B1 덤프에서 새 컬렉션을 되살린다. 범위(`--ids` 또는 `--all`)가 필요하다. 기본은 지금 없는 문서만 쓴다. `--overwrite`일 때만 덮는다. 실제 실행은 쓰기 전에 B1 덤프를 남긴다 |
| `scripts/migrate/lib/admin.mjs` | Admin 초기화, 쓰기 대상 고정, 덤프 직렬화(Timestamp 손실 없음), 400개 묶음 쓰기 |

실행 방법(저장소 루트):

```bash
node --env-file=.env scripts/migrate/stage2-entries.mjs
```

```bash
node --env-file=.env scripts/migrate/stage2-entries.mjs --apply
```

### 2.3 T6: 공개 데이터 경로, 시리즈 제거, 리다이렉트, 캐시 태그, 리전

1. `src/lib/server/entries.ts`가 `entries`를 읽는다. 목록은 `select()`로 본문을 빼고 읽는다. 컬렉션 이름은 이 파일에만 있다.
2. `content-posts.ts`는 `kind == 'post'`인 발행 글만 준다. 노트는 공개 페이지에 나오지 않는다(D4).
3. 글 상세는 `slugHistory`에 있는 옛 slug를 301로 보낸다.
4. 시리즈 컬렉션 코드 11개 파일, 1,820줄을 지웠다(Plan 7.1과 같은 수). `/series/*`는 `entries`와 `seriesMeta`로 다시 만들었다. 커버와 진행률 표시는 없다.
5. 홈의 Featured Series 구역을 뺐다. 카드 커버의 큰 글자는 카테고리 표시 이름이다.
6. `src/middleware.ts`와 `src/lib/redirects.ts`가 Plan 7.4의 연재·태그 주소를 301로 보낸다. 공개 요청에서 쿠키를 읽거나 쓰지 않는다.
7. 카테고리와 같은 뜻이라 빠진 태그(`/blog/tag/javascript`, `/blog/tag/운영체제`)는 그 카테고리의 글을 보인다.
8. 공개 응답에 `Vercel-Cache-Tag`를 붙인다. 목록성 페이지는 `posts`, 글 상세는 `posts,post-<id>`.
9. `vercel.json`에 `"regions": ["icn1"]`을 두었다. 적용 여부는 미리보기의 `x-vercel-id`로 확인한다(T10).

### 2.4 T3: 세션 인증 (PR-B)

| 파일 | 내용 |
|---|---|
| `src/lib/admin-guard.ts` | 순수 판정 함수. 요청 종류(공개, 로그인 페이지, 세션 발급, 관리자 페이지, 관리자 API), Origin 비교, `next` 검사, 로그인 5분 이내, 관리자 판정 |
| `src/middleware.ts` | 관리자 경로에서 세션 쿠키를 검증한다(`checkRevoked`). 페이지는 302, API는 401. 관리자 API 쓰기는 Origin이 다르면 403. 공개 요청은 쿠키를 보지 않는다 |
| `src/lib/server/admin-session.ts` | `ADMIN_UID` + `email_verified`. 쿠키 `cruz_admin`(HttpOnly, https면 Secure, SameSite=Lax, 14일) |
| `src/pages/api/admin/session.ts` | POST(발급), GET(정보), DELETE(삭제, `?all=1`이면 토큰 폐기) |
| `src/pages/admin/login.astro`, `AdminLogin.tsx` | Google 팝업 → ID 토큰 → 세션 발급 → `next`로 이동 |
| `src/lib/server/api-response.ts` | 오류 형식, `no-store`, zod 본문 검사 |

관리자 페이지 4개는 모두 SSR이다. `AdminGuard`는 자식을 그대로 그린다. 로그아웃은 세션 쿠키를 지우고 로그인 페이지로 간다.

### 2.5 T4: 글 API (PR-B)

| 파일 | 내용 |
|---|---|
| `src/lib/entry-rules.ts` | 순수 규칙. 초안 입력 검사·태그 정규화·900 KB, 발행 검사(kind별), 발행본 만들기, slugHistory, 숨김 전이 |
| `src/lib/server/admin-entries.ts` | Firestore 처리. 상태를 바꾸는 쓰기는 트랜잭션이고, 쓰기 전에 결과 문서를 `entryDocSchema`로 검사한다 |
| `src/lib/server/asset-usage.ts` | 저장·발행·삭제 뒤 `assets.usedBy`, `orphanedAt`을 맞춘다 |
| `src/lib/server/cdn-purge.ts` | 메모리 캐시 + `invalidateByTag(['posts', 'post-<id>'])`. Vercel 밖에서는 `skipped` |
| `src/pages/api/admin/posts/**` | Plan 6.3의 8개 경로 |

`@vercel/functions` 3.10.2를 직접 의존성으로 더했다. 2.2.13(전이 의존성)에는 `invalidateByTag`가 없다. Vercel 문서(cdn-cache/purge, functions 패키지 레퍼런스)로 이름과 인자를 확인했다. 로컬에서는 함수 컨텍스트가 없어 아무것도 하지 않는다(패키지 코드 확인).

### 2.6 T5: 자산 API (PR-B)

| 파일 | 내용 |
|---|---|
| `src/lib/asset-rules.ts` | 순수 규칙. 받는 형식, 크기 한도, 경로, 변형 계획, 영상 첫 바이트 확인, 정리 후보 판정 |
| `src/lib/server/admin-assets.ts` | 업로드 주소(V4 서명 PUT, 15분), finalize(sharp 변형, 원본 삭제), purge(지우기 직전 재검사) |
| `src/pages/api/admin/assets/**` | Plan 6.4의 3개 경로 |
| `scripts/smoke/stage2-api.mjs` | Plan 10.3 전체 순서. `--read-only`는 세션·인증 검사만 한다 |

변형 파일 이름은 `assets/{id}/w<폭>.webp`다. 최대 변형도 같은 규칙이다. 그래서 4단계 렌더러가 주소에서 `srcset`을 만들 수 있다.

### 2.7 T9: 옛 출간 경로 삭제 (PR-C)

1. API 6개를 지웠다: `publish-post`, `delete-post`, `content-posts`, `publish-status`, `publish-verify`, `posts/by-slug`. `/api/admin/series`, `/api/series-preview`는 PR-A가 지웠다.
2. lib를 지웠다: `admin-auth.ts`, `github-posts.ts`, `firestore-posts.ts`, `site-url.ts`.
3. 스크립트 `publish-preflight.mjs`, `publish-verify.mjs`와 `PUBLISH-SMOKE-TEST.md`를 지웠다. `PUBLISHING.md`와 README의 출간 흐름을 새 API 기준으로 다시 썼다.
4. 옛 화면이 가져오는 lib 4개는 남겼다(D10). `tsc` 오류는 9개 그대로다.

### 2.8 T8: 백업 (PR-C)

1. `src/lib/server/backup-dispatch.ts`: 발행·삭제 뒤 `repository_dispatch`(`content-changed`)를 보낸다. 토큰이 없으면 `skipped`, 2초 안에 204가 아니면 `failed`다. 발행은 항상 성공이다.
2. 백업 저장소 `crucial-sub/cruz-lab-content`의 파일(내보내기 스크립트, 워크플로, README)은 그 저장소에 둔다(Plan D7).
3. 내보내기 스크립트를 운영 데이터로 시험 실행했다(읽기만). 파일 356개(발행본 54, 초안 1, raw, 자산 목록). 두 번 실행한 결과가 같다(바뀐 것이 없으면 커밋하지 않는다).

## 3. 외부 변경

| # | 변경 | 시각 | 되돌리기 |
|---|---|---|---|
| E1 | Firestore 예약 백업(일간, 보존 7일, 스케줄 `a8ffad4f-7bc8-4e2e-a7d1-eb3939568aef`)과 삭제 보호 켜기 | 2026-11-08 15:24 KST | `firebase firestore:backups:schedules:delete`, `firebase firestore:databases:update "(default)" --delete-protection DISABLED` |
| E7 | 마이그레이션 실제 실행. B1 덤프 `~/projects/cruz-lab-backups/20261108-152505-stage2-migrate/` | 2026-11-08 15:25 KST | `stage2-rollback.mjs --apply` |

E7이 쓴 문서는 242개다. `entries` 55, `entries/*/revisions` 54, `seriesMeta` 3, `assets` 130.

PR-B·PR-C에서 한 외부 변경:

| # | 변경 | 시각 | 되돌리기 |
|---|---|---|---|
| E5 일부 | 비공개 저장소 `crucial-sub/cruz-lab-content` 생성, 파일 푸시, 저장소 변수 `FIREBASE_STORAGE_BUCKET` | 2026-11-08 19:36 KST | `gh repo archive` 또는 저장소 삭제 |
| 시험 데이터 | API 스모크 테스트 3회(사용자 승인). 시험 글·자산을 만들고 모두 지웠다 | 2026-11-08 19:09~19:38 KST | 남은 데이터 0을 확인했다 |

사용자가 한 외부 변경(2026-11-08 20:20~20:50 KST 사이, 웹 콘솔):

| # | 변경 | 되돌리기 |
|---|---|---|
| E5 나머지 | dispatch용 fine-grained PAT(`crucial-sub/cruz-lab-content`만, Contents 읽기·쓰기) | GitHub에서 PAT 삭제 |
| E4 | Vercel Preview 환경 변수 `ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`(Type Secret, Preview만, 브랜치 지정 없음). 그 뒤 `rebuild` 미리보기를 Redeploy했다 | Vercel에서 변수 삭제 뒤 다시 배포 |
| E5 나머지 | GCP 서비스 계정 `cruz-lab-backup@cruz-lab.iam.gserviceaccount.com`(역할 `roles/datastore.viewer`, `roles/storage.objectViewer`)과 JSON 키 → 백업 저장소 비밀값 `FIREBASE_SERVICE_ACCOUNT`(20:40 KST). 내려받은 키 파일은 지웠다 | 키 삭제, 계정 삭제, `gh secret delete` |
| E3 | Firebase Auth 승인 도메인에 `cruz-lab-git-rebuild-crucialsubs-projects.vercel.app` 추가 | 도메인 삭제 |

콘솔 이름 주의: 역할 선택기에서 `roles/storage.objectViewer`는 "저장소 개체 뷰어"로 번역돼 있다. 이름이 비슷한 "환경 및 스토리지 객체 뷰어"는 Composer 역할이다. Vercel의 옛 "Sensitive" 표시는 지금 Type "Secret"이다.

설정 뒤 확인에서 한 외부 변경(사용자 승인):

| # | 변경 | 시각 | 되돌리기 |
|---|---|---|---|
| 백업 실행 | 백업 Action 수동 실행 2회. 첫 실행이 커밋 `9f87c37`(파일 356개)을 만들었다. 두 번째는 커밋 없음 | 2026-11-08 20:51~20:53 KST | 백업 저장소의 커밋 되돌리기 |
| 시험 데이터 (미리보기) | 시험 글 `zgLYmKDGDGumHx0vUcdD`(slug `stage2-preview-check-20261108115839`, 이미지 없음) 생성·발행·API 삭제. 백업 저장소에 발행 커밋 `ed9238b`와 삭제 커밋 `4f646ca`가 생겼다. 삭제 API가 남기는 `publishLog` 2건은 Admin SDK로 지웠다(문서 ID와 `entryId`를 확인한 뒤) | 2026-11-08 20:58~21:05 KST | 남은 데이터 0을 확인했다(`entries`·`publishLog`·`entryTombstones`). 백업 저장소의 `raw/publishLog/34bpIrren83ykdpTyVX2.json`은 다음 예약 실행이 지운다 |

남은 외부 변경:

| # | 변경 |
|---|---|
| E2 | Storage 버킷 CORS. 3단계 에디터 업로드 전에 한다 |
| E6 | Secret Manager `GITHUB_TOKEN` 삭제(언제든) |
| 병합 뒤 | Vercel 환경 변수 `GITHUB_TOKEN` 삭제. `rebuild` 코드는 쓰지 않는다. 운영(main)의 `src/lib/server/github-posts.ts`가 아직 쓰므로 main 병합 뒤에 지운다 |

## 4. 검증 결과

| 항목 | 결과 |
|---|---|
| `pnpm test` | 53/53 통과 |
| `pnpm lint` | 통과 |
| `pnpm build` | 통과 |
| `tsc --noEmit` (`astro sync` 뒤) | 25 → 9. 시리즈 관련 13개와 `BlogPostList`의 `seriesId` 1개 등이 사라졌다. 남은 9개는 옛 관리자 화면(`PostList` 3, `editor-drafts` 4)과 `TextReveal` 1, `markdown-publish` 1이다 |
| 시험 실행 | 생성 55(발행 54, 초안 1), 제외 1, 충돌 0, 경고 0 |
| 실제 실행 | 스키마 검증 실패 0. 옛 글 56 − 제외 1 = `legacy` 표지가 있는 `entries` 55. 옛 `posts` 해시가 실행 전후로 같다 |
| 재실행 | 55편 모두 건너뜀. `seriesMeta`·`assets` 쓰기 0 |
| 공개 페이지(localhost, `scripts/smoke/stage2-public.mjs`) | 322건 통과. 발행 54편 200·제목 일치, 초안 404, `/blog` 54편, 리다이렉트 8개 301·목적지 200, 연재 21·5·2편 순서 일치, RSS·사이트맵 XML, `Set-Cookie` 없음, `Vercel-Cache-Tag` 있음 |
| 운영 무영향 | `https://www.cruzlab.dev/blog` 200(55장 그대로), 글 2편 제목 그대로, `firebase functions:list` 비어 있음 |

PR-B·PR-C 검증(2026-11-08):

| 항목 | 결과 |
|---|---|
| `pnpm test` | 112/112 통과(PR-A 53 + 59) |
| `pnpm lint`, `pnpm build` | 통과 |
| `tsc --noEmit` | 9개 그대로(새 오류 0). T9 삭제 뒤에도 9개다 |
| 10.3 API 스모크(`scripts/smoke/stage2-api.mjs`, localhost) | 104건 통과. 세션·쿠키 속성, 쿠키 없음 401, 다른 Origin 403, 인코딩 경로 401·302·403, 초안 409·422, 이미지 업로드·변형 3종·EXIF 제거·원본 삭제, 발행·공개 200·숨김 404·다시 보임·slug 변경 301, 초안 버리기, 중복 slug 422, note(공개 페이지 없음, 다시 발행해도 slug 유지), 삭제·고아 표시·정리. 끝난 뒤 남은 데이터 0 |
| 10.4 공개 페이지(`scripts/smoke/stage2-public.mjs`) | 322건 통과(미들웨어 변경과 T9 뒤 재실행) |
| 10.5 관리자 로그인(localhost) | 쿠키 없이 `/admin` → 302. 사용자가 Google 로그인 → 세션 발급 204, `/admin` 200. 로그아웃 → DELETE 204 → 다시 `/admin` 302. 쿠키 속성은 스모크가 확인했다(HttpOnly, SameSite=Lax, Path=/, 14일. http라 Secure 없음은 설계대로) |
| 10.6 미리보기(PR-B 배포 `cruz-mfrjvwcpm-…vercel.app`) | `x-vercel-id`가 `icn1::icn1::…`(함수가 서울에서 돈다). `/blog`·홈·글·연재·RSS 200, `Set-Cookie` 없음, `x-vercel-cache: HIT`. 관리자 경로는 `ADMIN_UID`가 없어 503. 미리보기 관리자 로그인과 발행 직후 퍼지 확인은 E3·E4 뒤에 한다 |
| 백업 내보내기(읽기만) | 파일 356개. 두 번 실행한 결과가 같다 |

설정 뒤 확인(2026-11-08, `rebuild` `814e7b3` 미리보기):

| 항목 | 결과 |
|---|---|
| E4 적용 | Redeploy 뒤 `GET /api/admin/session`이 503에서 401 `UNAUTHENTICATED`로 바뀌었다. 쿠키 없이 `/admin`은 리다이렉트된다 |
| 백업 Action 수동 실행 1 | [run 42477603381](https://github.com/crucial-sub/cruz-lab-content/actions/runs/42477603381) 성공. 커밋 `9f87c37`. `published/` 54, `drafts/` 1, `raw/` 300(`entries` 55, revisions 54, `seriesMeta` 3, `assets` 130, `posts` 56, `series` 2), `assets/index.json` 1. 합계 356개로 로컬 시험 실행과 같다 |
| 백업 Action 수동 실행 2 | [run 42477678177](https://github.com/crucial-sub/cruz-lab-content/actions/runs/42477678177) 성공. "바뀐 것이 없다". 커밋 없음 |
| 관리자 로그인 | 사용자가 브라우저 패널에서 Google 로그인. 세션 발급 204, `/admin` 대시보드로 이동. `GET /api/admin/session` 200(`no-store`) |
| 쿠키 속성 | HttpOnly: `document.cookie`에 `cruz_admin`이 없는데 세션 요청은 200이다. Secure: 브라우저 JS는 `Set-Cookie`를 읽을 수 없어 간접으로 확인했다. 코드는 `requestUrl.protocol === 'https:'`일 때 Secure를 붙인다. 서버가 본 요청 주소가 https다(같은 주소로 하는 Origin 검사가 세션 발급을 통과했고, 발행 응답의 `publicUrl`이 `https://`다). SameSite=Lax·Path=/·14일은 코드 값이고 localhost 스모크가 헤더로 확인했다 |
| 시험 글 발행 | 생성 201 → 초안 저장 200(v2) → 발행 200 `{revision: 1, purge: "ok", backup: "dispatched", assetUsage: "ok"}`. 글 주소 첫 요청 200(MISS, 제목 일치) |
| 발행 뒤 `/blog` | 발행 1.9초 뒤 첫 요청은 `STALE`(옛 목록)이다. 그다음 요청부터 `HIT`(age 12)이고 시험 글이 있다. `invalidateByTag`는 캐시를 지우지 않고 오래됨으로 표시한다. 첫 요청이 옛 응답을 받으면서 새로 만들기를 시작한다(8절 4) |
| 발행 백업 알림 | `repository_dispatch` run 42478083098 성공. 커밋 `ed9238b` "(publish zgLYmKDGDGumHx0vUcdD)". 발행본 md, `raw/entries` 2개, `raw/publishLog` 1개 추가 |
| 시험 글 삭제 | `DELETE` 200 `{deleted: true, orphanedAssets: 0, purge: "ok", backup: "dispatched"}`. 관리자 한 편 읽기 404. `/blog`는 첫 요청 `STALE`, 다음 요청부터 시험 글이 없다. 글 주소는 첫 요청 `STALE` 200, 다음부터 404 |
| 삭제 백업 알림 | run 42478162197 성공. 커밋 `4f646ca` "(delete zgLYmKDGDGumHx0vUcdD)". 발행본 md, `raw/entries` 2개 삭제, `raw/publishLog` 1개 추가 |
| 로그아웃 | `DELETE /api/admin/session` 204 → 세션 401. `/admin`으로 이동하면 리다이렉트 1회로 `/admin/login?next=%2Fadmin`에 간다(미들웨어 코드는 302) |
| 시험 데이터 정리 | `publishLog` 2건을 지운 뒤 시험 글의 `entries`·`publishLog`·`entryTombstones`가 모두 0이다. 전체 `publishLog`도 시험 전처럼 0건이다 |
| `pnpm lint` / `pnpm test` / `tsc --noEmit` | 통과 / 112개 통과 / 9개 그대로(`PostList` 3, `editor-drafts` 4, `TextReveal` 1, `markdown-publish` 1) |

옛 관리자 대시보드는 지운 `GET /api/admin/publish-status`를 불러 404를 받는다. D10대로 옛 화면은 고치지 않는다. 3단계 에디터가 화면을 바꾼다.

## 5. Plan과 다르게 하거나 Plan이 정하지 않은 것

1. 카테고리와 같은 뜻의 태그는 글의 카테고리와 상관없이 모두 뺀다. 실제 데이터에서는 두 해석의 결과가 같다.
2. 태그 별칭은 매핑 JSON이 아니라 `taxonomy.ts`에 둔다. API와 리다이렉트도 같은 규칙을 써야 하기 때문이다.
3. `EntryContent.category`는 `null`을 받는다. 빈 초안(6.3 `POST`)에는 카테고리가 없다. 발행할 때 post는 필수다.
4. 초안 상태로 옮긴 글(에세이 1편)은 `publishedAt`·`lastPublishedAt`이 `null`이다. D4의 "한 번도 발행하지 않았다"에 맞춘다.
5. 마이그레이션은 발행 글마다 `revisions/1`도 쓴다. Plan 4.2의 "발행할 때마다 스냅샷" 규칙에 맞춘다.
6. 재동기화가 글을 갱신할 때 예전 공개 slug를 `slugHistory`에 더한다.
7. 작업 브랜치 이름은 `stage2/…`다. `rebuild/…`는 이미 있는 `rebuild` 브랜치와 git 참조 이름이 겹쳐 만들 수 없다.
8. 연재 상세의 "읽은 글" 체크 표시(localStorage)를 지웠다. A5의 "진행률 기능은 두지 않는다"에 맞춘다.
9. 공개 페이지 점검 스크립트 `scripts/smoke/stage2-public.mjs`를 더했다. Plan에는 없다. 10.4 검증을 다시 돌릴 수 있게 한다.
10. 복원 스크립트의 기본 동작을 Plan 5.7보다 좁혔다. 범위를 요구하고, 지금 없는 문서만 쓴다. 목적(실수로 지운 글 되살리기)에 맞추고 덮어쓰기 사고를 막는다.
11. 운영에서 지웠지만 rebuild에서 고친 글은 "충돌"로 판정한다. Plan 5.4 표에 없는 경우다. "어느 쪽 변경도 자동으로 덮지 않는다" 원칙을 따른다.

PR-B·PR-C에서 판단한 것:

12. 초안 저장 때 서버가 태그를 정규화한다. 정규화 뒤 3개를 넘으면 400이다. 저장된 문서가 스키마(정규화된 태그)를 늘 지키게 한다.
13. 목록의 `counts`는 kind 조건만 적용한 상태별 수다. status·q 조건은 적용하지 않는다. 화면의 탭 수로 쓰기 위해서다.
14. 발행 응답의 `publicUrl`은 요청한 사이트의 origin 기준이다. `entries`는 rebuild 배포에서만 보이기 때문이다. note는 공개 페이지가 없어 `null`이다.
15. 숨김·다시 보임은 이미 그 상태면 쓰지 않는다. 응답은 `{ status, changed, purge }`다.
16. 초안 버리기는 `device`, `editorJson`을 `null`로 둔다. 발행본에는 두 값이 없다.
17. 자기 `slugHistory`에 있는 slug로 되돌리는 발행을 허용한다. 그 slug를 기록에서 빼고 직전 slug를 넣는다.
18. 같은 해시의 `pending` 자산이 있으면 새 문서를 만들지 않고 그 문서에 새 업로드 주소를 준다.
19. 글을 지울 때 삭제 표지를 `recursiveDelete`보다 먼저 쓴다. 삭제가 중간에 실패해도 재동기화가 글을 되살리지 않는다.
20. 고아 표시(`orphanedAt`)는 legacy 자산에도 적는다. 병합 전 정리에서는 legacy 자산을 빼므로 지워지지 않는다.
21. `purge` 요청에 선택 값 `ids`를 더했다. `minOrphanDays`는 0 이상을 받는다. 스모크 테스트가 시험 자산만 지우기 위해서다.
22. `firestore-posts.ts`, `site-url.ts`도 지웠다. Plan 6.5 목록에는 없다. 지운 API만 썼고, `firestore-posts.ts`는 옛 `posts`에 쓰는 코드다.
23. 함수 `maxDuration`을 60초로 정했다(`astro.config.mjs`). Vercel 프로젝트의 Fluid compute 설정을 볼 수 없다. 두 경우 모두 Hobby 한도 안이다.
24. 로그인 5분 판정은 시계 오차 60초를 허용한다(토큰 발급 시각이 서버보다 조금 미래인 경우).
25. 관리자 페이지 응답에 `Cache-Control: private, no-store`를 붙인다.
26. 백업 `raw/`의 시각은 `{ "__fs": "timestamp", "seconds", "nanoseconds", "iso" }`다. B1 덤프와 같은 태그라서 손실 없이 되돌린다. Plan의 "ISO 문자열"도 담는다.
27. 백업 `published/`는 발행본이 있는 글(published·hidden)을 모두 담는다. frontmatter에 `status`가 있다. `drafts/`는 초안과 발행본의 내용을 비교해 고른다.
28. 백업 알림은 Plan대로 발행·삭제 뒤에만 보낸다. 숨김은 다음 예약 실행이 반영한다.
29. 관리자 처리기를 모두 `withAdminApi`로 감싼다. 미들웨어 검사에 더해 세션과 쓰기 요청의 Origin을 한 번 더 본다(리뷰의 치명 지적 대응).
30. `ADMIN_UID`가 없으면 관리자 경로는 503 `ADMIN_NOT_CONFIGURED`다. 500은 Astro가 오류 페이지로 바꿔 본문이 사라진다.

## 6. 리뷰 결과

### 6.1 PR-A

새 리뷰어(별도 에이전트)가 `04e2425..dce33f1`을 읽기 전용으로 검토했다. 치명 0, 중요 1, 경미 9건이었다. 효과 기준으로 다시 나눠 5건을 고쳤다. 각 수정은 실패하는 테스트를 먼저 썼다.

| 고친 것 | 테스트 |
|---|---|
| 복원 스크립트가 백업 없이, 범위 없이 덮어쓴다 | `restore-plan.test.ts` |
| 수 맞추기가 남긴 삭제 후보 때문에 거짓 "불일치"를 낸다 | `expectedLegacyEntryCount` |
| 쓰기 전에 스키마를 검사하지 않는다. `readingTime` 0.4가 0이 된다 | `legacyToEntry` readingTime |
| `--propagate-deletes`가 rebuild에서 고친 글도 지운다 | `decideSync` |
| slugHistory 301에 테스트가 없고, 대상 kind를 따로 캐시된 목록으로 확인한다 | `slug-lookup.test.ts` |

미룬 것(경미):

1. 갱신·삭제에 `lastUpdateTime` 사전 조건이 없다. T4 API와 동시에 쓰면 덮일 수 있다. 사용자가 한 명이라 위험이 낮다.
2. 운영에서 발행을 내렸다가 다시 발행하면 revision이 1부터 다시 시작해 `revisions/1`을 덮는다. Plan 5.2를 그대로 따른 결과다.
3. 마이그레이션이 rebuild에서 만든 글과의 slug 충돌을 보고하지 않는다. T4 발행 검사가 slug 유일성을 막는다.
4. 없는 slug로 요청할 때마다 메모리 캐시 키가 늘고 쿼리가 2회 나간다. 옛 코드와 같은 패턴이다.
5. RSS에 `Cache-Control`이 없어 캐시 태그가 효과가 없다. 옛 동작과 같다.

### 6.2 PR-B

새 리뷰어(별도 에이전트)가 `b568fbf..554692f`를 읽기 전용으로 검토했다. 치명 1, 중요 2, 경미 9건이었다.

| 지적 | 처리 |
|---|---|
| 치명: `/api/%61dmin/…`처럼 인코딩한 경로가 미들웨어 검사를 건너뛴다. Astro는 `decodeURI`한 경로로 라우트를 고른다 | 재현했다(쿠키 없이 초안 목록 200). 실행할 라우트(`routePattern`)와 디코딩한 경로로 판정한다. 모든 관리자 처리기를 `withAdminApi`로 감싸 세션·Origin을 한 번 더 본다. 테스트와 스모크 검사를 더했다 |
| 중요: 커밋 뒤 자산 사용 기록·삭제 기록이 실패하면 성공한 요청이 500이 된다 | 실패해도 성공으로 끝내고 `assetUsage: 'failed'`를 적는다 |
| 중요: note를 다시 발행할 때마다 slug가 바뀐다 | 빈 slug면 지금 발행본의 slug를 다시 쓴다 |
| 경미: 발행 뒤 문서가 1 MiB를 넘을 수 있다 | 발행 전 크기를 어림해 422 |
| 경미: finalize가 legacy 자산을 다룰 수 있다, 해시를 확인하지 않는다, 쓰지 않는 새 자산이 정리되지 않는다 | legacy·경로 밖 거부, SHA-256 확인, finalize 때 고아 표시 |
| 경미: 옛 형식 slug로 되돌릴 수 없다 | 이 글의 `slugHistory`에 있는 slug는 형식 검사를 건너뛴다 |
| 경미: 발행 응답에 `backup`이 없다 | PR-C(T8)가 더했다 |

미룬 것(경미):

1. 끝내지 않은 업로드의 원본은 정리 전까지 Storage 공개 읽기 규칙으로 읽힌다. 2단계는 규칙을 바꾸지 않는다. 병합 뒤 규칙 정리(Plan 15절) 때 `assets/*/original.*` 읽기를 막는다.
2. mp4는 Plan D6대로 메타데이터를 지우지 않는다. 위치 정보가 남을 수 있다.
3. 서명 URL에 크기 제한 헤더가 없다. finalize가 크기를 다시 검사한다.
4. 초안 버리기는 version을 올리므로 내용이 같아도 `hasUnpublishedChanges`가 true다. Plan D4의 계산식 그대로다.

미리보기에서 찾아 고친 것: 미들웨어의 500 JSON은 Astro가 오류 페이지로 바꿔 빈 본문이 된다(404·500만 바꾼다). 설정 누락은 503으로 돌려준다.

## 7. 다음 작업

끝난 것(2026-11-08):

1. ~~사용자: E4, E5 나머지, E3~~ 끝났다(3절).
2. ~~PR #5·#6 병합~~ 끝났다. 되돌리기 기준 태그는 `rebuild-pre-stage2`(`04e2425`)다(Plan 11.1).
3. ~~설정 뒤 확인(백업 Action, 미리보기 로그인, 발행 퍼지·백업 알림)~~ 끝났다(4절 "설정 뒤 확인").

다음 것:

1. 3단계: 에디터 Plan. 새 세션에서 한다. 새 API의 첫 화면이다. 먼저 읽을 것: 이 문서 2.4~2.6(API), 5절(판단), 6.2(미룬 것), 8절 4(퍼지 뒤 첫 요청).
2. E2(버킷 CORS)는 3단계 에디터 업로드 전에 한다. 미리보기에서 서명 URL로 올리려면 필요하다.
3. 원격에 남은 병합 끝난 브랜치 `stage2/a-data-model`, `stage2/c-backup`을 지운다(사용자 확인 뒤). 이 문서 PR의 `stage2/finish-docs`도 병합 뒤 지운다.
4. E6(Secret Manager `GITHUB_TOKEN` 삭제)은 언제든 한다. Vercel 환경 변수 `GITHUB_TOKEN`은 main 병합 뒤에 지운다(3절).

## 8. 열린 질문

1. ~~`vercel.json`의 `regions`가 적용되는지~~ 적용된다. PR-B 미리보기의 `x-vercel-id`가 `icn1::icn1::…`다(2026-11-08).
2. 어느 글도 쓰지 않는 legacy 파일이 26개 있다(시리즈 커버 3개 포함). 병합 뒤 정리 작업에서 다룬다.
3. 개발 서버에서 없는 관리자 경로는 404 대신 401·403이다. prerender된 404 페이지를 그릴 때 미들웨어가 헤더 없이 한 번 더 돈다. Vercel에서는 함수까지 오지 않는다(엣지 404). 해가 없어 그대로 둔다.
4. 퍼지 뒤 첫 요청은 옛 응답이다. D8의 `invalidateByTag`는 캐시를 "오래됨"으로 표시한다(`@vercel/functions` 문서). 다음 첫 요청은 옛 응답(`STALE`)을 받고 뒤에서 새로 만든다. 그다음 요청부터 새 내용이다(미리보기에서 약 2초 안). 대안은 `dangerouslyDeleteByTag`다. 캐시를 지우므로 첫 요청이 새 내용을 받는다. 대신 그 요청은 Firestore를 읽어 느리다. 3단계에서 정한다. 발행 직후 에디터가 공개 주소를 바로 열면, 다시 발행한 글은 첫 화면이 옛 내용일 수 있다.
5. dispatch PAT에는 만료일이 있다. 만료되면 발행·삭제 응답의 `backup`이 `failed`가 된다. 발행은 성공하고 매일 03:00 예약 백업은 계속 돈다. 그때 PAT를 새로 만들어 Vercel `BACKUP_DISPATCH_TOKEN` 값을 바꾸고 다시 배포한다.
