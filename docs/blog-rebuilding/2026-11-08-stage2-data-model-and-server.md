# 재건 2단계: 데이터 모델과 서버 (작업 문서)

- 날짜: 2026-11-08
- Plan: [2026-11-07-stage2-data-model-and-server-plan.md](./2026-11-07-stage2-data-model-and-server-plan.md) (2026-11-08 승인)
- 기준: `rebuild` `04e2425`
- 브랜치: PR-A `stage2/a-data-model` → [PR #4](https://github.com/crucial-sub/cruz-lab/pull/4) (대상 `rebuild`, 2026-11-08 열림). PR-B·PR-C는 이 브랜치 위에 만든다.
- 상태: **PR-A(T1·T2·T6) 구현·검증 완료.** PR-B(T3·T4·T5), PR-C(T8·T9), T10은 남았다.

## 1. 현재 상황

1. 새 컬렉션 `entries`, `seriesMeta`, `assets`가 운영 Firestore에 생겼다. 옛 `posts`·`series`는 그대로다.
2. 이 브랜치의 공개 페이지는 `entries`를 읽는다. 운영(main)은 옛 `posts`를 계속 읽는다.
3. 운영 사이트는 바뀌지 않았다. `/blog`는 여전히 같은 글이 두 번 나와 55장이다(2026-11-08 확인).
4. 관리자 화면과 관리자 API는 아직 바꾸지 않았다. PR-B에서 한다.

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

## 3. 외부 변경

| # | 변경 | 시각 | 되돌리기 |
|---|---|---|---|
| E1 | Firestore 예약 백업(일간, 보존 7일, 스케줄 `a8ffad4f-7bc8-4e2e-a7d1-eb3939568aef`)과 삭제 보호 켜기 | 2026-11-08 15:24 KST | `firebase firestore:backups:schedules:delete`, `firebase firestore:databases:update "(default)" --delete-protection DISABLED` |
| E7 | 마이그레이션 실제 실행. B1 덤프 `~/projects/cruz-lab-backups/20261108-152505-stage2-migrate/` | 2026-11-08 15:25 KST | `stage2-rollback.mjs --apply` |

E7이 쓴 문서는 242개다. `entries` 55, `entries/*/revisions` 54, `seriesMeta` 3, `assets` 130.

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

## 6. 리뷰 결과 (PR-A)

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

## 7. 다음 작업

1. PR-A([#4](https://github.com/crucial-sub/cruz-lab/pull/4))를 검토하고 `rebuild`에 병합한다(사용자 확인 뒤). 병합 전에 태그 `rebuild-pre-stage2`를 단다(Plan 11.1).
2. PR-B: T3 세션 인증, T4 글 API, T5 자산 API.
3. PR-C: T8 백업 저장소와 Action, T9 옛 출간 경로 삭제.
4. T10: 전체 검증, `rebuild` 미리보기 확인(E3 승인 도메인 추가 뒤).

## 8. 열린 질문

1. `vercel.json`의 `regions`가 Astro Vercel 어댑터의 빌드 결과에도 적용되는지. 빌드 결과의 함수 설정(`.vc-config.json`)에는 리전이 없다. 미리보기의 `x-vercel-id`로 확인한다. 적용되지 않으면 Vercel 대시보드의 함수 리전 설정이 필요하다(사용자).
2. 어느 글도 쓰지 않는 legacy 파일이 26개 있다(시리즈 커버 3개 포함). 병합 뒤 정리 작업에서 다룬다.
