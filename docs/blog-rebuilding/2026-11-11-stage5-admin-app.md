# 재건 5단계 작업 문서: 관리자 앱

- 날짜: 2026-11-10 ~ 2026-11-11 (PR-A·PR-B·PR-C·PR-D·PR-E 구현, T16 문서 PR. 5단계 끝)
- Plan: [2026-11-10-stage5-admin-app-plan.md](./2026-11-10-stage5-admin-app-plan.md) (승인 2026-11-10, [PR #21](https://github.com/crucial-sub/cruz-lab/pull/21) 병합 `90c6201`)
- 진행 기록: [계획 문서 11.11](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md#1111-5단계-구현-진행-기록-2026-11-10--2026-11-11)
- 브랜치: `stage5/a-app`(PR-A, `origin/rebuild` `90c6201`에서 생성), `stage5/b-manage`(PR-B, `d1ded00`), `stage5/c-editor`(PR-C, `eb72c39`), `stage5/d-readers`(PR-D, `7a370fb`), `stage5/e-perf`(PR-E, `c582243`), `stage5/docs`(T16 문서 PR, `5c6ba0c`). 대상은 `rebuild`다.
- 상태: **5단계 끝(2026-11-11).** 코드 PR 5개(PR-A~PR-E)가 모두 `rebuild`에 병합됐다. 마지막 병합은 PR-E [PR #26](https://github.com/crucial-sub/cruz-lab/pull/26)(`5c6ba0c`)이다. T16 문서 PR은 2.21에 적었다(커밋 `7887eff`, [PR #27](https://github.com/crucial-sub/cruz-lab/pull/27), 병합은 사용자 확인 뒤). 다음 작업 단위는 main 병합 준비다(7절, 감사 문서 11.3). 아래는 PR별 기록이다.
- PR별 기록: PR-A(T1~T4) 끝. 커밋 `4a8f6b3`, [PR #22](https://github.com/crucial-sub/cruz-lab/pull/22) `rebuild` 병합(`d1ded00`, 2026-11-11). 태그 `rebuild-pre-stage5`(= `90c6201`). **PR-B(T5~T8) 구현·검증·별도 리뷰·리뷰 수정 끝(2026-11-11), 브랜치 `stage5/b-manage`(기준 `d1ded00`), 커밋 `ee39038`, [PR #23](https://github.com/crucial-sub/cruz-lab/pull/23) `rebuild` 병합(`eb72c39`).** **PR-C(T9~T11) 구현·검증·별도 리뷰·리뷰 수정 끝(2026-11-11), 브랜치 `stage5/c-editor`(기준 `eb72c39`), 커밋 `7fbfe27`, [PR #24](https://github.com/crucial-sub/cruz-lab/pull/24) `rebuild` 병합(`7a370fb`).** **PR-D(T12) 구현·검증·별도 리뷰·리뷰 수정 끝(2026-11-11), 브랜치 `stage5/d-readers`(기준 `7a370fb`), 커밋 `48c8d66`, [PR #25](https://github.com/crucial-sub/cruz-lab/pull/25) `rebuild` 병합(`c582243`).** **PR-E(T13·T14) 구현·측정·검증·별도 리뷰·리뷰 수정 끝(2026-11-11), 브랜치 `stage5/e-perf`(기준 `c582243`), 측정용 커밋 3개를 사용자 확인 뒤 커밋 하나 `c61fa06`로 합쳤다. [PR #26](https://github.com/crucial-sub/cruz-lab/pull/26) `rebuild` 병합(`5c6ba0c`).**

## 1. 현재 상황

| 항목 | 상태 |
|---|---|
| PR-A (T1 앱 틀, T2 첫 화면·목록, T3 알림·출간 기록, T4 입구) | 구현·검증 끝(2026-11-11). 별도 리뷰 2건(서버·화면)과 수정 끝(6절). 49파일, +4,288·−267줄(문서 제외). 커밋 `4a8f6b3`·`0278859`(PR 링크), [PR #22](https://github.com/crucial-sub/cruz-lab/pull/22) `rebuild` 병합(`d1ded00`) |
| PR-A 병합 뒤 미리보기 확인(Plan 8.6의 1) | 끝(4.7). 로그아웃 뒤 "고치기"는 사용자 몫 |
| PR-B~PR-E 병합 뒤 미리보기 확인(Plan 8.6의 4·5, 7절 다음 것) | 하지 않았다. PR-E의 측정(Plan 8.6의 2·3)은 병합 전 작업 브랜치 미리보기에서 끝냈다(4.16·4.17). 남은 확인은 main 병합 전에 한다(감사 문서 11.3의 10) |
| PR-B (T5 이미지, T6 분류, T7 연재·프로젝트, T8 리비전) | 구현·검증 끝(2026-11-11, 2.7~2.11·4.8·4.9). 별도 리뷰 2건과 수정 끝(6.5~6.8). 커밋 `ee39038`·`021ca81`(PR 링크), [PR #23](https://github.com/crucial-sub/cruz-lab/pull/23) `rebuild` 병합(`eb72c39`) |
| PR-C (T9 이미지 세부 조절, T10 키맵 설정, T11 자동 재시도·블록 이동·찾기·바꾸기) | 구현·검증 끝(2026-11-11, 2.12~2.15·4.10~4.12). 별도 리뷰 2건과 수정 끝(6.9~6.12). 커밋 `7fbfe27`·`16fa7ad`(PR 링크), [PR #24](https://github.com/crucial-sub/cruz-lab/pull/24) `rebuild` 병합(`7a370fb`) |
| PR-D (T12 독자 흐름) | 구현·검증 끝(2026-11-11, 2.16·2.17·4.13~4.15). 별도 리뷰 2건과 수정 끝(6.13~6.16). 커밋 `48c8d66`·`ef7ea13`(PR 링크), [PR #25](https://github.com/crucial-sub/cruz-lab/pull/25) `rebuild` 병합(`c582243`) |
| PR-E (T13 측정·처방, T14 MCP 도구 삭제) | 구현·측정·검증 끝(2026-11-11, 2.18~2.20·4.16·4.17). 처방 2건은 사용자 결정(5절 140·145). 별도 리뷰 2건과 수정 끝(6.17~6.20). 커밋 `c61fa06`·`36fdab8`(PR 링크), [PR #26](https://github.com/crucial-sub/cruz-lab/pull/26) `rebuild` 병합(`5c6ba0c`) |
| 문서 PR (T16) | 끝(2026-11-11, 2.21). 브랜치 `stage5/docs`(`origin/rebuild` `5c6ba0c`에서 생성). 이 문서, 감사 문서, Plan만 바꿨다. 코드 변경 0. 커밋 `7887eff`, [PR #27](https://github.com/crucial-sub/cruz-lab/pull/27)(대상 `rebuild`). 병합은 사용자 확인 뒤 |
| 외부 변경 | 규칙·인덱스·환경 변수·Vercel 설정·버킷 CORS는 바꾸지 않았다. PR-E: E1(Codex 설정 3줄 삭제) 끝, E2는 할 일 없음(Fluid compute 이미 켜짐), 측정용 미리보기 배포 3개(3절). **E3(백업 저장소 `settings`)은 하지 않았다.** 사용자 확인 뒤에 한다(7절 다음 것 2) |
| 운영 데이터 | 시험 데이터만 만들고 모두 지웠다(4.5·4.7·4.9·4.12·4.14·4.15). `readerEvents`·`readerDaily`는 시험 뒤 0이다(실제 독자 데이터는 main 병합 뒤 운영 주소에서 쌓인다). 끝 상태: `entries` 69(초안 7, 빈 초안 2), `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 파일 37. 더해진 것: `settings/taxonomy`(기본 10개, 별칭 없음). `settings/editor`는 PR-C 시험 뒤 지워 없다. 사용자 초안과 공개 글은 읽기만 했다. 5단계 끝 상태는 PR-E 끝의 수(4.17)다: `entries` 69(초안 7, 표지 붙은 글 0), `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 37, `settings`는 `taxonomy`만, `readerEvents` 0, `readerDaily` 0. T16은 운영 데이터를 읽지도 쓰지도 않았다 |
| Firebase 인증 사용자 | 스모크가 Admin SDK로 만든 시험 사용자를 세션 API가 지웠다(4.2). 관리자 계정은 그대로다 |

## 2. 한 일

### 2.1 T1: 앱 틀 (D9)

| 파일 | 내용 |
|---|---|
| `src/pages/admin/[...path].astro` | 관리자 앱 진입. `AdminPage` 틀 + `<AdminApp client:only="react">`. 세션 만료 시각(`locals.admin.expiresAt`)을 앱에 넘긴다. `/admin/login`은 따로 있는 페이지가 먼저 맞는다 |
| `src/admin/router.ts` | 순수 함수 라우터. `/admin`(쿼리 포함), `/admin/edit/<id>`(ID 형식 검사), `/admin/log`. 모르는 주소는 null(앱이 `/admin`으로 바꾼다). 링크 클릭을 앱이 받을지 판단(`routeForLinkClick`: 왼쪽 버튼, 수정 키 없음, `target` 없음, 같은 origin, 아는 주소). 탭 제목 |
| `src/admin/AdminApp.tsx` | 루트. History API 이동(`pushState`·`replaceState`·`popstate`), 문서 전체의 앱 주소 링크를 앱 안 이동으로 받는다(에디터의 "← 목록"도). 떠나기 가드: 에디터가 등록하고 앱이 이동 전에 부른다. 뒤로 가기에서 가드가 막으면 주소를 되돌린다. 목록 데이터를 한 번 받아 두고 줄 고치기·지우기·더하기만 한다. 에디터는 `React.lazy`, 불러오기 실패 화면(오류 경계). 관리자 표시 쓰기·로그아웃 |
| `src/admin/app-context.ts` | 화면들이 함께 쓰는 값(지금 화면, 이동, 목록, 알림, 로그아웃), `errorMessage`, `redirectIfUnauthorized`(401이면 로그인 화면) |
| `src/admin/editor-loader.ts` | `import('@/editor/ui/EditorApp')`와 미리 받기(`preloadEditor`) |
| `src/admin/admin-hint.ts` | 관리자 표시(D4): `localStorage` `cruz-admin-hint` = 만료 시각(ms). 세션 만료 시각, 최대 14일. 쓰기·지우기·읽기 |
| `src/admin/layout/AdminLayout.tsx`, `AdminNav.tsx` | 1024px 이상: 왼쪽 메뉴 200px + 내용 최대 1120px. 미만: 위 막대(☰ · 제목 · 새 글), 메뉴는 왼쪽 시트(Esc로 닫음). 메뉴: 글, 출간 기록, 사이트 보기(새 탭), 로그아웃 |
| `src/admin/ui.tsx`, `src/admin/api.ts` | 단추 클래스·확인 대화상자·알림·행 메뉴(⋯)·서울 시각 표기. 앱의 API 호출(에디터 `state/api.ts`의 요청 함수를 쓴다) |
| `src/editor/ui/EditorApp.tsx` | `host` 연결부(이동, 떠나기 가드 등록, 떠날 때 목록 한 줄 값, 삭제 알림, 로그아웃). KaTeX·에디터 CSS를 이 모듈이 가져온다. 열면 본문에 커서(초안은 끝, 발행한 글은 처음). 404·삭제 뒤 이동은 `host.navigate` |
| `src/editor/state/api.ts` | 요청 함수를 `apiRequest`로 내보낸다(타입만 가져오는 파일이라 에디터 청크를 끌어오지 않는다) |
| 지움 | `src/pages/admin/index.astro`(최소 목록), `edit/[id].astro`, `edit/index.astro`, `posts/index.astro`, `posts/new.astro`(Plan 6절). 지우기 전 grep: 서로끼리, `AdminPage.astro`·`editor/index.ts` 주석, 경로 판정 테스트(경로 글자만)뿐이었다 |

### 2.2 T2: 첫 화면·목록 (D10)

| 파일 | 내용 |
|---|---|
| `src/admin/home/HomeScreen.tsx` | 맨 위 알림 띠. "새 글"·"오늘 기록"(빈 초안을 만들고 바로 에디터). "이어 쓰기": 초안과 "발행 뒤 변경 있음" 글 최대 3편(제목 · 종류 · 상태 · 고친 때 · 기기), 빈 초안 제외, 마우스를 올리면 에디터 청크 미리 받기. 목록·거르기. 빈 초안 칩과 "모두 지우기"(개수 확인, 직전에 목록을 다시 받아 아직 빈 초안만 지움). 키 `Shift+N`(새 글)·`/`(검색 칸), 입력 칸 안에서는 듣지 않음. 숨기기·다시 보이기·삭제(확인) |
| `src/admin/home/list-filter.ts` | 순수 함수: 주소 상태(`?status=&kind=&q=&sort=`, 기본값은 쓰지 않음), 검색(제목·slug·태그·카테고리 이름·key·연재 key), 상태 탭 수(종류·검색 뒤), 정렬(고친 때·발행일·30일 독자, 같으면 고친 때 → ID), 이어 쓰기 고르기, 분류 칸 글자 |
| `src/admin/home/EntryFilters.tsx` | 상태 탭 + 수, 빈 초안 칩, 검색 칸, 종류, 정렬 |
| `src/admin/home/EntryTable.tsx` | 768px 이상 표(제목+slug · 종류 · 상태+변경 있음 · 분류 · 30일 독자 · 고친 때 · 발행일 · ⋯), 미만 두 줄 행(제목 / 종류 · 상태 · 독자 · 고친 때, 행 끝 ⋯). 행 메뉴: 공개 페이지 보기(발행 상태일 때), 숨기기/다시 보이기, 삭제 |
| `src/lib/server/admin-entries.ts` 목록 | 응답에 `isEmptyDraft`(초안 상태 + 제목·설명·본문이 빔. 초안 상태 글만 설명·본문을 두 번째 쿼리로 읽고 응답에는 넣지 않는다), `readers30: null`(D20 전 자리), `publicPath`(발행본 slug 기준 공개 주소, 숨김 글도) |

### 2.3 T3: 알림·출간 기록 (D11, D15 2)

| 파일 | 내용 |
|---|---|
| `src/lib/server/admin-entries.ts` | `publishLog` 줄에 `title`(그때 제목)을 더하고 줄 ID를 돌려준다(발행·숨김·다시 보임·삭제). `discardDraft`가 같은 트랜잭션에서 `published.fromDraftVersion`을 새 초안 버전으로 맞춘다(리비전 문서는 그대로). `getEntryLabel` |
| `src/pages/api/admin/posts/[id]/publish.ts`, `visibility.ts`, `index.ts`(DELETE) | 부수 작업 결과를 그 줄에 적는다: 발행·삭제는 `purge`·`backup`·`assetUsage`, 숨김·다시 보임은 `purge`. 기록이 실패해도 요청은 성공이다 |
| `src/lib/publish-log.ts` | 줄 모양, 칸 읽기(모르는 값·없는 칸은 null), 알림 계산 `computePublishAlerts`(최근 7일, 오래된 줄부터 실패 → 같은 글의 성공 줄이 뒤에 있으면 지움, skipped는 성공이 아님), 동작 글자 |
| `src/lib/server/publish-log.ts` | 쪽 읽기(최신순, `before`는 줄 ID → `startAfter(문서)`), 최근 7일 알림, 글의 마지막 줄, 부수 결과 기록, retry 줄 쓰기 |
| `src/pages/api/admin/publish-log.ts` | `GET ?before=&limit=`(기본 50, 최대 50) → `{ items, nextBefore }`. `GET ?alerts=1` → `{ alerts: { purge[], backup[] } }` |
| `src/pages/api/admin/posts/[id]/retry.ts` | `POST { purge?: true, backup?: true }`. 글이 있으면 백업 알림은 publish, 지워졌으면 delete(이름표는 마지막 기록). 결과를 retry 줄로 남긴다. 글도 기록도 없으면 404 |
| `src/admin/layout/AlertBar.tsx` | 정상이면 그리지 않는다. 캐시 비우기 실패 N건(다시 비우기), 백업 알림 실패 N건(다시 알리기), 이 기기에 보내지 않은 초안 N편(열기: IndexedDB `listOfflineDraftIds`) |
| `src/admin/log/LogScreen.tsx` | 출간 기록 50줄씩 + 더 보기. 때 · 동작 · 제목(에디터 링크, 지운 글은 기록된 이름과 "(지운 글)") · 판, 그 아래 부수 결과(실패만 빨간색) |
| `src/editor/state/offline-store.ts` | `listOfflineDraftIds()` |

### 2.4 T4: 입구 (D4)

| 파일 | 내용 |
|---|---|
| `src/layouts/components/Footer.astro` | 링크 끝 "관리"(`/admin`, `rel="nofollow"`). 누구에게나 보인다. 헤더는 그대로 |
| `src/pages/admin/login.astro`, `src/components/admin/AdminLogin.tsx` | 관리자 틀(`AdminPage`, noindex). 사전 안내("블로그 관리자 전용 화면입니다. 관리자 계정이 아니면 로그인되지 않고, 로그인 기록도 남기지 않습니다."), "Google로 로그인", "블로그로 돌아가기". 403 `NOT_ADMIN`이면 거부 화면("관리자 계정이 아닙니다 · 이 계정으로는 들어갈 수 없습니다 · 방금 로그인 기록은 지웠습니다" + 블로그로 돌아가기). 팝업 닫기는 문구 없이, 팝업 막힘·네트워크는 안내 문구 |
| `src/lib/server/admin-session.ts`, `src/lib/admin-guard.ts` | ID 토큰 확인 뒤 관리자가 아니면 `deleteUser(uid)`. `shouldDeleteRejectedUser`: 관리자 UID와 같거나(이메일 미확인으로 거부된 관리자 포함) `ADMIN_UID`가 없으면 지우지 않는다. 403 `details.authRecordDeleted` |
| `src/layouts/BaseLayout.astro` | 본문 끝 인라인 스크립트(빌드 결과 273바이트): 관리자 표시가 살아 있으면 `[data-admin-only]`의 `hidden`을 푼다 |
| `src/components/post/PostArticle.astro` | 머리줄 끝 "고치기"(`/admin/edit/<id>`, `data-admin-only hidden`, `rel="nofollow"`). 글·노트·프로젝트 글이 이 컴포넌트를 쓴다 |

### 2.5 검증 도구와 테스트

| 파일 | 내용 |
|---|---|
| `tests/unit/admin-router.test.ts`(13) | 주소 ↔ 화면, ID 검사(한글 글 ID 포함), 옛 주소·만들지 않은 화면, 링크 클릭 판단, 같은 주소의 `#` 링크 |
| `tests/unit/admin-list-filter.test.ts`(11) | 주소 상태 왕복·기본값, 상태 탭 수, 검색 대상 5가지, 종류, 빈 초안 칩, 정렬 3가지, 이어 쓰기, 분류 글자 |
| `tests/unit/publish-log-alerts.test.ts`(13) | 정상·옛 줄, 실패 → 성공으로 지움, skipped(캐시·백업), 백업만 다시 한 줄, 숨김 실패 → 발행 성공, 순서, 다른 글, 7일 경계, 글마다 한 건, 칸 읽기 |
| `tests/unit/admin-session-reject.test.ts`(7) | 세션 API 순서: 설정 없음 503·잘못된 토큰 401이면 지우지 않음, 비관리자 삭제, `ADMIN_UID`가 인증 사용자가 아니면 지우지 않음, 이메일 미확인 관리자, 삭제 실패, 관리자 |
| `tests/unit/admin-hint.test.ts`(6), `admin-guard.test.ts`(+3) | 표시 만료·14일 한도·지우기·막힌 저장 공간. 비관리자 삭제 조건(관리자 UID는 절대 아님) |
| `scripts/smoke/stage5-admin.mjs` | PR-A 몫 API 스모크(119건). 진입·로그인 화면, 공개 입구(푸터 링크·`hidden`·표시 스크립트·Set-Cookie 없음), 목록 새 칸, 발행·버리기·숨김·삭제 줄의 부수 결과, 출간 기록 쪽·검사, 알림·다시 시도, 비관리자 세션 403 → 인증 사용자 삭제, 끝에 시험 데이터 0. Google API 호출은 네트워크가 끊겨도 몇 번 다시 한다(4.6). 정리는 단계마다 다시 시도하고, 한 단계가 실패해도 끝까지 한다. 일부러 넣은 실패 줄을 먼저 지운다. Ctrl+C에도 지운다(6절) |
| `scripts/smoke/stage2-api.mjs` | 초안 버리기 뒤 `hasUnpublishedChanges` 기대값을 false로(D15 2). 검사를 둘로 나눠 106건 |

### 2.6 리뷰 뒤 고친 것 (2026-11-11, 6절)

| 파일 | 내용 |
|---|---|
| `src/lib/server/admin-session.ts` | 비관리자 인증 기록을 지우기 전에 `getUser(ADMIN_UID)`를 부른다. 실패하면(설정 오류) 지우지 않는다(S1) |
| `src/lib/server/admin-entries.ts` | 빈 초안 판정은 "초안 상태 + 제목이 빈" 글의 설명·본문만 읽는다(S5). `getEntryLabel`은 이름표 칸 4개만 읽는다(S4) |
| `src/editor/ui/EditorApp.tsx` | 저장 성공 때 떠나기 가드가 읽는 ref(마지막 저장 시각, "발행 뒤 변경")를 바로 고친다(B1). 떠날 때 알리는 값에 `publicPath`(B6). 열 때 404면 목록 줄을 뺀다(B4). 로그아웃 전에 저장을 비운다(B8) |
| `src/admin/router.ts`, `AdminApp.tsx` | 같은 주소의 `#` 링크는 브라우저에 맡긴다(B2). 이동이 가드를 기다리는 동안 온 뒤로 가기는 받지 않고, 끝난 뒤 주소를 화면에 맞춘다(B12). `replaceState` 예외를 삼킨다(B14). 글 ID에 한글(가-힣)을 받는다(B13) |
| `src/admin/home/HomeScreen.tsx` | 주소의 검색어가 화면 밖에서 바뀌면 검색 칸을 맞춘다(B3). 숨김·다시 보임의 캐시 비우기 실패 문구, 숨김·삭제 뒤 알림 띠 다시 받기(B7). 목록 삭제 때 이 기기 보관 초안도 지운다(B4). 빈 초안 "모두 지우기"는 이 기기 보관함에 있는 글을 남긴다(S8). 모달이 열려 있으면 `Shift+N`·`/`를 듣지 않는다(B15) |
| `src/admin/layout/AlertBar.tsx` | `refreshKey`가 바뀌면 다시 받는다. 보관 초안은 목록에 있는 글만 보인다(B4) |
| `src/admin/log/LogScreen.tsx` | "더 보기" 실패 문구를 단추 아래에 보이고, 401이면 로그인 화면(B5) |
| `src/admin/ui.tsx` | 확인 대화상자는 처음 열 때만 "취소"에 초점을 둔다. Esc는 ref로 최신 `onCancel`을 부른다(B9) |
| `src/admin/api.ts` | `setVisibility` 응답 타입에 `purge` |
| 테스트·스모크 | 2.5의 `admin-router`·`publish-log-alerts`·`admin-session-reject`, `stage5-admin.mjs` 정리(S3, S7) |

### 2.7 PR-B T5: 이미지 라이브러리 (D12)

작업 분담: T5는 서브에이전트가 구현했다(파일이 겹치지 않게 나눔). 이 세션이 라우터·메뉴·앱 연결과 브라우저 확인을 했다.

| 파일 | 내용 |
|---|---|
| `src/lib/server/admin-assets.ts` | `listAssetsForAdmin()`(끝에 더하기만): 141개 전부, 올린 때 최신순(같으면 ID). 썸네일은 새 자산 `w480`(없으면 가장 작은 변형), legacy는 원본. 스키마가 틀린 문서는 빼고 로그 |
| `src/pages/api/admin/assets/index.ts` | `GET /api/admin/assets` → `{ items }` |
| `src/admin/assets/AssetsScreen.tsx`, `AssetDetail.tsx` | 격자(정사각, `loading="lazy"`, 60칸 + 더 보기), 거르기(전체·쓰는 것·쓰지 않는 것·legacy·영상 + 수), 정렬(올린 때·크기). 영상은 칸에서 불러오지 않는다. 상세: 1024px 이상 오른쪽 패널(sticky), 미만 시트. 큰 미리보기·형식·크기·변형·쓰는 글(에디터 링크)·주소 복사(`![](…)`)·지우기 |
| `src/admin/assets/asset-filter.ts`, `assets-api.ts` | 순수 함수(거르기·수·정렬·쪽·지울 수 있는지·바이트 글자·마크다운 한 줄), API 호출 |
| 지우기 | 쓰지 않는 새 자산만. 정리 API(`ids` 하나, `minOrphanDays: 0`) 시험 실행 → 확인 창(저장 경로) → 실행. legacy는 "main 병합 뒤에 정리합니다" 안내만 |

### 2.8 PR-B T6: 분류 (D1)

| 파일 | 내용 |
|---|---|
| `src/lib/taxonomy.ts` | 코드 `CATEGORIES`는 기본값으로 남긴다. 데이터를 받는 순수 함수(이름 끝 `In`): `defaultTaxonomy`, `hasCategoryIn`, `categoryLabelIn`, `normalizeTagIn`·`normalizeTagsIn`(데이터 동의어·별칭), 별칭 표(`addAlias`·`removeAliasesTo`·`removeAliasFrom`), `replaceTag`, 입력 검사(`checkCategoryKey`·`checkCategoryLabel`), `alignContentTaxonomy`(옛 판의 분류 맞추기). key 형식 `CATEGORY_KEY_PATTERN`(저장 문서), `NEW_CATEGORY_KEY_PATTERN`(만들기·바꾸기) |
| `src/lib/entry-schema.ts` | `categoryKeySchema`는 형식 검사(`[a-z0-9-]+`, 40자). `tagsSchema`는 정규화 형식만. `taxonomyDocSchema`(더하기) |
| `src/lib/entry-rules.ts` | `draftInputSchema.category` 형식 검사. `normalizeDraftInput(input, taxonomy)`: 데이터 동의어·별칭, 목록에 없는 카테고리 400. `checkPublishable`에 `taxonomy`(목록 검사). `nextVersionsForBulkEdit`. `CREATABLE_KINDS`에 project(T7). `parseRevisionNumber`(T8). `publicPathFor`는 `public-paths.ts`로 옮기고 다시 내보낸다 |
| `src/lib/server/taxonomy-store.ts` | `getTaxonomy()`: 공개는 메모 60초·실패면 기본값, 관리자 검사(`strict`)는 매번 읽고 실패면 503·깨진 문서 500. `readTaxonomyForAdmin()`: 카테고리별 글 수(초안 포함)·공개 수, 목록에 없는 key, 태그별 글 수, 별칭. `changeCategories()`(만들기·이름·key 바꾸기/합치기·지우기·글 옮기기), `renameTag()`(바꾸기·합치기). 한 트랜잭션: 분류 문서(version + 1) + 대상 글 초안·발행본 + `publishLog` 한 줄. 시험 실행(`dryRun`)은 대상 글만 돌려준다. 커밋 뒤 퍼지·백업 알림·부수 결과 기록 |
| `src/pages/api/admin/taxonomy/index.ts`, `categories.ts`, `tags.ts` | `GET`, `POST {op, …, baseVersion, dryRun?}`, `POST {from, to, baseVersion, dryRun?}`. version이 다르면 409 `TAXONOMY_CONFLICT` |
| `src/lib/server/cdn-purge.ts` | `purgePublicCacheMany(ids)`: 글 태그 50개씩 + 목록 태그 한 번 |
| 공개 코드 | `server/entries.ts`(카테고리 이름을 데이터에서), `blog-list.ts`(`buildCategoryTabs(posts, order)`: 분류 순서, 이름은 글 값), `BlogList.astro`, `sitemap-posts.xml.ts`, `content-posts.ts`·`public-paths.ts`·`CategoryTabs.astro`(타입 `string`). OG 라벨은 `getPublishedEntryById`의 `categoryLabel`(데이터) |
| `src/pages/blog/category/[key].astro`, `blog/tag/[tag].astro` | 목록에도 글에도 없는 key·태그가 별칭에 있으면 301(CDN 캐시 헤더) |
| `src/admin/taxonomy/TaxonomyScreen.tsx`, `taxonomy-api.ts` | 카테고리 줄(이름·key·동의어·글 수·공개 수·⋯), 태그 줄, 옛 주소(별칭) 목록. 새 카테고리·이름 바꾸기는 바로 실행. key 바꾸기·합치기·글 옮기기·지우기·태그 바꾸기는 시험 실행 → 대상 글 목록·수 확인 창 → 실행. 바꾼 뒤 분류와 글 목록을 다시 받는다 |
| 에디터 | `MetaPanel.tsx`: 카테고리 칸은 API 목록(받지 못하면 코드 기본값), 목록에 없는 key는 "(목록에 없음)", 맨 아래 "+ 새 카테고리"(이름·주소 key). 태그 칸 기존 태그 제안(`datalist`), 입력은 데이터 별칭으로 정규화. `class-options.ts`: 열 때 분류·연재 선택지를 한 번 받는다 |
| `src/admin/home/HomeScreen.tsx`, 목록 API | `AdminListItem.categoryLabel`(데이터 이름). 검색·분류 칸이 쓴다 |
| `src/admin/log/LogScreen.tsx`, `src/lib/publish-log.ts`, `server/publish-log.ts` | 새 동작 이름(category·recategorize·retag·series·restore), 줄 칸 `op`·`from`·`to`·`affected`. 분류·연재 줄은 설명과 "글 N편"을 보인다 |
| `src/pages/api/admin/posts/[id]/retry.ts` | 분류·연재 줄(글이 아닌 ID)의 "다시 비우기"는 마지막 줄의 대상 글과 목록을 비운다 |

### 2.9 PR-B T7: 연재·프로젝트 (D2)

| 파일 | 내용 |
|---|---|
| `src/lib/server/admin-series.ts` | `listSeriesForAdmin()`: `seriesMeta` 문서 + 글의 연재 key(문서 없는 key는 제목 null), 편 목록·공개 수. 프로젝트(대표 순서) 먼저. `updateSeriesMeta()`: 버전은 문서 `updateTime`, 다른 칸 보존, 프로젝트 칸은 프로젝트 문서만. `createProject()`: `seriesMeta`(project 칸, 순서 = 최댓값 + 1) + 첫 Part 초안 한 트랜잭션. `deleteSeriesMeta()`: 글 0편일 때만. 바꾸면 그 연재의 공개 글·목록 퍼지와 `series` 줄 |
| `src/pages/api/admin/series/index.ts`, `series/[key].ts`, `projects.ts` | `GET`, `PUT`·`DELETE`(버전 검사 409 `SERIES_CONFLICT`), `POST` 201 |
| `src/lib/server/admin-entries.ts` | `newEntryDoc(kind, now, series)`, `assertValidNewEntry`(새 프로젝트가 트랜잭션 안에서 쓴다) |
| `src/admin/series/SeriesScreen.tsx`, `series-api.ts` | 목록(제목 없음 표시, 종류, 대표, 편 목록 접기·에디터 링크), 정보 고치기(제목·설명, 프로젝트면 긴 설명·태그·기술·GitHub·데모·기간·순서·대표), 새 프로젝트(→ 앱 목록에 빈 줄 → 에디터), 지우기 |
| 에디터 | 메타 패널 연재 key 칸이 기존 key를 제안한다(제목·프로젝트 표시) |

### 2.10 PR-B T8: 리비전 (D3)

| 파일 | 내용 |
|---|---|
| `src/lib/server/admin-entries.ts` | `listRevisions`(본문 없음, 최신 먼저, 지금 발행본 표시), `getRevision`(본문 포함), `restoreRevision`(초안 = 그 판 + 지금 분류에 맞춤, 버전 + 1, 충돌 409, `restore` 줄, 자산 사용 기록). 발행본·리비전은 그대로 |
| `src/pages/api/admin/posts/[id]/revisions/index.ts`, `[rev].ts`, `[rev]/restore.ts` | `GET`, `GET`, `POST {baseVersion}`. 판 번호가 틀리면 400 |
| `src/editor/ui/RevisionsDialog.tsx` | 목록(판·시각·제목) → 미리보기(미리보기 모드 렌더) → "초안으로 가져오기"(지금 발행본이면 꺼짐). 넓은 화면 2단, 좁은 화면 위아래 |
| `EditorApp.tsx`, `TopBar.tsx`, `commands/registry.ts` | 상단 ⋯ 메뉴 "이전 발행본"(발행본이 있을 때), 팔레트 명령 `revisions`(키 없음). 가져오기는 초안 버리기와 같은 길: 확인 → 저장 멈춤·비우기 → API → 다시 열기(보관함 지움). 충돌이면 충돌 창 |

### 2.11 PR-B 검증 도구와 테스트

| 파일 | 내용 |
|---|---|
| `tests/unit/taxonomy-store-rules.test.ts`(29) | 첫 저장 값 = 코드 10개, 이름·key 찾기, 데이터 정규화·동의어, 별칭 표(잇기·되돌리기·지우기), 태그 합치기, 입력 검사, 저장 스키마(형식만), 초안 저장·발행 검사(목록 밖 400), 일괄 바꾸기 버전, 옛 판 분류 맞추기, 판 번호 |
| `tests/unit/admin-asset-filter.test.ts`(24) | 거르기 5종·수, 정렬 2종·동률·빈 날짜, 60칸 쪽, 지울 수 있는지, 바이트 글자, 마크다운 한 줄 |
| `admin-router`(+1, 고침), `blog-list`(+1, 고침), `editor-commands`(고침), `publish-log-alerts`·`admin-list-filter`(줄 모양) | 새 화면 주소, 탭 순서 인자, 명령 `revisions` |
| `scripts/smoke/stage5-admin.mjs` | PR-B 검사를 더했다(223건). 8 이미지(목록 수·모양·정렬·썸네일, 시험 이미지 올리기 → 쓰지 않음 → 시험 실행 → 지우기 → Storage 0, legacy 후보 아님), 9 분류(만들기, 첫 저장 = 기존 10개, 중복·형식·낡은 version, 목록 밖 카테고리 저장 400, 이름, key 바꾸기 시험 실행·실행·버전·옛 주소 301·기록, 글 옮기기, 합치기·별칭, 쓰는 카테고리 지우기 409, 태그 바꾸기·옛 주소 301·동의어 400·되돌리기, 지우기), 10 연재(목록, 새 프로젝트·중복 409·형식 400, 고치기 409·400·200, 첫 Part 발행 → `/projects`·302, 지우기 409·200, kind project 새 글), 11 리비전(목록·한 판·404·400, 가져오기 409·200, 초안 버리기). 정리: 시험 이미지(Storage·문서), 시험 연재 정보, 분류·연재 줄, 분류 문서의 시험 값. 끝에 `assets`·`seriesMeta` 수와 분류 문서(시험 값 없음, 기존 10개 있음)도 본다 |

### 2.12 PR-C T9: 이미지 세부 조절 (D13)

작업 분담: T9는 서브에이전트가 구현했다(파일이 겹치지 않게 나눔). 이 세션이 설계 세부를 정해 주고, 변경을 읽고, 찾기 플러그인 연결·브라우저 확인을 했다.

| 파일 | 내용 |
|---|---|
| `src/editor/markdown/image-html.ts`(새) | 원시 HTML 두 모양 읽기·쓰기. 폭(16~4096 정수)·정렬(center·right) 맞추기. "이미지만 있는 단락" 판정(`soloImageIndex`)과 그 단락을 둘 수 있는 자리(`canHoldImageLayout`: 문서·인용·콜아웃·목록 항목, 체크 항목 첫 단락과 표 칸은 아님). 순수 모듈(Node 스크립트가 가져온다) |
| `src/editor/markdown/to-doc.ts`, `from-doc.ts` | 블록 `html`이 두 모양이면 이미지 하나만 있는 단락으로 읽는다(속성은 값이 있을 때만). 이미지만 있는 단락이고 폭·정렬이 있으면 HTML 블록으로 쓴다. 그런 단락이 다른 블록과 같은 목록 항목에 있으면 느슨한 목록으로 쓴다 |
| `src/editor/extensions/index.ts` | 이미지 `width`(숫자)·`align` 속성. HTML에는 `data-width`·`data-align`으로 쓰고 읽어 에디터 안 복사·붙여넣기에서 남는다. 바깥 HTML의 `width`는 읽지 않는다(리뷰 S2) |
| `src/editor/ui/image-layout.ts`(새) | 데코레이션 플러그인: 이미지만 있는 단락에 `editor-image-solo`·`data-align`. 문서가 바뀔 때만 다시 계산. 끌기 계산(`dragImageWidth`·`dragDelta`) |
| `src/editor/ui/ImageNodeView.tsx` | 메뉴에 "폭(px)" 입력·정렬 3단추, 저장하지 않는 경우의 알림. 오른쪽(오른쪽 정렬이면 왼쪽) 가장자리 끌기 손잡이(10px 단위, 최대 본문 폭, 터치 기기는 숨김). 속성을 바꿔도 이미지 선택을 지킨다 |
| `src/editor/editor.css` | 단락 안 폭·정렬, 손잡이, 알림 |
| `src/lib/content/rehype-assets.ts` | `sizesFor()`: 최대 변형에 작성자 폭 W(< 720)가 있으면 `(max-width: Wpx) 100vw, Wpx` |

### 2.13 PR-C T10: 키맵 설정 (D14)

| 파일 | 내용 |
|---|---|
| `src/editor/commands/command-keys.ts`(새) | 명령 표: id·이름·묶음·범위·기본 키. 기본 키 문자열은 이 파일에만 있다. 순수 데이터라 서버·설정 화면이 아이콘·Tiptap 없이 읽는다 |
| `src/editor/commands/registry.ts` | 명령마다 표의 칸(`commandSpec(id)`)에 실행·아이콘·메뉴 표시를 더한다. 새 명령 `block-move-up`·`block-move-down`·`find`. 화면 동작 `openFind` |
| `src/editor/commands/keymap.ts` | `KeyBinding`의 플랫폼 값이 null일 수 있다(그 플랫폼만 키 없음) |
| `src/editor/commands/keymap-settings.ts`(새) | 키 하나 검사(형식, 수식 키, Mod+Alt, 막는 키, Win 키), 설정 전체 검사(모르는 명령, 적용 뒤 충돌), 기본값과 같은 줄 빼기, 이 기기 플랫폼 키만 바꾸기·되돌리기, 키 잡기(눌린 키 → 키 문자열, 글자는 키보드 자리로) |
| `src/editor/commands/shortcuts.ts` | `RegistryShortcuts`를 `handleKeyDown` 플러그인으로 바꿨다. 키를 누를 때 명령 목록을 읽고, 목록이 바뀌었을 때만 판정기를 다시 만든다 |
| `src/lib/entry-schema.ts` | `editorSettingsDocSchema`(모양만) |
| `src/lib/server/admin-settings.ts`(새), `src/pages/api/admin/settings/editor.ts`(새) | `GET`·`PUT { keymap, baseVersion }`. 검사 실패 422 `INVALID_KEYMAP`(줄마다 `field`·`code`·`message`·`ids`), version이 다르면 409 `SETTINGS_CONFLICT`. 트랜잭션. 기본값과 같은 줄은 빼고 저장. 깨진 문서는 빈 keymap + `problem: 'invalid'` |
| `src/admin/settings/SettingsScreen.tsx`·`KeyCapture.tsx`·`settings-api.ts`(새) | 묶음별 표(명령 · 지금 키 · 기본 키 · 바꾸기·지우기·기본값으로). 이 기기 플랫폼 키만 고친다. 막는 키는 그 줄에 이유, 충돌은 빨간 줄과 저장 단추 끔. 다른 플랫폼·옛 명령의 문제는 머리 알림과 "이 줄들을 기본값으로". 409면 다시 받는다 |
| `src/admin/router.ts`, `AdminNav.tsx`, `AdminApp.tsx`, `app-context.ts` | `/admin/settings`와 메뉴 "설정"(맨 끝). 컨텍스트에 `registerLeaveGuard`(설정 화면의 저장하지 않은 변경, 리뷰 B10) |
| `src/editor/ui/EditorApp.tsx` | 열 때 설정을 한 번 읽어 적용. 읽지 못하거나 값이 틀리면 기본 키 + 띠 |

### 2.14 PR-C T11: 자동 재시도·블록 이동·찾기·바꾸기 (D15 1, D6, D7)

| 파일 | 내용 |
|---|---|
| `src/editor/state/save-controller.ts`, `autosave.ts` | 네트워크 오류·5xx면 2·5·15초 뒤 세 번 다시 보낸다(네트워크 오류는 매번 먼저 기기에 보관). 기다리는 동안 상태 `retrying`과 몇 번째인지. 다 실패하면 지금처럼 멈춘다(5xx error, 네트워크 offline). 409·413·422와 그 밖의 4xx는 다시 보내지 않는다. 성공·"다시 시도"·충돌·초기화에서 횟수 0 |
| `src/editor/commands/move-block.ts`(새) | 블록 한 칸 옮기기 트랜잭션. 목록 항목은 항목 단위, 표는 표 전체, 고른 블록 노드(구분선 등) 그대로. 못 옮기면 감싼 블록. 선택은 블록과 함께 간다 |
| `src/editor/commands/history-step.ts`(새) | 블록 이동·바꾸기를 되돌리기 한 단계로 보낸다(앞·뒤 입력과 묶지 않는다, 리뷰 B5) |
| `src/editor/ui/find.ts`(새), `FindBar.tsx`(새) | `prosemirror-search` 1.1.1을 붙이고, 찾은 수("2 / 5", 1000 한도)·질의 만들기·바꾸기(`closeHistory`)·결과로 스크롤. 막대: 찾기 칸(Enter 다음, Shift+Enter 이전), 대소문자·정규식, 바꾸기 칸·"바꾸기"·"모두 바꾸기", Esc·닫기. 열 때 짧은 선택을 미리 넣는다. 닫으면 강조를 지운다 |
| `src/editor/ui/editor-extensions.ts`, `editor.css` | 검색 플러그인 연결, 찾은 곳 강조 |
| `src/editor/ui/MobileBar.tsx` | 블록 위·아래 단추(9개) |
| `src/editor/ui/EditorApp.tsx` | 찾기 막대 열고 닫기(편집 모드 밖으로 가면 닫음), 재시도 상태 표시와 "다시 시도", 온라인 복귀면 기다리지 않고 보낸다 |
| `package.json` | `prosemirror-search` 1.1.1(MIT). ProseMirror 판은 한 벌씩이다(`prosemirror-view` 1.42.9, `-state` 1.4.4, `-model` 1.25.13) |

### 2.15 PR-C 검증 도구와 테스트

| 파일 | 내용 |
|---|---|
| `tests/unit/editor-image-attrs.test.ts`(74 → 리뷰 뒤 78) | 두 모양 읽기·거부·쓰기·왕복, 단락 판정, 스키마 속성(바깥 `width` 무시), 데코레이션, 끌기 계산, 세미콜론 없는 참조, 체크 항목의 빈 첫 단락 |
| `tests/unit/editor-keymap-settings.test.ts`(25 → 29) | 명령 표 = 레지스트리, 키 하나·전체 검사, 줄 빼기, 플랫폼 키 바꾸기, 키 잡기(한글 입력 상태 포함) |
| `tests/unit/editor-move-block.test.ts`(10 → 12) | 단락·제목·목록 항목·인용·콜아웃·코드·표·구분선, 감싼 블록, 키·되돌리기 한 번에 한 칸 |
| `tests/unit/editor-find.test.ts`(10 → 13) | 찾은 수·대소문자·정규식·오류·한도, 바꾸기, 모두 바꾸기 뒤 Mod+Z 한 번, 미리 넣는 글자, 강조 지우기, Mod+F 페이지 범위 |
| `editor-save-controller`(+7), `editor-autosave`(+2), `editor-shortcuts`(+1), `content-assets`(+3), `editor-markdown`(+2, fixture `tests/fixtures/markdown/image-layout.md`), `admin-router`(+1, 고침), `editor-commands`(고침) | 자동 재시도, 열린 에디터에 키 설정 적용, `sizes`, 설정 주소 |
| `scripts/smoke/stage5-admin.mjs` | 12 설정(읽기·401·409·422 다섯 종류·400·403·저장·줄 빼기·기본값으로, 끝에 처음 상태로), 13 이미지 HTML 시험 글 발행 → 공개 페이지에 `<p align="center"><img … width="480">`·`<img … width="320">` |

### 2.16 PR-D T12: 독자 흐름 (D20)

| 파일 | 내용 |
|---|---|
| `src/lib/tracker/events.ts`(새) | 이벤트 종류·한도·검사(`parseTrackBody`)·정규화(경로·들어온 곳·검색어·바깥 링크)·로봇 User-Agent·Origin·저장 판단(`trackStoreDecision`)·서울 날짜. zod·`@/` 별칭 없음(브라우저 번들 크기, 스모크가 Node로 직접 가져온다). 구조 오류는 요청 전체 거부, 드문 실제 값은 고쳐 받거나 그 이벤트만 버림(리뷰 뒤) |
| `src/lib/tracker/daily.ts`(새) | 순수 함수: 요청 하나의 이벤트 → readerDaily에 더할 수(`dailyIncrementsOf`), 날짜 문서들 → 사이트 요약·글 요약·글별 방문 수, 비율·떠난 수 |
| `src/lib/tracker/client.ts`(새) | 공개 페이지 수집 스크립트. 탭 세션 방문 ID(sessionStorage, 30분 쉬면 새 방문), view·404는 열 때(bfcache 복원 때도), read·out·pdf·copy·search는 떠날 때 `sendBeacon`(페이지당 2번까지). 요청 하나 = 한 페이지(경로·글 ID는 본문에 한 번), 떠날 때 이벤트 10개까지. 관리자 표시(`<body data-admin>`)·webdriver면 돌지 않는다 |
| `src/lib/server/reader-store.ts`(새) | 저장(원본 줄 N개 배치 → 날짜 요약 increment. 요약이 실패해도 원본 줄은 남는다), 발행 글 메모 목록 검사(`keepKnownEntries`), 날짜 요약 읽기(문서 ID 범위), 90일 정리(500개씩 10번까지), 방문 경로 예(10개, 그 글을 처음 연 줄), 글별 30일 방문 수, 기간 검사(30·90) |
| `src/pages/api/track.ts`(새) | `POST /api/track`. Origin → 크기 → 검사 → 로봇 → 저장 판단 → 저장. 204·400·403·413·405·503. 쿠키를 읽지도 쓰지도 않는다. no-store |
| `src/pages/api/admin/readers/index.ts`·`[id].ts`(새) | `GET /api/admin/readers?days=30|90`(사이트 요약), `GET /api/admin/readers/{글 ID}?days=`(글 요약 + 경로 예). 열 때마다 90일 지난 원본 줄 정리 |
| `src/lib/server/admin-entries.ts` | 목록 API `readers30` = 최근 30일 방문 수(기록 없으면 0, 요약을 읽지 못하면 null) |
| `src/admin/readers/ReadersScreen.tsx`·`EntryReaders.tsx`·`BarChart.tsx`·`ReaderParts.tsx`·`readers-api.ts`(새) | `/admin/readers`: 수 칸 5개, 날짜별 방문 막대(30·90일, "날짜별 값 보기" 표), 많이 읽힌 글, 들어온 곳, 블로그 안 검색어(0건 먼저), 없는 주소. `/admin/readers/<글 ID>`: 수 칸 7개(방문·조회·75%·끝까지·떠남·바깥 링크·코드 복사), 막대, 들어온 곳, 다음 글, 전 글, 방문 경로 예 |
| `src/admin/router.ts`, `AdminNav.tsx`, `AdminApp.tsx` | `/admin/readers`·`/admin/readers/<id>`. 메뉴 "독자"(연재와 출간 기록 사이, Plan D10의 7개가 모두 있다). 글 하나의 독자 화면에서도 "독자"가 지금 화면이다 |
| `src/admin/home/EntryTable.tsx` | 독자 열은 `readers30`. 행 메뉴 "독자 보기"(초안이 아닌 글) |
| `src/layouts/BaseLayout.astro` | 관리자 표시 인라인 스크립트를 한 줄로 줄이고 `<body data-admin>`을 단다(판정은 전과 같다). 그 뒤에 수집 모듈(빌드가 인라인한다) |
| `src/components/post/PostArticle.astro`, `src/components/NotFound.astro` | `<article data-entry-id>`, `<section data-not-found>` |
| `src/pages/about.astro` | 맨 아래 "이 사이트는 쿠키·개인정보 없이 익명 방문 수를 셉니다." |

### 2.17 PR-D 검증 도구와 테스트

| 파일 | 내용 |
|---|---|
| `tests/unit/tracker-events.test.ts`(새, 28) | 받는 것(글 페이지·글 아닌 페이지·404·한글 글 ID·노트 목록 복사·드문 실제 값 고쳐 받기·바깥 링크 버림·검색어 5개·짧아지는 검색어 버림), 거부(JSON·방문 ID·크기·이벤트 수·경로 구조·글 ID·view 2개·순서·종류·read·copy·out·search·들어온 곳), 정규화, 로봇(CUBOT은 사람)·Origin·저장 판단(시험 표지는 localhost만), 브라우저 한도(2번, 4 KB 보장), 서울 날짜 |
| `tests/unit/reader-daily.test.ts`(새, 14) | 더할 수(첫 페이지·다음 페이지·새로 고침·글 → 목록·read·out·pdf·copy·search·404·300자 key·점과 빗금 key), 모르는 글 ID(copy는 사이트 수로), 사이트·글 요약(빈 날, 0건 먼저, 다음·전 글, 읽음·떠남), 30일 방문 수, 깨진 문서, 비율 |
| `tests/unit/admin-router.test.ts`(+3, 고침 1) | 독자 주소, 틀린 글 ID, 링크 클릭 |
| `scripts/smoke/stage5-track.mjs`(새) | localhost에서만 돈다. 검사 거부 17종·413·403(Astro checkOrigin과 처리기)·405, 드문 실제 값은 받음, 운영 호스트가 아니면 저장 안 함(보통 방문·Origin 없음·X-Forwarded-Host 흉내·로봇), 시험 방문 2개의 요약 = `dailyIncrementsOf` 기대값(노트 목록 복사 포함), 원본 줄 칸(IP·UA 없음), 관리자 독자 API(401·400·30·90일·요약·글 요약·경로 예), 목록 `readers30`, 90일 정리 경계. 끝에(실패·Ctrl+C에도) 시험 표지 줄을 지우고, 요약 문서에서 이 실행이 더한 수를 뺀다(0이 된 칸·빈 문서를 지운다). 오늘 요약 문서가 이미 있거나 서울 자정 5분 안이면 저장 시험을 건너뛴다 |
| `scripts/smoke/stage4-public.mjs` | 10절: 모든 공개 페이지의 관리자 표시 + 수집 스크립트(인라인 모듈 1개, `import` 없음, 합 2 KB 안), 글 상세 `data-entry-id`·`#post-body`, 404 화면(정적·SSR) `data-not-found`, `/about` 안내 한 줄. 개발 서버는 모듈이 실렸는지만 본다 |
| `scripts/smoke/stage5-admin.mjs` | 목록 `readers30` 기대값: null → 0 이상 정수 |

### 2.18 PR-E T13: 측정과 처방 (D16·D17)

| 파일 | 내용 |
|---|---|
| `src/lib/server/server-timing.ts`(새) | `Server-Timing` 헤더. `ServerTiming`(`measure`·`measureSync`·`add`·`header`), `formatServerTiming`(이름은 토큰만, 설명은 ASCII만). `total` = 측정을 만든 때부터 헤더를 쓸 때까지. `inst` = 이 인스턴스에서 몇 번째 측정인지(desc `req N`)와 프로세스 나이(dur) |
| `src/pages/blog/[...slug].astro`, `notes/[slug].astro`, `projects/[project]/[slug].astro` | `db`(글 찾기), `render`(본문 렌더 전체), `adj`·`series`·`project`(옆 글·연재·프로젝트 정보 읽기), `total`, `inst` |
| `src/lib/server/render-entry.ts` | 실제로 그린 요청에만 `assets`(자산 문서 읽기)·`hl`(하이라이터 준비)·`md`(마크다운 변환, 코드 하이라이트 포함)를 남긴다. 자산 읽기와 하이라이터 준비를 함께 기다린다. 하이라이터는 `getServerHighlighter(markdown)`다 |
| `src/lib/server/code-highlighter.ts`(새) | 서버 하이라이터(D16, 사용자 결정 2026-11-11). Shiki Oniguruma 엔진(`shiki/wasm`, JS 안에 넣은 wasm)을 인스턴스마다 한 번 만든다. 글에 나온 언어의 문법만 `import()` + `loadLanguage`로 더한다. 같은 언어를 두 요청이 함께 불러오지 않는다. 실패는 기억하지 않는다 |
| `src/lib/content/shiki-languages.ts` | `CodeHighlighter` 타입(옮김), 문법 파일 20개(`SITE_GRAMMARS`)와 이름·별칭 표, `grammarForLanguage`, `grammarsInMarkdown`(펜스 여는 줄과 원시 HTML의 `language-…`를 넉넉히 찾는다), `codeHighlighterFromCore`(코어 → `toPre`. 언어 판정은 부를 때마다 지금 등록된 언어로 한다) |
| `src/lib/content/highlighter.ts` | 에디터 미리보기와 테스트용으로 남긴다(JS 엔진, 언어 20종). 서버 공용 `getSiteHighlighter`는 지웠다 |
| `src/lib/server/og-image.ts`, `src/pages/og/[id].png.ts` | `db`·`title`(프로젝트 제목)·`imp-satori`·`imp-resvg`·`font`·`satori`·`resvg`·`total`·`inst`. 404에도 헤더를 붙인다. resvg 네이티브 판을 불러오는 동안만 `process.report.excludeNetwork`를 켜고, 끝나면 원래 값으로 돌린다(D17, 사용자 결정 2026-11-11) |

### 2.19 PR-E T14: MCP 도구 삭제 (D8)

| 대상 | 내용 |
|---|---|
| `tools/cruz-lab-knowledge-mcp/` | 지웠다(server.mjs, README, TEST_RESULT). `tools/` 폴더도 없어졌다 |
| `package.json`, `pnpm-lock.yaml` | `mcp:knowledge` 명령과 `@modelcontextprotocol/sdk` 의존성을 지웠다. 잠금 파일에서 이 SDK만 쓰던 패키지 53개가 빠졌다. `inherits`·`wrappy`는 `optional` 표시만 바뀌었다. 다른 패키지의 판은 바뀌지 않았다 |
| `~/.codex/config.toml`(저장소 밖, E1) | `[mcp_servers.cruz-lab-knowledge]` 3줄과 뒤의 빈 줄을 지웠다(사용자 확인 2026-11-11). 지우기 전 사본을 scratchpad에 두었다. 다른 줄은 바꾸지 않았다(diff로 확인) |
| `README.md` | 도구 설명(기술 표 1행, 문단 1, 디렉터리 1행, MCP 기술 1행)은 그대로 둔다. main 병합 준비의 설명 문서 최종본 몫이다(감사 문서 11.3의 5) |

`tests/unit/project-to-entry.test.ts`의 slug 문자열 `cruz-lab-knowledge-mcp`는 시험 값이라 그대로 둔다(Plan D8).

### 2.20 PR-E 검증 도구와 테스트

| 파일 | 내용 |
|---|---|
| `tests/unit/server-timing.test.ts`(새, 8) | 헤더 형식(소수 한 자리, 설명의 ASCII 밖 글자·따옴표, 토큰이 아닌 이름, 음수·NaN, Headers가 받음), 실패해도 시간을 남김, total·inst, req 순서 |
| `tests/unit/code-highlighter.test.ts`(새, 9) | C 글은 C 문법만 불러옴, 모르는 언어는 민무늬, 드롭다운 20종 ↔ 문법 파일 20개, 표 = 문법 파일의 name·aliases, 별칭·기존 글 이름·대소문자, `grammarsInMarkdown`(\`\`\`·~~~, 목록·인용 안, 원시 HTML class, 중복 없음), 두 엔진의 HTML이 같음(SQL 빼고, 5절 141), 서버는 SQL 함수 이름을 칠함 |
| `tests/unit/og-template.test.ts`(+1) | timing 단계 5개, 불러온 뒤 `excludeNetwork`가 원래 값 |
| 측정 도구(저장소 밖, scratchpad) | 빌드 결과 함수를 새 프로세스로 띄워 첫 요청만 CPU 프로파일로 잡는 스크립트와 묶음별·함수별 분석 스크립트, 새 프로세스에서 경로를 차례로 불러 TTFB·Server-Timing을 적는 스크립트, Shiki 변형별·OG 변형별 벤치, 발행 글 전체 엔진 비교. 운영 데이터는 읽기만 했다 |

### 2.21 T16: 문서 PR

4단계 T9(PR #18)와 같은 방식이다. 문서만 담는 PR이고 대상은 `rebuild`다. 새 세션(전역 7번 규칙)이 PR #26 병합을 확인하고 `origin/rebuild` `5c6ba0c`에서 브랜치 `stage5/docs`를 만들었다. 코드·테스트·스크립트·`package.json`은 바꾸지 않았다.

| 파일 | 내용 |
|---|---|
| 이 문서 | 머리(날짜·브랜치·상태 "5단계 끝"), 1절 표(PR-E 병합 커밋, PR 링크 커밋, 병합 뒤 미리보기 행, T16 행, E3 상태, 5단계 끝 데이터), 이 절, 7절을 main 병합 준비 인계 형태("끝난 것 / 다음 것 / 열린 질문")로, 8절에 처리 시점 표시 |
| 감사 문서 `2026-11-06-blog-architecture-audit-2-problems-and-plan.md` | 11절 표의 5단계 행을 완료로, 11.11 마무리, 11.3 "main 병합 직전에 할 일"의 5단계 몫(3·5·7·8 보강, 10~12 새 항목), 8.3의 5단계 행에 "5단계 끝" 한 줄 |
| Plan `2026-11-10-stage5-admin-app-plan.md` | 머리(상태), 14절(본문 미리 계산 행에 PR-E 측정값), 15절(PR-B 머리의 PR 링크, T16 판단 65~67, 5단계 끝 상태) |

PR #18과 비교해 더한 것: 다음 단계가 6단계가 아니라 main 병합 준비라서, 8.3의 다음 단계 행 대신 11.3에 5단계에서 이어받는 것을 모았다(10 병합 전 확인, 11 상기 목록·열린 질문 보이기, 12 병합 뒤 정리).

11.3 확인: 5단계 Plan과 이 문서에서 "main 병합"·"병합 뒤"·"병합 전"·"사용자 몫"을 찾아 11.3과 대조했다. 더한 것:

1. 3(설명 문서): 5단계로 낡은 README 곳(관리자 화면 설명, 실행 명령의 `pnpm mcp:knowledge`).
2. 5(MCP 도구 문서): README의 도구 언급을 모두 적었다. 이전 목록은 4곳이었고 실제는 8곳이다(`5c6ba0c` 기준).
3. 7(운영 콜드): 공개 응답 Server-Timing을 둘지 정하는 시점(8절 11).
4. 8(독자 흐름 첫 수집): 저장은 Host가 `www.cruzlab.dev`일 때만이다(`PRODUCTION_HOST`). 공개 스크립트 크기를 다시 잰다(8절 9).
5. 10(새): PR-B~PR-D 몫 미리보기 확인, 사용자 몫(로그아웃 뒤 "고치기", D18), E3. 5단계에서 하지 않았다.
6. 11(새): 5단계 Plan 14절 상기 목록과 이 문서 8절 열린 질문을 병합 준비 세션이 한 번 보인다(Plan 14절 머리).
7. 12(새): 병합 뒤 정리에 더할 것. 원격의 병합 끝난 브랜치(3단계 6개, 4단계 7개, 5단계 `stage5/*` 7개. 5단계는 문서 PR 포함), Secret Manager `GITHUB_TOKEN`(2단계 E6), 쓰지 않는 legacy 자산 26개(Plan 1.1). 마지막 것은 Plan 2.3이 "2단계 Plan 15절"에 있다고 적었지만 그 절에 없다.

하지 않은 것: `README.md`·`PUBLISHING.md`·`.env.example`(4단계 D5 답, main 병합 준비 몫). 이전 7절 7이 적은 "시각 문서"(HTML)는 만들지 않았다. Plan 7절 T16의 범위가 아니고, 4단계 T9·3단계 T10도 만들지 않았다. E3, 병합 뒤 미리보기 확인, D18(사용자 확인 뒤, 11.3의 10). 8절 질문은 풀지 않았다. 기존 기록(2.1~2.20, 4·5·6절)은 고치지 않았다.

검증: `git diff --stat 5c6ba0c`는 문서 3개뿐이다. 문서에 적은 커밋 해시·PR 번호·병합 커밋을 `gh pr view`(#21~#26)와 `git log`로 확인했다. 수치(테스트 918, 스모크 252/252·178/178, API 106/106, 왕복 69/69, 공개 점검 1,380/0 + 324/0, 공개 스크립트 2,038바이트, 데이터 끝 수)를 4.17과 대조했다. 세 문서의 상대 경로 링크와 `#` 앵커를 스크립트로 검사했다(깨진 것 0. 11.11 제목에 끝 날짜를 붙여 바뀐 앵커는 이 문서 머리에서 고쳤다). `pnpm lint` 통과(문서만 바뀌어 결과가 같다). 코드 변경이 없어 테스트·빌드는 다시 돌리지 않았다.

## 3. 외부 변경

없다. 규칙·인덱스·환경 변수·Vercel·버킷 CORS를 바꾸지 않았다. 새 비밀값이 없다. 데이터는 `publishLog` 칸 더하기(`title`·`purge`·`backup`·`assetUsage`·`retried`, 새 `action` `retry`)뿐이다(Plan 4.3).

PR-B(2026-11-11): 데이터 `settings/taxonomy` 문서가 생겼다(스모크 첫 실행). 정리 뒤 값은 코드 기본 카테고리 10개 그대로이고 별칭이 없다(4.9). `publishLog` 칸 `op`·`from`·`to`·`affected`·`previous`와 새 `action`(category·recategorize·retag·series·restore)을 더했다. **E3(백업 저장소 `scripts/export.mjs`에 `settings` 한 줄)은 하지 않았다.** 다른 저장소 PR이라 사용자 확인 뒤에 한다(7절).

PR-D(2026-11-11): 외부 변경 없음. 새 컬렉션 `readerEvents`·`readerDaily`는 시험 때만 생겼고 끝에 0이다. 규칙·색인을 바꾸지 않았다(새 컬렉션은 규칙에 없어 클라이언트 접근이 막힌다).

PR-E(2026-11-11):

1. E1: `~/.codex/config.toml`의 도구 등록 3줄을 지웠다(2.19). 되돌리기는 Plan 9.3(그 줄을 다시 넣고 도구 폴더를 git에서 되살린다).
2. E2: 할 일이 없다. Vercel 대시보드(Settings → Functions)에서 Fluid compute가 이미 "Enabled"였다(읽기만 했다).
3. 측정용으로 작업 브랜치 `stage5/e-perf`를 세 번 푸시했다(사용자 허락 2026-11-11). Vercel이 미리보기 배포 3개를 만들었다. PR·`rebuild` 푸시는 하지 않았다.
4. 데이터·규칙·환경 변수·Storage 경로는 바꾸지 않았다. D17 3번(Storage `og/` 저장본)은 하지 않았다(5절 145).

## 4. 검증 결과

### 4.1 자동 검사 (2026-11-11)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `npx tsc --noEmit` | 0(`astro sync`·빌드 뒤) |
| `pnpm test` | 622 통과(43 파일). 기준 580(39 파일) + 새 42. 전체 실행에서 시간에 민감한 기존 테스트 1건(`content-highlighter` 5초 시간 초과, `editor-paste-drop` 업로드 실패 표시)이 가끔 떨어졌다. 둘 다 이번에 고치지 않은 파일이고, 기계 부하(load average 9~25)가 높을 때만 났다. 같은 코드로 다시 돌리면 622/622. **리뷰 수정 뒤: 633 통과(44 파일, +11)** |
| `pnpm build` | 통과(경고는 기존 2개: 500 KB 넘는 청크, 로컬 Node 24). 리뷰 수정 뒤에도 통과 |
| 리뷰 수정 뒤 `pnpm lint`·`tsc` | 통과·0 |

### 4.2 스모크·왕복·공개 점검

| 항목 | 기준 | 결과 |
|---|---|---|
| `stage5-admin.mjs` | — | 개발 서버 4329에서 95/95(공개 입구 검사 더하기 전), 빌드 결과 4392에서 119/119. 끝에 `entries`·`publishLog` 수가 처음과 같다. **리뷰 수정 뒤 빌드 결과 4392에서 119/119** |
| `stage2-api.mjs`(`pnpm smoke:api`) | 105/105 | 106/106(개발 서버 4329). 기대값 1건을 D15 2에 맞게 고치며 검사가 1건 늘었다(5절 23). **리뷰 수정 뒤 106/106(개발 서버 4329, 세 번째 실행).** 앞의 실행 5번(빌드 결과 4392에서 3번, 개발 서버에서 2번)은 Google API 연결 끊김(`fetch failed`, Storage 시간 초과)으로 멈췄다. 매번 스모크의 finally가 시험 글·자산·Storage를 지웠다(수 세기로 확인) |
| 왕복 검사(`pnpm smoke:roundtrip`) | 69/69 | 69/69 |
| 공개 점검(`stage4-public.mjs` + 2단계) | 그대로 통과 | 빌드 결과 4392: 883/0 + 324/0. `/blog` HTML 90,709바이트(PR-D 90,181 → +528: 푸터 링크와 표시 스크립트). 개발 서버에서는 `/blog` 크기 검사 1건만 걸린다(개발용 속성, 4단계도 빌드 결과로 쟀다) |

### 4.3 번들 (빌드 결과)

| 파일 | 바이트 | gzip |
|---|---|---|
| `AdminApp.*.js`(앱 첫 청크) | 41,818 → 리뷰 수정 뒤 43,071 | 13,761 → 14,140 |
| `EditorApp.*.js`(에디터, 동적 import로만 연결) | 1,811,908 | 554,447 |
| `EditorApp.*.css`(KaTeX + 에디터) | 43,286 | 11,377 |
| `_path_.*.css`(관리자 앱 페이지 CSS) | 70,657 | — |
| `AdminLogin.*.js` | 160,556 | 34,462 |

- 앱 첫 청크가 정적으로 가져오는 것은 React 런타임 2개뿐이다. 에디터 청크는 `import()`로만 걸린다. 리뷰 수정 뒤에도 같다(빌드 결과의 import 문으로 확인).
- `/admin` HTML은 에디터 JS를 참조하지 않는다(스모크 검사). 에디터 CSS `<link>`는 싣는다(5절 17).
- 브라우저: 1280px `/admin`을 열었을 때 에디터·Tiptap·KaTeX 자원 요청 0(4.4 시나리오 1).
- 공개 페이지: `astro-island` 0 그대로(공개 점검). 관리자 표시 스크립트 273바이트(추적 스크립트는 PR-D, 둘의 합 2 KB 한도).

### 4.4 브라우저 확인 (개발 서버 4329, 앱 브라우저, Plan 8.4)

앱 브라우저에 사용자가 전에 localhost에서 로그인한 세션 쿠키가 남아 있었다(쿠키는 포트를 가리지 않는다). 그 세션으로 확인했다. 사용자 글은 열기만 하고 고치지 않았다. 로그아웃은 누르지 않았다(사용자 세션이 끊긴다).

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | `/admin` 1280px | 왼쪽 메뉴 200px, 내용 1,080px(최대 1,120), 이어 쓰기 3편, 표 69행. 에디터 자원 요청 0 |
| 2 | 검색·종류·정렬 | "pintos" → 즉시 5편, 주소 `?q=pintos`. 종류 프로젝트·정렬 발행일 → `?kind=project&q=pintos&sort=published`, 0편. 검색 지움 → 8편. 프로젝트 글 하나를 에디터로 열고 "← 목록" → 같은 거르기, 같은 문서(새로 고침 없음), 목록 API를 다시 부르지 않음 |
| 3 | 목록에서 글 열기 | 같은 문서 안에서 에디터가 열리고 본문에 커서. 요청은 그 글 하나(`GET /api/admin/posts/<id>`) |
| 4 | 입력 직후 목록으로 | `Shift+N`으로 시험 글을 만들고 제목 입력 → 바로 "← 목록" → 떠나기 전에 `PUT draft`(버전 2, 서버 제목 같음) → 목록 줄과 이어 쓰기 첫 칸이 새 제목. 목록을 다시 받지 않음 |
| 5 | 390px | 위 막대(☰·제목·새 글), 두 줄 행, 가로 넘침 0(scrollWidth 390). 시험 글 `⋯` → 숨기기 → 공개 주소 404, 탭 "숨김 1" → 다시 보이기 → 200 |
| 6 | 빈 초안 칩 | 시험 빈 project 초안 2편(Admin SDK) → 칩 "빈 초안 4"(사용자 2 + 시험 2). 종류 프로젝트 → 칩 2 → "모두 지우기" 확인 창 2편 → 지움. 사용자 빈 초안 2편과 초안 7편 그대로(수 세기로 확인) |
| 7 | 알림 띠 | 정상이면 없다. 시험 줄(`purge: failed`) → "캐시 비우기 실패 1건" → "다시 비우기" → API 200, 로컬이라 `skipped` → 안내 알림, 띠 남음(설계대로) → 성공 줄(`purge: ok`)을 넣고 다시 열면 띠가 사라짐. 실제 퍼지 성공으로 사라지는 것은 `rebuild` 미리보기에서 본다(8.6, 5절 11) |
| 17 | 푸터 "관리"·"고치기" | 표시가 없는 상태: 푸터 "관리"(nofollow) 보임, 글 상세 "고치기"는 `hidden`(display none). 표시를 넣으면 "고치기"가 머리줄 끝에 보이고, 누르면 `/admin/edit/<id>`. 앱을 연 뒤에는 앱이 표시를 남긴다(12.3일 = 세션 만료까지). 프로젝트 글에도 "고치기"가 보인다. 쿠키 없는 `/admin/log` → 로그인 화면 302(스모크). 로그인 화면 375px 확인. **로그아웃 뒤 "고치기"가 사라지는 것은 사용자 세션을 끊어야 해서 하지 않았다**(단위 테스트: `clearAdminHint`, 코드: 앱 로그아웃이 표시를 지운다) |

그 밖에 확인한 것: 출간 기록 화면(1024px, 지운 글 표시, 실패 빨간색, retry 줄 "다시 시도(캐시)"), 삭제 확인 창(제목, "공개 주소는 404가 됩니다"), 로그인 화면 1280·375px.

**리뷰 수정 뒤 확인(2026-11-11 02시, 개발 서버 4329, 같은 세션).** 시험 글 1편(`stage5-test 리뷰 확인`, `draft.device` `stage5-test`)을 페이지 안 `fetch`로 만들었다. 모두 같은 문서 안에서 했다(새로 고침 없음).

| 지적 | 확인 | 결과 |
|---|---|---|
| B2 | 에디터 미리보기에서 제목 앵커(`#둘째-제목`) 누름 | 주소의 hash만 바뀜. 기본 동작을 막지 않음. 에디터 그대로 |
| B6 | 에디터에서 처음 발행 → "← 목록" | 줄이 "발행", `⋯`에 "공개 페이지 보기"(`/blog/<slug>`). 목록 API를 다시 부르지 않음 |
| B1 | 발행한 시험 글에 한 글자 → 바로 "← 목록" | 떠나기 전 `PUT draft`(네트워크가 느려 20초). 줄에 "변경 있음"과 새 고친 때(02:08), 이어 쓰기 첫 칸 "발행 뒤 변경 · 02:08". 서버 `hasUnpublishedChanges` true, 버전 3 |
| B3 | `/admin?q=stage5-test`에서 메뉴 "글" → 뒤로 가기 | 검색 칸이 빈 값, 70행 → 뒤로 가기에서 `stage5-test`, 1행 |
| B7 | `⋯` → 숨기기 | "숨겼습니다. 공개 주소는 404입니다."(로컬 퍼지 `skipped`), 알림 요청 4 → 5, 공개 주소 404 |
| B9 | 삭제 확인 창 → Tab으로 "삭제" → 70초 넘게 기다림(1분 시계가 다시 그림) | 초점이 "삭제"에 남음. Esc로 닫힘 |
| B4 | 다른 곳에서 지움(API DELETE) → 목록에서 그 글 열기 | 에디터가 404를 받고 `/admin?q=stage5-test`로 돌아감. 줄이 빠짐 |
| B15 | 390px, 메뉴 시트 연 채 `Shift+N` | 새 글을 만들지 않음 |

브라우저로 확인하지 않은 것: B5("더 보기" 실패), B8(에디터 로그아웃, 사용자 세션이 끊긴다), B12(뒤로 가기 겹침), S8(보관함 글 남김), 캐시 비우기 실패 문구(로컬은 `skipped`). 코드와 lint·tsc로만 봤다. 앱 브라우저 창이 숨겨져 있어 `requestAnimationFrame`이 돌지 않았다. 그래서 열 때 본문 초점(5절 5)은 이번에 다시 보지 않았다.

하지 않은 것(사용자 몫, Plan D18): 관리자가 아닌 실제 Google 계정으로 로그인 → 거부 화면 → Firebase 인증 사용자 목록에 남지 않음. API 경로는 스모크가 시험 사용자로 확인했다(4.2).

### 4.5 시험 데이터

만든 것: 스모크 시험 글(실행마다 1편)·시험 줄·시험 인증 사용자, 브라우저 시험 글 1편(`stage5-test 시나리오 5`, 발행·숨김·다시 보임·삭제), 시험 빈 project 초안 2편, 시험 `publishLog` 줄 2개. 모두 지웠다. 끝 수: `entries` 69, `publishLog` 2, `assets` 141, `seriesMeta` 7, 초안 7(표지 붙은 것 0).

리뷰 수정 뒤(2026-11-11 02시): 스모크 시험 데이터(`stage5-admin` 1회, `stage2-api` 6회), 브라우저 시험 글 1편과 그 기록 3줄(발행·숨김·삭제). 모두 지웠다. 끝 수가 위와 같다. Storage `assets/` 파일 37. 로컬 `.env`에 백업 토큰이 없어 백업 알림은 보내지 않았다(`skipped`).

### 4.6 환경 문제: Google API 연결 끊김

2026-11-11 00시대에 이 컴퓨터에서 `oauth2.googleapis.com`·`identitytoolkit.googleapis.com`(192.178.x·172.217.x)로 가는 연결이 수십 초씩 끊겼다 붙었다 했다(`curl` 000, Node `ETIMEDOUT`). `firestore.googleapis.com`은 됐다. 그래서 스모크가 중간에 멈췄고, 개발 서버의 세션 확인이 실패하면 로그인 화면으로 갔다(기존 동작: 확인 실패 = 세션 없음). 코드 문제가 아니다. 스모크는 Google 호출을 다시 시도하게 고쳤다. 화면 동작 중 서버 응답이 13~32초 걸린 때가 있었다(숨기기, 다시 시도). 2026-11-11 02시대(리뷰 수정 검증)에도 같았다: `firebasestorage.googleapis.com` 시간 초과, ID 토큰 요청 `fetch failed`, 초안 저장 20초.

### 4.7 PR-A 병합 뒤 `rebuild` 미리보기 확인 (Plan 8.6의 1, 2026-11-11 02:53~03:00 KST)

[PR #22](https://github.com/crucial-sub/cruz-lab/pull/22) 병합(`d1ded00`)의 Vercel 미리보기다. 앱 브라우저에 사용자의 기존 로그인 세션이 있었다. 시험 글 1편(`stage5-test 미리보기 확인 mwaznktw`)을 페이지 안 `fetch`로 만들었다.

| 확인 | 결과 |
|---|---|
| 시험 글 발행 → 출간 기록 | 발행 응답 `purge: ok`, `backup: dispatched`, `assetUsage: ok`. 출간 기록 화면 줄: "발행 · 1판 · 캐시 비움 · 백업 알림 · 자산 기록 맞춤" |
| "다시 비우기"가 띠를 지운다(시나리오 7, 5절 11) | 시험 실패 줄(`purge: failed`)을 Admin SDK로 넣음 → 첫 화면 띠 "캐시 비우기 실패 1건" → "다시 비우기" → `retry` 줄 `purge: ok` → 알림 0건, 띠가 사라짐 |
| 삭제 | 응답 `purge: ok`, `backup: dispatched`. 공개 주소 404 |
| 로그아웃 뒤 "고치기"가 사라짐 | **하지 않았다.** 사용자 세션이 끊긴다. 사용자 몫이다(7절) |

정리: 시험 글은 API로 지웠고, 그 글의 `publishLog` 4줄(발행·시험 실패·다시 시도·삭제)은 Admin SDK로 지웠다. 끝 수 `entries` 69, `publishLog` 2, `assets` 141, `seriesMeta` 7. 백업 저장소에는 발행·삭제 알림이 한 번씩 갔다(백업 Action이 내보낸 결과는 같다).

### 4.8 PR-B 검사 (2026-11-11, `stage5/b-manage`, 기준 `d1ded00`)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `npx tsc --noEmit` | 0 |
| `pnpm test` | 688 통과(46 파일). PR-A 뒤 633(44 파일) + 새 55(분류 규칙 29, 자산 거르기 24, 라우터 1, 카테고리 탭 1) |
| `pnpm build` | 통과(경고는 기존 2개) |
| `stage5-admin.mjs` | 개발 서버 4333 223/223, 빌드 결과 4394 223/223. 첫 실행(225건)에서 태그 되돌리기 3건이 떨어져 고쳤다(5절 40) |
| `stage2-api.mjs` | 106/106(개발 서버 4333) |
| 왕복 검사 | 69/69 |
| 공개 점검(빌드 결과 4394) | `stage4-public.mjs` 883/0 + 2단계 324/0. `/blog` HTML 90,709바이트(PR-A와 같다) |
| 번들 | 앱 첫 청크 `AdminApp.*.js` 85,998바이트(gzip 24,684). PR-A 43,071(14,140) → 이미지·분류·연재 화면만큼 늘었다. 처음 빌드는 159 KB였다: 화면이 `public-paths` → `entry-rules`를 거쳐 zod를 끌어왔다. `publicPathFor`를 옮겨 막았다(5절 53). 에디터 JS는 `import()`로만 걸린다(스모크 검사 그대로 통과). `EditorApp.*.js` 1,821,900 |

### 4.9 PR-B 브라우저 확인 (개발 서버 4333, 앱 브라우저, Plan 8.4 시나리오 8~12)

앱 브라우저의 사용자 localhost 세션 쿠키로 했다. 로그아웃은 누르지 않았다. 시험 데이터만 고쳤다.

| # | 시나리오 | 결과 |
|---|---|---|
| 8 | 이미지 라이브러리 | 141칸(60 + 더 보기 81), 거르기 수: 쓰는 것 115 · 쓰지 않는 것 26 · legacy 130 · 영상 3. 시험 이미지 1장(스크립트로 올림) → "쓰지 않는 것" 27 → 상세(변형 w480·max, 쓰는 글 0) → 지우기 → 확인 창(저장 경로) → 지움, 수 141·26으로 돌아옴. legacy 쓰지 않는 이미지: 지우기 단추 없음, "legacy 자산은 main 병합 뒤에 정리합니다." |
| 9 | 시험 카테고리 | 분류 화면 "새 카테고리"로 만들기 → 에디터 카테고리 칸에 보임 → 메타 패널 "+ 새 카테고리"로 둘째 만들기(만들자마자 고름, 자동 저장) → 시험 글 발행 → `/blog/category/<key>` 200(이름·글) → key 바꾸기(확인 창 대상 1편) → 옛 주소 301 → 새 주소 200 → "글 옮기기"(확인 창) → 초안·발행본 key 바뀜, 변경 있음 없음, 1판 그대로 → 지우기 |
| 10 | 시험 태그 | 태그 ⋯ → 이름 바꾸기·합치기 → 확인 창(대상 1편) → 초안·발행본 태그 바뀜, 별칭 → 옛 태그 주소 301 → 새 주소 200. 확인 창이 입력 그대로를 보여 정규화 이름으로 고쳤다. 되돌리기는 스모크로 확인 |
| 11 | 새 프로젝트 | "새 프로젝트"(제목·key) → 에디터가 열리고 연재 칸 key·순서 1, 프로젝트 안내 → 첫 Part 발행 → `/projects`에 보임 → 정보 고치기(설명·기술 "Astro, React, Astro" → 중복 뺌·기간) → Part 삭제 → 연재 정보 지우기 → `/projects`에서 사라짐 |
| 12 | 이전 발행본 | 시험 글 2판 → 에디터 ⋯ "이전 발행본" → 2판(지금 발행본)·1판 목록, 1판 미리보기 → 초안으로 가져오기(확인) → 제목 칸 1판, 옛 key·옛 태그가 별칭으로 새 값이 됨, 발행본 2판 그대로, 변경 있음 → 초안 버리기 → 2판 |
| 390px | 이미지·분류·연재 화면 | 가로 넘침 0(scrollWidth 390). 이미지 3열, 상세는 아래 시트 |

시험 데이터 정리: 시험 글·카테고리 2개는 API로, 남은 태그 별칭과 시험 줄 16개는 Admin SDK로 지웠다. 끝 수 `entries` 69, `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 37. `settings/taxonomy`: 카테고리 10개가 코드 기본값과 같고 별칭이 없다.

환경: 주 checkout의 `.env` 끝에 줄 바꿈이 없어, 복사한 뒤 더한 `ADMIN_UID`가 앞 줄 값에 붙었다. 첫 스모크가 "ADMIN_UID가 필요합니다"로 멈춰 알았다. 줄을 나누고 개발 서버를 다시 띄웠다(값은 해시로만 비교했다). Google API 연결은 이번에는 끊기지 않았다.

### 4.10 PR-C 검사 (2026-11-11, `stage5/c-editor`, 기준 `eb72c39`)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `npx tsc --noEmit` | 0 |
| `pnpm test` | 827 통과(50 파일). PR-B 뒤 690(46 파일) + 새 137(이미지 74, 키맵 설정 25, 블록 이동 10, 찾기 10, 저장·자동저장 9, 그 밖 9) |
| `pnpm build` | 통과(경고는 기존 2개) |
| `stage5-admin.mjs` | 개발 서버 4335 252/252(PR-B 226 + PR-C 26) |
| `stage2-api.mjs` | 106/106(개발 서버 4335) |
| 왕복 검사 | 69/69 |
| 공개 점검(빌드 결과 4396) | `stage4-public.mjs` 883/0 + 2단계 324/0. `/blog` HTML 90,709바이트(PR-B와 같다) |
| 번들 | 앱 첫 청크 `AdminApp.*.js` 102,688바이트(gzip 30,229). PR-B 뒤 86,730(24,890) → 설정 화면·명령 표·키 검사만큼 늘었다. zod·ProseMirror는 들어오지 않는다. `EditorApp.*.js` 1,848,555(gzip 565,362), PR-B 뒤 1,821,900 → `prosemirror-search`·찾기 막대·이미지 조절만큼. 에디터 JS는 `import()`로만 걸린다 |

환경: `prosemirror-search`를 더한 뒤 개발 서버가 에디터를 받지 못했다(504 "Outdated Optimize Dep", 5절 18의 오류 화면). `node_modules/.vite`(Vite 의존성 캐시)를 지우고 서버를 다시 띄워 풀었다. 코드 문제가 아니다. Google API 연결은 끊기지 않았지만 설정 저장 PUT이 11초 걸린 때가 있었다.

### 4.11 PR-C 브라우저 확인 (개발 서버 4335, 앱 브라우저, Plan 8.4 시나리오 13~16)

앱 브라우저의 사용자 localhost 세션 쿠키로 했다. 로그아웃은 누르지 않았다. 시험 글 1편(`stage5-test PR-C 확인 mwbqmjc8`, 이미지는 사이트 아이콘 `/icons/icon-512.png`)을 페이지 안 `fetch`로 만들었다. 사용자 글은 열지 않았다.

| # | 시나리오 | 결과 |
|---|---|---|
| 13 | 이미지 폭 480 · 가운데 | 이미지를 고르면 메뉴에 "폭(px)"·정렬 3단추. 480 + Enter, "가운데" → 편집 모드에서 바로 폭 480, 좌우 여백 80px씩. 소스 모드 `<p align="center"><img src="/icons/icon-512.png" alt="시험 그림" width="480"></p>`. 편집 모드로 돌아와도 경고 없음. 미리보기 같은 모양. 발행 → 공개 페이지 `<p align="center"><img … width="480" loading="lazy" decoding="async"></p>`, 폭 480, 좌우 104px씩(본문 689px) |
| 13 | 끌어서 폭 | 손잡이(오른쪽 가장자리, `ew-resize`)를 왼쪽으로 100px 끌기 → 가운데 정렬이라 480 → 280, 메뉴 폭 칸 280, 선택 유지. `⌘Z` 한 번에 480 |
| 14 | 키 바꾸기 | 설정 화면 "굵게" → `⌘⌥B`: 그 줄에 "Mod(⌘·Ctrl)와 Alt를 함께 쓰는 키는 쓸 수 없습니다", 받지 않음. `⌘⇧B` → 지금 키 ⌘⇧B. 기울임에도 `⌘⇧B` → 두 줄 빨강, "문제 2건을 고쳐야 저장됩니다", 저장 꺼짐 → 기울임 "기본값으로". 저장 → 서버 `{ bold: { mac: 'Mod-Shift-b', other: 'Mod-b' } }`(이 기기 키만). 에디터를 새로 열고 단어를 고른 뒤 `⌘B` → 굵게 없음, `⌘⇧B` → 굵게. 끝에 "맥 키 모두 기본값으로" → 저장 → keymap `{}` |
| 15 | 찾기·바꾸기 | 편집 모드 `⌘F` → 막대, 찾기 칸에 포커스. "사과" → "1 / 3", 강조 3곳. 바꿀 글자 "포도" → "모두 바꾸기" → 3곳 바뀜, "없음". 닫기 → 강조 사라짐, 에디터에 포커스 → `⌘Z` 한 번에 3곳 모두 원래대로(이미지 폭·정렬 그대로). 소스 모드 `⌘F` → 막대 없음, 기본 동작을 막지 않음(브라우저 찾기) |
| 16 | 블록 이동 | 첫째 단락에서 `⌘⇧↓` → 이미지 단락 아래로, `⌘Z` 한 번에 원래대로. 390px 모바일 바 9개(한 칸 38px)의 "블록 아래로"·"블록 위로" → 옮기고 되돌아옴, 바가 남음 |
| 390px | 찾기 막대·설정 화면 | 찾기 막대 두 줄(390×83), 가로 넘침 0. 설정 화면 두 줄 행, 가로 넘침 0(scrollWidth 390) |

브라우저 확인 중 찾아 고친 것:

1. 찾기 칸에 포커스가 있으면 결과가 화면 밖에 남았다. ProseMirror의 `scrollIntoView`는 DOM 선택이 에디터 안일 때만 돈다. 결과를 고를 때 직접 스크롤하게 고쳤다(5절 79). 다시 확인: 아래쪽 결과로 스크롤됨.
2. 막대의 단추에 포커스가 있으면 Esc가 막대를 닫지 않았다. 막대 전체에서 Esc를 받게 고쳤다. 다시 확인: "다음 결과" 단추를 누른 뒤 Esc → 닫힘, 강조 지움.

확인 중 본 것(결함 아님):

- 자동 조작이 클릭 직후 바로 키를 누르면 ProseMirror가 클릭한 자리를 선택으로 읽기 전이라 앞의 선택(고른 이미지)이 옮겨졌다. 1초를 두면 클릭한 단락이 옮겨진다. 사람의 입력 속도에서는 생기지 않는다.
- 고른 이미지의 메뉴(5줄)가 아래 단락을 덮는다. 메뉴 아래 글자를 누르면 메뉴를 누른다. 3단계부터 같은 방식이고 메뉴가 커졌다. 이미지 밖을 먼저 누르면 메뉴가 닫힌다.
- 이미지를 고른 채 `⌘⇧B`(굵게)를 누르면 이미지에 굵게 마크가 걸려 폭·정렬을 저장하지 않는다는 알림이 뜬다(5절 83 판정대로). 되돌리기로 풀었다.

브라우저로 확인하지 않은 것: 자동 재시도(네트워크를 끊을 수 없다, 단위 테스트 9건), 키 설정 읽기 실패 띠(단위 판정과 코드로만), 오른쪽 정렬의 손잡이, 터치 기기에서 손잡이 숨김, 라이트 테마.

### 4.12 PR-C 리뷰 수정 뒤 검증과 시험 데이터 (2026-11-11 16시)

| 항목 | 결과 |
|---|---|
| `pnpm lint`·`tsc` | 통과·0 |
| `pnpm test` | 843 통과(50 파일, 리뷰 수정 +16) |
| `pnpm build` | 통과 |
| `stage5-admin.mjs` | 빌드 결과 4396 252/252, 개발 서버 4335 252/252. 실행 첫 줄에 `settings/editor` 처음 상태를 남긴다(리뷰 S10) |
| `stage2-api.mjs` | 106/106(개발 서버 4335) |
| 왕복 검사 | 69/69 |
| 공개 점검(빌드 결과 4396) | 883/0 + 324/0. `/blog` HTML 90,709바이트 |
| 번들 | `AdminApp.*.js` 103,985바이트(gzip 30,652), `EditorApp.*.js` 1,850,936(gzip 566,163) |
| 형식 | 새 파일과, 기준 판에서 prettier가 깨끗했던 파일만 `prettier --write`했다. 기준 판부터 형식이 맞지 않던 파일(`EditorApp.tsx`, `AdminApp.tsx`, `router.ts`, `entry-schema.ts`, 스모크 등)은 돌리지 않았다(바꾸지 않은 줄까지 diff가 늘지 않게). 저장소는 형식 검사를 lint에 넣지 않는다 |

시험 데이터: 브라우저 시험 글 2편(`stage5-test PR-C 확인 …`, `stage5-test PR-C 리뷰 확인 …`)은 API로 지웠고, 그 글의 `publishLog` 3줄(발행·삭제·삭제)은 Admin SDK로 지웠다. 스모크 4회는 매번 스스로 정리했다. 키 설정 시험(시나리오 14)은 끝에 기본값으로 저장했고, 처음에 없던 `settings/editor` 문서는 지웠다. 끝 수: `entries` 69(초안 7, 표지 붙은 글 0), `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 37, `settings`는 `taxonomy`(기본 10개, 별칭 없음)만.

### 4.13 PR-D 검사 (2026-11-11, `stage5/d-readers`, 기준 `origin/rebuild` `7a370fb`)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `npx tsc --noEmit` | 0 |
| `pnpm test` | 881 통과(52 파일). PR-C 뒤 843(50 파일) + 새 38(이벤트 검사 22, 날짜 요약 13, 라우터 3) |
| `pnpm build` | 통과(경고는 기존 2개) |
| `stage5-track.mjs`(새) | 개발 서버 4337 160/160, 빌드 결과 4398 160/160. 시작·끝 `readerEvents` 0, `readerDaily` 0 |
| `stage5-admin.mjs` | 개발 서버 4337 252/252, 빌드 결과 4398 252/252 |
| `stage2-api.mjs` | 106/106(개발 서버 4337) |
| 왕복 검사 | 69/69 |
| 공개 점검(빌드 결과 4398) | `stage4-public.mjs` 1,313/0(PR-C 883 + 10절 수집 스크립트 검사) + 2단계 324/0. `/blog` HTML 93,283바이트(PR-C 90,709 → +2,574: 인라인 수집 스크립트) |
| 공개 스크립트 | 관리자 표시 222 + 수집 1,791 = 2,013바이트(한도 2,048). 수집은 인라인 모듈 1개(`import` 없음). 공개 페이지 `astro-island` 0 |
| 번들 | 앱 첫 청크 `AdminApp.*.js` 115,952바이트(gzip 33,830). 리뷰 수정 뒤 116,712(33,996). PR-C 뒤 103,985(30,652) → 독자 화면 2개·막대·요약 비율 함수만큼. 정적으로 가져오는 것은 React 런타임뿐이다(zod·Firebase 없음). 에디터 JS(`EditorApp.*.js` 1,850,936)는 `import()`로만 걸린다 |

환경: 개발 서버가 첫 관리자 화면에서 "jsxDEV is not a function"(Vite 의존성 다시 최적화)으로 빈 화면이었다. `node_modules/.vite`를 지우고 다시 띄워 풀었다(PR-C 4.10과 같은 원인). 빌드 결과에서 처음에 Origin 없는 `text/plain` 요청이 403이었다. Astro `checkOrigin`이 처리기보다 먼저 돈다(5절 104). 스모크를 그에 맞게 고쳤다.

### 4.14 PR-D 브라우저 확인 (개발 서버 4337, 앱 브라우저, Plan 8.4 시나리오 18)

앱 브라우저의 사용자 localhost 세션 쿠키로 했다. 로그아웃은 누르지 않았다. 시험 데이터는 scratchpad 스크립트로 넣었다: 오늘은 수집 API로 시험 표지 방문 4개(글 3편, 검색 0건, 없는 주소, 이력서 PDF), 지난 7일은 없던 날짜의 요약 문서만 직접 썼다.

| 확인 | 결과 |
|---|---|
| `/admin/readers` 1280px | 메뉴 "독자"(연재와 출간 기록 사이, 지금 화면). 수 칸 방문 25·조회 42·PDF 2·바깥 링크 1·코드 복사 1. 막대 30칸(8일에 값), "가장 많은 날 4". 많이 읽힌 글 3편(방문·조회), 들어온 곳(linkedin.com 16, 직접 8, google.com 1), 검색어 "0건 1" 표, 없는 주소와 들어온 곳 |
| 90일 | 막대 90칸. 화면 읽기 글 "날짜별 방문: 90일 합계 25, 가장 많은 날 11월 6일 4" |
| 글 하나의 독자 | 많이 읽힌 글을 누르면 같은 문서 안에서 `/admin/readers/<id>`(메뉴 "독자"가 지금 화면). 방문 17·조회 24, 75% 71%(17번)·끝까지 33%(8번)·떠남 67%(16번) = 넣은 값으로 계산한 값과 같다. 들어온 곳, 다음 글, 전 글, 방문 경로 예 3개(들어온 곳 → 페이지 → 읽은 깊이 → 코드 복사 → 바깥 도메인 → 없는 주소) |
| 목록 | 정렬 "30일 독자" → 17·8·1·0. 390px 두 줄 행 "독자 17". 행 `⋯` 메뉴: 공개 페이지 보기 · 독자 보기 · 숨기기 · 삭제. "독자 보기" → 같은 문서 안에서 그 글의 독자 화면 |
| 390px | 독자 화면 2개·목록 가로 넘침 0(scrollWidth 390). 수 칸 2열 |
| 공개 페이지(관리자 표시 있음) | `<html data-admin>`, "고치기" 보임, 수집 스크립트가 돌지 않음(방문 상태가 그대로) |
| 공개 페이지(표시를 지움, 4337 출처만) | 글 상세 view 1번 → 코드 복사 → 떠날 때(다른 페이지로 이동) 1번(복사·75%·100%) → `/about` view 1번. 방문 상태의 순서 11 → 15. 서버 204. `/about` 안내 한 줄 |
| 저장 안 함 | 위 브라우저 방문은 localhost라 저장하지 않았다. 원본 줄 17개가 모두 시험 표지 방문이었다(그 밖 0) |

확인 중 본 것: 앱 브라우저 창이 숨겨져 있어 스크롤 이벤트가 오지 않았다(그리기 단계가 돌지 않는다). 읽음은 떠날 때 다시 재므로 기록됐다.

시험 데이터 정리: 시험 표지 원본 줄 17개와 이 스크립트가 만든 요약 문서 8개를 지웠다. `readerEvents` 0, `readerDaily` 0.

### 4.15 PR-D 리뷰 수정 뒤 검증과 시험 데이터 (2026-11-11 19시)

| 항목 | 결과 |
|---|---|
| `pnpm lint`·`tsc` | 통과·0 |
| `pnpm test` | 888 통과(52 파일, 리뷰 수정 +7) |
| `pnpm build` | 통과 |
| `stage5-track.mjs` | 빌드 결과 4398 178/178, 개발 서버 4337 178/178. `--base https://www.cruzlab.dev`는 요청 없이 멈춘다 |
| `stage5-admin.mjs` | 빌드 결과 4398 252/252, 개발 서버 4337 252/252 |
| `stage2-api.mjs` | 106/106(개발 서버 4337) |
| 왕복 검사 | 69/69 |
| 공개 점검(빌드 결과 4398) | `stage4-public.mjs` 1,313/0 + 2단계 324/0. `/blog` HTML 93,308바이트 |
| 공개 스크립트 | 관리자 표시 203 + 수집 1,835 = 2,038바이트(한도 2,048). 인라인 모듈 1개, `import` 없음 |

브라우저 다시 확인(개발 서버 4337, 시험 데이터를 다시 넣고 지움):

| 지적 | 확인 | 결과 |
|---|---|---|
| B10 | 글 하나의 독자 화면 경로 예 | "RAG는 … (100%) · 코드 복사 → 바깥 github.com → …"(75%·100%·복사 순서가 섞여도 같은 모양) |
| B8 | 막대·값 표 | 막대 색 rgb(5, 150, 105). "날짜별 값 보기"를 열면 30줄 표 |
| S9 | 경로 예 | 처음 연 줄로 고른 방문 3개 |
| D4·114 | 관리자 표시가 있는 공개 글 | `<body data-admin>`, "고치기" 보임, 수집 스크립트가 돌지 않음(방문 상태 그대로) |
| S3·B3 | 마지막 이벤트가 31분 전인 방문 상태를 넣고 새로 고침 | 새 방문 ID, 순서 1 |
| B2 | `pageshow`(persisted) 보내기 | 같은 방문, 순서 1 → 2(view를 다시 보냄) |

브라우저로 확인하지 않은 것: 실제 bfcache 복원(앱 브라우저에서 뒤로 가기 캐시를 확정할 수 없어 이벤트를 흉내 냈다), 탭을 오간 뒤 보내지 못하는 이벤트(113), B7(목록을 받는 짧은 순간).

시험 데이터: 스모크 4회(수집 2·관리자 2)와 브라우저 확인 시험 데이터를 모두 지웠다. 끝 수: `entries` 69(초안 7, 표지 붙은 글 0), `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 37, `settings`는 `taxonomy`만, `readerEvents` 0, `readerDaily` 0.

### 4.16 PR-E 측정 (2026-11-11, `stage5/e-perf`, 기준 `origin/rebuild` `c582243`)

측정 글은 Plan 1.3과 같은 「UserProgram - 시스템 콜 동작 흐름」(`/blog/pintos-userprogram-02`, 코드 C 8·NASM 1)이다. 둘째 글은 「UserProgram - Argument Passing」, OG는 측정 글의 `/og/<글 ID>.png`다. 값은 ms다.

**로컬 CPU 프로파일(처방 전).** 빌드 결과 함수(`.vercel/output/functions/_render.func`)를 새 Node 프로세스로 띄웠다. 데우기 요청(`/og/zz.png`, `/blog`) 뒤 글 요청만 inspector로 잡았다(표본 0.1 ms).

| 요청 | 전체 | 나눔 |
|---|---|---|
| 새 프로세스의 첫 요청 `/og/zz.png` | 841 | 모듈 읽기·컴파일(node-core 279, 파일 읽기 102 등). firebase-admin 포함 317, 그중 Firestore 208. 네트워크 대기 203 |
| 첫 글(측정 글) | 476 | Shiki 311(언어 20종 등록 `createHighlighterCoreSync` 42 + 첫 하이라이트 269: 정규식 번역 `toRegExp` 66, 실행 `findNextMatchSync` 180 등). 마크다운 파이프라인의 나머지와 대기 |
| 둘째 글 | 71 | 대기 53, Shiki 약 4 |

**Shiki 벤치(로컬, 새 프로세스, 측정 글의 코드 블록).** 언어 불러오기 + 준비 + 첫 하이라이트.

| 변형 | 합 | 나눔 |
|---|---|---|
| 지금(JS 엔진, 20종) | 약 283 | 17 + 35 + 231 |
| 글 언어만(JS 엔진, 2종) | 약 239 | 2 + 2 + 235 |
| 글 언어만 + Oniguruma | 약 143 | 2 + 29(wasm 포함) + 112 |
| 같은 코드 다시 칠하기 | 약 40 | |

**로컬 Server-Timing(빌드 결과, 새 프로세스 3회, 글 상세가 첫 요청).** 기계 부하(load average 3~5)로 값이 흔들린다.

| 단계 | 처방 전 | 처방 뒤 |
|---|---|---|
| 글 상세 TTFB | 1,515 · 1,765 · 2,213 | 1,476 · 825 · 735 |
| `hl` | 42 · 97 · 93 | 56 · 51 · 45 |
| `md` | 317 · 391 · 436 | 182 · 179 · 179 |
| `render` | 359 · 494 · 531 | 239 · 231 · 224 |
| 둘째 글 TTFB | 46 · 50 · 74 | 184 · 41 · 66 |

로컬 OG는 네이티브 판의 그리기가 0.37~3.5초로 크게 흔들렸다(같은 SVG, 맥의 코어 배정으로 본다). 그래서 OG 처방은 미리보기 값으로 정했다.

**미리보기 Server-Timing.** 앱 브라우저의 사용자 Vercel 세션으로 배포 주소의 `/robots.txt`(정적 파일, 함수를 깨우지 않음)를 열고, 같은 출처 `fetch`(`cache: no-store`, 쿼리로 CDN을 건너뜀)로 차례로 불렀다.

| 회 | 배포(커밋) | 측정 시각(UTC) | 측정 글 | 둘째 글 | 첫 OG | 다음 OG |
|---|---|---|---|---|---|---|
| 처방 전 | `aee36aa` | 12:49(배포 11:45, 그사이 요청 없음) | **4,474**: db 453, hl 229, md 1,310, render 1,541, total 2,092, inst 4,035(프로세스 나이, 콜드) | 205 | **11,361**: imp-resvg 10,303, imp-satori 10,420, font 10,437(함께 기다림), satori 163, resvg 564 | 865: resvg 479 |
| Oniguruma + resvg-wasm | `f68f7bb` | 13:02(배포 직후) | **3,108**: db 416, hl 120, md 908, render 1,029, total 1,494, inst 27,638 | 239 | **3,167**: imp 290~342, satori 136, resvg 2,545 | 2,332: resvg 2,132 |
| Oniguruma + 네이티브·`excludeNetwork` | `1d966bb` | 13:19(배포 직후) | **2,920**: db 363, hl 119, md 859, render 978, total 1,400, inst req 1 · 15,045 | 179 | **1,241**: imp-resvg 201, imp-satori 283, font 287, satori 126, resvg 513, total 964 | 569: resvg 436 |

- 처방 전 첫 OG는 세 import와 글꼴 읽기(작은 파일)가 모두 10.3~10.4초에 끝났다. 무엇인가 프로세스 전체를 막았다는 뜻이다(5절 145).
- 배포 직후 두 회는 `inst`의 프로세스 나이가 15~28초였다. 프로세스는 요청 전에 이미 떠 있었다(배포 뒤 Vercel이 미리 띄운 것으로 본다). 그래서 이 두 회의 TTFB에는 프로세스 부팅이 덜 들어 있다. 인스턴스가 식은 뒤 다시 잰 값은 아래 4.17에 있다.
- 글 상세의 렌더(`render`)는 1,541 → 978 ms(−37%), 그중 `md` 1,310 → 859 ms, `hl` 229 → 119 ms다.

### 4.17 PR-E 검사와 콜드 측정 (리뷰 수정 뒤, 2026-11-11)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `npx tsc --noEmit` | 0 |
| `pnpm test` | 918 통과(54 파일). PR-D 뒤 888 + 새 30(server-timing 9, code-highlighter 16, render-entry 2, og-template 3) |
| `pnpm build` | 통과(경고는 기존 2개) |
| `stage5-admin.mjs` | 빌드 결과 4399 252/252, 개발 서버 4339 252/252 |
| `stage5-track.mjs` | 빌드 결과 178/178, 개발 서버 178/178. 시작·끝 `readerEvents` 0, `readerDaily` 0 |
| `stage2-api.mjs`(`pnpm smoke:api`) | 106/106(개발 서버 4339) |
| 왕복 검사(`pnpm smoke:roundtrip`) | 69/69 |
| 공개 점검(빌드 결과 4399) | `stage4-public.mjs` 1,380/0(PR-D 1,313 + Server-Timing 67) + 2단계 324/0. `/blog` HTML 93,308바이트(PR-D와 같다) |
| 공개 스크립트 | 관리자 표시 203 + 수집 1,835 = 2,038바이트(한도 2,048, PR-D와 같다) |
| 번들 | 관리자 첫 청크 `AdminApp.*.js` 116,712바이트(PR-D와 같다, Shiki 없음). 미리보기 하이라이터 청크 1,584,711바이트(PR-E 전 1,584,737). 함수 번들: 문법 파일 20개와 `engine-oniguruma`의 `wasm-inlined.mjs`가 실리고 JS 엔진은 빠졌다(리뷰어 확인). 함수 폴더 약 51 MB(로컬 맥 바이너리 기준, PR-E 전과 비슷하다) |
| 시험 데이터 | 끝 수 `entries` 69(초안 7, 표지 붙은 글 0), `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 37, `settings`는 `taxonomy`만, `readerEvents` 0, `readerDaily` 0 |

스모크를 한 번 잘못 시작했다(빌드 결과 서버가 뜨지 않은 채). 빌드 결과 몫은 연결 오류로 바로 멈췄다. 개발 서버의 관리자 스모크는 끝까지 돌며 시험 줄을 만들었고, 자기 정리 단계에서 모두 지웠다(그 뒤 `publishLog` 2). 그다음 전체를 다시 돌린 결과가 위 표다.

**미리보기 진짜 콜드(배포 `1d966bb`, 인스턴스가 쉰 뒤).** 4.16과 같은 순서다. `inst`가 `req 1`이고 프로세스 나이가 수 초면 새 인스턴스다.

| 회 | 측정 시각(UTC), 쉰 시간 | 측정 글 | 둘째 글 | 첫 OG | 다음 OG |
|---|---|---|---|---|---|
| 1 | 13:19(배포 직후, 프로세스 나이 15초) | 2,920: render 978, md 859, hl 119, total 1,400 | 179 | 1,241: imp-resvg 201, resvg 513 | 569 |
| 2 | 13:42, 23분 | **3,558**: db 330, hl 130, md 792, render 922, total 1,300, req 1 · 나이 2.9초 | 128 | **1,087**: imp-resvg 223, imp-satori 313, satori 118, resvg 502, total 974 | 620 |
| 3 | 14:01, 18분 | **3,897**: db 393, hl 114, md 977, render 1,092, total 1,560, req 1 · 나이 3.2초 | 241 | **1,238**: imp-resvg 253, imp-satori 355, satori 147, resvg 541, total 1,109 | 786 |

- 첫 OG는 세 번 모두 3초 안이다(1,241·1,087·1,238 ms). D17의 목표를 지킨다.
- 처방 전 콜드(4.16, 나이 4.0초)와 진짜 콜드 2·3회를 견주면: 글 상세 TTFB 4,474 → 3,558·3,897 ms, `render` 1,541 → 922·1,092 ms, `md` 1,310 → 792·977 ms, `hl` 229 → 130·114 ms. 첫 OG 11,361 → 1,087·1,238 ms.
- 처방 전 콜드는 한 번만 Server-Timing으로 쟀다(코드를 되돌려 다시 배포해야 해서). 그 전 값은 Plan 1.3의 세 번(글 상세 1,736·4,362·1,757 ms, 첫 OG 11초대)이다.
- 글 상세 TTFB 중 페이지 코드 밖(TTFB − `total`)은 처방 전 약 2.4초, 2·3회 약 2.3초다. 함수 부팅·모듈 읽기·네트워크다. 운영은 바이트코드 캐시가 이 몫을 줄인다(Plan 1.3, 8절 12).

## 5. Plan과 다르게 하거나 Plan이 정하지 않은 것

1. **메뉴는 화면을 만든 것만 보인다(글, 출간 기록).** Plan D10의 메뉴 7개 중 이미지·분류·연재·독자·설정은 그 화면을 만드는 PR이 메뉴와 라우터 표에 더한다. 지금 그 주소는 앱이 `/admin`으로 바꾼다.
2. **행 메뉴 "독자 보기"는 PR-D가 더한다.** 독자 화면(D20)이 아직 없다. 독자 열은 자리만 있다("—", 정렬 항목은 있다).
3. **에디터에서 돌아올 때 목록을 다시 받지 않고 그 줄만 고친다.** 에디터가 떠날 때(가드 통과 뒤) 제목·slug·분류·태그·연재·상태·변경 있음·발행일·고친 때·기기·빈 초안 여부를 앱에 알린다. 새 글은 만든 뒤 빈 줄을 더한다. 에디터에서 지운 글은 줄을 뺀다. Plan 8.4의 3 "다시 받지 않고 돌아온다"를 지키면서 제목이 낡지 않게 했다.
4. **"← 목록"(`/admin`)은 첫 화면의 마지막 거르기로 돌아간다.** 에디터 상단 바의 링크는 쿼리가 없다. 앱이 마지막 첫 화면 쿼리를 기억했다가 붙인다(Plan 8.4의 2 "돌아오면 같은 거르기").
5. **열면 본문에 커서를 둔다. 초안은 끝, 발행한 글은 처음.** Plan 2.1 "열면 본문"·8.4의 3. 3단계 에디터는 처음 열 때 초점을 두지 않았다. 보관함 복원 창이 뜨면 두지 않는다.
6. **빈 초안 칩은 종류·검색 조건을 따른다. "모두 지우기"는 직전에 목록을 다시 받아 아직 빈 초안인 것만 지운다.** 그사이 다른 기기에서 쓴 초안을 지우지 않게 했다. 칩 상태는 주소에 쓰지 않는다(Plan의 주소 상태는 4개). 시나리오 6은 종류 거르기로 시험 초안만 골라 지웠다.
7. **목록 API에 `publicPath`를 더했다.** 목록의 `slug`는 초안 값이라 발행 뒤 slug를 고치면 공개 주소와 다르다. 행 메뉴 "공개 페이지 보기"가 발행본 slug로 간다. 숨김 글도 값을 주고 화면은 발행 상태일 때만 링크를 보인다(다시 보여도 목록을 다시 받지 않는다).
8. **`isEmptyDraft`는 초안 상태 글만 두 번째 쿼리로 설명·본문을 읽어 계산한다.** 목록 쿼리는 그대로 본문을 읽지 않는다. 발행본이 있는 글은 빈 초안이 아니다.
9. **알림 계산 순수 함수는 `src/lib/publish-log.ts`, 서버 읽기·쓰기는 `src/lib/server/publish-log.ts`다.** Plan 4.1은 서버 파일 하나였다. 순수 함수를 Firebase 없이 테스트하고 줄 타입을 앱과 함께 쓰려고 나눴다.
10. **출간 기록 API 쿼리: `?alerts=1`(알림만), `?before=<줄 ID>&limit=`(쪽).** `before`는 시각이 아니라 앞 쪽 마지막 줄 ID다. 같은 시각의 줄을 건너뛰지 않는다(`startAfter(문서)`).
11. **로컬의 "다시 비우기"는 띠를 지우지 않는다.** 로컬 퍼지는 `skipped`이고, `skipped`는 실패를 지우지 않는다(로컬에서는 운영 CDN을 비울 수 없다). 화면은 "이 환경에서는 실행하지 않았습니다"를 알린다. 시나리오 7의 "사라짐"은 성공 줄을 넣어 확인했고, 실제 퍼지 성공은 `rebuild` 미리보기(8.6)에서 본다.
12. **숨김·다시 보임 줄에는 `backup` 칸이 없다.** 그 동작은 백업 알림을 보내지 않는다(2단계부터). 퍼지 결과만 적는다.
13. **다시 시도 API 본문은 `{ purge: true }` / `{ backup: true }`(둘 다 가능)이다.** 글이 지워졌으면 백업 알림은 delete로 보내고 이름표는 마지막 기록에서 가져온다. 다시 시도 줄에 `retried`(무엇을 다시 했는지)를 둔다.
14. **거부 응답에 `details.authRecordDeleted`를 둔다.** 화면은 지웠을 때만 "방금 로그인 기록은 지웠습니다"를 보인다(지우기 실패를 사실과 다르게 말하지 않게). 팝업을 닫으면 문구 없이 돌아가고, 팝업 막힘·네트워크는 안내 문구다.
15. **푸터 "관리"와 "고치기"에 `rel="nofollow"`를 붙였다.** 관리자 화면은 noindex이고 `robots.txt`도 `/admin/`을 막는다.
16. **관리자 표시 만료는 세션 만료 시각이다(최대 14일).** 진입 페이지가 `locals.admin.expiresAt`을 앱에 넘긴다. Plan D4 "만료 시각 = 세션과 같은 14일".
17. **빌드 결과의 `/admin` 페이지는 에디터 CSS(`EditorApp.*.css`, 43,286바이트, gzip 11,377)를 `<link>`로 싣는다.** Astro가 동적 import 모듈의 CSS를 그 페이지에 모은다(화면 깜빡임 방지). 에디터 JS 청크(1.8 MB)는 받지 않는다(Plan 8.1 "EditorApp 청크를 받지 않는다"는 JS로 판단했다). 이 CSS의 전역 규칙은 CSS 변수와 KaTeX `counter-reset`뿐이라 목록 화면 모양에 영향이 없다. 막으려면 CSS를 런타임에 직접 넣어야 해서 하지 않았다.
18. **에디터를 받지 못하면 "에디터를 불러오지 못했습니다" 화면(다시 불러오기·목록으로)을 보인다.** 개발 서버의 의존성 재최적화(504)로 지연 로드가 실패해 앱 전체가 빈 화면이 된 것을 보고 더했다. 운영에서도 새 배포로 옛 청크가 사라지면 같은 일이 생길 수 있다.
19. **앱 화면의 API가 401이면 로그인 화면으로 보낸다.** 에디터와 같다(`redirectToLogin`).
20. **`Shift+N`은 키 자리(`KeyN`)로도 듣는다.** 한글 입력 상태에서 `Shift+N`의 글자는 'ㅜ'다. `/`도 `Slash` 자리로 듣는다.
21. **1024px 미만의 첫 화면 제목줄에서는 "새 글"을 숨긴다.** 위 막대에 "새 글"이 있어 두 번 보였다. "오늘 기록"은 남는다.
22. **숨기기·다시 보이기를 누르면 "숨기는 중…" 알림을 먼저 띄운다.** 응답이 늦을 때 누른 것이 보이지 않았다(4.6).
23. **`stage2-api.mjs`의 초안 버리기 뒤 기대값을 `hasUnpublishedChanges: false`로 바꿨다.** D15 2의 의도된 변화다. 제목 검사와 나눠 검사가 105 → 106건이다.
24. **에디터 상단 바·메타 패널은 그대로 두었다.** "← 목록"은 `<a href="/admin">` 그대로이고 앱이 링크 클릭을 받는다. 에디터 화면은 메뉴 없는 전체 화면이다(D10).
25. **옛 주소(`/admin/posts`, `/admin/edit?slug=`, `/admin/posts/new`)는 301 대신 앱이 `/admin`으로 바꾼다.** 301 페이지를 지웠다(Plan 6절). 서버는 앱 페이지를 200으로 주고, 앱이 주소를 `replaceState`로 고친다(Plan D9 "모르는 주소는 /admin으로 바꾼다").
26. **로그인 화면은 `client:load`를 유지한다.** 서버가 안내 글을 그려 JS가 늦어도 안내가 먼저 보인다.
27. **스모크 `stage5-admin.mjs`는 Google API 호출을 다시 시도한다.** 4.6의 네트워크 끊김 때문이다. 검사 내용은 바꾸지 않는다.

리뷰 뒤 더한 판단(2026-11-11, 6절):

28. **비관리자 인증 기록은 `ADMIN_UID`가 실제 인증 사용자일 때만 지운다.** Plan D4 4 "관리자 UID는 절대 지우지 않는다"를 보강한다. 설정값이 틀리면(오타, 따옴표) 진짜 관리자가 "관리자 아님"으로 판정된다. 그때 관리자 기록을 지우면 다음 로그인이 새 UID를 만들어 모든 환경에서 잠긴다. 거부 응답은 그대로 403이고 `authRecordDeleted`는 false다. 거부 경로에서만 Auth 호출이 하나 는다.
29. **빈 초안 판정은 "초안 상태 + 제목이 빈" 글의 설명·본문만 읽는다.** 제목이 있는 초안의 본문을 받지 않는다. 같음 조건 두 개라 복합 인덱스가 필요 없다(운영 쿼리로 확인: 제목 빈 초안 6편, 빈 초안 2편으로 전과 같다). 공백만 있는 제목은 이 쿼리에 걸리지 않아 빈 초안이 아니다(지우지 않는 쪽). 지금 그런 글은 0편이다.
30. **빈 초안 "모두 지우기"는 이 기기 오프라인 보관함에 있는 글을 남긴다.** 서버에는 비어 있어도 보내지 못한 내용이 이 기기에 있을 수 있다. 알림 문구에 남긴 수를 적는다.
31. **지운 글과 오프라인 보관 초안.** 목록에서 지우면 이 기기 보관 초안도 지운다(에디터의 삭제와 같다). 에디터가 열 때 404를 받으면 목록 줄을 빼고 첫 화면으로 간다. 이때 보관 초안은 지우지 않는다(사용자가 지운 것이 아니다). 알림 띠의 "보내지 않은 초안"은 목록에 있는 글만 센다.
32. **첫 화면의 숨김·다시 보임·삭제 뒤 알림 띠를 다시 받는다.** 캐시 비우기가 `failed`면 성공 문구 대신 "잠시 이전 본문(또는 404)이 보일 수 있습니다"를 보인다.
33. **라우터의 글 ID는 영문·숫자·`_`·`-`에 한글(가-힣)을 더해 받는다.** slug 규칙(`SLUG_PATTERN`)과 같은 글자다. 프로젝트 글 ID(`project-<key>-<slug>`)가 한글 slug를 가질 수 있다(T7). 슬래시·점·공백은 계속 받지 않는다.

PR-B에서 더한 판단(2026-11-11):

34. **데이터 분류 함수는 `taxonomy.ts`에 이름 끝 `In`으로 더했다.** 코드 상수는 기본값이다. 동의어 태그 → 카테고리 301은 리뷰 뒤 태그 페이지로 옮겼다(58).
35. **관리자 쓰기 검사(초안 저장·발행·리비전 가져오기)와 관리자 목록은 `settings/taxonomy`를 메모 없이 매번 읽는다.** 다른 서버 인스턴스에서 방금 만든 카테고리를 낡은 메모(60초) 때문에 "목록에 없음"으로 거절하지 않게 한다. 공개 읽기는 Plan대로 메모 60초다. 읽기에 실패하면: 공개는 기본값, 발행·가져오기는 503, 초안 저장은 기본값으로 저장하고 카테고리 목록 검사를 하지 않는다(리뷰 뒤, 59).
36. **저장 문서의 태그 검사(`tagsSchema`)는 형식만 본다.** 동의어 검사는 저장 API가 데이터 동의어로 한다. 동의어를 가진 카테고리를 지우면 그 동의어가 보통 태그가 되기 때문이다.
37. **분류 일괄 바꾸기는 초안 version을 1 올린다.** 열린 에디터가 옛 분류로 덮어쓰지 않고 다음 저장에서 충돌 창을 본다. "발행 뒤 변경"이 없던 글은 `fromDraftVersion`도 함께 올린다(변경 있음이 생기지 않는다). 리비전과 `updatedAt`은 그대로다(목록의 "고친 때" 순서가 바뀌지 않게).
38. **합치기는 따로 있는 동작(`merge { key, into }`)이다.** 처음에는 key 바꾸기(`rekey`)의 새 key가 있는 카테고리면 합쳤다. 리뷰 B1 뒤 `rekey`는 있는 key를 400으로 거절하고, 화면도 입력 창에서 막는다. 합치면 옛 카테고리의 동의어 태그를 남는 카테고리로 옮긴다.
39. **별칭 표 규칙.** from → to를 더할 때 to에서 시작하던 줄은 지운다(다시 살아 있는 값이다). from으로 가던 줄은 to로 잇는다(두 번 건너지 않는다). 카테고리를 지우면 그리로 가던 줄도 지운다. 새 카테고리 key가 옛 별칭이었으면 그 줄을 지운다.
40. **태그의 새 이름은 코드 규칙으로만 정규화한다.** 데이터 별칭을 따르면 되돌리기(b → a, 별칭 a → b)가 "같은 이름" 400이 된다(스모크 첫 실행에서 찾았다).
41. **카테고리 이름 바꾸기는 글을 바꾸지 않는다.** 이름은 글 문서에 없다. 그 카테고리의 공개 글 캐시만 비운다(글 상세가 이름을 보인다).
42. **분류·연재 기록 줄.** `entryId`는 `taxonomy`·`series`(글 하나가 아니다), `op`(create·rename·rekey·merge·delete·move, update·create-project·delete), `from`·`to`, `affected`(바뀐 글 ID), `purged`(캐시를 비운 글 ID, 이름 바꾸기 포함), 글 옮기기는 `previous`(글별 옛 초안·발행본 카테고리, 되돌리기 근거). 알림·다시 시도는 60을 본다.
43. **여러 글 퍼지는 `purgePublicCacheMany`다.** 글 태그를 50개씩 지우고 목록 태그는 한 번 무효화한다. 백업 알림은 바꾸기마다 한 번이다(백업 Action은 컬렉션 전체를 내보낸다).
44. **공개 카테고리 탭 순서는 분류 데이터 순서다.** 이름은 글 값(`categoryLabel`)이다. 목록에 없는 key(기본값으로 읽은 때)는 뒤에 key 이름순이다.
45. **커버·OG 팔레트는 카테고리 key로 고른다(리뷰 S10 뒤).** 이름을 바꿔도 색이 같다. 새 카테고리는 해시 팔레트다. OG 글꼴 서브셋 스크립트는 코드 기본값 그대로다. 서브셋은 KS X 1001 한글 2,350자를 넣으므로 보통 이름은 그려진다.
46. **연재 정보의 버전 검사는 문서 `updateTime`이다.** 문서에 칸을 더하지 않는다(Plan 4.3 "스키마 그대로"). 문서의 다른 칸은 그대로 둔다. 연재를 프로젝트로 바꾸는 길은 없다(새 프로젝트로 만든다).
47. **연재·프로젝트 정보 "지우기"를 더했다.** 그 key를 쓰는 글이 0편일 때만이다. Plan 8.4 11의 "지움"과 잘못 만든 프로젝트를 치우는 길이다(`DELETE /api/admin/series/{key}`).
48. **새 프로젝트: 대표 순서 = 지금 최댓값 + 1, 대표 아님, 첫 Part 제목은 빈칸.** 새 글 API의 kind에 project를 더했다(Plan D2). 첫 화면 "새 글"은 그대로 글·노트다.
49. **리비전 가져오기는 옛 판의 분류를 지금 분류에 맞춘다.** 옛 key는 별칭으로 새 key, 지운 카테고리는 없음, 태그는 지금 별칭·동의어로 정규화한다. 지금 발행본과 같은 판은 가져오기 단추를 끈다(초안 버리기와 같다). `restore` 줄의 판 번호는 가져온 판이다.
50. **리비전 API 주소.** `GET …/revisions`, `GET …/revisions/{rev}`, `POST …/revisions/{rev}/restore { baseVersion }`. 판 번호가 1~6자리 정수가 아니면 400이다.
51. **T5는 서브에이전트가 구현했다.** 영상은 격자에서 불러오지 않고, 상세에서만 `preload="metadata"`다. 지우기는 정리 API를 `ids` 하나, `minOrphanDays: 0`으로 부른다. 마크다운 한 줄의 주소 괄호·공백을 인코딩한다. 상세 패널은 sticky이고 모바일은 아래 시트다.
52. **메뉴는 글·이미지·분류·연재·출간 기록이다.** 독자·설정은 PR-C·PR-D가 더한다.
53. **`publicPathFor`를 `public-paths.ts`로 옮겼다.** `entry-rules`는 다시 내보낸다. 관리자 화면이 공개 주소 함수를 가져오면 zod가 앱 첫 청크에 들어왔다(159 KB → 87 KB, gzip 45 → 25 KB).
54. **관리자 목록 API에 `categoryLabel`(데이터 이름)을 더했다.** 첫 화면 검색·분류 칸이 쓴다. 에디터도 떠날 때 이름을 알린다.
55. **에디터의 분류 선택지는 열 때 한 번 받는다(분류·연재 두 요청).** 받지 못하면 코드 기본 카테고리로 연다. 글의 key가 목록에 없으면 "(목록에 없음)" 선택지를 보인다.
56. **분류 화면 "글 옮기기"의 후보는 관리자 목록(초안 카테고리) 기준이다.** 서버는 고른 글의 초안·발행본을 함께 바꾼다.
57. **`settings/taxonomy`는 지우지 않고 남겼다.** 스모크 첫 실행이 만들었다(기존 10개 + 시험 1개, "앞 10개가 기본값과 같다" 검사 통과). 정리 뒤 값은 기본 10개 그대로다(Plan 8.3 "저장했으면").

PR-B 리뷰 뒤 더한 판단(2026-11-11, 6.5~6.8):

58. **동의어 태그 → 카테고리 301은 태그 페이지가 데이터 동의어로 한다.** 미들웨어(`redirects.ts`)는 Firestore를 읽지 않으므로 태그 주소 정규화(대소문자·공백·NFC·코드 별칭)만 한다. 지운 기본 카테고리의 동의어(예: `ai`)는 보통 태그가 되고, 그 주소는 태그 목록이다(리뷰 S2). 대소문자가 다른 동의어 주소(`/blog/tag/JavaScript`)는 두 번 넘어간다(정규화 → 카테고리).
59. **초안 저장의 분류 처리.** 옛 key는 별칭으로 새 key가 된다. 목록에 없는 카테고리는 버전 검사 뒤에 400이다(충돌 409가 먼저다). 분류를 읽지 못하면 기본값으로 태그를 정규화하고 카테고리 목록 검사를 하지 않는다(리뷰 S5·S6).
60. **묶음 줄(분류·연재)의 알림과 다시 시도.** 다른 묶음 동작의 성공은 앞 동작의 퍼지 실패를 지우지 않는다. 다시 시도 줄만 지운다. 다시 비우기는 최근 7일 안에 퍼지가 실패한 그 묶음 줄들의 `purged`(없으면 `affected`)를 모두 비운다. 백업 다시 알리기는 publish로 보낸다(리뷰 S3·B5·B6). 출간 기록 화면은 `entryId`로 묶음 줄을 알아본다(다시 시도 줄도 "(지운 글)"을 붙이지 않는다).
61. **자산 정리의 재검사는 이전 발행본(`revisions`)도 본다.** 1판에만 쓰는 이미지는 지우지 않는다(리뷰 S1, 중요). 2단계 정리 규칙도 같이 바뀐다. 라이브러리는 그 이미지를 "쓰지 않는 것"으로 보이지만, 지우기는 시험 실행에서 "아직 쓰는 글이 있다"(kept)로 멈춘다. 컬렉션 그룹 읽기는 색인이 필요 없었다(62개, 0.5초).
62. **OG 이미지는 분류와 프로젝트 제목을 메모 없이 읽는다.** OG는 CDN이 하루 저장한다. 다른 인스턴스의 낡은 메모로 그린 그림이 남지 않게 한다(리뷰 S4). 관리자 목록 API도 분류를 메모 없이 읽는다(B2).
63. **프로젝트 GitHub·데모 주소는 http·https만 받는다.** 공개 `/projects`가 `href`로 그린다(리뷰 S8. zod `url()`이 `javascript:`를 통과시켰다).
64. **연재 기록 줄은 트랜잭션 안에서 쓴다.** 커밋 뒤의 version 읽기가 실패해도 저장은 성공(version null)이다(리뷰 S9).
65. **관리자 목록 force 다시 받기는 진행 중인 요청을 다시 쓰지 않는다.** 가장 최근 요청만 상태에 쓴다. 분류 화면은 바꾼 뒤 늘 목록을 다시 받는다(리뷰 B2).
66. **메타 패널 "+ 새 카테고리"의 409는 선택지를 다시 받는다.** 만든 뒤 다시 받기만 실패하면 지금 선택지에 새 카테고리를 더한다. 분류를 받지 못했으면 "(목록에 없음)"을 쓰지 않는다(리뷰 B3).
67. **초안 버리기·이전 판 가져오기가 409 아닌 이유로 실패하면 저장을 다시 예약한다**(리뷰 B4. 초안 버리기는 3단계부터 있던 같은 결함이다).
68. **스모크 정리는 추적하지 못한 시험 글도 찾는다.** 표지(`stage5-test`)가 ID·제목·slug·연재 key·기기에 있는 글이다(리뷰 S11).

PR-C에서 더한 판단(2026-11-11):

69. **명령의 id·이름·묶음·범위·기본 키를 명령 표(`command-keys.ts`)로 옮겼다.** Plan 4.1에 없는 파일이다. 서버 검사와 설정 화면이 같은 기본 키를 읽어야 한다. 레지스트리는 아이콘(lucide)·ProseMirror를 가져오므로 서버와 관리자 앱 첫 청크에 넣지 않는다. 레지스트리는 표의 칸에 실행 함수를 더한다. 표와 레지스트리가 같은지는 테스트가 본다.
70. **키 검사는 순수 모듈 `keymap-settings.ts`다(zod 없음).** 서버 API·설정 화면·에디터가 같은 함수를 쓴다(Plan 5절 "공유 모듈"). 서버는 zod로 모양만 보고 이 함수로 뜻을 본다.
71. **막는 키를 Plan의 6개보다 넓혔다.** Shift를 함께 누른 브라우저 키(⌘⇧T·N·W), 맥의 ⌃Tab, 편집 기본 키(Mod+C·V·X·A, Mod+Shift+V), Win 키, 수식 키(Mod·Ctrl·Alt) 없는 키(F1~F12만 예외)를 더했다. 이 키에 명령을 걸면 복사·붙여넣기나 글자 입력이 깨진다. Mod+Shift+C(코드 블록 기본 키)는 막지 않는다.
72. **`KeyBinding`의 플랫폼 값이 null일 수 있다.** 설정 화면은 이 기기 플랫폼 키만 고친다(Plan D14). 맥에서 굵게 키를 지우면 그 밖 플랫폼 키는 남아야 한다. 문서의 값 null은 Plan대로 "두 플랫폼 모두 키 없음"이다.
73. **저장 API는 기본값과 같은 줄을 빼고 저장한다.** 검사는 뺄 줄을 고르기 전에 요청 그대로 한다(모르는 id를 먼저 거른다).
74. **에디터는 저장된 설정의 모르는 명령 id(옛 명령)를 무시한다.** 형식·충돌 문제가 있으면 Plan대로 기본 키로 열고 띠로 알린다. 설정 화면은 그런 줄(다른 플랫폼 문제 포함)을 머리에 보이고 "이 줄들을 기본값으로"로 지운다. 이 기기에서는 다른 플랫폼 키를 고칠 수 없기 때문이다.
75. **키 판정기가 명령 목록을 키를 누를 때 읽는다.** 3단계의 `addKeyboardShortcuts`는 에디터를 만들 때 한 번 키를 묶는다. 설정은 에디터를 연 뒤 받으므로 판정기를 `handleKeyDown` 플러그인으로 바꿨다(우선순위 200 그대로). 설정을 받기 전 짧은 동안은 기본 키다.
76. **설정 화면에서 저장한 키는 다음에 여는 에디터부터 적용된다.** Plan D14 "열 때 한 번 읽는다" 그대로다. 화면 문구로 알린다.
77. **찾기는 명령 하나(`find`, "찾기·바꾸기", Mod+F)다.** 막대는 찾기 줄과 바꾸기 줄을 늘 보인다. 바꾸기 전용 키는 두지 않았다(맥의 ⌘H는 앱 숨기기다). 다음·이전은 막대 안 Enter·Shift+Enter다.
78. **찾기 명령은 페이지 범위다.** 편집 모드면 제목 칸에 포커스가 있어도 막대를 연다. 소스·미리보기 모드면 명령이 false를 돌려주어 브라우저 찾기가 열린다(Plan D7).
79. **찾기 세부.** 입력하는 대로 커서 뒤 첫 결과를 고르고 그 자리로 스크롤한다(포커스가 막대에 있으면 ProseMirror가 스크롤하지 않아 직접 한다, 브라우저 확인 중 찾음). 열 때 한 블록 안의 짧은 선택(100자 이하)을 미리 넣는다. 찾은 수는 1000까지 센다. 문자열 검색은 글자 그대로다(`\n`을 줄바꿈으로 바꾸지 않는다). 막대 안 어디서든 Esc로 닫는다. 닫으면 강조를 지우고 에디터로 포커스를 돌린다.
80. **블록 이동 세부.** 옮길 블록은 목록 항목 안이면 그 항목, 표 안이면 표 전체, 그 밖은 문서·인용·콜아웃의 바로 아래 블록이다. 부모의 처음·끝이라 못 옮기면 감싼 블록(인용·콜아웃·목록)을 옮긴다. 더 못 옮겨도 키는 받는다(맥 ⌘⇧↑가 문서 처음까지 고르지 않게). `closeHistory`로 앞의 입력과 묶지 않는다(Plan "Mod+Z 한 번에 한 칸"). 툴바에는 그리지 않는다(Plan D6 "팔레트, 모바일 바").
81. **모바일 바는 9개다.** 블록 위·아래를 이미지와 되돌리기 사이에 넣었다. 390px에서 한 칸 38px, 가로 넘침 0.
82. **자동 재시도 세부.** 네트워크 오류는 보낼 때마다 먼저 기기에 보관한다. 기다리는 동안 상태는 `retrying`이고 상단 바에 "(1/3)"과 "다시 시도"(바로 보내고 횟수 0)를 보인다. 기다리는 동안 입력하면 2초 저장이 재시도를 대신하고 횟수는 이어진다. 온라인으로 돌아오면 기다리지 않고 보낸다. 409·413·422 밖의 4xx(400·403·404·429)도 다시 보내지 않는다(Plan은 다시 보낼 오류를 네트워크·5xx로 정했다).
83. **T9: 폭·정렬은 "이미지만 있는 단락"에만 쓴다.** Plan의 두 모양은 단락 하나를 차지한다. 단락에 다른 글자, 이미지 둘, 마크(링크 등) 있는 이미지가 있으면 폭·정렬을 쓰지 않는다. 표 칸(인라인)과 체크 항목 첫 단락(`- [ ] ` 표시와 한 줄)도 쓸 수 없다. 영상 주소도 쓰지 않는다(공개 렌더가 `<video>`로 바꾸며 폭을 버린다).
84. **T9: 에디터 표시도 같은 판정이다(보이는 대로 저장).** 데코레이션이 그 단락에만 폭·정렬을 보인다. 메뉴의 폭·정렬 칸은 그 단락에서만 켜지고, 조건이 깨지면 "이 줄에는 다른 내용이 있어 폭·정렬을 저장하지 않습니다"를 보인다.
85. **T9: 값과 읽기 세부.** 폭은 16~4096 정수, 정렬은 center·right만 저장한다(left는 null). 폭 없는 `<img src>`와 `<p align="left">`도 이미지로 읽는다(쓸 때 `![]()`). 태그·속성 이름은 대소문자를 가리지 않는다. 모르는 이름 참조(`&nbsp;` 등)가 있으면 읽지 않는다(글자가 바뀌지 않게). 쓸 때 줄바꿈도 참조로 바꾼다(여는 태그가 한 줄이어야 HTML 블록이다). 에디터 안 복사·붙여넣기는 `data-width`·`data-align`으로 폭·정렬을 지킨다. 바깥 HTML의 `width`는 읽지 않는다(리뷰 뒤, 91).
86. **T9: 그런 이미지 단락이 다른 블록과 같은 목록 항목에 있으면 느슨한 목록으로 쓴다.** HTML 블록은 빈 줄까지 이어져 같은 항목의 다음 블록을 삼킨다. 앞의 단락 바로 뒤 `<img>`는 그 단락의 한 줄로 읽힌다. 단락 둘이 이어진 항목과 같은 처리다.
87. **T9: 끌기 세부.** 가운데 정렬은 끈 거리의 두 배, 오른쪽 정렬은 손잡이가 왼쪽에 있고 방향이 반대다(손잡이가 포인터를 따라간다). 3px 미만이면 저장하지 않는다. 최대는 본문 내용 폭이다. 폭·정렬을 바꾼 뒤에도 이미지 선택을 다시 두어 메뉴가 닫히지 않는다(되돌리기 한 번).
88. **T9: `sizes`.** 작성자 폭 W가 본문 폭 720보다 작으면 `(max-width: Wpx) 100vw, Wpx`, 아니면 지금 값이다.
89. **T9는 서브에이전트가 구현했다.** 이 세션이 위 83·84의 판정 방식과 범위를 정해 주었다. 찾기 플러그인 연결은 이 세션이 했다.
90. **스모크는 `settings/editor`를 처음 상태로 되돌린다.** 처음에 없었으면 지우고, 있었으면 처음 keymap으로 쓴다(version은 오른다). 덮어쓰기 전에 처음 keymap을 출력에 남긴다(리뷰 S10).

PR-C 리뷰 뒤 더한 판단(2026-11-11, 6.9~6.12):

91. **붙여넣은 HTML의 `width`는 이미지 폭이 되지 않는다.** 공개 글 페이지는 모든 새 자산 이미지에 `width`(최대 변형 폭)를 붙인다. 그 글을 복사해 붙이면 사용자가 정하지 않은 폭이 원시 HTML로 저장된다(리뷰 S2). 에디터는 자기 표지 `data-width`만 읽는다. 운영 초안의 `editorJson`에는 폭이 있는 이미지가 0개다(읽기 전용으로 셌다: editorJson 4개, 이미지 1개).
92. **기본 키와 같은 값은 키 검사에서 뺀다.** 이 기기 플랫폼만 바꾸면 다른 플랫폼에는 기본 키가 그대로 적힌다. 선택 풀기의 기본 키 `Escape`(수식 키 없음)가 검사에 걸려 그 명령을 바꾸거나 지울 수 없었다(리뷰 B1·S1).
93. **막는 키를 더 넓혔다(71에 더해).** 커서 이동·지우기 키(←·→·Home·End·PageUp·PageDown·Backspace·Delete와 그 조합, Mod+Shift가 아닌 ↑·↓ 조합), F5·F11·F12, Mod+R, 맥의 ⌃ 글자 편집 키(⌃A·B·D·E·F·H·K·N·O·P·T·V·Y), 맥의 ⌘·⌃ Space(리뷰 S6). 에디터 키 판정기가 먼저 받아 단어 지우기·줄 이동·새로 고침이 조용히 사라지기 때문이다. 기본 키는 모두 이 검사를 통과한다(테스트).
94. **체크 항목의 판정은 "실제로 쓰이는 블록 순번"으로 한다.** 빈 단락은 마크다운에 쓰이지 않는다. 빈 첫 단락 뒤의 이미지 단락을 HTML로 쓰면 체크 상자가 사라졌다(리뷰 S3). 에디터 표시도 같은 순번을 쓴다.
95. **블록 이동·바꾸기는 앞·뒤 입력 모두와 묶지 않는다.** 옮긴 직후의 입력이 옮기기와 한 묶음이 되었다(리뷰 B5). 동작 뒤에 빈 `closeHistory` 트랜잭션을 보낸다(`history-step.ts`).
96. **찾기 보완.** 인라인 원자(이미지·인라인 수식·줄바꿈)를 걸치는 결과는 뺀다(정규식 `.`가 이미지를 지웠다, 리뷰 S5). 다시 Mod+F를 눌러도 지금 선택이 찾은 결과면 찾을 글자를 바꾸지 않는다(B6). 팔레트·대화상자·충돌 창이 열려 있으면 막대를 열지 않는다(B7). 막대의 단추에 포커스가 있을 때 Mod+Z·Mod+Shift+Z(그 밖 플랫폼 Ctrl+Y)는 에디터를 되돌린다(B3, 글자 칸 안에서는 그 칸의 글자를 되돌린다). 편집 모드 밖의 팔레트에는 찾기가 없다(B11). 결과 글자의 좌표로 스크롤한다(B14).
97. **이미지 메뉴 보완.** 맥 Safari·Firefox는 단추를 눌러도 포커스를 주지 않는다. 메뉴를 누르는 동안 표시를 두어 입력 칸의 blur를 "메뉴 안으로 옮김"으로 본다(리뷰 B4, 그 브라우저로는 확인하지 못했다). 폭·정렬을 끈 이유를 메뉴 안 글자로도 보인다(B12).
98. **설정 화면 보완.** 저장된 문서가 깨졌으면 바꾼 것이 없어도 저장할 수 있다(B2). 409면 서버 값과 version만 새로 받고 화면 값은 남긴다(다시 저장하면 덮는다, B10). 저장하지 않은 변경이 있으면 앱 안 이동과 탭 닫기 전에 묻는다(B10). 이를 위해 앱 컨텍스트에 `registerLeaveGuard`를 더했다(에디터 연결부와 같은 가드 자리). "바꾼 것 되돌리기"는 빨간 이유도 지운다(B16). 1024px 미만에서 저장 막대는 위 막대 아래에 붙는다(B8). 키 잡기는 바깥을 누르거나 창이 포커스를 잃으면 취소한다(B15).
99. **폭만 정한 새 자산 이미지에 height를 붙인다.** 그 변형의 비율로 계산한다(화면 밀림 방지, 리뷰 S8).
100. **세미콜론 없는 이름 참조로 읽힐 `&`가 있으면 원시 이미지 HTML로 읽지 않는다.** 브라우저는 속성 값의 `&lt b`를 `< b`로 읽는다. 에디터가 글자 그대로 두면 저장 때 뜻이 바뀐다(리뷰 S9). `&이름=`(주소의 `&token=`)은 브라우저도 풀지 않으므로 받는다.

PR-D에서 더한 판단(2026-11-11):

101. **순수 요약 함수는 `src/lib/tracker/daily.ts`에 둔다.** Plan 4.1에 없는 파일이다. 서버 저장(더할 수), 관리자 API(요약), 스모크(기대값), 테스트가 같은 함수를 쓴다. `events.ts`와 `daily.ts`는 zod·`@/` 별칭을 쓰지 않는다. 스모크가 Node로 직접 가져오고, `events.ts`는 브라우저 번들에도 들어간다.
102. **시험 표지 방문은 localhost에서만 저장한다(리뷰 S6 뒤. 처음에는 "운영 호스트가 아닐 때"였다).** Plan D20 서버 2 "스모크는 시험 표지로 따로 쓰고 지운다"의 구현이다. 방문 ID가 `stage5-test-`로 시작하고 Host 헤더·요청 주소가 모두 localhost·127.0.0.1이면 저장한다. 미리보기에서는 시험 표지 방문도 저장하지 않는다. 운영 호스트에서는 그 방문을 저장하지 않는다(실제 데이터와 섞이지 않게). 브라우저 수집 스크립트의 방문 ID는 `crypto.randomUUID()`라 이 표지가 생기지 않는다. 미리보기는 Vercel 로그인 보호가 있다. 시험 데이터는 같은 컬렉션에 쓰고 스모크가 지운다. 스모크는 오늘 요약 문서가 이미 있으면(실제 데이터일 수 있다) 저장 시험을 건너뛴다.
103. **운영 판정은 Host 헤더와 요청 주소의 호스트를 모두 본다.** Astro는 `X-Forwarded-Host`를 요청 주소에 쓴다(빌드 결과에서 확인). Vercel은 Host로 배포를 고르므로 미리보기 주소로 운영 Host를 보낼 수 없다. `cruzlab.dev`(www 없음)는 운영 주소가 아니다(www로 넘어간다).
104. **Origin 검사를 더했다.** Plan에 없다. Origin이 있으면 요청 주소와 같아야 한다(다른 사이트가 방문자 브라우저로 이벤트를 보내지 못하게). 없으면 받는다. 빌드 결과(운영 모드)에서는 Astro의 `checkOrigin`이 `text/plain` POST를 먼저 막는다(Origin이 다르거나 없으면 403, 그 응답에는 no-store가 없다). 브라우저의 `sendBeacon`은 늘 같은 사이트 Origin을 보낸다.
105. **요청 하나 = 한 페이지.** 본문 `{ v, p, i?, e: [...] }`. 경로·글 ID를 이벤트마다 쓰지 않는다. 수집 스크립트 크기를 줄이고, 긴 한글 slug 경로가 4 KB를 쉽게 채우지 않게 한다. 구조 오류(형식·종류·순서·글 ID)는 요청 전체를 400으로 받지 않는다. 실제 브라우저에서 드물게 나오는 값은 고쳐 받거나 그 이벤트만 버린다(126).
106. **모르는 글 ID(발행 글 메모 목록 밖).** view는 글이 아닌 페이지로 센다. read·copy는 버린다. 앞 페이지 글 ID는 지운다. 메모는 60초라 방금 발행한 글은 다른 인스턴스에서 1분 안쪽 동안 글로 세지 않는다.
107. **경로 길이 한도는 1,024글자(퍼센트 인코딩)다. 넘으면 잘라 받는다(리뷰 S4 뒤. 처음에는 거부였다).** slug는 300자까지 받는다(한글 한 글자 = 9글자). 지금 가장 긴 공개 경로는 156글자다. 한글 slug 약 110자까지는 자르지 않는다. 요약 문서의 key는 300자로 더 자른다(128).
108. **방문 수의 계산.** 사이트 방문 = 방문의 첫 이벤트(seq 1) 수. 글 방문 = 이 방문에서 그 글을 처음 연 view(브라우저가 이 방문에서 연 글 ID를 기억한다). 자정을 넘는 방문은 시작한 날에만 사이트 방문으로 센다.
109. **비율의 분모는 조회 수다.** 75%·끝까지 읽음 = 그 글을 연 번 중 그 깊이까지 간 번. 떠남 = 조회 − 같은 방문에서 다음 페이지로 간 수(onward). 같은 글을 다시 열면(새로 고침) onward로 세고 다음 글·들어온 곳으로는 세지 않는다.
110. **404는 view 대신 보낸다.** 조회 수에 넣지 않는다. 방문의 첫 페이지면 사이트 방문·들어온 곳에 센다. 앞 페이지가 글이면 그 글의 onward로 센다.
111. **글별 들어온 곳 = 그 글을 열기 바로 전.** 첫 페이지면 바깥 도메인·(direct)·블로그 안 경로(새 탭 등), 그 뒤는 방문 안 앞 페이지 경로다. 사이트의 들어온 곳은 방문의 첫 페이지 기준이다.
112. **바깥 링크는 요약에 수만 둔다.** 도메인·주소는 원본 줄에만 있다(경로 예에 도메인이 보인다).
113. **보내기 횟수는 페이지당 2번이다(리뷰 S11·B5 뒤. 처음에는 최대 4번이었다).** view 1번 + 떠날 때 1번(Plan D20 "최대 2번"). 떠날 때는 새 이벤트가 있을 때만 보낸다. 그래서 탭을 오간 뒤(첫 숨김 뒤) 생긴 이벤트는 보내지 못할 수 있다(8절 8). 떠날 때 보내는 이벤트는 10개까지, 바깥 링크 주소는 200글자까지다. 경로 1,024글자와 합쳐도 본문이 4 KB를 넘지 않는다(테스트로 고정). 처음에는 4 KB를 재며 오래된 이벤트를 버렸다.
114. **2 KB 한도를 맞춘 방법.** 수집 스크립트는 다른 클라이언트 번들과 나누는 모듈을 가져오지 않는다(처음 빌드는 `events`·`admin-hint` 청크가 따로 생겨 모듈 3개였고, 수집 모듈만 2,480바이트였다). 관리자 표시 인라인 스크립트가 `<body data-admin>`을 달고 수집 스크립트는 그것을 본다. 검색은 검색창(`[data-post-search]`) 입력을 직접 듣는다(`SearchFilter.astro`는 바꾸지 않았다). 인라인 표시 스크립트를 한 줄로 썼다(인라인은 빌드가 줄이지 않는다). 처리기는 모두 window에 단다. `JSON.stringify`·`Date.now`를 짧은 이름으로 받는다. 검색어 정규화는 서버만 한다. 빌드는 4 KB 미만인 수집 모듈을 페이지에 인라인한다. 리뷰 수정 뒤 합 2,038바이트(표시 203 + 수집 1,835)다. 남는 자리는 10바이트다(8절 9).
115. **뺀 것.** 미리 그리기(prerender) 기다리기, 가운데 단추 클릭(auxclick). 2 KB 한도 때문이다. 이 사이트는 미리 그리기를 쓰지 않는다. 뒤로 가기 캐시(bfcache)에서 돌아온 페이지 다시 세기는 처음에 뺐다가 리뷰 B2 뒤 되살렸다(130).
116. **75%·100% 판정.** 본문(`#post-body`) 기준이다. 스크롤 때와 떠날 때 잰다. 본문 끝이 화면 안에 들어오면 100%다. 그래서 화면 하나에 들어오는 짧은 글은 열고 떠나면 100%다.
117. **로봇 User-Agent.** 걸러 내는 데만 쓰고 저장하지 않는다. 카카오톡 앱 안 브라우저(KAKAOTALK)·다음 앱(DaumApps)은 사람이다. 카카오 미리보기(kakaotalk-scrap)·다음(Daumoa)·네이버(Yeti) 수집기와 이름에 bot이 있는 수집기, curl·python 같은 프로그램은 로봇이다. User-Agent가 없으면 로봇이다.
118. **readers30.** 오늘 포함 30일(서울 날짜). 날짜 요약 문서를 문서 ID 범위로 읽는다(있는 문서만 읽기 비용). 기록이 없으면 0, 읽지 못하면 null("—").
119. **방문 경로 예는 그 글의 조회가 있는 날만 찾는다.** 빈 날의 쿼리도 읽기 1회라서다. 최신 날부터 7일씩 찾는다. 리뷰 S9 뒤: 그 글을 처음 연 줄(`meta.first`)만 고른다(같음 조건 네 개의 단일 필드 색인 병합, 복합 색인 없음). 정렬 조건은 복합 색인이 필요해 쓰지 않는다. 하루에 30줄까지 받아 시각 최신순으로 고른다.
120. **90일 정리.** day < 오늘 − 89인 원본 줄을 지운다(90일 화면 범위 밖). 두 독자 API 모두 열 때 500개까지 지운다. 날짜 요약 문서는 지우지 않는다(하루 1개, 작다).
121. **관리자 독자 API.** `?days=`는 30·90만 받는다(그 밖 400). 글 ID 형식을 검사한다. 지운 글도 기록을 보인다(제목은 목록에서 찾고 없으면 ID).
122. **`/about` 안내 문구는 합니다체다.** 그 페이지의 글투다. 뜻은 Plan D20 6과 같다.
123. **화면 세부.** 두 화면이 함께 쓰는 조각은 `ReaderParts.tsx`에 둔다. 기간(30·90일)은 주소에 쓰지 않는다. 다른 글로 가면 30일로 돌아간다. 행 메뉴 "독자 보기"는 초안이 아닌 글(발행·숨김)에만 있다.
124. **`stage4-public.mjs`의 개발 서버 실행.** 개발 서버는 스크립트를 인라인하지 않는다. 크기 대신 수집 모듈이 실렸는지만 본다. 크기는 빌드 결과로 잰다.

PR-D 리뷰 뒤 더한 판단(2026-11-11, 6.13~6.16):

125. **글이 아닌 페이지의 코드 복사는 사이트 수로만 센다(리뷰 S1 = B1).** 노트 목록(`/notes`)에도 복사 단추가 있다. 처음에는 서버가 글 ID 없는 copy를 거부해 그 요청의 다른 이벤트까지 버렸다. 모르는 글 ID의 copy도 사이트 수로 센다. read는 지금처럼 글이 있어야 한다.
126. **검사의 두 갈래(리뷰 S4 = B4).** 구조 오류(형식·종류·순서·글 ID)는 요청 전체 400이다. 드문 실제 값은 받는다: 들어온 곳 hostname은 밑줄·끝의 점·IPv6를 받고, 그래도 읽지 못하면 `(other)`("기타")다. `//`로 시작하는 경로를 받는다(저장 key와 화면 글자로만 쓴다). 긴 경로는 자른다. 읽지 못하는 바깥 링크 주소는 그 이벤트만 버린다. 검색어는 요청마다 5개까지 받고 나머지는 버린다.
127. **view·404는 요청마다 1개, seq는 요청 안에서 커져야 한다(리뷰 S5).** 한 요청에 seq 1인 view를 여러 개 넣어 방문 수를 부풀리지 못하게 한다(400 `views`·`order`).
128. **요약 문서 보호(리뷰 S2).** 방문자가 정하는 key(들어온 곳, 404 경로)는 요약에서 300자로 자른다(Firestore 필드 경로 1,500바이트 안). 원본 줄 배치를 먼저 쓰고 요약을 따로 쓴다. 요약 쓰기가 실패해도(문서가 1 MiB에 닿음, 쓰기 경합) 그날 원본 줄은 남는다. 요청 수 제한(rate limit)은 없다. 누군가 운영 주소로 서로 다른 key를 대량으로 보내면 그날 요약 문서가 커질 수 있다(8절 7).
129. **30분 쉬면 새 방문이다(리뷰 S3 = B3).** 브라우저가 마지막 이벤트 시각을 저장하고, 30분이 지났으면 새 방문 ID를 만든다. 탭을 열어 두거나 브라우저가 세션을 되살려도 다른 날의 방문이 이어지지 않는다(D20 2). 방문당 200개 상한에 닿은 탭도 30분 뒤 다시 센다. 쉬지 않고 자정을 넘는 방문은 하나다. 그 방문은 시작한 날에만 사이트 방문으로 세고, 자정 뒤 처음 연 글은 다음 날 글 방문으로 센다(리뷰 S10, 화면 머리 "방문은 탭 하나의 세션").
130. **bfcache에서 돌아온 페이지를 다시 센다(리뷰 B2).** `pageshow`의 `persisted`면 방문 상태를 다시 읽고 view를 보낸다. 그러지 않으면 목록 → 글 X → 뒤로 → 글 Y에서 Y의 앞 페이지가 X로 잘못 남고, 낡은 순서 번호가 저장 공간을 덮었다.
131. **페이지당 보내기 2번(리뷰 S11·B5).** 113에 적었다.
132. **시험 표지 방문은 localhost에서만(리뷰 S6).** 102에 적었다.
133. **스모크 정리(리뷰 S7).** localhost가 아닌 주소면 시작하지 않는다(보통 방문이 운영에 저장되지 않게). Ctrl+C는 다음 요청부터 멈추고 main의 finally가 정리한다(정리 중 요청이 문서를 다시 만들지 않게). 요약 문서는 지우지 않고 이 실행이 더한 수(204를 받은 요청의 기대값)를 increment(-n)로 뺀 뒤 0인 칸·빈 맵을 지우고, 수가 남지 않으면 문서를 지운다. 그사이 들어온 실제 수는 남는다. 서울 자정 5분 안이면 저장 시험을 건너뛴다.
134. **90일 정리는 열 때 500개씩 10번까지(리뷰 S8).** 독자 화면을 오래 열지 않아 밀린 줄을 따라잡는다.
135. **로봇 판정(리뷰 B11).** `bot`은 뒤에 `/`·`;`·`)`·`-`가 오거나 낱말일 때만 로봇이다(Googlebot/, PetalBot;, Slackbot-). CUBOT 휴대폰 이름은 사람이다.
136. **화면 보완(리뷰 B7~B10).** 목록을 받기 전에는 "(목록에 없는 글)"을 붙이지 않는다. 막대 색은 brand-hover(#059669, 흰 배경과 약 3.8:1)이고, "날짜별 값 보기"(details 안 표)로 날짜별 값을 읽는다(터치·키보드·화면 읽기 프로그램). 빈 상태 문구를 병합과 상관없이 맞게 고쳤다. 경로 예는 페이지마다 가장 깊이 읽은 곳과 복사 여부를 따로 두고 글자를 마지막에 만든다.

PR-E에서 더한 판단(2026-11-11):

137. **Server-Timing은 글·노트·프로젝트 글 상세 세 곳과 `/og/<id>.png`에 붙인다.** Plan D16은 "글 상세 응답"이다. 세 상세 페이지는 같은 `renderEntry`를 쓰고, main 병합 뒤 운영 콜드 측정(감사 문서 11.3의 7)에 같은 항목이 필요하다. `/notes` 스트림·목록에는 붙이지 않았다.
138. **항목 이름.** `db`(글 찾기), `render`(본문 렌더 전체)와 그 안의 `assets`·`hl`·`md`, `adj`·`series`·`project`, `total`, `inst`. Plan의 "Firestore 읽기, 하이라이터 준비, 마크다운 변환, 전체"를 단계별로 나눈 것이다. 설명(desc)은 ASCII만 쓴다(`Headers`가 한글 값을 거부한다). `total`에는 페이지 모듈을 처음 읽는 시간이 들어가지 않는다(Astro는 페이지 모듈을 읽은 뒤 페이지 코드를 돌린다). 그래서 `inst`를 더했다(Plan에 없음): desc는 이 인스턴스의 몇 번째 측정인지, dur는 프로세스 나이다. 콜드 요청인지 데운 요청인지 이것으로 가린다. TTFB − `total`은 모듈 읽기와 네트워크다.
139. **공개 응답의 Server-Timing은 CDN 저장본에도 남는다.** 내용은 단계별 시간과 프로세스 나이뿐이다(경로·ID·비밀값 없음). 잴 때는 쿼리를 붙여 CDN을 건너뛴다.
140. **D16의 조건("하이라이터 준비가 대부분")은 좁게는 맞지 않았다.** 로컬 CPU 프로파일(4.16)에서 첫 글 476 ms 중 Shiki가 311 ms였고, 그중 언어 20종 등록은 42 ms, 나머지 약 269 ms는 첫 하이라이트(문법 정규식의 번역·V8 컴파일·실행)였다. 언어만 불러오기는 Shiki 시간을 283 → 239 ms로, Oniguruma 엔진까지 바꾸면 143 ms로 줄였다(벤치, 4.16). 사용자에게 그림과 함께 설명하고 물었다. **사용자 결정(2026-11-11): 언어만 + 서버 Oniguruma 엔진.** 4단계 D8(서버·브라우저 같은 JS 엔진)과 다르다.
141. **에디터 미리보기는 JS 엔진 그대로다(브라우저에 wasm을 보내지 않는다).** 발행 글 62편(코드가 있는 글 56편, 코드 블록 294개)을 두 엔진으로 그려 HTML이 모두 같았다. 테스트 예시에서 다른 것은 SQL 함수 이름(`COUNT(`)뿐이었다. Oniguruma는 늘 칠했고, JS 엔진은 실행 환경에 따라 달랐다(이 테스트 파일만 돌리면 민무늬, 전체 테스트에서는 색칠). 그래서 SQL은 엔진 비교 테스트에서 빼고 서버 결과만 고정했다. 공개 페이지는 원본 엔진 쪽이 되었다.
142. **글의 언어는 마크다운을 정규식으로 넉넉히 찾는다.** 펜스 여는 줄(\`\`\`·~~~ 뒤 첫 낱말, 줄 앞의 들여쓰기·목록·인용 기호를 가리지 않음)과 원시 HTML의 `language-…`다. 한 번 더 파싱하지 않는다. 더 고르면 문법 하나를 더 불러올 뿐이고, 빠뜨리면 그 블록이 민무늬다. 발행 글 비교가 빠뜨림 0을 확인했다.
143. **문법 파일은 이름을 글자 그대로 쓴 `import()` 20개다.** 함수 번들 추적(nft)이 그 20개만 싣는다(빌드 결과로 확인). `shiki/langs` 묶음(언어 200여 종)을 가져오지 않으려고 이름·별칭 표를 코드에 두고, 테스트가 문법 파일의 name·aliases와 비교한다.
144. **자산 읽기와 하이라이터 준비를 함께 기다린다.** Plan에 없다. 네트워크와 CPU라 겹친다.
145. **OG는 D17 1·2번을 한 뒤 사용자 결정으로 다른 길을 골랐다.** 1번(재기): 미리보기 첫 OG 11,361 ms 중 불러오기 단계가 약 10.4초, 그리기는 0.56초였다. 규칙대로 2번(resvg-wasm)을 했다. 미리보기 첫 OG가 3,167 ms(그리기 2.5초), 다음 OG가 2,332 ms로 3초 목표를 넘었다. 그동안 원인을 코드에서 찾았다. 네이티브 판의 `isMusl()`(Linux에서 glibc·musl을 가림)이 `process.report.getReport()`를 부르고, 진단 보고서는 열린 네트워크 연결마다 역방향 DNS를 찾는다. OG 요청은 Firestore를 먼저 읽어 연결이 열려 있다. 로컬 재현: 연결 없음 34 ms, Firestore 연결 뒤 364 ms, `excludeNetwork` 켬 44 ms. 사용자에게 그림과 함께 설명하고 물었다. **사용자 결정(2026-11-11): 네이티브 판 + 불러오는 동안만 `process.report.excludeNetwork`.** D17 3번(Storage 저장본)은 하지 않는다. 새 Storage 경로가 생기지 않는다.
146. **`excludeNetwork`는 불러오는 동안만 켜고 원래 값으로 돌린다.** Node 22·24에 있는 설정이고 `@types/node`에 없어 타입을 더했다. `process.report`가 없는 런타임이면 아무것도 하지 않는다. 같은 순간 다른 코드가 진단 보고서를 만들면 네트워크 칸이 빠진다. 이 사이트는 진단 보고서를 쓰지 않는다.
147. **resvg-wasm을 시험할 때 본 것.** `includeFiles`에 pnpm 심볼릭 링크 경로(`node_modules/@resvg/resvg-wasm/…`)를 주면 함수 폴더에 깨진 링크가 생겼다. 실제 경로를 주면 실린다. 최종 코드는 wasm을 쓰지 않아 `astro.config.mjs`는 처음 그대로다.
148. **E2는 할 일이 없었다.** Fluid compute가 이미 켜져 있었다(3절). Plan 1.3의 미리보기 값도 켜진 상태에서 잰 것이다. 바이트코드 캐시는 production 배포에만 적용된다(Plan 1.3).
149. **Plan 1.3의 "함수 부팅 약 3.3초"에는 Firestore 첫 연결도 들어 있다.** 그 값을 잰 `/og/zz.png`는 ID 검사를 통과해 Firestore를 읽는다. 로컬 프로파일에서 첫 요청 841 ms 중 firebase-admin·Firestore·gRPC 모듈 읽기가 약 317 ms, 네트워크 대기가 약 203 ms였다. 큰 의존성을 늦게 불러오기(D16 3)는 하지 않았다. 글 상세는 어차피 Firestore를 읽는다.

PR-E 리뷰 뒤 더한 판단(2026-11-11, 6.17~6.20):

150. **markdown 블록이 있으면 사이트 문법 20개를 모두 불러온다(리뷰 S1 = B6).** markdown 문법은 다른 언어를 늦게 포함한다(`embeddedLangsLazy`, 사이트 언어 16개: 머리말의 yaml, 안쪽 펜스의 언어 등). 그 언어가 나중에 등록되면 Shiki가 markdown 문법을 다시 만든다. markdown만 불러오면 같은 블록이 인스턴스가 앞서 불러온 언어에 따라 다르게 칠해졌다. 사이트 문법 중 이런 문법은 markdown뿐이다(테스트가 확인한다). 에디터 미리보기와 같은 조건(20종 모두)이 된다.
151. **하이라이터가 실패해도 글을 실패시키지 않는다(리뷰 S2).** 엔진을 만들지 못하면 코드는 민무늬로 그리고, 문법 하나를 불러오지 못하면 그 언어만 민무늬다. 경고를 남긴다. 처음 코드는 실패를 그대로 던져 그 인스턴스의 상세 페이지가 모두 500이 될 수 있었다. "실패는 기억하지 않는다"는 주석도 고쳤다. Node는 평가에 실패한 `import()`를 기억하고, Oniguruma 엔진은 wasm 초기화 결과를 모듈에 둔다. 그래서 같은 인스턴스의 재시도는 같은 오류일 수 있다. resvg도 같다.
152. **Server-Timing 읽는 법(리뷰 S3).** 페이지 모듈이 정적으로 가져오는 것(Shiki 코어·엔진·테마, unified·remark·rehype·KaTeX)은 페이지 모듈을 읽을 때 평가되어 `hl`·`total`에 들어가지 않는다. 그 몫은 TTFB − `total`로 본다. 병렬 항목(`render`·`adj`·`series`, `assets`·`hl`, `imp-satori`·`imp-resvg`·`font`)은 더하지 않는다. 같은 스레드라 CPU 단계가 다른 항목의 벽시계 시간을 늘린다(4.16의 `font` 10.4초가 그 예다).
153. **`inst`의 프로세스 나이는 desc로 옮겼다(리뷰 S4).** `inst;desc="req 3 age 812.4s"`다. dur에 넣으면 DevTools가 요청 안의 긴 막대로 그린다. 헤더는 측정 쿼리 없이도 늘 붙인다(Plan D16·D17 그대로). 내용은 단계별 시간·요청 순서·프로세스 나이뿐이고, Timing-Allow-Origin이 없어 다른 출처는 읽지 못한다. CDN 저장본에는 처음 그린 요청의 값이 남는다.
154. **리다이렉트(301)에도 헤더를 붙인다(리뷰 S5).** `db`를 재고 요청 순서도 늘어나므로 다음 측정의 `req N`과 맞춘다.
155. **`excludeNetwork`가 없는 Node에서는 바꾸지 않는다(리뷰 S6).** Node 22.13·23.3부터 있다. 없으면 Linux에서 경고를 남긴다(불러오기가 다시 느려질 수 있다). 되돌릴 때는 원래 값을 그대로 넣는다. detect-libc(sharp)도 같은 방식으로 켰다 끈다(리뷰어 확인).
156. **펜스 정보 문자열은 remark처럼 풀고 판정한다(리뷰 S7).** 역슬래시 이스케이프(예: `objective\-c`)와 숫자 문자 참조(예: `&#106;s`)를 푼다. 이름 문자 참조는 풀지 않는다(언어 이름에 쓰일 일이 없다).
157. **문법 이름·별칭 표는 처음 부를 때 만든다(리뷰 B7).** 모듈 최상위에서 만들면 표를 쓰지 않는 에디터 미리보기 청크에도 남았다. 고친 뒤 미리보기 하이라이터 청크는 1,584,711바이트다(PR-E 전 1,584,737).
158. **테스트는 언어마다 서버 하이라이터 모듈을 새로 읽은 상태에서 비교한다(리뷰 S8·B2).** 처음 테스트는 한 모듈 상태에 언어가 쌓인 채 비교해, 불러온 언어에 따라 결과가 바뀌는 결함(150)을 잡지 못했다. markdown 예시에 머리말과 안쪽 펜스를 넣었다. 문법 파일은 운영과 같은 `GRAMMAR_LOADERS`로 읽는다(B4).
159. **`excludeNetwork` 테스트는 resvg를 불러오는 순간의 값을 모의 모듈로 잡는다(리뷰 B1).** 맥에서는 resvg가 `isMusl()`을 부르지 않는다. 원래 값이 false·true일 때 모두 되돌리는지, 불러오기가 실패해도 되돌리는지 본다. 켜는 줄을 지우면 이 테스트가 실패하는 것을 확인했다(markdown 규칙(150)도 같은 방법으로 확인했다).
160. **공개 점검이 Server-Timing을 본다(리뷰 B10).** `stage4-public.mjs`가 글·노트·프로젝트 글 상세(`db`·`render`·`adj`/`project`), OG 200(그리기 단계 6개), OG 404(`db`)의 헤더 항목과 `total`·`inst` 끝을 검사한다.

## 6. 리뷰 결과

### 6.1 방법

- 2026-11-11. 별도 리뷰어 서브에이전트 2개가 `git diff 90c6201`을 따로 보았다. 서버 쪽(S)과 화면 쪽(B)이다.
- 리뷰어에게는 Plan 3절 D4·D9·D10·D11·D15 2, 4.1~4.3, 5절, 7절 T1~T4, 8.1·8.4만 기준으로 주었다. 구현 세션의 판단(5절)은 주지 않았다.
- 리뷰어는 단위 테스트만 돌렸다(운영 데이터에 닿는 명령 금지).
- 이 세션이 지적마다 코드를 다시 읽어 확인하고, 심각도를 다시 매겼다.

### 6.2 수

| | 치명 | 중요 | 경미 |
|---|---|---|---|
| 서버(S) | 0 | 1 | 7 |
| 화면(B) | 0 | 1 | 14 |
| 합계 | **0** | **2** | **21** |

중요 2건과 경미 17건을 고쳤다. 경미 4건(S2, S6, B10, B11)은 고치지 않고 이유를 적었다(6.4). 모든 지적의 코드 경로를 다시 읽어 확인했다. B14의 Safari 호출 한도 값은 확인하지 못했다.

### 6.3 지적과 처리

| # | 심각도 | 지적 | 처리 |
|---|---|---|---|
| S1 | 중요 | `ADMIN_UID` 설정이 틀리면 진짜 관리자의 인증 기록을 지운다 | 고침(5절 28). 단위 테스트 7건 |
| B1 | 중요 | 떠나기 가드가 `flush()` 바로 뒤에 다시 그리기 전 ref를 읽는다. 발행 글을 고치고 바로 떠나면 목록 줄에 "변경 있음"이 없고 고친 때가 옛 값이다(Plan 8.4의 4) | 고침. 저장 성공 이벤트에서 ref를 바로 고친다. 브라우저 확인(4.4) |
| S2 | 경미 | 다른 배포(미리보기)의 "다시 비우기" 성공이 운영 퍼지 실패 알림을 지울 수 있다(퍼지 범위는 환경별) | 고치지 않음(6.4) |
| S3 | 경미 | 스모크 정리 중 네트워크 오류 하나가 정리 전체를 끊는다. 일부러 넣은 실패 줄이 남으면 가짜 알림 띠가 7일 보인다 | 고침. 단계마다 다시 시도·계속, 실패 줄 먼저, Ctrl+C 처리, 수 세기도 다시 시도 |
| S4 | 경미 | 다시 시도 API의 `getEntryLabel`이 글 문서 전체(본문·`editorJson`)를 읽는다 | 고침. `getAll(fieldMask)`로 4칸만 |
| S5 | 경미 | 목록 API가 요청마다 모든 초안의 본문을 읽는다 | 고침(5절 29) |
| S6 | 경미 | "인증 사용자 목록에는 관리자만 남는다"는 세션 요청이 서버에 닿을 때만 성립한다(팝업 뒤 탭 닫기·네트워크 실패·삭제 실패) | 고치지 않음(6.4) |
| S7 | 경미 | 테스트가 놓친 경계: 백업 skipped, 백업만 다시 한 줄, 숨김 실패 → 발행 성공, 세션 API의 삭제 순서 | 고침. 알림 3건 + 세션 7건 |
| S8 | 경미 | 빈 초안 "모두 지우기"가 이 기기에만 있는(보내지 못한) 내용을 고아로 만든다 | 고침(5절 30) |
| B2 | 경미 | 링크 가로채기가 같은 주소의 `#` 링크(미리보기 제목 앵커·각주)를 막는다. 옛 에디터 페이지에서는 됐다 | 고침. 테스트 1건, 브라우저 확인 |
| B3 | 경미 | 검색 칸 글자가 처음 값만 받는다. 메뉴 "글"·뒤로 가기로 주소가 바뀌어도 검색 칸과 거르기가 남는다 | 고침. 브라우저 확인 |
| B4 | 경미 | 지운 글: 에디터 404가 목록 줄을 빼지 않고, 목록 삭제가 보관 초안을 지우지 않아 알림 띠의 "열기"가 404로 남는다 | 고침(5절 31). 브라우저 확인(404 경로) |
| B5 | 경미 | 출간 기록 "더 보기" 실패가 화면에 보이지 않고 401에 로그인 화면으로 가지 않는다 | 고침 |
| B6 | 경미 | 에디터에서 처음 발행하고 돌아오면 줄 메뉴에 "공개 페이지 보기"가 없다(`publicPath`를 알리지 않음) | 고침. 브라우저 확인 |
| B7 | 경미 | 숨기기 문구가 캐시 비우기 결과를 보지 않는다. 알림 띠를 다시 받지 않는다 | 고침(5절 32). 브라우저 확인(로컬 `skipped`) |
| B8 | 경미 | 에디터에서 로그아웃하면 저장 대기 중인 마지막 입력을 묻지 않고 버린다 | 고침. 앱 안 이동과 같이 저장을 먼저 비운다 |
| B9 | 경미 | 확인 대화상자가 부모가 다시 그릴 때마다 초점을 "취소"로 되돌린다 | 고침. 브라우저 확인 |
| B10 | 경미 | "모두 지우기"의 다시 받기와 DELETE 사이에 다른 기기의 입력이 생기면 지운다 | 고치지 않음(6.4) |
| B11 | 경미 | 로그인 사전 안내 "로그인 기록도 남기지 않습니다"가 세션 요청 실패 때는 사실과 다를 수 있다 | 고치지 않음(6.4). 사용자가 문구를 그대로 두기로 했다(2026-11-11, 8절 2) |
| B12 | 경미 | 앱 안 이동이 가드를 기다리는 중의 뒤로 가기가 가드를 한 번 더 돌린다 | 고침. 받지 않고, 끝난 뒤 주소를 화면에 맞춘다 |
| B13 | 경미 | 글 ID 형식이 영문만 받아 한글 slug의 프로젝트 글 ID를 거절할 수 있다(지금 영향 없음) | 고침(5절 33). 테스트 |
| B14 | 경미 | 검색 칸 입력마다 `replaceState`. Safari는 짧은 시간에 많이 부르면 예외를 던진다 | 고침(예외를 삼킨다). 늦추기(디바운스)는 하지 않았다: 빠르게 에디터로 가면 마지막 글자가 주소에 없다 |
| B15 | 경미 | 모바일 메뉴 시트가 열려 있어도 `Shift+N`이 새 글을 만든다 | 고침. 브라우저 확인 |

### 6.4 고치지 않은 것과 이유

1. **S2(다른 배포의 다시 시도).** main 병합 뒤 관리는 운영 배포에서 한다. 미리보기 배포에서 "다시 비우기"를 누르는 일은 드물다. 공개 캐시는 `s-maxage=60` 뒤 SWR로 스스로 새로 고친다. 고치려면 `publishLog` 줄에 환경 칸을 더하고 알림 계산을 환경별로 나눠야 한다. 피해에 비해 크다.
2. **S6·B11(인증 기록이 남는 예외).** 클라이언트 SDK가 팝업 로그인에서 인증 사용자를 먼저 만든다. 세션 요청이 서버에 닿지 않으면 서버가 지울 수 없다. 클라이언트에서 `user.delete()`로 지우면, 진짜 관리자가 네트워크 실패를 겪을 때 관리자 기록을 지울 수 있다. 그래서 하지 않는다. 막는 방법(blocking function)은 Identity Platform이 필요하다. 사전 안내 문구는 사용자 결정(D4 2)이다. 사용자에게 물었고, 사용자는 그대로 두기로 했다(2026-11-11, 8절 2). 남은 기록은 Firebase 콘솔의 인증 사용자 목록에서 지울 수 있다.
3. **B10(모두 지우기 경쟁).** 서버 DELETE에 "빈 초안일 때만" 조건을 더해도, 다른 기기의 자동 저장 전(2초) 입력은 서버에 없어 막지 못한다. 창은 다시 받기와 DELETE 사이 1~2초다. 드물고, 칩은 사용자가 확인 창을 보고 누른다.

### 6.5 PR-B 리뷰 방법

- 2026-11-11. 별도 리뷰어 서브에이전트 2개가 `git diff origin/rebuild`(새 파일은 `git add -N`)를 따로 보았다. 서버 쪽(S)과 화면 쪽(B)이다.
- 기준은 Plan 3절 D1·D2·D3·D9·D10·D11·D12, 4.1~4.3, 5절, 7절 T5~T8과 그 아래 주의, 8.1·8.4 시나리오 8~12다. 작업 문서(이 문서)는 주지 않았다.
- 리뷰어는 단위 테스트·`tsc`·lint만 돌렸다(Firebase·네트워크 금지).
- 이 세션이 지적마다 코드를 다시 읽어 확인했다. 모두 실제 결함이었다.

### 6.6 PR-B 수

| | 치명 | 중요 | 경미 |
|---|---|---|---|
| 서버(S) | 0 | 2 | 9 |
| 화면(B) | 0 | 1 | 8 |
| 합계 | **0** | **3** | **17** |

B6은 S3과 같은 결함이다. 모두 고쳤다.

### 6.7 PR-B 지적과 처리

| # | 심각도 | 지적 | 처리 |
|---|---|---|---|
| S1 | 중요 | 1판에만 쓰는 이미지를 라이브러리가 바로 지울 수 있다(정리 재검사가 `revisions`를 보지 않는다). 1판 미리보기·가져오기에서 이미지가 깨진다 | 고침(5절 61). 스모크 검사 2건(kept, 글 삭제 뒤 지움) |
| S2 | 중요 | 기본 카테고리를 지우면 그 동의어 태그 주소가 미들웨어 301 → 404로 깨진다 | 고침(5절 58). 리다이렉트 테스트 고침. 공개 점검(동의어 301) 통과 |
| B1 | 중요 | "주소 key 바꾸기"에 있는 key를 넣으면 경고 없이 합친다(원래 카테고리가 지워진다) | 고침(5절 38). 서버 `merge` 동작, `rekey` 400, 화면 입력 창에서 막음. 스모크 검사 1건, 브라우저 확인(요청 0건) |
| S3·B6 | 경미 | 묶음 줄 알림: 뒤의 성공이 앞의 실패를 지운다. 다시 시도가 마지막 줄만 본다. 이름 바꾸기 줄에 비운 글이 없다. 백업은 delete로 간다 | 고침(5절 60). 알림 테스트 2건 |
| S4 | 경미 | OG가 메모된 분류·연재 제목을 쓴다(하루 남는 그림) | 고침(5절 62) |
| S5 | 경미 | 초안 저장이 버전보다 카테고리 목록을 먼저 본다(409 대신 400). 옛 key 별칭을 쓰지 않는다 | 고침(5절 59). 단위 테스트 고침 |
| S6 | 경미 | 분류 문서를 읽지 못하면 모든 초안 저장이 막힌다 | 고침(5절 59) |
| S7 | 경미 | 글 옮기기 기록에 발행본의 옛 값이 없다 | 고침(초안·발행본 둘 다) |
| S8 | 경미 | 프로젝트 링크가 `javascript:` 주소를 받는다 | 고침(5절 63) |
| S9 | 경미 | 연재 저장이 커밋 뒤 읽기 실패를 500으로 돌려준다. 기록 줄을 트랜잭션 밖에서 쓴다 | 고침(5절 64) |
| S10 | 경미 | 카테고리 이름을 바꾸면 커버·OG 색이 바뀐다 | 고침(5절 45) |
| S11 | 경미 | 스모크 정리가 추적한 ID만 지운다 | 고침(5절 68) |
| B2 | 경미 | 이름 바꾸기 뒤 첫 화면에 옛 카테고리 이름이 남는다(목록을 다시 받지 않음, 진행 중 요청 재사용, 메모) | 고침(5절 65·62) |
| B3 | 경미 | 메타 패널 새 카테고리의 409가 계속 실패한다. 만든 뒤 다시 받기 실패를 만들기 실패로 보인다 | 고침(5절 66) |
| B4 | 경미 | 이전 판 가져오기(와 초안 버리기)가 실패하면 저장 예약이 멈춘 채 남는다 | 고침(5절 67) |
| B5 | 경미 | 분류 줄의 다시 시도 줄에 "(지운 글)"이 붙는다 | 고침(5절 60) |
| B7 | 경미 | 글 옮기기 창을 목록보다 먼저 열면 고른 글이 비고, 목록 오류에도 "불러오는 중"이다 | 고침(목록이 오면 모두 고름, 오류 문구·다시 받기) |
| B8 | 경미 | 연재 오류 문구가 같은 말을 두 번 보인다 | 고침 |
| B9 | 경미 | 390px에서 누르는 영역이 작다(메타 패널 새 카테고리 단추, 판 목록 닫기, 글 옮기기 행) | 고침(`min-h-9`) |

### 6.8 PR-B 리뷰 수정 뒤 검증 (2026-11-11 04시)

| 항목 | 결과 |
|---|---|
| `pnpm lint`·`tsc` | 통과·0 |
| `pnpm test` | 690 통과(46 파일, +2: 묶음 줄 알림) |
| `pnpm build` | 통과. 앱 첫 청크 86,730바이트(gzip 24,890) |
| `stage5-admin.mjs` | 개발 서버 4333 226/226, 빌드 결과 4394 226/226(+3: 있는 key로 key 바꾸기 400, 1판에만 쓰는 이미지 kept, 글 삭제 뒤 지움) |
| `stage2-api.mjs` | 106/106 |
| 공개 점검(빌드 결과) | 883/0 + 324/0. `/blog/tag/javascript` → 301 `/blog/category/javascript`(태그 페이지), `/blog/tag/JavaScript` → 301 `/blog/tag/javascript`(미들웨어) |
| 브라우저 | B1(입력 창 문구, 요청 0건). B2·B3·B4·B7~B9는 코드·단위 테스트·스모크로만 보았다 |
| 끝 수 | `entries` 69, `publishLog` 2, `assets` 141, `seriesMeta` 7, Storage `assets/` 37. `settings/taxonomy` = 기본 10개, 별칭 없음 |

### 6.9 PR-C 리뷰 방법

- 2026-11-11. 별도 리뷰어 서브에이전트 2개가 `git diff origin/rebuild`(새 파일은 `git add -N`)를 따로 보았다. 서버·변환기·순수 로직(S)과 화면(B)이다.
- 기준은 Plan 0절, 3절 D6·D7·D9·D10·D13·D14·D15(1), 4.1~4.3, 7절 T9~T11과 그 아래 주의, 8.1, 8.4 시나리오 13~16, 11절이다. 작업 문서(이 문서)는 주지 않았다.
- 리뷰어는 단위 테스트·`tsc`·lint와 저장소 밖 시험 코드만 돌렸다(Firebase·네트워크·브라우저 금지).
- 이 세션이 지적마다 코드를 다시 읽어 확인했다. 브라우저로 다시 확인할 수 있는 것은 확인했다(6.12).

### 6.10 PR-C 수

| | 치명 | 중요 | 경미 |
|---|---|---|---|
| 서버(S) | 0 | 2 | 8 |
| 화면(B) | 0 | 4 | 12 |
| 합계 | **0** | **6** | **20** |

S1은 B1과 같은 결함이다. 중요 5건(B1·B2·B3·B4·S2)과 경미 19건을 고쳤다. 경미 1건(B13)은 고치지 않고 이유를 적었다(6.12). S11(테스트 공백)은 결함 수에 넣지 않고 테스트를 더해 덮었다.

### 6.11 PR-C 지적과 처리

| # | 심각도 | 지적 | 처리 |
|---|---|---|---|
| B1·S1 | 중요 | 선택 풀기(기본 키 Escape)는 키를 바꾸거나 지울 수 없다. 다른 플랫폼에 기본 키가 그대로 적혀 검사에 걸린다 | 고침(5절 92). 테스트: 기본 키 전체, Escape 바꾸기·지우기 |
| B2 | 중요 | 깨진 설정 문서를 화면에서 고칠 수 없다(바꾼 것이 없어 저장이 꺼짐) | 고침(5절 98) |
| B3 | 중요 | "모두 바꾸기" 뒤 포커스가 막대에 있어 Mod+Z가 에디터를 되돌리지 않는다(8.4 시나리오 15) | 고침(5절 96). 브라우저 확인 |
| B4 | 중요(추측) | 맥 Safari·Firefox에서 입력 칸을 고친 뒤 누른 정렬·크기 단추가 먹히지 않는다 | 고침(5절 97). 그 브라우저로는 확인하지 못했다 |
| S2 | 중요 | 붙여넣은 HTML(공개 글 포함)의 `width`가 그대로 폭이 되어 원시 HTML로 저장된다 | 고침(5절 91). 운영 editorJson 0개 확인. 테스트 |
| B5 | 경미 | 블록을 옮긴 직후의 입력이 옮기기와 한 묶음이다 | 고침(5절 95). 테스트(이동·바꾸기) |
| B6 | 경미 | 정규식 모드에서 다시 Mod+F를 누르면 찾을 글자가 찾은 결과로 바뀐다 | 고침(5절 96). 테스트 |
| B7 | 경미 | 팔레트·대화상자가 열려 있을 때 Mod+F가 뒤에 막대를 연다 | 고침(5절 96) |
| B8 | 경미 | 1024px 미만에서 설정 저장 막대가 위 막대에 가려진다 | 고침(5절 98). 브라우저 확인(390px) |
| B9 | 경미 | 라이트 테마에서 키 설정 띠·찾기 "없음" 글자 대비가 낮다 | 고침(`text-amber-800 dark:text-amber-200`, `text-red-600 dark:text-red-400`). 기존 `WarningsBanner`는 그대로다(8절 4) |
| B10 | 경미 | 설정 화면의 저장하지 않은 변경을 409·이동에서 말없이 잃는다 | 고침(5절 98) |
| B11 | 경미 | 소스·미리보기 모드 팔레트에 찾기가 보이지만 아무 일도 없다 | 고침(5절 96) |
| B12 | 경미 | 폭·정렬을 끈 이유가 `title`에만 있다 | 고침(5절 97). 브라우저 확인 |
| B13 | 경미 | 키 입력마다 데코레이션·찾은 수를 문서 전체로 다시 계산한다 | 고치지 않음(6.12) |
| B14 | 경미 | 긴 단락에서 찾은 곳이 화면 밖에 남을 수 있다(블록 단위 스크롤) | 고침(5절 96) |
| B15 | 경미 | 키 잡기가 바깥을 눌러도 이어진다 | 고침(5절 98) |
| B16 | 경미 | "바꾼 것 되돌리기" 뒤에도 빨간 줄이 남는다 | 고침(5절 98) |
| S3 | 경미 | 체크 항목의 빈 첫 단락 뒤 폭 있는 이미지면 체크 상자가 사라진다 | 고침(5절 94). 테스트 |
| S4 | 경미 | 재시도를 기다리는 동안 내용을 되돌리면 재시도 표시가 남는다 | 고침(`save-unchanged`가 retrying도 풀고 횟수 0). 테스트 |
| S5 | 경미 | 정규식이 이미지 등 원자를 걸쳐 바꾸기가 이미지를 지운다 | 고침(5절 96). 테스트 |
| S6 | 경미 | 막는 키 밖의 구조 키·브라우저 키(Alt+Backspace, F5 등)를 덮어쓸 수 있다 | 고침(5절 93). 테스트 |
| S7 | 경미 | 표 칸 여러 개를 고른 상태에서 옮기면 선택이 잘못된 자리를 가리킨다 | 고침(블록 처음의 글자 자리). 테스트 |
| S8 | 경미 | 폭만 정한 새 자산 이미지에 height가 없어 화면이 밀린다 | 고침(5절 99). 테스트 |
| S9 | 경미 | 세미콜론 없는 참조(`&lt b`)를 브라우저와 다르게 읽는다 | 고침(5절 100). 테스트 |
| S10 | 경미 | 스모크가 운영 `settings/editor`를 덮어쓰며 처음 값을 메모리에만 둔다 | 고침(처음 keymap을 출력에 남긴다) |

### 6.12 고치지 않은 것과 리뷰 수정 뒤 확인

1. **B13(문서 전체 다시 계산).** 데코레이션은 문서가 바뀔 때만, 찾은 수는 찾기 막대가 열려 있을 때만 다시 센다. 운영 글은 가장 긴 것도 수십 KB이고 찾은 수는 1000에서 멈춘다. 재지 않았지만 지금 크기에서는 문제가 될 가능성이 낮다. 느려지면 바뀐 범위만 다시 보게 한다.
2. **브라우저 다시 확인(개발 서버 4335).** 시험 글 1편을 더 만들어 확인하고 지웠다. B3: "모두 바꾸기" 단추에 포커스가 있는 채 `⌘Z` → 3곳 원래대로, 바꿀 글자 칸 그대로. B12: 글자와 섞인 이미지를 고르면 폭 칸이 꺼지고 메뉴 안에 "이미지만 있는 줄에서 정할 수 있습니다". B8: 390px에서 아래로 내려도 저장 막대가 위 막대 바로 아래(48px). 가로 넘침 0.
3. **확인하지 못한 것.** B4(Safari·Firefox), B7(팔레트 위 Mod+F), B10(떠나기 확인 창), B15. 코드와 단위 테스트·lint·tsc로만 보았다.

### 6.13 PR-D 리뷰 방법

- 2026-11-11. 별도 리뷰어 서브에이전트 2개가 `git diff origin/rebuild`(새 파일은 `git add -N`)를 따로 보았다. 서버·순수 로직(S)과 화면·브라우저(B)이다.
- 기준은 Plan 0절, 2.3, D3·D4·D9·D10·D20, 4.1~4.3, 5절, 7절 T12와 그 아래 주의, 8.1, 8.4 시나리오 18, 11절이다. 작업 문서(이 문서)는 주지 않았다.
- 리뷰어는 단위 테스트·`tsc`·lint와 저장소 밖 시험 코드만 돌렸다(Firebase·네트워크·브라우저 금지).
- 이 세션이 지적마다 코드를 다시 읽어 확인했다. 브라우저로 다시 확인할 수 있는 것은 확인했다(4.15).

### 6.14 PR-D 수

| | 치명 | 중요 | 경미 |
|---|---|---|---|
| 서버(S) | 0 | 3 | 8 |
| 화면(B) | 0 | 3 | 8 |
| 합계 | **0** | **6** | **16** |

S1 = B1, S3 = B3, S4 = B4, S11 = B5는 같은 결함이다. 겹침을 빼면 중요 4건(S1, S2, S3, B2), 경미 14건이다. 중요 4건과 경미 12건을 고쳤다. 경미 1건(B6)은 이유를 적고 두었다. 경미 1건(S10)은 판단 129로 뜻을 적고 날짜 경계 처리는 바꾸지 않았다(30분 새 방문으로 줄었다).

### 6.15 PR-D 지적과 처리

| # | 심각도 | 지적 | 처리 |
|---|---|---|---|
| S1·B1 | 중요 | 노트 목록(`/notes`)의 코드 복사가 글 ID 없이 가서 서버가 요청 전체를 400으로 버린다(같이 간 바깥 링크도 잃음) | 고침(5절 125). 테스트, 스모크(노트 목록 복사 요청) |
| S2 | 중요 | 요약 문서의 방문자 key(검색어·404 경로·들어온 곳)에 한도가 없어 문서가 1 MiB에 닿으면 그날 원본 줄까지 모두 실패한다. 긴 key는 필드 경로 한도를 넘는다 | 고침(5절 127·128): view 1개·검색어 5개/요청, key 300자, 원본 줄을 먼저 따로 쓴다. 요청 수 제한은 없다(8절 7) |
| S3·B3 | 중요 | 방문 ID가 끝나지 않는다. 열어 둔 탭·되살린 세션에서 다른 날의 방문이 같은 ID로 이어진다(D20 2와 반대). 그날 방문 수가 0이 된다 | 고침(5절 129): 30분 쉬면 새 방문. 테스트 없음(브라우저 스크립트), 브라우저로 확인 |
| B2 | 중요 | bfcache 복원에 view가 없어 다음 글의 앞 페이지가 틀린다. 낡은 방문 상태가 저장 공간을 덮는다 | 고침(5절 130). 브라우저로 이벤트를 흉내 내 확인 |
| S4·B4 | 경미 | 드문 실제 값(밑줄·끝 점·IPv6 hostname, `//` 경로, 긴 경로, 이상한 바깥 링크)이 요청 전체를 400으로 만든다 | 고침(5절 126). 테스트, 스모크 |
| S5 | 경미 | 한 요청에 seq 1인 view를 여러 개 넣어 방문 수를 부풀릴 수 있다 | 고침(5절 127). 테스트, 스모크 |
| S6 | 경미 | 시험 표지 저장이 localhost보다 넓다(미리보기, X-Forwarded-Host) | 고침(5절 102). 테스트 |
| S7 | 경미 | 스모크가 요약 문서를 통째로 지운다(실제 수·자정·Ctrl+C·운영 주소) | 고침(5절 133) |
| S8 | 경미 | 90일 정리가 한 번에 500줄이라 밀린 줄을 따라잡지 못한다 | 고침(5절 134) |
| S9 | 경미 | 경로 예가 정렬 없는 10줄이고 새로 고침 줄이 자리를 차지한다 | 고침(5절 119). 정렬은 복합 색인이 필요해 하지 않았다 |
| S10 | 경미 | 자정을 넘는 방문의 수가 "그날 그 글을 연 방문 수"와 어긋난다 | 뜻을 적음(5절 129). 30분 새 방문으로 줄었다 |
| S11·B5 | 경미 | 페이지당 요청이 최대 4번이다(Plan 2번) | 고침(5절 113). Plan대로 2번 |
| B6 | 경미 | 검색 타이머를 기다리는 동안 떠나면 그 검색어가 남지 않는다 | 고치지 않음(6.16) |
| B7 | 경미 | 목록을 받기 전·실패 때 모든 글이 "(목록에 없는 글)"로 보인다 | 고침(5절 136) |
| B8 | 경미 | 날짜별 값을 title로만 보인다. 라이트 테마 막대 대비가 약 2:1이다 | 고침(5절 136). 브라우저로 확인 |
| B9 | 경미 | 빈 상태 문구가 병합 뒤에 낡는다 | 고침(5절 136) |
| B10 | 경미 | 75% → 복사 → 100% 순서면 경로 예 글자가 어긋난다 | 고침(5절 136). 브라우저로 확인 |
| B11 | 경미 | CUBOT 휴대폰 UA를 로봇으로 판정한다 | 고침(5절 135). 테스트 |

### 6.16 고치지 않은 것과 리뷰 수정 뒤 확인

1. **B6(떠날 때 기다리던 검색어).** Plan D20은 "1.5초 멈췄을 때"다. 멈추기 전에 결과 글을 누르면 그 검색어는 남지 않는다. 고치려면 떠날 때 기다리던 검색어를 넣어야 하고, 2 KB 한도에 남은 자리(10바이트)가 없다. 결과가 있었던 검색이 덜 잡힌다는 한계를 적는다(8절 8).
2. **리뷰 수정 뒤 확인.** 4.15.

### 6.17 PR-E 리뷰 방법

- 2026-11-11. 별도 리뷰어 서브에이전트 2개가 `git diff origin/rebuild`(측정용 커밋 3개)를 따로 보았다. 서버·측정(S)과 그 밖(테스트·도구 삭제·에디터 영향·주석, B)이다.
- 기준은 Plan 1.2·1.3, D8·D16·D17, 6절, 7절 T13·T14, 8.1·8.6, 9.3, 10절, 11절이다. 작업 문서(이 문서)는 주지 않았다. 사용자 결정 2건(Oniguruma, 네이티브 + `excludeNetwork`)은 사실로만 알렸다.
- 리뷰어는 단위 테스트·`tsc`·lint와 저장소 밖 시험 코드만 돌렸다(Firebase·네트워크·브라우저·빌드 금지). 빌드 결과 폴더는 읽기만 했다.
- 이 세션이 지적마다 코드를 다시 읽어 확인했다. S1·B1·B6은 결함을 일부러 되살려 테스트가 실패하는지 보았다(5절 159).

### 6.18 PR-E 수

| | 치명 | 중요 | 경미 |
|---|---|---|---|
| 서버·측정(S) | 0 | 0 | 8 |
| 그 밖(B) | 0 | 1 | 10 |
| 합계 | **0** | **1** | **18** |

S1 = B6, S8 ⊂ B10은 같은 결함이다. 중요 1건(B1)과 경미 대부분을 고쳤다. 고치지 않은 것은 6.20에 적는다.

### 6.19 PR-E 지적과 처리

| # | 심각도 | 지적 | 처리 |
|---|---|---|---|
| B1 | 중요 | `excludeNetwork` 테스트가 핵심 동작을 보지 않는다(이미 불러온 모듈, 기본값 false라 켜는 줄을 지워도 통과) | 고침(5절 159). 불러오는 순간의 값, false·true 되돌림, 실패 때 되돌림 |
| S1·B6 | 경미 | markdown 블록의 색이 인스턴스가 앞서 불러온 언어에 따라 바뀐다(늦게 포함하는 언어) | 고침(5절 150). 새 상태 비교 테스트 |
| S2 | 경미 | 하이라이터 준비 실패가 글 전체를 500으로 만든다. "실패를 기억하지 않는다" 주석이 틀리다 | 고침(5절 151). 실패 경로 테스트 2개 |
| S3 | 경미 | 정적 import는 `hl`·`total`에 안 들어간다. 병렬 항목은 더할 수 없다 | 문서·주석(5절 152) |
| S4 | 경미 | CDN 저장본에 남는 헤더, `inst`의 dur 뜻 | 일부 고침(5절 153): 나이를 desc로. 헤더는 늘 붙인다 |
| S5 | 경미 | 301 응답에 헤더가 없는데 요청 순서는 는다 | 고침(5절 154) |
| S6 | 경미 | `excludeNetwork`가 없는 Node, 되돌릴 값, Linux 경로 테스트 없음 | 고침(5절 155·159). 동기 require로 좁히기는 하지 않음(6.20) |
| S7 | 경미 | 정보 문자열의 이스케이프·문자 참조를 풀지 않는다 | 고침(5절 156). 테스트 |
| S8·B10 | 경미 | renderEntry + timing, 실패 경로, 공개 응답 헤더를 보는 검사가 없다 | 고침(5절 158·160). renderEntry 테스트 2개, 공개 점검. 재시도 테스트는 두지 않음(6.20) |
| B2 | 경미 | 첫 테스트가 모듈 상태와 실행 순서에 묶여 있다. 색 단언이 대소문자 차이에 기댄다 | 고침(5절 158). 새 모듈 상태, 기본색이 아닌 토큰 단언 |
| B3 | 경미 | 테스트 이름과 내용이 다르다(사이트 언어인데 아직 안 불러온 경우가 없다) | 고침. 그 경우를 더했다 |
| B4 | 경미 | 표 테스트가 운영과 다른 경로로 문법을 읽는다 | 고침. `GRAMMAR_LOADERS`를 내보내고 그것으로 읽는다. 마지막 원소 가정에 주석 |
| B5 | 경미 | SQL을 뺀 이유의 주석이 관찰과 다르다(실행마다 다름, 원인 미확인). 미리보기 주석이 "20종 비교"다 | 고침. 주석 2곳, 8절 10 |
| B7 | 경미 | 서버 전용 표가 미리보기 청크에 들어간다 | 고침(5절 157) |
| B8 | 경미 | 낡은 주석(lowlight·code-languages·shiki-languages), 타입을 옮긴 뒤 가져오는 곳 | 고침. 언어 목록 네 곳을 주석에 적었다. `CodeHighlighter`는 shiki-languages.ts에서 직접 가져온다 |
| B9 | 경미 | 쓰지 않는 export `SHIKI_THEMES` | 고침 |
| B11 | 경미 | 측정용 커밋 메시지와 넣었다 뺀 기록. 주석의 수치 출처 | 커밋 정리는 사용자 확인 뒤(7절). 수치는 4.16에 있고 주석의 출처를 4.16으로 고쳤다 |

### 6.20 고치지 않은 것과 리뷰 수정 뒤 확인

1. **S4 헤더를 측정 쿼리 때만 붙이기.** Plan D16·D17은 응답에 붙인다고 정했다. main 병합 뒤 운영 콜드 측정(감사 문서 11.3의 7)도 같은 헤더를 쓴다. 노출되는 것은 시간·요청 순서·프로세스 나이뿐이다.
2. **S6 동기 require로 창 좁히기.** 지금 번들에서 진단 보고서를 부르는 곳은 resvg와 detect-libc(동기로 켰다 끔)뿐이라 실제 충돌이 없다. 함수 번들 추적을 다시 확인해야 하는 바꿈이라 두었다.
3. **B10 재시도 테스트.** 같은 인스턴스의 재시도는 같은 오류일 수 있다(5절 151). 테스트로 고정할 동작이 아니다.
4. **리뷰 수정 뒤 확인.** 4.17.

## 7. 다음 작업

main 병합 준비 세션이 먼저 읽는 절이다. 5단계는 끝났다.

**끝난 것(2026-11-11).**

1. PR-A(T1~T4) 구현·검증·별도 리뷰·수정, 커밋 `4a8f6b3`, [PR #22](https://github.com/crucial-sub/cruz-lab/pull/22) `rebuild` 병합(`d1ded00`). 태그 `rebuild-pre-stage5`(= `90c6201`).
2. PR-A 병합 뒤 `rebuild` 미리보기 확인(4.7): 발행 줄에 퍼지 ok·백업 dispatched, "다시 비우기"가 실제 퍼지로 띠를 지움, 삭제 줄도 같음. 시험 데이터 0.
3. PR-B(T5~T8) 구현(2.7~2.11). T5는 서브에이전트가 구현했다. 판단 34~57(5절).
4. 검증(4.8·4.9): lint, `tsc` 0, 테스트 688, 빌드, `stage5-admin.mjs` 223/223(개발 서버·빌드 결과), `stage2-api.mjs` 106/106, 왕복 69/69, 공개 점검 883/0 + 324/0, 브라우저 시나리오 8~12와 390px.
5. 별도 리뷰(6.5~6.7): 치명 0, 중요 3, 경미 17. 모두 고쳤다. 판단 58~68. 다시 검증(6.8): 테스트 690, 스모크 226/226(개발 서버·빌드 결과), `stage2-api` 106/106, 공개 점검 883/0 + 324/0. 시험 데이터 0.
6. 사용자 승인(2026-11-11) 뒤 커밋 `ee39038`, 브랜치 `stage5/b-manage` 푸시, [PR #23](https://github.com/crucial-sub/cruz-lab/pull/23)(대상 `rebuild`). PR #23은 `rebuild`에 병합됐다(`eb72c39`).
7. PR-C(T9~T11) 구현(2.12~2.15, 브랜치 `stage5/c-editor`, 기준 `eb72c39`). T9는 서브에이전트가 구현했다. 판단 69~90.
8. 검증(4.10·4.11): lint, `tsc` 0, 테스트 827, 빌드, `stage5-admin.mjs` 252/252(개발 서버·빌드 결과), `stage2-api.mjs` 106/106, 왕복 69/69, 공개 점검 883/0 + 324/0, 브라우저 시나리오 13~16과 390px. 확인 중 찾은 2건(찾은 결과 스크롤, 막대 Esc)을 고쳤다.
9. 별도 리뷰(6.9~6.12): 치명 0, 중요 6, 경미 20(S1 = B1). 경미 1건(B13)만 두고 모두 고쳤다. 판단 91~100. 다시 검증(4.12): 테스트 843, 스모크 252/252(빌드 결과·개발 서버), API 106/106, 왕복 69/69, 공개 점검 883/0 + 324/0. 시험 데이터 0.

10. 사용자 승인(2026-11-11) 뒤 커밋 `7fbfe27`, 브랜치 `stage5/c-editor` 푸시, [PR #24](https://github.com/crucial-sub/cruz-lab/pull/24)(대상 `rebuild`). PR #24는 `rebuild`에 병합됐다(`7a370fb`).
11. PR-D(T12) 구현(2.16·2.17, 브랜치 `stage5/d-readers`, 기준 `7a370fb`). 판단 101~124.
12. 검증(4.13·4.14): lint, `tsc` 0, 테스트 881, 빌드, `stage5-track.mjs` 160/160·`stage5-admin.mjs` 252/252(개발 서버·빌드 결과), `stage2-api.mjs` 106/106, 왕복 69/69, 공개 점검 1,313/0 + 324/0, 공개 스크립트 2,013바이트, 브라우저 시나리오 18과 390px.
13. 별도 리뷰(6.13~6.16): 치명 0, 중요 6, 경미 16(겹침 4쌍). 경미 1건(B6)만 두고 모두 고쳤다. 판단 125~136. 다시 검증(4.15): 테스트 888, `stage5-track.mjs` 178/178·`stage5-admin.mjs` 252/252(빌드 결과·개발 서버), API 106/106, 왕복 69/69, 공개 점검 1,313/0 + 324/0, 공개 스크립트 2,038바이트. 시험 데이터 0.
14. 사용자 승인(2026-11-11) 뒤 커밋 `48c8d66`, 브랜치 `stage5/d-readers` 푸시, [PR #25](https://github.com/crucial-sub/cruz-lab/pull/25)(대상 `rebuild`). PR #25는 `rebuild`에 병합됐다(`c582243`).
15. PR-E(T13·T14) 구현(2.18~2.20, 브랜치 `stage5/e-perf`, 기준 `c582243`). 판단 137~149. 측정을 먼저 하고(4.16), 처방 2건은 사용자가 그림 설명을 보고 정했다(D16: 글 언어만 + 서버 Oniguruma, D17: resvg 네이티브 + `excludeNetwork`). E1 끝, E2 할 일 없음(Fluid compute 이미 켜짐).
16. 측정(4.16·4.17): 미리보기 첫 OG 11,361 → 1,087~1,241 ms(세 번 모두 3초 안), 다음 OG 865 → 569~786 ms. 진짜 콜드 글 상세 TTFB 4,474 → 3,558·3,897 ms(렌더 1,541 → 922·1,092 ms). 측정용으로 작업 브랜치를 세 번 푸시했다(사용자 허락).
17. 별도 리뷰(6.17~6.20): 치명 0, 중요 1, 경미 18(겹침 2쌍). 중요는 `excludeNetwork` 테스트가 핵심 동작을 보지 않음(B1). markdown 문법의 늦은 포함(S1 = B6)과 하이라이터 실패가 글 전체를 500으로 만듦(S2)도 고쳤다. 판단 150~160. 다시 검증(4.17).
18. 사용자 승인(2026-11-11) 뒤 측정용 커밋 3개와 리뷰 수정·문서를 커밋 하나 `c61fa06`로 합치고 `stage5/e-perf`에 `--force-with-lease`로 푸시, [PR #26](https://github.com/crucial-sub/cruz-lab/pull/26)(대상 `rebuild`).
19. [PR #26](https://github.com/crucial-sub/cruz-lab/pull/26)은 `rebuild`에 병합됐다(`5c6ba0c`, 2026-11-11). 코드 PR 5개가 모두 들어갔다.
20. T16 문서 PR(2.21). 브랜치 `stage5/docs`(`5c6ba0c`에서 생성). 사용자 승인(2026-11-11) 뒤 커밋 `7887eff`, [PR #27](https://github.com/crucial-sub/cruz-lab/pull/27)(대상 `rebuild`).
21. 5단계 끝 검증 상태(PR-E 리뷰 수정 뒤, 4.17): lint 통과, `tsc` 0, 테스트 918(54 파일), 빌드 통과, `stage5-admin.mjs` 252/252·`stage5-track.mjs` 178/178(빌드 결과·개발 서버), 2단계 API 스모크 106/106, 왕복 69/69, 공개 점검 1,380/0 + 324/0, 공개 스크립트 2,038바이트, `/admin` 첫 화면은 에디터 JS를 받지 않음(앱 첫 청크 116,712바이트). 시험 데이터 0. 외부 변경: E1 끝, E2 할 일 없음, E3 안 함(3절).

**다음 것.**

1. T16 문서 [PR #27](https://github.com/crucial-sub/cruz-lab/pull/27) 병합(사용자 확인 뒤).
2. 사용자 확인 뒤: E3(백업 저장소 `crucial-sub/cruz-lab-content`의 `scripts/export.mjs`에 `{ name: 'settings', subcollections: [] }` 한 줄, 그 저장소에 PR). 지금 `settings/taxonomy`는 백업되지 않는다. main 병합 전에 한다(감사 문서 11.3의 10).
3. main 병합 준비(Plan D19). 별도 작업 단위이고 새 세션에서 한다. 감사 문서 11.3 "main 병합 직전에 할 일" 1~12를 그대로 따른다. 먼저 읽을 것:
   - 감사 문서 11.3(목록 전체)과 11.11(5단계 진행 기록).
   - 2단계 Plan 15절(병합 직전 4항목, 병합 직후 5항목).
   - 이 문서 7절(이 절)과 8절(열린 질문), 5절 137~160(PR-E 판단. Server-Timing 읽는 법은 138).
   - 5단계 Plan 14절(상기 목록. 병합 준비 세션이 사용자에게 한 번 보인다).
4. main 병합 전에 `rebuild` 미리보기에서 할 확인(5단계에서 하지 않았다. 감사 문서 11.3의 10):
   - PR-B 몫: 분류 화면에서 시험 카테고리 만들기 → 지우기, 공개 동의어 태그 주소 301(태그 페이지), 이미지 라이브러리 141칸.
   - PR-C 몫: 이미지 폭·정렬 글을 발행해 공개 페이지와 `sizes`·height를 본다(새 자산 이미지로). 키 설정 저장 → 에디터 적용.
   - PR-D 몫(Plan 8.6의 4): 공개 페이지를 몇 개 열어 `readerEvents`·`readerDaily`가 늘지 않는지 Admin SDK로 센다. 관리자 독자 화면이 빈 상태로 열리는지 본다.
   - 사용자 몫: 로그아웃 뒤 글 상세 "고치기"가 사라지는지(Plan 8.4의 17). D18(Plan 8.5): Chrome·Safari 코드 복사, iPhone Safari 에디터 모바일 바, iPhone 목록 390px, 관리자가 아닌 Google 계정의 로그인 거부, Safari 이미지 메뉴 "폭 입력 → 바로 가운데"(8절 5).
5. main 병합 뒤 확인(감사 문서 11.3의 4·7·8): 재발행 첫 요청의 `x-vercel-cache`, 운영 콜드 글 상세 TTFB 3회(기준 1.5초, 8절 12), 독자 흐름 첫 수집(`readerDaily/{오늘}`, 관리자 본인 방문 빠짐). 그때 공개 스크립트 크기(2,038바이트)를 다시 잰다(8절 9).
6. 원격의 병합 끝난 브랜치 삭제(사용자 확인 뒤): 3단계 6개, 4단계 7개, 5단계 `stage5/plan`·`a-app`·`b-manage`·`c-editor`·`d-readers`·`e-perf`. 문서 PR 병합 뒤 `stage5/docs`도.

**열린 질문.** 8절에 있다. 열린 것은 1, 3~12다. 모두 main 병합을 막지 않는다. 처리 시점은 8절 머리에 적었다.

## 8. 열린 질문

열린 것은 1, 3~12다. 2는 닫았다. 모두 "지금 판단"이 있고 main 병합을 막지 않는다. 처리 시점은 다음과 같다.

- main 병합 전 `rebuild` 미리보기(7절 다음 것 4): 5(Safari 이미지 메뉴).
- main 병합 뒤 운영 측정(7절 다음 것 5): 9(공개 스크립트 크기), 11(Server-Timing을 둘지), 12(운영 콜드의 남은 몫).
- 나머지(1·3·4·6·7·8·10): 그대로 둔다. main 병합 준비 세션이 5단계 Plan 14절 상기 목록과 함께 사용자에게 한 번 보인다(감사 문서 11.3의 11).

1. 에디터 CSS를 `/admin` 첫 화면이 받는 것(5절 17)을 그대로 둘지. 지금 판단: 그대로 둔다(gzip 11 KB, 에디터 진입 때 깜빡임이 없다).
2. ~~로그인 사전 안내 "로그인 기록도 남기지 않습니다"(D4 2)의 예외(6.4의 2)~~ **닫음(2026-11-11, 사용자 답: 그대로 둔다).** 팝업 로그인 뒤 세션 요청이 서버에 닿지 않을 때만 인증 기록이 남는다. 팝업이 닫힌 뒤 1초 안에 탭을 닫거나, 그 순간 네트워크가 끊기거나, 서버의 삭제 요청이 실패할 때다. 드물고, 남은 기록은 권한이 없다. 그래서 문구와 코드를 바꾸지 않는다.
3. 이미지 라이브러리의 "쓰지 않는 것"은 초안·발행본만 센다(`usedBy`). 이전 발행본에만 쓰는 이미지도 여기 보이지만 지우기는 막힌다(5절 61). 지금 판단: 그대로 둔다(그런 이미지는 다시 발행할 때만 생기고, 지우기 시험 실행이 이유를 보인다). 따로 "이전 판만 씀"으로 보이려면 목록 API가 리비전을 읽어야 한다.
4. 에디터의 "지원하지 않는 내용" 경고 띠(`WarningsBanner`, 3단계부터)는 라이트 테마에서 글자(`text-amber-200`) 대비가 낮다. PR-C의 키 설정 띠는 고쳤다(리뷰 B9). 지금 판단: 3단계 파일이라 이번에 고치지 않는다. 고치려면 같은 클래스 한 줄이다.
5. 이미지 메뉴의 Safari·Firefox 동작(리뷰 B4)은 Chromium 앱 브라우저로 확인할 수 없었다. D18(실제 기기) 때 사용자 Safari로 "폭 입력 → 바로 가운데 누르기"를 함께 본다.
6. 고른 이미지의 메뉴(5줄)가 아래 단락을 덮는다(4.11). 메뉴 아래 글자를 누르려면 이미지 밖을 먼저 눌러 메뉴를 닫아야 한다. 지금 판단: 그대로 둔다(3단계부터 같은 방식). 불편하면 메뉴를 이미지 위나 옆으로 옮긴다.
7. 공개 수집 API에 요청 수 제한(rate limit)이 없다(리뷰 S2, 5절 128). 누군가 운영 주소로 서로 다른 검색어·경로·들어온 곳을 대량으로 보내면 그날 요약 문서(`readerDaily`)가 커지고, 1 MiB에 닿으면 그날 요약 쓰기가 실패한다(원본 줄은 남는다). 지금 판단: 그대로 둔다(개인 블로그, 요약만 그날 모자란다). 실제로 생기면 Vercel 방화벽 규칙(요청 수 제한)이나 요약 key 수 상한을 더한다.
8. 독자 흐름 수집의 한계(5절 113, 6.16): 페이지당 보내기 2번이라 탭을 오간 뒤 생긴 이벤트(끝까지 읽음 등)를 보내지 못할 수 있다. 1.5초를 기다리기 전에 떠난 검색어는 남지 않는다. 지금 판단: Plan D20(최대 2번, 멈췄을 때)을 따른다. 읽음 비율이 낮게 나오면 다시 본다(보내기 횟수를 늘리면 함수 호출 비용이 는다).
9. 공개 스크립트 2 KB 한도의 남는 자리가 10바이트다(5절 114). 수집 스크립트를 고치면 넘을 수 있다. `stage4-public.mjs`가 빌드 결과에서 잰다. 넘으면 한도를 바꿀지(예: gzip 기준) 사용자에게 묻는다.
10. 에디터 미리보기(JS 엔진)와 공개 페이지(Oniguruma)는 SQL 함수 이름(`COUNT(` 등) 색이 다를 수 있다(5절 141, 리뷰 B5). JS 엔진에서 이 색이 실행마다 달랐고 원인은 찾지 못했다. 발행 글에는 이런 차이가 없다(62편, 코드 블록 294개). 지금 판단: 그대로 둔다. 미리보기만의 색 차이이고 공개 페이지는 원본 엔진이다. 거슬리면 미리보기도 Oniguruma로 바꾼다(브라우저가 wasm 약 0.6 MB를 더 받는다).
11. 공개 응답의 Server-Timing을 언제까지 둘지(5절 153). 지금 판단: main 병합 뒤 운영 콜드 측정(감사 문서 11.3의 7)까지 둔다. 그 뒤에도 해가 없으면 둔다. 빼려면 측정 쿼리가 있을 때만 붙이게 바꾼다.
12. 운영 콜드 글 상세의 남은 몫. 미리보기 진짜 콜드(4.17)에서 TTFB 약 3.6~3.9초 중 렌더(`render`)가 약 0.9~1.1초, 페이지 코드 밖(TTFB − `total`)이 약 2.3초다. 운영은 바이트코드 캐시가 모듈 읽기를 줄인다. 지금 판단: Plan D16 4대로 main 병합 뒤 운영 값을 보고, 1.5초를 넘고 렌더 몫이 절반을 넘을 때만 본문 미리 계산을 다시 본다.

