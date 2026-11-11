# 재건 5단계 Plan: 관리자 앱

- 날짜: 2026-11-10
- 상태: **승인됨(2026-11-10).** 사용자 결정 8건의 답은 13절에 있다. 12절 끝의 "Claude 판단"(D9~D20)도 함께 승인받았다. 구현은 새 세션에서 T1부터 한다(7절).
- 브랜치: 이 Plan은 `stage5/plan`. 처음 `origin/rebuild` `67299d1`에서 만들었고, 결정을 받는 동안 PR #19·#20이 병합돼 `origin/rebuild` `c7701c1` 위로 옮겼다(커밋 전 문서만 있어 충돌 없음). 커밋 `3624923`, [PR #21](https://github.com/crucial-sub/cruz-lab/pull/21)(대상 `rebuild`). main이 아니다. 구현은 승인 뒤 새 세션에서 `rebuild`에서 작업 브랜치를 만든다(7절).
- 근거: [계획 문서](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md) 5.1~5.4(M1~M6·M11), 8.1, 8.3 "5. 관리자 앱", 10.1, 11.3. [2단계 Plan](./2026-11-07-stage2-data-model-and-server-plan.md) D4·D5·D7, 6절(API), 15절. [3단계 Plan](./2026-11-08-stage3-editor-plan.md) D6·D9·D11, 14절, 부록 B. [3단계 작업 문서](./2026-11-09-stage3-editor.md) 8절 4·5·7·10·13. [4단계 Plan](./2026-11-09-stage4-public-site-plan.md) D3·D4·D5·D6·D7·D13, 13절, 14절. [4단계 작업 문서](./2026-11-09-stage4-public-site.md) 4.17·4.18, 5절 58·62, 7절, 8절 3~6.
- 시각 문서: [visual-plans/2026-11-10-cruz-lab-stage5-plan.html](./visual-plans/2026-11-10-cruz-lab-stage5-plan.html)

## 0. 결론 먼저

1. **관리자 화면을 단일 React 앱으로 다시 만든다(D9).** `/admin/**`는 Astro 페이지 한 개가 React 앱을 띄운다. 목록·이미지·분류·연재·독자·출간 기록·설정이 한 앱 안의 화면이다. 에디터는 그 앱의 한 화면이고 따로 내려받는다(지연 로드). 목록만 볼 때 에디터 청크(1.8 MB)를 받지 않는다.
2. **첫 화면은 "이어 쓰기"와 목록이다(D10).** 맨 위에 최근에 고친 초안 3편과 "새 글"·"오늘 기록" 버튼이 있다. 한 번 누르면 본문이다. 목록은 상태·종류·검색·정렬로 즉시 거르고, 글마다 최근 30일 독자 수를 보인다. 빈 초안은 따로 모아 한꺼번에 지운다. 390px에서도 동작한다(M11).
3. **문제가 있을 때만 알린다(D11).** 정상이면 알림이 없다. 최근 7일의 캐시 비우기·백업 알림 실패와 이 기기의 미전송 초안만 띠 한 줄로 보인다. 출간 기록 화면이 `publishLog`를 보인다.
4. **태그와 카테고리를 모두 브라우저에서 관리한다(D1, 사용자 결정).** 카테고리 목록을 코드 상수에서 데이터베이스(`settings/taxonomy`)로 옮긴다. 새 카테고리 만들기, 이름·주소 key 바꾸기, 글 0편 카테고리 지우기, 글의 카테고리 한꺼번에 바꾸기, 태그 이름 바꾸기·합치기가 된다. 옛 주소는 새 주소로 넘긴다. 지금 10개는 코드에 기본값으로 남는다.
5. **연재·프로젝트 정보 화면과 새 프로젝트 만들기(D2, 사용자 결정).** `seriesMeta`의 제목·설명·프로젝트 정보를 고치고, 새 프로젝트를 만든다.
6. **리비전 보기·되돌리기와 독자 흐름(D3, 사용자 결정).** 이전 발행본을 보고 초안으로 가져온다. 독자 흐름은 날짜별 독자 수, 한 번의 방문 안의 경로(들어온 곳·다음에 읽은 글·떠난 곳), 끝까지 읽은 비율, 외부 링크·이력서 PDF·코드 복사, 블로그 안 검색어, 없는 주소(404)를 관리자 앱에서 보인다. 개인 정보와 오래 남는 식별자는 저장하지 않는다(D20).
7. **공개 사이트 입구는 푸터 "관리" 링크다(D4, 사용자 결정).** 누구에게나 보인다. 로그인 화면에 사전 안내를 두고, 관리자가 아닌 계정은 정중한 거부 화면을 보이며 그 계정의 인증 기록을 바로 지운다. 글 상세의 "고치기" 같은 관리자 전용 동작은 관리자 앱을 연 브라우저에만 보인다.
8. **에디터에 이미지 세부 조절·키맵 설정·블록 이동·찾기·바꾸기를 넣는다(D13·D14·D6·D7).** 이미지마다 임의 px 폭과 정렬을 정한다(원시 HTML, GitHub README 관례). 키맵은 `settings/editor`에 저장한다. 링크 카드는 미룬다(D5).
9. **`tools/cruz-lab-knowledge-mcp`를 지운다(D8, 사용자 결정).** 쓰지 않는 도구다. cruz-lab 프로젝트 글 3편은 재건 뒤 전략을 세워 새로 쓴다(14절).
10. **4단계에서 넘어온 측정 2건을 다시 쟀다(1.3).** 미리보기 콜드 TTFB는 함수 부팅 약 3.3초 + 첫 렌더 준비 약 1.4초다. OG 첫 요청은 다시 11초대다. 처방은 단계별 시간을 먼저 재고 정해진 규칙으로 고른다(D16·D17).
11. **5단계는 재건의 마지막 단계다.** 끝나면 main 병합 준비 작업 단위가 따로 있다(D19). `README.md`·`PUBLISHING.md`·`.env.example`은 그때 한 번 쓴다(4단계 D5 답).

## 1. 출발점: 2026-11-10에 확인한 사실

모든 조회는 읽기 전용이다. 운영 데이터는 Admin SDK로 셌다(값은 출력하지 않고 수와 key만). 코드는 처음 `67299d1`, 뒤에 `c7701c1`(PR #19·#20 병합 뒤) 기준으로 읽었다. PR #19·#20은 `/blog` 목록·커버·OG 팔레트만 바꿨다. 관리자 화면·API·헤더·푸터는 바뀌지 않았다. 관리자 화면은 `rebuild` 미리보기에서 사용자의 기존 로그인 세션으로 열어 보기만 했다. 버튼은 누르지 않았다.

### 1.1 운영 데이터

| 항목 | 값 | 뜻 |
|---|---|---|
| `entries` | 69편: post 발행 54, project 발행 8, post 초안 6, note 초안 1. 숨김 0 | 4단계 끝 상태와 같다 |
| 초안 7편 | 제목·본문이 모두 빈 초안 2편(post 1·note 1, 버전 1, 같은 분에 생성). 제목 없이 본문 30~549자인 시험 초안 4편. legacy 에세이 1편 | "새 글"·"새 노트"는 누르는 즉시 문서를 만든다. 빈 초안이 목록에 쌓인다(D10). 사용자 초안이라 이 Plan은 지우지 않는다 |
| 발행 뒤 변경 | 0편 | |
| `revisions` | 62개. 글마다 1개다. 다시 발행한 글이 없다 | 리비전 화면(D3)은 다음 발행부터 이력이 쌓인다 |
| 태그 | 12종. `크래프톤-정글` 24, `wesbos30` 21, `pintos` 5, 나머지 9종은 1~2편 | |
| 카테고리 | 코드 상수 10개(`taxonomy.ts`). 발행 글이 있는 것 9개. 공개 코드에서 상수를 읽는 곳은 `blog-list.ts`, `server/entries.ts`, `blog/category/[key].astro`. 스키마 검사(`categoryKeySchema`)는 상수 목록의 `z.enum`이다. 에디터 메타 패널의 카테고리 칸은 상수 목록에서 고르기만 한다 | D1 b는 이 네 곳과 에디터가 데이터를 읽게 바꾼다 |
| 연재 key | post: `wesbos30` 21, `pintos` 5, `proxy-lab` 2. project: `cruz-lab` 3, `jungle-tetris` 2, `stock-lab` 2, `llm-yatcha` 1 | |
| `seriesMeta` | 7개. 연재 3(설명: `wesbos30` 33자, `pintos`·`proxy-lab` 빈칸), 프로젝트 4(긴 설명·태그·기술·GitHub 있음, 데모 없음, 대표 4개 모두 참, 기간 `YYYY-MM`) | 화면에서 고칠 길이 없다(D2) |
| `assets` | 141개: legacy 130(변형 없음, 29.4 MB, 가장 큰 것 2.64 MB), 새 자산 11(변형 있음). `usedBy`가 빈 것 26개(모두 legacy, 5.2 MB). `orphanedAt` 0. 종류 webp 73, png 45, jpeg 18, webm 3, gif 2 | 라이브러리의 legacy 썸네일은 원본을 받는다(D12). 쓰지 않는 legacy 26개는 main 병합 뒤에만 지운다 |
| Storage | `images/` 127개 27.7 MB, `assets/` 37개 5.0 MB, `series-covers/` 3개 1.7 MB | |
| 본문 이미지(초안 기준) | 115개: 새 자산 25, legacy Storage 49, 외부 41. 원시 `<img>`를 쓴 글 0편 | 이미지 세부 조절(D13)은 세 종류 모두에 쓸 수 있어야 한다. 기존 글의 왕복 결과는 바뀌지 않는다 |
| `publishLog` | 2줄(publish 1, delete 1. 4단계 시험 노트) | 출간 기록 화면(D11)은 지금 거의 비어 있다 |
| `settings` | 컬렉션 없음 | `settings/editor`·`settings/taxonomy`는 새 문서다 |
| 독자 데이터 | 없음 | 독자 흐름(D20)은 main 병합 뒤 실제 방문자부터 쌓인다 |
| `entryTombstones` | 0 | |
| 기기 이름 | `draft.device`: 없음 65, `macbook` 4 | |
| 백업 저장소 | `crucial-sub/cruz-lab-content`(비공개): `published/<slug>.md` 62(frontmatter에 `kind`·`series`), `drafts/` 7, `raw/<컬렉션>/<id>.json`. 내보내는 컬렉션은 `scripts/export.mjs`의 고정 목록 7개(`entries`+`revisions`, `seriesMeta`, `assets`, `publishLog`, `entryTombstones`, `posts`, `series`)다. `settings`는 없다. Action 최근 13회: 성공 11, 실패 1, 취소 1 | `settings/taxonomy`가 생기면 백업 목록에 더해야 한다(E3) |

### 1.2 관리자 화면과 코드

| 항목 | 값 | 확인 방법 |
|---|---|---|
| 관리자 페이지 | `/admin`(최소 목록, 서버 렌더 130줄), `/admin/edit/[id]`(`EditorApp` `client:only`), `/admin/login`(공개 틀 `BaseLayout` + `AdminLogin` React), `/admin/posts/new`(POST 폼 → 303), `/admin/posts`·`/admin/edit`(301 → `/admin`) | 코드 |
| 관리자 틀 | `AdminPage.astro`: 사이트 헤더·푸터 없음, `noindex`, 테마 초기화 스크립트. 로그인 페이지만 공개 틀을 쓴다 | 코드 |
| 최소 목록 실측 | 1280px: 내용 폭 896px(`max-w-4xl`), 69행 한 열, 행 48px, 페이지 높이 3,540px. 390px: 가로 넘침 없음, 긴 제목은 말줄임. 상태 탭(전체 69·초안 7·발행됨 62·숨김 0). 검색 입력·종류 거르기·정렬 선택이 없다. API는 `q`(제목·slug)를 받는다 | 미리보기, 페이지 안 측정 |
| 목록 정렬 | `updatedAt` 내림차순. 이관 글 55편의 `updatedAt`이 모두 2026-03-31 20:47이라 한 덩어리로 보인다 | 화면 |
| M1~M11 지금 상태 | M1 부분(자체 틀은 있다. 폭 896px). M2·M3 해결(`publish-status` API는 2단계 T9, 출간 상태 카드가 있던 `AdminDashboard.tsx`는 3단계 PR-C가 지웠다). M4 해결(상태별 서버 집계). M5 해결(프로필 사진이 없다). M6 부분(상태 탭만). M7~M10 해결(3단계 에디터). M11 부분(목록과 에디터는 모바일에서 동작한다. 관리 화면은 목록뿐이다) | 화면, 코드, git 기록 |
| 관리자 API | 세션(POST·GET·DELETE), 글 목록·새 초안, 한 편 읽기·삭제, 초안 저장, 초안 버리기, 발행, 숨김, 자산 업로드 주소·완료·한 개 읽기, 자산 정리. **없는 것**: 자산 목록, 출간 기록 읽기, 설정, 분류 변경, 연재 정보, 리비전, project 새로 만들기(`CREATABLE_KINDS` = post·note), 독자 데이터 | `src/pages/api/admin/**` |
| 로그인 거부 | 세션 API가 관리자가 아니면 403 `NOT_ADMIN`을 돌려준다. 화면은 클라이언트에서 로그아웃하고 오류 문장을 보인다. Firebase 인증 사용자 기록은 남는다 | `admin-session.ts`, `AdminLogin.tsx` |
| `publishLog` 한 줄 | `entryId`, `action`(publish·hide·unhide·delete), `slug`, `at`, `revision?`. 퍼지·백업 결과는 발행 응답에만 있고 기록하지 않는다. 에디터는 실패를 토스트로만 보인다 | `admin-entries.ts`, `publish.ts`, `EditorApp.tsx` |
| 에디터 | `src/editor/` 44개 파일. `EditorApp.tsx` 1,224줄, 명령 레지스트리 618줄. `keymap.ts`에 덮어쓰기·충돌·`Mod+Alt` 검사 함수가 이미 있고 테스트된다. 덮어쓰기 값은 늘 빈 객체다. 화살표 키 명령은 없다 | 코드 |
| 이미지 메뉴 | 대체 텍스트, 캡션, 크기(작게·보통·크게 = 변형 주소 바꾸기). 크기 메뉴는 새 자산에만 켜진다. 임의 폭·정렬이 없다 | `ImageNodeView.tsx` |
| 연재 입력 | 메타 패널: key 자유 입력 + 순서 숫자. 기존 key를 고르는 목록이 없다. `seriesMeta`를 만들거나 고치는 코드는 이전 스크립트뿐이다. 새 key의 제목은 key 그대로 보인다 | `MetaPanel.tsx`, `content-posts.ts` |
| 태그 입력 | 메타 패널 태그 칸에 쓰고 Enter. `normalizeTag`로 정규화. 최대 3개. 기존 태그 제안이 없다 | `MetaPanel.tsx` |
| 공개 헤더 | 로고 + 메뉴 4 + 테마 + GitHub. 390px 폭에서 377px를 쓴다(실제 빌드, Pretendard 적용 뒤. 4단계 D6 계산값은 372px). 아이콘 32px. 연필을 더하면 409px로 19px 넘친다 | 로컬 정적 빌드 `/about`에서 측정 |
| 공개 푸터 | 링크 7개: 연재 · RSS · 노트 RSS · GitHub · 이메일 · 사이트맵 · About | `Footer.astro` |
| 공개 요청과 쿠키 | 공개 요청은 쿠키를 읽지 않는다(2단계 D5). 공개 HTML은 CDN이 모든 방문자에게 같은 것을 준다. JS가 있어야 보이는 요소는 `data-js-only` + noscript 스타일로 숨기는 방식이 이미 있다 | `middleware.ts`, `BaseHead.astro` |
| 번들(`pnpm build`) | `EditorApp` 1,815,484 B(gzip 555,941), 미리보기 하이라이터(동적) 1,584,737 B(gzip 233,054), React 런타임 175,550 B, `AdminLogin` 158,401 B(gzip 33,812). 함수 폴더 47 MB(로컬 맥 바이너리 기준) | 빌드 |
| 기준선 | `c7701c1`: `pnpm lint` 통과, `pnpm test` 580(39 파일), `pnpm build` 통과, `tsc --noEmit` 0(빌드 뒤. 빌드 전에는 `.astro` 타입이 없어 `middleware.ts` 2건). `67299d1`에서는 테스트 573(38 파일)이었다 | 실행 |
| 후보 패키지 | `prosemirror-search` 1.1.1(MIT, ProseMirror 공식, 검색·바꾸기 명령). `@vercel/functions` 3.10.2는 이미 있다(`waitUntil`). 드래그 핸들(`@tiptap/extension-drag-handle-react` 3.33.0, MIT)은 D6 답으로 쓰지 않는다 | `npm view`, `package.json` |
| MCP 도구 | `tools/cruz-lab-knowledge-mcp/`(서버 705줄, README, TEST_RESULT). 도구 5·리소스 3·프롬프트 2. 로컬 마크다운 폴더 3곳을 읽기만 한다. 의존성 `@modelcontextprotocol/sdk`는 이 도구만 쓴다. `package.json` 명령 `mcp:knowledge`. 등록은 `~/.codex/config.toml` 한 곳. README의 기술 표·디렉터리 절이 이 도구를 설명한다 | 코드, 설정 파일, grep |
| Vercel 함수 | 함수 1개(`_render.func`, Node 22, `maxDuration` 60, `icn1`). Fluid compute 켜짐 여부는 저장소에서 알 수 없다(대시보드 설정) | `.vc-config.json`, `vercel.json` |

### 1.3 4단계에서 넘어온 측정 (`rebuild` 미리보기)

요청은 미리보기 페이지 안의 같은 출처 `fetch`(`cache: no-store`, 쿼리를 붙여 CDN을 건너뜀)다. 글은 「UserProgram - 시스템 콜 동작 흐름」, OG는 같은 글이다.

| 회 | 시각(UTC) | 직전 상태 | 요청 순서와 TTFB |
|---|---|---|---|
| 0 | 11-09 18:11 | `67299d1` 배포 7분 뒤, 홈을 한 번 연 직후 | 글 상세 **1,736 ms** → OG **11,074 ms** → OG 다시 547 ms → 글 상세 다시 69 ms. 이어서 다른 글 2편 281·389 ms, `/about` 385 ms, `/blog` 95 ms, `/notes` 80 ms |
| 1 | 11-09 18:36 | `446b629` 배포(PR #19, 18:19 병합) 뒤. 이 세션은 22분 동안 요청하지 않았다 | 글 상세 **4,362 ms** → 다른 글 188 ms → 같은 글 다시 170 ms → OG **11,069 ms** → OG 다시 567 ms |
| 2 | 11-10 12:24 | 같은 배포(PR #20은 12:34에 병합). 이 세션은 약 18시간 요청하지 않았다. 그사이 다른 세션의 4단계 4.18 확인이 있었다 | `/og/zz.png`(없는 ID, Firestore·렌더 없음) **3,317 ms** → `/blog` 285 ms → 글 상세 **1,757 ms** → 다른 글 332 ms → OG **11,037 ms** → OG 다시 605 ms |

- 2회가 원인을 나눈다. 함수 부팅이 약 3.3초다(Firestore도 렌더도 없는 요청이 3,317 ms. 콜드였다는 뜻이다). 부팅 뒤 첫 글 렌더 준비가 약 1.4초다(첫 글 1,757 ms − `/blog` 285 ms 안팎). 둘째 글부터는 0.2~0.4초다.
- 그래서 콜드 글 상세는 4.4~4.7초다(1회 4,362 ms). 4단계 D7의 뒤집는 조건(1.5초)을 크게 넘는다. 다만 본문 미리 계산(D7 뒤집기)은 렌더 준비 1.4초만 없앤다. 부팅 3.3초는 남는다.
- Vercel 문서에 따르면 바이트코드 캐시와 미리 데우기는 production 배포에만 적용된다. 미리보기 함수는 48시간 쉬면 보관 상태가 되어 첫 호출이 더 느리다. 2025-04-23 전에 만든 프로젝트는 Fluid compute를 직접 켜야 한다([콜드 스타트 안내](https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel), [Compute 개요](https://vercel.com/docs/fundamentals/what-is-compute)). 그래서 미리보기 값은 운영 값의 위쪽 한계로 본다.
- OG 첫 요청은 여섯 번 모두 11초대다(4단계 4.17 2회, 4.18 1회, 이번 0·1·2회). 함수가 이미 깨어 있어도(0·2회) 같다. 다음 OG는 0.55~0.6초다.

## 2. 목표와 범위

### 2.1 5단계가 끝나면 참이 되는 것

| 요구 | 출처 | 5단계 해결 방법 |
|---|---|---|
| 관리자는 단일 React 앱이다 | 8.3 | D9 |
| 관리자는 자체 틀이고 본문 폭은 960~1200px이다 | M1 | D10(내용 최대 1120px) |
| 정상이면 알림이 없다. 문제가 있을 때만 띠 한 줄 | M2·M3, 5.3 | D11 |
| 상태별(초안·발행·숨김) 서버 집계 | M4 | 그대로(3단계) |
| 목록은 표 형태(제목·상태·수정일), 상태 거르기, 검색. 숨김 글 포함 | M6, 5.2 | D10 |
| 모바일 390px에서 목록 · 초안 이어 쓰기 · 발행 전환이 동작한다 | M11, 5.2 | D10 |
| 열면 본문. 첫 화면에서 한 번에 이어 쓴다 | 5.4 종합, 5.3 | D10 "이어 쓰기" |
| "오늘 기록" 버튼으로 노트 1개를 바로 만든다 | 5.3 | D10 |
| 공개 사이트에서 관리자 화면으로 가는 입구 | 8.3, 5.3 | D4(사용자 결정: 푸터 "관리") |
| 태그·카테고리 관리(만들기·이름 바꾸기·합치기) | 8.3, 5.2 | D1(사용자 결정: 둘 다 브라우저에서) |
| 이미지 라이브러리(목록, 쓰는 글, 쓰지 않는 것 지우기) | 8.3, 5.2 | D12 |
| 출간 기록 | 8.3, 5.2 | D11 |
| 설정(키맵) | 8.3, 3단계 Plan 14절(확정) | D14 |
| 이미지 임의 px 폭·정렬 | 4단계 D3 답("나중에 반드시") | D13 |
| 연재·프로젝트 정보 고치기, project 글 새로 만들기 | 4단계 작업 문서 5절 62, 5.2 | D2(사용자 결정) |
| 리비전 보기·되돌리기 | 5.2 | D3(사용자 결정) |
| 독자 수·독자 경로를 관리자 앱에서 본다 | 5.2 "간단한 통계", 사용자 요청(2026-11-10) | D3·D20 |
| 블록 순서 바꾸기, 찾기·바꾸기 | 3단계 Plan 14절, 4단계 Plan 14절 | D6·D7(사용자 결정) |
| 쓰지 않는 MCP 도구 정리 | 4단계 작업 문서 8절 5 | D8(사용자 결정: 지운다) |
| 글 상세 콜드 TTFB의 원인을 재고 처방한다. 기준은 운영 1.5초 | 4단계 D7, 작업 문서 8절 4 | D16 |
| OG 첫 요청이 3초 안이다 | 4단계 작업 문서 8절 6 | D17 |
| 클립보드 복사가 실제 Chrome·Safari에서 동작한다 | 4단계 작업 문서 8절 3 | D18 |
| iOS Safari에서 에디터 모바일 바가 키보드 위에 붙는다 | 3단계 작업 문서 8절 13 | D18 |
| 저장 실패가 일시 오류면 자동으로 다시 보낸다 | 3단계 작업 문서 8절 5 | D15 |
| 초안 버리기 뒤 "발행 뒤 변경"이 보이지 않는다 | 3단계 작업 문서 8절 10 | D15 |
| 목록만 볼 때 에디터 청크를 받지 않는다 | 3단계 작업 문서 8절 4 | D9 |

### 2.2 하는 것

1. 관리자 앱 틀: 진입 페이지 1개, 화면 전환(자체 라우터), 레이아웃, 로그인 화면(관리자 틀, 사전 안내, 거부 화면), 관리자 표시(공개 페이지용).
2. 첫 화면과 목록: 이어 쓰기, 새 글·오늘 기록, 거르기·검색·정렬, 30일 독자 수, 빈 초안 정리, 행 메뉴.
3. 알림 띠와 출간 기록: `publishLog`에 부수 작업 결과 칸을 더하고, 실패를 다시 시도하는 API와 화면.
4. 공개 사이트: 푸터 "관리" 링크, 관리자 전용 "고치기", 독자 흐름 수집 스크립트, 비관리자 로그인의 인증 기록 삭제.
5. 이미지 라이브러리: 자산 목록 API와 화면.
6. 분류: 카테고리 목록 데이터화(`settings/taxonomy`)와 화면, 태그 바꾸기·합치기, 옛 주소 301, 에디터 태그·카테고리·연재 key 제안.
7. 연재·프로젝트 정보 화면과 새 프로젝트, 리비전 보기·가져오기.
8. 독자 흐름: 수집 API, 날짜별 요약, 관리자 화면 2개(사이트·글).
9. 에디터: 이미지 세부 조절, 키맵 설정, 블록 이동, 찾기·바꾸기, 저장 자동 재시도, 초안 버리기 표시.
10. 측정과 처방: 글 상세 콜드 TTFB(D16), OG 첫 요청(D17).
11. MCP 도구 삭제(D8).
12. 검증: 관리자 API 스모크, 독자 흐름 스모크, 브라우저 시나리오, 실제 기기 확인(D18), `rebuild` 미리보기.

### 2.3 하지 않는 것

| 하지 않는 것 | 이유 또는 시점 |
|---|---|
| `README.md`·`PUBLISHING.md`·`.env.example` 최종본 | 4단계 D5 답. 5단계 뒤 main 병합 준비 작업 단위(D19). README의 MCP 도구 설명도 그때 지운다 |
| 옛 `posts`·`series` 컬렉션 삭제, 규칙을 "전부 거부"로, legacy 자산 정리 | main 병합 뒤(2단계 Plan 15절, 감사 문서 11.3) |
| 공개 페이지 디자인 변경 | 4단계 몫. 5단계는 푸터 링크 1개, 관리자 전용 "고치기", 추적 스크립트만 더한다 |
| 링크 카드 | D5 답(미룸). 14절 |
| 드래그 핸들 | D6 답(블록 이동 명령만). 14절 |
| 비공개 미리보기 링크, 예약 발행 | D3 답(뺌). 14절 |
| 다른 날까지 같은 독자로 잇기(기기에 오래 남는 익명 ID), Vercel Web Analytics, 외부 분석 도구 | D20. 독자 흐름은 한 번의 방문 안에서만 잇는다 |
| 검색 엔진 검색어 | 사이트가 알 수 없다. Google Search Console 등록으로 본다(14절, 사용자가 원할 때) |
| cruz-lab 프로젝트 글 고치기·숨기기 | 재건 뒤 전략을 세워 새로 쓴다(사용자 2026-11-10). 14절 |
| 전역 검색 팔레트, 댓글, 404 최신 글 | 4단계 Plan 14절 그대로 |
| 백업 Action 실패 알림 | GitHub API 읽기 권한이 있는 토큰이 필요하다. 매일 예약 실행이 백업을 다시 맞춘다. 14절 |
| 슬래시 메뉴 순서·기본 보기 모드 설정 | 계획 문서 8.1의 `settings/editor` 후보다. 요구가 없다. 키맵만 한다 |
| editorJson v2 형식 | 3단계 작업 문서 8절 7. 깊이 한도로 문제가 난 글이 없다 |
| 카테고리 커버, 연재 커버 | 계획 문서 10.1 결정 2. D2의 범위는 제목·설명·프로젝트 칸이다 |
| 여러 관리자, 권한 단계 | 관리자는 `ADMIN_UID` 한 명이다(2단계 D5) |
| Firestore·Storage 규칙 변경 | 관리자 쓰기와 독자 데이터 쓰기는 모두 서버 API(Admin SDK)다. 새 컬렉션은 규칙에 없어 클라이언트 접근이 막힌다 |

## 3. 설계 결정

"사용자 결정" 8건(D1~D8)은 2026-11-10에 모두 답을 받았다(13절). "Claude 판단"(D9~D20)은 승인할 때 함께 확인한다.

### D1. 분류(태그·카테고리) 관리 (사용자 결정: b. 둘 다 브라우저에서)

**물은 것.** 태그는 글 문서 안의 글자다. 카테고리는 글 안의 key 하나와 코드 상수 목록(표시 이름) 두 곳에 나뉘어 있다. 그래서 바꿀 일이 셋이다: (1) 태그 이름 바꾸기·합치기, (2) 글의 카테고리 바꾸기, (3) 카테고리 목록 바꾸기(새 칸, 칸 이름·key). 처음 권장은 (1)(2)만 버튼으로 하는 a였다. 사용자가 "장기적으로 카테고리든 태그든 브라우저 안에서 손쉽게 수정 가능한 게 낫지 않나"라고 물었고, 이 앱의 목적(코드 없이 브라우저에서 블로그를 다룬다)에 맞으므로 권장을 b로 바꿨다. 사용자가 b를 골랐다.

**설계(Claude 판단).**

| 항목 | 정함 |
|---|---|
| 데이터 | `settings/taxonomy`: `{ categories: [{ key, label, synonymTags[] }], categoryAliases: { 옛 key: 새 key }, tagAliases: { 옛 태그: 새 태그 }, version, updatedAt }` |
| 기본값 | 코드 `CATEGORIES`(10개)는 남긴다. 문서가 없거나 읽기에 실패하면 이 값을 쓴다. 첫 저장 때 문서를 만든다. 2단계 이전 스크립트는 코드 값을 그대로 쓴다 |
| 읽기 | 서버 `getTaxonomy()`: 메모리 60초(글 목록 메모와 같다). 공개 코드 3곳(`blog-list.ts`, `server/entries.ts`, `blog/category/[key].astro`), 사이트맵, OG 라벨이 상수 대신 이 값을 쓴다 |
| 검사 | `categoryKeySchema`는 형식 검사(`[a-z0-9-]+`)로 바꾼다. "목록에 있는 key인가"는 초안 저장·발행 API가 `getTaxonomy()`로 검사한다. 저장된 문서를 읽을 때는 모르는 key도 받는다(깨진 문서로 보지 않는다) |
| 카테고리 동작 | 새로 만들기(표시 이름 + 주소 key), 이름 바꾸기, key 바꾸기(그 카테고리 글의 초안·발행본 key를 한 번에 바꾸고 `categoryAliases`에 옛 key, 퍼지), 글 0편(초안 포함)일 때만 지우기. 합치기 = 글 옮기기 + 빈 카테고리 지우기 |
| 동의어 태그 | 기존 10개의 값을 문서로 옮긴다. 화면은 보이기만 한다. 새 카테고리의 동의어는 빈 목록이다 |
| 글 옮기기 | 목록에서 글을 골라 다른 카테고리로. 초안과 발행본의 key를 함께 바꾼다. 새 리비전은 만들지 않는다 |
| 태그 동작 | 이름 바꾸기·합치기. 대상 글의 초안·발행본 태그를 함께 고친다. `tagAliases`에 옛 이름. 동의어·3개 한도 검사 |
| 옛 주소 | `/blog/category/<옛 key>`, `/blog/tag/<옛 태그>`는 페이지가 못 찾으면 별칭 표를 보고 301 |
| 기록 | `publishLog`에 `retag`·`recategorize`·`category`(만들기·이름·key·지우기) 줄. 대상 글 ID 목록을 남긴다(되돌리기 근거) |
| 에디터 | 카테고리 칸은 API의 목록을 쓰고 맨 아래 "+ 새 카테고리"(작은 입력 2칸). 태그 칸은 기존 태그를 제안한다 |
| 실행 전 확인 | 바꾸기·옮기기는 대상 글 목록과 수를 보이고 확인을 받는다 |
| 비용 | 2~2.5일 |

### D2. 연재·프로젝트 정보 화면 (사용자 결정: a. 화면 1개)

**물은 것.** 연재(3개)와 프로젝트(4개)의 이름·설명·프로젝트 정보는 `seriesMeta`에 있다. `/series/<key>` 머리와 `/projects` 카드에 보이지만 브라우저에서 고칠 길이 없다. 새 프로젝트는 만들 수도 없다. 계획 문서 10.1이 "연재 관리 화면 없음"을 정했기 때문에 물었다. 그때의 뜻은 커버·진행률을 가진 큰 연재 기능을 줄이자는 것이었다.

**설계(Claude 판단).**

| 항목 | 정함 |
|---|---|
| 화면 | `/admin/series`: 연재·프로젝트 목록(제목, key, 편 수, 종류). 고치기: 제목·설명, 프로젝트면 긴 설명·태그·기술·GitHub·데모·대표·순서·기간. "새 프로젝트": key·제목 → `seriesMeta/<key>`(project 칸) + 첫 Part 초안(kind project, `series: { key, order: 1 }`) → 에디터 |
| 새 연재 | 따로 만드는 버튼은 없다. 에디터에서 새 key를 쓰면 생기고, 이 화면에 "제목 없음"으로 보인다. 여기서 제목·설명을 단다 |
| 커버 | 없다(10.1 유지. 카드·OG는 코드 커버) |
| API | `GET /api/admin/series`, `PUT /api/admin/series/{key}`(버전 검사), `POST /api/admin/projects`. `CREATABLE_KINDS`에 project를 더한다 |
| 메타 패널 | 연재 key 칸이 기존 key 목록을 제안한다 |
| 퍼지 | 저장하면 그 연재·프로젝트 글의 캐시와 목록을 비운다 |
| 비용 | 1일 |

### D3. 계획 문서 5.2의 선택 기능 (사용자 결정)

| 기능 | 답 | 내용 |
|---|---|---|
| 리비전 보기·되돌리기 | **넣는다** | 에디터 메뉴 "이전 발행본": 리비전 목록(번호·날짜·제목) → 미리보기 → "초안으로 가져오기"(초안 버전 +1, 충돌 검사 그대로). 지금 글마다 1개라 이력은 다음 발행부터 쌓인다. 반나절 |
| 비공개 미리보기 링크 | 뺀다 | 14절 |
| 예약 발행 | 뺀다 | 14절. Vercel Hobby의 Cron Jobs는 하루 한 번(그 시각의 한 시간 안), 새 Schedules는 15분 간격이다([Cron 사용량](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Schedules 이전 안내](https://vercel.com/docs/schedules/migrate-from-cron-jobs)) |
| 조회수 → 독자 흐름 | **넣는다(1·2·3단계 전부)** | 처음 질문은 "관리자 목록의 조회수"였다. 사용자가 "어떤 날 몇 명이 읽었는지, 그 독자가 또 어떤 글을 읽었는지"를 원했다. Claude가 단계를 나눠 제안했고 사용자가 전부를 골랐다. 설계는 D20 |

### D4. 공개 사이트의 입구 (사용자 결정: 푸터 "관리" 공개 + 두 화면 다듬기)

**물은 것.** 처음에는 관리자 본인 브라우저에만 보이는 입구(헤더 연필)를 권했다. 사용자가 판별 방식(브라우저 저장 공간의 메모, 시크릿 창에서는 안 보임)을 확인한 뒤 "굳이 숨길 필요가 있나. 내 계정이 아니면 어차피 못 들어간다"고 제안했다. 보안은 숨기든 안 숨기든 같다. 관리자 화면과 API가 매번 세션을 서버에서 확인하기 때문이다. 사용자는 면접관이 이 흐름을 겪어 보는 것도 나쁘지 않다고 보았다.

**답(2026-11-10).**

1. 푸터 링크 끝에 "관리"를 둔다. 누구에게나 보인다. 헤더는 그대로다.
2. 로그인 화면(`/admin/login`)을 관리자 틀(`AdminPage.astro`)로 옮기고 사전 안내를 둔다: "블로그 관리자 전용 화면입니다. 관리자 계정이 아니면 로그인되지 않고, 로그인 기록도 남기지 않습니다." 버튼 "Google로 로그인", 링크 "블로그로 돌아가기".
3. 관리자가 아닌 계정이면 거부 화면을 보인다: "관리자 계정이 아닙니다 · 이 계정으로는 들어갈 수 없습니다 · 방금 로그인 기록은 지웠습니다" + "블로그로 돌아가기". 날것의 오류(403 JSON, 빈 화면)를 보이지 않는다.
4. 세션 API가 ID 토큰을 확인한 뒤 관리자 UID가 아니면 그 Firebase 인증 사용자를 바로 지운다(`getAuth().deleteUser(uid)`). 관리자 UID는 절대 지우지 않는다. `ADMIN_UID`가 없으면(503) 지우지 않는다. 그래서 Firebase 인증 사용자 목록에는 관리자만 남는다.
5. "이 관리자 앱을 만든 과정 보기" 링크는 지금 넣지 않는다. 그 글을 쓰면 넣는다(14절).
6. 관리자 전용 동작(글 상세·노트·프로젝트 글의 "고치기")은 관리자 앱을 연 브라우저에만 보인다(아래 "관리자 표시").

**관리자 표시(Claude 판단).** 관리자 앱이 열릴 때 그 브라우저의 `localStorage`에 `cruz-admin-hint`(만료 시각 = 세션과 같은 14일)를 남긴다. 로그아웃하면 지운다. 공개 페이지의 인라인 스크립트가 표시를 보고 `hidden`인 관리자 전용 요소를 드러낸다. 표시는 권한이 아니다. 흉내 내면 그 사람 화면에 "고치기"가 보일 뿐이고, 누르면 로그인 화면이다. 시크릿 창은 저장 공간이 따로라 표시가 없다. 같은 표시로 독자 흐름에서 관리자 본인 방문을 뺀다(D20).

### D5. 링크 카드 (사용자 결정: 미룬다)

주소 한 줄은 지금처럼 링크다. 카드 후보는 4편 5줄이다(4단계 D4 조사). 넣으면 발행 응답 뒤 백그라운드로 그 사이트의 메타 정보를 읽고, SSRF 방지 규칙(http·https, 사설 주소 차단, 5초, 1 MB)이 필요하다. 1~2일. 14절에 남긴다.

### D6. 블록 순서 바꾸기 (사용자 결정: 블록 이동 명령만)

| 항목 | 정함 |
|---|---|
| 동작 | 커서가 있는 블록(단락·제목·목록 항목·코드·표·이미지·인용·콜아웃)을 한 칸 위·아래로 옮긴다 |
| 키 | `Mod+Shift+↑` / `Mod+Shift+↓`. 맥에서 `⌘⇧↑/↓`는 원래 "문서 처음·끝까지 선택"이다. 에디터 안에서만 블록 이동으로 쓴다(노션과 같다). 지금 에디터에 화살표 키 명령은 없다. 키맵 설정(D14)으로 바꿀 수 있다 |
| 진입 | 명령 레지스트리 명령 2개. 팔레트, 모바일 바 버튼 |
| 되돌리기 | `Mod+Z` 한 번에 한 칸 |
| 비용 | 반나절 미만 |

드래그 핸들은 14절에 남긴다(블록 이동 명령을 써 본 뒤 다시 묻는다).

### D7. 찾기·바꾸기 (사용자 결정: 넣는다)

| 항목 | 정함 |
|---|---|
| 동작 | 편집 모드에서 `Mod+F`가 브라우저 찾기 대신 에디터 찾기 막대를 연다. 찾기(대소문자·정규식 선택), 다음·이전(`Enter`·`Shift+Enter`), 바꾸기, 모두 바꾸기, 찾은 수 "2 / 5". `Esc`로 닫는다. 소스 모드는 브라우저 찾기 그대로(`<textarea>`) |
| 구현 | `prosemirror-search`(ProseMirror 공식, MIT): 검색 상태·강조·명령. 막대 UI는 직접 만든다. 명령 레지스트리에 등록(팔레트에도 보임) |
| 되돌리기 | "모두 바꾸기"는 트랜잭션 하나라 `Mod+Z` 한 번에 전부 되돌아간다 |
| 3단계 질문 | "VS Code `Cmd+D`처럼 같은 글자를 여러 곳 고치기"(2026-11-09)를 "모두 바꾸기"가 맡는다 |
| 비용 | 반나절~1일 |

### D8. `tools/cruz-lab-knowledge-mcp` (사용자 결정: 지운다)

**물은 것과 평가.** 4단계가 도구가 읽던 `src/content/projects`를 지웠다. 그래서 도구를 고칠지 물었다. 사용자는 도구를 AI 추천으로 만들었고 써 본 적이 없다고 했고, 객관 평가를 요청했다. Claude의 평가(2026-11-10):

1. 도구는 같은 컴퓨터의 마크다운 폴더를 읽기만 한다. Codex·Claude Code는 같은 파일을 원래 직접 읽고 검색한다. MCP로 한 번 더 감싸 얻는 것이 거의 없다. MCP가 값을 내는 곳은 에이전트가 원래 닿지 못하는 외부 서비스·인증 데이터·여러 클라이언트에 나눠 줄 도구다.
2. MCP는 2025-11에 Linux Foundation 산하 Agentic AI Foundation으로 넘어가 업계 공통 규격이 되었다. 2026년에는 새로운 것이 아니라 기반이 되었고, 도구 설명이 컨텍스트를 많이 쓴다는 비판과 CLI + Skills로 옮기는 흐름도 있다. 그래서 "MCP 서버를 만들어 봤다"만으로는 차별점이 아니다(출처는 13절 아래).
3. 포트폴리오로는 이득보다 위험이 크다. "왜 로컬 파일을 MCP로 감쌌나"에 답하기 어렵고, 본인이 기억하지 못하는 글은 면접에서 역효과다.

**답(2026-11-10): "도구 싹 지워."**

| 지우는 것 | 시점 |
|---|---|
| `tools/cruz-lab-knowledge-mcp/`(server.mjs, README, TEST_RESULT) | T14 |
| `package.json`의 `mcp:knowledge` 명령, 의존성 `@modelcontextprotocol/sdk`(이 도구만 쓴다) | T14 |
| `~/.codex/config.toml`의 `[mcp_servers.cruz-lab-knowledge]` 3줄(저장소 밖, 사용자 승인 2026-11-10) | T14. 지우기 전에 그 줄만 보이고 지운다 |
| README의 도구 설명(기술 표 1행, 문단 1, 디렉터리 1행, 실행 명령) | main 병합 준비(4단계 D5). 감사 문서 11.3에 적는다 |

`tests/unit/project-to-entry.test.ts`는 slug 문자열 `cruz-lab-knowledge-mcp`를 시험 값으로만 쓴다. 도구와 상관없어 그대로 둔다. cruz-lab 프로젝트 글 3편(옛 CMS 설명 2편, MCP 글 1편)은 지금 손대지 않고 재건 뒤 새로 쓴다(14절).

### D9. 앱 구조: 단일 React 앱 + 자체 라우터 + 에디터 지연 로드 (Claude 판단)

| | **단일 앱 (선택)** | 페이지마다 Astro + React 섬 |
|---|---|---|
| 진입 | `src/pages/admin/[...path].astro` 한 개(SSR, 미들웨어가 세션 검사) → `<AdminApp client:only="react">` | 화면마다 `.astro` |
| 화면 전환 | History API로 주소만 바꾼다. 목록 데이터를 다시 받지 않는다 | 전체 새로 고침 |
| 에디터 | `React.lazy(() => import('@/editor/ui/EditorApp'))`. 목록만 보면 에디터 청크를 받지 않는다. KaTeX CSS는 에디터 모듈이 가져온다 | 지금과 같다 |
| 저장 안 한 변경 | 화면을 떠나기 전에 에디터의 저장을 비운다(`flush`). 실패하면 머물지 묻는다 | `beforeunload` |
| 의존성 | 더하지 않는다. 라우터는 60줄 안팎 | — |

화면과 주소: `/admin`(첫 화면·목록), `/admin/edit/<id>`(에디터), `/admin/assets`(이미지), `/admin/taxonomy`(분류), `/admin/series`(연재·프로젝트), `/admin/readers`(독자 흐름), `/admin/readers/<id>`(글 하나의 독자), `/admin/log`(출간 기록), `/admin/settings`(설정). `/admin/login`은 따로 둔다(세션 없이 연다). `/admin/posts/new`(POST 폼)와 301 페이지 2개는 지운다. 앱이 `POST /api/admin/posts`를 부른다. 모르는 주소는 `/admin`으로 바꾼다.

**선택 이유.** 계획 문서 8.3이 "단일 React 앱"을 정했다. 목록과 에디터를 오갈 때 다시 그리지 않는다. 에디터 청크를 늦게 받으므로 첫 화면이 가볍다(3단계 8절 4).

### D10. 레이아웃과 첫 화면·목록 (Claude 판단)

**레이아웃(M1).** 폭 1024px 이상: 왼쪽 메뉴 200px(글·이미지·분류·연재·독자·출간 기록·설정, 아래에 사이트 보기·로그아웃) + 내용(최대 1120px). 1024px 미만: 위 막대(제목·새 글·메뉴 버튼). 메뉴는 시트로 연다. 에디터 화면은 메뉴 없이 전체 화면이다(지금 에디터 상단 바의 "← 목록"이 돌아가는 길).

**첫 화면(5.3, 5.4 종합).** 맨 위 한 줄: "새 글", "오늘 기록"(노트를 만들고 바로 에디터). 그 아래 "이어 쓰기": 최근에 고친 초안과 "발행 뒤 변경 있음" 글 최대 3편(제목·고친 때·기기). 빈 초안은 넣지 않는다. 그 아래 목록이다. 알림 띠(D11)는 맨 위에 문제가 있을 때만 생긴다.

**목록(M4·M6).**

| 항목 | 정함 |
|---|---|
| 데이터 | `GET /api/admin/posts` 한 번(본문 없음, 69행). 응답에 `isEmptyDraft`(발행본 없음 + 제목·설명·본문이 빔, 서버가 계산)와 `readers30`(최근 30일 독자 수, D20)를 더한다. 거르기·검색·정렬은 브라우저에서 즉시 |
| 거르기 | 상태 탭(전체·초안·발행·숨김 + 수), 종류(글·노트·프로젝트), 검색(제목·slug·태그·카테고리 이름·연재 key), "빈 초안 N" |
| 정렬 | 고친 때(기본) · 발행일 · 30일 독자. 발행일 정렬은 이관 글 55편이 한 시각으로 묶이는 문제(1.2)를 푼다 |
| 표(768px 이상) | 제목(아래 작게 slug) · 종류 · 상태(+ "변경 있음") · 분류(카테고리 또는 연재 key·순서) · 30일 독자 · 고친 때 · 발행일 |
| 모바일(768px 미만) | 두 줄 행: 제목 / 종류 · 상태 · 독자 · 고친 때. 행 끝 `⋯` 메뉴 |
| 행 메뉴 | 공개 페이지 보기, 독자 보기, 숨기기/다시 보이기(M11 "발행 전환"), 삭제(확인) |
| 빈 초안 | 칩을 누르면 그것만 보이고 "모두 지우기"(개수와 확인) |
| 주소 상태 | `?status=&kind=&q=&sort=`. 에디터에서 돌아오면 같은 거르기다 |
| 키 | `Shift+N` 새 글, `/` 검색 칸. 입력 칸 안에서는 듣지 않는다. 공개 페이지에는 전역 키를 두지 않는다 |

### D11. 알림 띠와 출간 기록 (Claude 판단)

**`publishLog` 칸 더하기(더하기만).** 발행·숨김·삭제 뒤 부수 작업 결과를 같은 줄에 적는다: `purge`(ok·failed), `backup`(dispatched·skipped·failed), `assetUsage`(ok·failed), `title`(그때 제목). 새 `action` 값: `retag`·`recategorize`·`category`(D1), `series`(D2), `restore`(D3), `retry`(아래). 옛 줄은 칸이 없어도 읽힌다.

**알림 띠.** 정상이면 없다.

| 조건 | 띠 | 버튼 |
|---|---|---|
| 최근 7일 `publishLog`에 `purge: failed`가 있고 그 뒤 같은 글의 성공 줄이 없다 | "캐시 비우기 실패 N건" | 다시 비우기(`POST /api/admin/posts/{id}/retry {purge}`) |
| 같은 조건의 `backup: failed` | "백업 알림 실패 N건" | 다시 알리기(같은 API `{backup}`) |
| 이 브라우저의 오프라인 보관함(IndexedDB)에 초안이 있다 | "이 기기에 보내지 않은 초안 N편" | 열기 |

다시 시도에 성공하면 그 글의 새 줄(`action: retry`)을 남기고 띠가 사라진다. 띠는 첫 화면이 받는 출간 기록 요청 하나로 계산한다. GitHub를 부르지 않는다(M3).

**출간 기록 화면.** 최신순 50줄씩(`GET /api/admin/publish-log?before=`). 줄: 때 · 동작 · 제목(링크) · 리비전 · 부수 결과(실패만 빨간색). 글이 지워졌으면 기록된 `title`·`slug`를 쓴다.

### D12. 이미지 라이브러리 (Claude 판단)

| 항목 | 정함 |
|---|---|
| API | `GET /api/admin/assets`: 141개 전부(본문 없음): ID, 주소, 썸네일 주소(새 자산은 `w480`, legacy는 원본), 종류, 크기(바이트·폭·높이), `legacy`, `usedBy`, `orphanedAt`, 올린 때. 글 제목은 목록 API 결과로 앱이 잇는다 |
| 화면 | 격자(썸네일 `loading="lazy"`, 정사각 칸, `object-fit: cover`). 거르기: 전체 · 쓰는 것 · 쓰지 않는 것 · legacy · 영상. 정렬: 올린 때 · 크기 |
| 상세 | 오른쪽 패널(모바일은 시트): 큰 미리보기, 크기·변형 목록, 쓰는 글(에디터 링크), 주소 복사(마크다운 `![](…)` 한 줄) |
| 지우기 | 쓰지 않는 새 자산만. 2단계 정리 API(`POST /api/admin/assets/purge {ids, dryRun}`)로 시험 실행 결과를 보이고 확인 뒤 실행. 정리 API는 지우기 직전에 모든 글을 다시 훑는다. legacy는 "main 병합 뒤 정리" 표시만(`PURGE_LEGACY_ASSETS = false`) |
| 올리기 | 하지 않는다. 이미지는 에디터에서 넣는다 |
| 무게 | legacy 썸네일은 원본(최대 2.64 MB)이다. 지연 로드 + 한 번에 60칸까지 그리고 "더 보기". legacy용 작은 변형을 만드는 일은 데이터 쓰기라 하지 않는다 |

### D13. 이미지 세부 조절: 임의 px 폭과 정렬 (Claude 판단, 범위는 4단계 D3 답으로 확정)

**표기.** 폭과 정렬이 없으면 지금처럼 `![alt](src "title")`이다. 있을 때만 원시 HTML로 쓴다(GitHub README 관례. GitHub·백업 저장소에서 그대로 보인다).

| 상태 | 마크다운 |
|---|---|
| 폭만 | `<img src="…" alt="…" title="…" width="600">` (단락에 이 태그 하나) |
| 정렬(가운데·오른쪽), 폭 선택 | `<p align="center"><img src="…" alt="…" width="600"></p>` |
| 왼쪽 정렬 | 기본값이다. 속성을 쓰지 않는다 |

**변환기.** 마크다운 → 문서: 위 두 모양만 이미지 노드로 읽는다. 받는 속성은 `src`·`alt`·`title`·`width`(숫자)·`align`(left·center·right)이다. 다른 속성이나 모양은 지금처럼 "지원하지 않는 HTML" 경고 + 글자다(3단계 D10). 문서 → 마크다운: 노드에 폭이나 정렬이 있을 때만 HTML로 쓴다. 왕복 검사 69/69를 지킨다(원시 `<img>`를 쓴 글이 0편이다). 단위 테스트 fixture를 더한다.

**에디터.** 이미지를 고르면 메뉴에 "폭(px)" 입력(비우면 자동)과 정렬 버튼 3개가 더해진다. 데스크톱은 이미지 오른쪽 가장자리를 끌어 폭을 바꾼다(10px 단위, 최대 본문 폭). 기존 크기 메뉴(작게·보통·크게 = 변형 바꾸기)는 새 자산에 그대로 있다. 폭·정렬은 legacy·외부 이미지에도 된다.

**공개 렌더.** 4단계가 원시 `<img width>`·`<p align>` 통과를 테스트로 고정했다(`content-assets.test.ts`). 폭이 있는 새 자산 이미지는 `sizes`를 그 폭으로 맞춘다(`rehype-assets`).

### D14. 설정과 키맵 (Claude 판단, 범위는 확정)

| 항목 | 정함 |
|---|---|
| 데이터 | `settings/editor`: `{ keymap: { [명령 ID]: { mac, other } \| null }, version, updatedAt }`. 기본값과 다른 명령만 담는다. `null`은 "키 없음" |
| API | `GET /api/admin/settings/editor`, `PUT …`(버전 검사, zod: 아는 명령 ID, 키 형식, `Mod+Alt` 거부, 충돌 거부 → 422 항목별 이유) |
| 에디터 | 열 때 한 번 읽어 `applyKeymapOverrides`(이미 있다)로 적용한다. 읽기에 실패하거나 값이 틀리면 기본 키로 열고 띠로 알린다 |
| 설정 화면 | 명령 묶음별 표: 명령 · 지금 키 · 기본 키. "바꾸기"를 누르고 키를 누르면 잡는다. 지우기 · 기본값으로. 충돌은 저장 전에 빨갛게. 이 기기의 플랫폼(맥·그 밖) 키만 고친다 |
| 막는 키 | `Mod+Alt` 조합(계획 문서 2.2 #2), 브라우저가 가로채는 키(`Mod+W`·`Mod+T`·`Mod+N`·`Mod+Q`·`Mod+Tab`·`Mod+L`) |

### D15. 에디터 보완 (Claude 판단)

1. **저장 자동 재시도(3단계 8절 5).** 네트워크 오류·5xx·503이면 2초·5초·15초 뒤 세 번 다시 보낸다. 그래도 실패하면 지금처럼 멈추고 "다시 시도"를 보인다. 409·413·422는 다시 보내지 않는다.
2. **초안 버리기 뒤 "발행 뒤 변경"(3단계 8절 10).** `discardDraft`가 같은 트랜잭션에서 `published.fromDraftVersion`을 새 초안 버전으로 맞춘다. 초안이 발행본과 같으므로 뜻이 맞다. 리비전 문서는 바꾸지 않는다.
3. **청크(3단계 8절 4).** 앱이 에디터를 늦게 받는다(D9). 에디터 청크 안의 분할(KaTeX·lowlight)은 하지 않는다. 크기만 기록한다.
4. **editorJson 깊이(3단계 8절 7).** 바꾸지 않는다(2.3).
5. **iOS 모바일 바(3단계 8절 13).** D18에서 사용자 iPhone으로 확인한다. 흔들리면 3단계 D12대로 하단 고정으로 바꾼다.

### D16. 글 상세 콜드 TTFB (Claude 판단, 4단계 D7의 뒤집는 조건)

**사실(1.3).** 미리보기 콜드 = 함수 부팅 약 3.3초 + 첫 렌더 준비 약 1.4초. 둘째 글부터 0.2~0.4초. 미리보기는 바이트코드 캐시·미리 데우기가 없다.

**결정.**

1. **기준을 운영으로 옮긴다.** 4단계 D7의 "미리보기 콜드 TTFB 1.5초"는 미리보기가 운영과 같다는 가정이었다. 문서상 그렇지 않다. 기준은 "main 병합 뒤 운영의 콜드 글 상세 TTFB 1.5초"로 바꾼다. 미리보기 값은 기록만 한다.
2. **렌더 준비 1.4초를 먼저 줄인다(T13).** 글 상세 응답에 `Server-Timing`(Firestore 읽기, 하이라이터 준비, 마크다운 변환, 전체)을 붙인다. 로컬에서 빌드 결과를 새 프로세스로 띄워 첫 글 렌더를 CPU 프로파일로 잰다. 하이라이터 준비가 대부분이면 그 글에 나오는 언어만 불러오게 바꾼다(Shiki 세밀 번들의 `loadLanguage`). KaTeX 등 다른 모듈이면 그 글에 수식이 있을 때만 가져온다.
3. **부팅 3.3초는 설정으로 다룬다.** Vercel 대시보드에서 Fluid compute가 꺼져 있으면 켜기를 사용자에게 묻는다(E2). 켜면 운영에서 바이트코드 캐시가 적용된다. 함수 번들의 큰 의존성(`firebase-admin` 등)을 늦게 불러오는 일은 2번 측정에서 부팅 몫이 드러날 때만 한다.
4. **본문 미리 계산(D7 뒤집기)은 마지막이다.** 2번 뒤에도 운영 콜드가 1.5초를 넘고 렌더 몫이 그 절반을 넘으면, main 병합 뒤 별도 작업으로 다시 본다(14절).

### D17. OG 첫 요청 (Claude 판단, 4단계 작업 문서 8절 6)

**사실.** 같은 인스턴스가 방금 페이지를 그렸어도 첫 OG는 11초대다(여섯 번). 다음 OG는 0.55~0.6초다. 그래서 비용은 함수 부팅이 아니라 그 인스턴스의 첫 OG 그리기(satori·resvg import, wasm 초기화, 글꼴 읽기)에 있다. 로컬은 1.6~3.7초다. Vercel CDN은 지역마다 따로 저장한다([Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache)). 그래서 서울에서 한 번 받아 CDN을 데워도 다른 지역의 크롤러에는 소용이 없다.

**순서.** 목표는 "OG 첫 요청 3초 안"이다.

1. 재기: `/og/<id>.png` 응답에 `Server-Timing`(import satori, import resvg, 글꼴, satori, resvg)을 붙여 미리보기에서 콜드 3회를 잰다.
2. import·초기화가 대부분이면 `@resvg/resvg-js`(네이티브)를 `@resvg/resvg-wasm`으로 바꿔 다시 잰다. 3초 안이면 끝이다.
3. 그래도 3초를 넘으면 발행 응답 뒤 백그라운드(`waitUntil`)로 PNG를 그려 Storage `og/<id>-<revision>.png`에 저장한다. `/og/<id>.png`는 저장본이 있으면 그것을 돌려준다. 다시 발행하면 새 리비전 파일을 쓰고 옛 파일을 지운다. 기존 글 62편의 저장본은 처음 요청될 때 만든다.

**선택 이유.** 원인이 재지 않은 추측(4단계 작업 문서 8절 6)이라 먼저 잰다. 3번은 새 Storage 경로와 파일 정리가 생기므로 2번이 안 될 때만 한다.

### D18. 실제 브라우저·기기 확인 (Claude 판단)

| 확인 | 방법 | 누가 |
|---|---|---|
| 코드 복사(클립보드 API 경로, 4단계 8절 3) | `rebuild` 미리보기 글 상세에서 코드 블록 "복사" → 다른 입력 칸에 붙여넣기. Chrome(Claude in Chrome, 사용자 허락 뒤)과 Safari(사용자 Mac 또는 iPhone) | Chrome은 Claude, Safari는 사용자 |
| 에디터 모바일 바(3단계 8절 13) | iPhone Safari로 `rebuild` 미리보기 에디터를 열고 키보드를 띄운 채 입력·스크롤 | 사용자 |
| 관리자 목록 390px(M11) | iPhone Safari로 이어 쓰기 · 숨김 전환 | 사용자 |
| 로그인 거부(D4) | 관리자가 아닌 Google 계정으로 시도 → 거부 화면 → Firebase 인증 사용자 목록에 남지 않음 | 사용자(다른 계정이 있으면). 없으면 스모크의 시험 사용자로 대신한다(8.1) |

결과는 작업 문서 4절에 적는다. 사용자 확인은 미리보기 확인(8.6) 때 한 번에 묻는다.

### D19. PR 분할과 main 병합 준비의 자리 (Claude 판단)

코드 PR 5개 + 문서 PR 1개. 모두 대상은 `rebuild`다. 7절.

- **PR-A** `stage5/a-app`: T1~T4. 앱 틀, 첫 화면·목록, 알림·출간 기록, 입구(D4).
- **PR-B** `stage5/b-manage`: T5~T8. 이미지 라이브러리, 분류(D1), 연재·프로젝트(D2), 리비전(D3).
- **PR-C** `stage5/c-editor`: T9~T11. 이미지 세부 조절, 키맵 설정, 블록 이동·찾기·바꾸기·자동 재시도.
- **PR-D** `stage5/d-readers`: T12. 독자 흐름(D20).
- **PR-E** `stage5/e-perf`: T13~T14. TTFB(D16), OG(D17), MCP 도구 삭제(D8).
- **문서 PR** `stage5/docs`: T16.

PR-A 병합 전에 태그 `rebuild-pre-stage5`를 단다(이 Plan의 병합 커밋). PR-B~PR-E는 PR-A 병합 뒤에 시작한다. PR-B의 분류 데이터화(T6)와 PR-D의 공개 스크립트는 공개 코드를 함께 건드리므로 PR-B를 먼저 병합하고 PR-D를 그 위에서 시작한다. PR-C·PR-E는 순서와 상관없다.

**main 병합 준비.** 5단계 문서 PR 뒤에 **별도 작업 단위**로 한다. 이 Plan의 작업이 아니다. 그 세션은 감사 문서 11.3 "main 병합 직전에 할 일" 목록을 그대로 따른다: 2단계 Plan 15절 4항목, 프로젝트 재동기화, `README.md`·`PUBLISHING.md`·`.env.example` 최종본(README의 MCP 도구 설명 삭제 포함), 재발행 첫 요청 확인, 운영 콜드 TTFB 측정(D16), 독자 흐름 첫 수집 확인(D20). 병합 직후 정리는 2단계 Plan 15절 "병합 직후" 5항목이다.

### D20. 독자 흐름 (Claude 판단, 범위는 D3 사용자 답 "1·2·3단계 전부")

**목표.** 관리자 앱에서 (1) 날짜별로 몇 명이 읽었나, (2) 한 번의 방문에서 어디서 들어와 무엇을 읽고 어디서 떠났나, (3) 끝까지 읽었나·무엇을 눌렀나를 본다. 누가 읽었는지는 남기지 않는다.

**개인정보 원칙.**

1. 쿠키를 쓰지 않는다. 기기에 오래 남는 식별자를 만들지 않는다.
2. 방문은 탭 하나의 세션이다. `sessionStorage`의 무작위 방문 ID(탭을 닫으면 사라짐)로 같은 방문 안의 페이지만 잇는다. 그래서 "어제 읽은 사람이 오늘 다시 왔다"는 알 수 없다.
3. IP·브라우저 정보(User-Agent)를 저장하지 않는다. UA는 로봇을 거르는 데만 쓰고 버린다.
4. 들어온 곳은 바깥 사이트면 도메인만(`linkedin.com`), 블로그 안이면 경로만 저장한다.
5. 관리자 표시(D4)가 있는 브라우저, `navigator.webdriver`인 브라우저, JS가 없는 요청은 세지 않는다.
6. `/about` 아래에 한 줄을 둔다: "이 사이트는 쿠키·개인정보 없이 익명 방문 수를 센다." (법률 판단은 아니다. 유럽 ePrivacy는 기기 저장소 사용 일반에 동의를 요구한다. 이 설계는 탭 세션 저장만 쓰고 개인을 식별하지 않는다.)

**"몇 명"의 뜻.** 하루 독자 수 = 그날 그 글을 연 방문 수(탭 세션). 한 사람이 같은 날 따로 두 번 들어오면 2다. 화면에 "방문 수"라고 적는다.

**수집하는 것.**

| 이벤트 | 언제 | 남는 값 |
|---|---|---|
| `view` | 공개 페이지가 열릴 때 | 날짜(KST), 방문 ID, 방문 안 순서, 경로, 글 ID(글·노트·프로젝트 글이면), 들어온 곳(방문의 첫 페이지일 때) |
| `read` | 글 본문의 75%·100%까지 내려갔을 때 | 글 ID, 75·100 |
| `out` | 바깥 링크를 눌렀을 때 | 글 ID 또는 경로, 링크 도메인과 주소 |
| `pdf` | `/about`의 이력서 PDF를 눌렀을 때 | — |
| `copy` | 코드 블록 "복사"를 눌렀을 때 | 글 ID, 코드 블록 순서 |
| `search` | `/blog` 필터에 2글자 이상 쓰고 1.5초 멈췄을 때 | 정규화한 검색어, 결과 수 |
| `404` | 없는 주소 화면이 열렸을 때 | 요청 경로, 들어온 곳 |

**보내는 방법.** `view`는 페이지가 열리면 바로, 나머지는 페이지를 떠날 때(`pagehide`·`visibilitychange`) 모아서 `navigator.sendBeacon`으로 한 번 보낸다. 페이지당 함수 호출은 최대 2번이다. 스크립트는 모든 공개 페이지의 인라인 또는 지연 모듈 1개, 2 KB 안이다. 공개 페이지의 `astro-island` 0은 그대로다.

**서버.** `POST /api/track`(공개, 쿠키 없음).

1. 본문 4 KB 이하, 이벤트 종류 목록, 경로는 `/`로 시작, 글 ID는 발행 글 메모 목록에 있어야 한다. 방문당 이벤트 200개 상한.
2. 요청 호스트가 운영 주소(`www.cruzlab.dev`)일 때만 저장한다. 미리보기·localhost는 같은 Firestore를 쓰므로 저장하지 않는다(스모크는 시험 표지로 따로 쓰고 지운다).
3. 원본 줄 `readerEvents/{auto}`를 쓰고, 같은 요청에서 날짜 요약 `readerDaily/{YYYY-MM-DD}`의 수를 `increment`로 올린다. 요약에는 글별 조회·방문, 글별 들어온 곳, 글 → 다음 글 이동 수, 글별 75·100% 읽음, 바깥 링크·PDF·복사 수, 검색어(결과 0건 표시), 404 경로가 들어간다.
4. 원본 줄은 90일 뒤 지운다. 관리자가 독자 화면을 열 때 오래된 줄을 500개씩 지운다(Cron을 쓰지 않는다).
5. 관리자 화면은 날짜 요약 문서만 읽는다(30일이면 30번 읽기). 원본 줄은 글 하나의 "방문 경로 예" 10개를 보일 때만 읽는다.

**관리자 화면.**

| 화면 | 보이는 것 |
|---|---|
| 목록(D10) | 글마다 30일 방문 수 열, 그 열로 정렬 |
| `/admin/readers` | 날짜별 전체 방문(30·90일 막대), 많이 읽힌 글, 들어온 곳 상위, 이력서 PDF 수, 블로그 안 검색어(0건 먼저), 없는 주소 상위(옛 링크면 리다이렉트 규칙 후보) |
| `/admin/readers/<글 ID>` | 날짜별 방문 막대, 들어온 곳, 이 글 다음에 읽은 글·이 글 전에 읽은 글, 여기서 떠난 비율, 75·100% 읽음 비율, 바깥 링크·코드 복사 수 |

**비용.** 방문 1번 ≈ 이벤트 2~4개 = 쓰기 4~8번(원본 + 요약). 하루 300 방문이면 쓰기 약 2,400번이다. Firestore 무료 한도(하루 쓰기 20,000, 읽기 50,000)의 12% 안이다. 넘으면 쓰기 10만 회당 $0.09다(Blaze). Vercel Hobby 함수 호출 한도는 월 1,000,000회다(Fluid compute가 꺼진 옛 방식이면 100,000회). 하루 300 방문이면 월 약 18,000회다([Firestore 요금](https://cloud.google.com/firestore/pricing), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [함수 요금](https://vercel.com/docs/functions/usage-and-pricing)).

**데이터는 main 병합 뒤부터 쌓인다.** 운영(main)은 5단계 코드를 갖지 않고, `rebuild` 미리보기는 로그인 보호가 있어 방문자가 없다.

**비용(구현).** 2~2.5일.

## 4. 구조

### 4.1 파일

```
src/pages/admin/
  [...path].astro                  # 관리자 앱 진입 (D9). SSR, 미들웨어가 세션 검사
  login.astro                      # 관리자 틀(AdminPage), 사전 안내 · 거부 화면 (D4)
  (index.astro, edit/[id].astro, edit/index.astro, posts/index.astro, posts/new.astro 삭제)
src/admin/                         # 관리자 앱 (새 폴더)
  AdminApp.tsx                     # 틀 · 라우터 · 저장 안 한 변경 가드
  router.ts                        # History API 라우터 (주소 ↔ 화면)
  admin-hint.ts                    # 관리자 표시 저장 · 삭제 (D4)
  layout/AdminLayout.tsx, layout/AdminNav.tsx, layout/AlertBar.tsx
  home/HomeScreen.tsx              # 새 글 · 오늘 기록 · 이어 쓰기 · 목록 (D10)
  home/EntryTable.tsx, home/EntryFilters.tsx, home/list-filter.ts (순수 함수)
  assets/AssetsScreen.tsx, assets/AssetDetail.tsx (D12)
  taxonomy/TaxonomyScreen.tsx      # 카테고리 만들기 · 이름 · key · 지우기, 글 옮기기, 태그 바꾸기 · 합치기 (D1)
  series/SeriesScreen.tsx          # 연재 · 프로젝트 정보 · 새 프로젝트 (D2)
  readers/ReadersScreen.tsx, readers/EntryReaders.tsx, readers/BarChart.tsx (D20)
  log/LogScreen.tsx                # 출간 기록 (D11)
  settings/SettingsScreen.tsx, settings/KeyCapture.tsx (D14)
src/components/admin/AdminLogin.tsx  # 사전 안내 · 거부 화면 (D4)
src/editor/
  ui/EditorApp.tsx                 # 앱 안 화면으로 (flush 노출), 키맵 설정 적용
  ui/MetaPanel.tsx                 # 카테고리 목록 API · "+ 새 카테고리" · 태그 · 연재 key 제안 (D1 · D2)
  ui/ImageNodeView.tsx             # 폭 입력 · 정렬 · 끌어서 폭 (D13)
  ui/RevisionsDialog.tsx           # 이전 발행본 (D3)
  ui/FindBar.tsx                   # 찾기 · 바꾸기 (D7)
  commands/registry.ts             # 블록 위 · 아래 이동(D6), 찾기(D7), 이전 발행본(D3)
  markdown/to-doc.ts, from-doc.ts  # <img width> · <p align><img></p> (D13)
  state/save-controller.ts         # 자동 재시도 (D15)
src/lib/
  taxonomy.ts                      # 코드 기본값 유지. 데이터 목록을 받는 순수 함수(정규화 · 동의어 · 별칭)
  entry-schema.ts                  # categoryKeySchema 형식 검사로, settings · readerDaily 스키마 (더하기만)
  entry-rules.ts                   # CREATABLE_KINDS에 project (D2), 분류 바꾸기 규칙 (D1)
  tracker/events.ts                # 이벤트 종류 · 검사 (브라우저 · 서버 공용)
src/lib/server/
  admin-entries.ts                 # discardDraft의 fromDraftVersion(D15), publishLog 부수 결과 칸(D11), 리비전 읽기 · 가져오기(D3)
  admin-session.ts                 # 비관리자 인증 사용자 삭제 (D4)
  admin-assets.ts                  # listAssetsForAdmin (D12)
  taxonomy-store.ts                # getTaxonomy(메모 60초) · 카테고리 · 태그 바꾸기 (D1)
  admin-series.ts                  # listSeries, updateSeriesMeta, createProject (D2)
  admin-settings.ts                # 키맵 읽기 · 쓰기 (D14)
  publish-log.ts                   # 읽기, 알림 계산, 다시 시도 기록 (D11)
  reader-store.ts                  # 이벤트 저장 · 날짜 요약 · 90일 정리 · 화면용 읽기 (D20)
  og-image.ts                      # Server-Timing, (필요하면) resvg-wasm · 저장본 (D17)
  render-entry.ts                  # Server-Timing, 언어별 하이라이터 불러오기 (D16)
src/pages/api/
  track.ts                         # POST 공개 이벤트 수집 (D20)
  admin/assets/index.ts            # GET 목록 (D12)
  admin/publish-log.ts             # GET (D11)
  admin/posts/[id]/retry.ts        # POST {purge | backup} (D11)
  admin/posts/[id]/revisions/index.ts, [rev].ts, [rev]/restore.ts   # (D3)
  admin/taxonomy/index.ts, categories.ts, tags.ts                    # (D1)
  admin/series/index.ts, series/[key].ts, projects.ts                # (D2)
  admin/readers/index.ts, readers/[id].ts                            # (D20)
  admin/settings/editor.ts                                           # (D14)
src/pages/blog/category/[key].astro, blog/tag/[tag].astro   # getTaxonomy, 못 찾으면 별칭 301 (D1)
src/layouts/components/Footer.astro  # "관리" 링크 (D4)
src/layouts/BaseLayout.astro         # 추적 스크립트 · 관리자 표시 스크립트 (D4 · D20)
src/components/post/PostArticle.astro  # 관리자 전용 "고치기" (D4)
src/pages/about.astro                # 익명 통계 안내 한 줄 (D20)
scripts/smoke/stage5-admin.mjs     # 관리자 API 스모크 (시험 데이터 만들고 지움)
scripts/smoke/stage5-track.mjs     # 수집 API 스모크 (시험 표지, 끝에 지움)
tests/unit/admin-list-filter.test.ts, admin-router.test.ts, editor-image-attrs.test.ts,
           editor-keymap-settings.test.ts, taxonomy-store-rules.test.ts, publish-log-alerts.test.ts,
           tracker-events.test.ts, reader-daily.test.ts
(삭제) tools/cruz-lab-knowledge-mcp/**  (D8)
```

### 4.2 화면과 데이터 흐름

```
/admin/** ──미들웨어(세션 쿠키)──▶ [...path].astro ──▶ AdminApp (React, client:only)
   ├─ /admin              HomeScreen ── GET /api/admin/posts (69행 + readers30) + GET /api/admin/publish-log (알림)
   ├─ /admin/edit/<id>    lazy(EditorApp) ── 3단계 API + GET settings/editor + GET taxonomy
   ├─ /admin/assets       GET /api/admin/assets ── 지우기: POST assets/purge {ids, dryRun}
   ├─ /admin/taxonomy     GET taxonomy · POST categories · POST tags · 글 옮기기
   ├─ /admin/series       GET series · PUT series/<key> · POST projects
   ├─ /admin/readers[/id] GET readers (readerDaily 30·90개) · 경로 예(readerEvents 10줄)
   ├─ /admin/log          GET publish-log?before=
   └─ /admin/settings     GET/PUT settings/editor
AdminApp 열림 ─▶ localStorage cruz-admin-hint ─▶ 공개 페이지 "고치기" 보임 · 추적 안 함 (D4 · D20)
/admin/login ─▶ Google ─▶ POST /api/admin/session ─▶ 관리자? ─예─▶ 세션 쿠키
                                                   └아니오─▶ deleteUser(uid) ─▶ 403 ─▶ 거부 화면 (D4)
공개 페이지 ─▶ view(바로) · read/out/copy/search/404(떠날 때) ─sendBeacon─▶ POST /api/track
            ─▶ 운영 호스트만 ─▶ readerEvents(90일) + readerDaily(increment)
발행·숨김·삭제 ─▶ publishLog 한 줄 (purge·backup·assetUsage·title 칸) ─▶ 알림 띠 계산 (D11)
분류 바꾸기 ─▶ 대상 글 draft·published 일괄 ─▶ settings/taxonomy 별칭 ─▶ publishLog ─▶ 퍼지
```

### 4.3 데이터 (더하기만)

| 문서 | 칸 | 쓰는 곳 |
|---|---|---|
| `settings/editor` | `keymap`, `version`, `updatedAt` | D14 |
| `settings/taxonomy` | `categories[]`, `categoryAliases`, `tagAliases`, `version`, `updatedAt` | D1 |
| `publishLog/{id}` | `purge?`, `backup?`, `assetUsage?`, `title?`, `affected?: string[]`, `from?`·`to?`. 새 `action`: `retag`·`recategorize`·`category`·`series`·`restore`·`retry` | D11, D1, D2, D3 |
| `seriesMeta/{key}` | 스키마 그대로. 화면에서 쓴다 | D2 |
| `entries/{id}` | 스키마 그대로(카테고리 key는 형식 검사로 넓힌다). kind project를 API로 만든다. 분류 바꾸기가 `draft`·`published`의 `category`·`tags`를 바꾼다 | D1, D2 |
| `readerEvents/{auto}` | `day`, `visit`, `seq`, `type`, `path`, `entryId?`, `ref?`, `meta?`, `at` | D20 |
| `readerDaily/{YYYY-MM-DD}` | 글별·사이트 수(맵, `increment`) | D20 |

규칙은 바꾸지 않는다. 새 컬렉션은 규칙에 없어 클라이언트 접근이 막힌다. `publishLog`·`readerEvents`를 시각·날짜로 읽는 것은 단일 필드 인덱스(자동)다. `readerDaily` 문서는 하루 1개이고 글 62편 기준 수 KB다(1 MiB 한도와 거리가 멀다).

## 5. 2·3·4단계 대응표

| 5단계 기능 | 쓰는 것 | 확인한 것 · 바꾸는 것 |
|---|---|---|
| 목록 | `listEntriesForAdmin`(select, 69행) | 응답에 `isEmptyDraft`, `readers30`을 더한다. 서버가 계산한다(본문을 보내지 않는다) |
| 새 글·오늘 기록 | `createEntry(kind)` | 그대로. `CREATABLE_KINDS`에 project(D2) |
| 숨김 전환·삭제 | `setEntryVisibility`, `deleteEntry` | 그대로 |
| 초안 버리기 | `discardDraft` | `published.fromDraftVersion` 맞추기(D15) |
| 발행 | `publishEntry` + `purgePublicCache` + `notifyContentChanged` | `publishLog`에 부수 결과를 적는다(트랜잭션 뒤 `update`) |
| 초안 저장·발행 검사 | `normalizeDraftInput`, `checkPublishable`(카테고리 `z.enum`) | 카테고리 key가 `getTaxonomy()` 목록에 있는지 API가 검사한다. 태그 정규화는 데이터 동의어·별칭을 받는다 |
| 세션 | `createAdminSessionCookie`(403 `NOT_ADMIN`) | 403 전에 비관리자 인증 사용자를 지운다(D4) |
| 자산 정리 | `purgeAssets({ ids, dryRun })` | 그대로. 라이브러리가 부른다 |
| 키맵 | `applyKeymapOverrides`, `findKeyConflicts`, `usesModAlt`, `formatKey` | 그대로. 서버 검사도 같은 함수를 쓴다(공유 모듈) |
| 이미지 렌더 | `rehype-assets`(작성자 폭 유지, srcset) | 폭이 있으면 `sizes`를 그 폭으로 |
| 공개 캐시 | `purgePublicCache(id)`, `setPublicPageCache` | 분류·연재 바꾸기가 글마다 부른다. 목록 무효화 한 번 |
| 공개 분류 | `CATEGORIES`, `getCategoryLabel`, `categoryForSynonymTag` | `getTaxonomy()` 결과를 받는 함수로. 코드 값은 기본값 |
| 글 상세 렌더 | `renderEntry`(메모 id·revision), Shiki 세밀 번들 | `Server-Timing`. 측정 뒤 언어별 불러오기(D16) |
| 코드 복사·목록 필터 | `post-scripts.ts`, `SearchFilter.astro` | 추적 이벤트를 더한다(D20) |

## 6. 지우는 것

| 파일 | 이유 |
|---|---|
| `src/pages/admin/index.astro`(130줄) | 앱의 첫 화면이 대신한다(D9·D10) |
| `src/pages/admin/edit/[id].astro`, `edit/index.astro`, `posts/index.astro`, `posts/new.astro` | 앱 라우터가 대신한다(D9). POST 폼 대신 앱이 API를 부른다 |
| `tools/cruz-lab-knowledge-mcp/`(server.mjs 705줄, README, TEST_RESULT) | D8 |

| 의존성 | |
|---|---|
| 지운다 | `@modelcontextprotocol/sdk`(D8) |
| 더한다 | `prosemirror-search`(D7). D17 2번이 필요하면 `@resvg/resvg-wasm` |

지우기 전에 파일마다 import·링크가 없는지 grep한다(1단계 규칙).

## 7. 작업 순서

구현은 새 세션에서 한다(전역 7번 규칙). 각 작업은 검증까지 끝낸다.

| # | 작업 | 의존 | PR | 외부 변경 |
|---|---|---|---|---|
| T1 | 앱 틀: `[...path].astro`, `AdminApp`·라우터·레이아웃·메뉴, 에디터 지연 로드와 화면 떠나기 가드, 관리자 표시, 옛 관리자 페이지 5개 삭제, 라우터 테스트 | — | A | — |
| T2 | 첫 화면·목록(D10): 새 글·오늘 기록, 이어 쓰기, 표·모바일 행, 거르기·검색·정렬·주소 상태, 빈 초안 칩·모두 지우기, 행 메뉴, 키, `list-filter.ts` 테스트. 독자 열은 자리만(D20 뒤 채움) | T1 | A | — |
| T3 | 알림·출간 기록(D11): `publishLog` 칸, 알림 계산, `retry` API, 출간 기록 화면·API. `discardDraft` 수정(D15 2) | T1 | A | — |
| T4 | 입구(D4): 푸터 "관리", 로그인 화면(관리자 틀, 사전 안내, 거부 화면), 세션 API의 비관리자 인증 사용자 삭제, 관리자 전용 "고치기"(글·노트·프로젝트 글), 공개 점검 그대로 통과 | T1 | A | 데이터: 비관리자 인증 기록 삭제 |
| T5 | 이미지 라이브러리(D12): 목록 API, 화면, 상세, 지우기(시험 실행 → 확인) | T1 | B | — |
| T6 | 분류(D1): `settings/taxonomy`·`getTaxonomy()`, 공개 코드 3곳·사이트맵·OG 라벨, 스키마 검사, 카테고리 만들기·이름·key·지우기, 글 옮기기, 태그 바꾸기·합치기, 별칭 301, 에디터 카테고리 칸·"+ 새 카테고리"·태그 제안 | T1 | B | 데이터: `settings/taxonomy`. E3(백업 목록) |
| T7 | 연재·프로젝트(D2): API·화면, 새 프로젝트, `CREATABLE_KINDS`, 메타 패널 key 제안 | T1 | B | — |
| T8 | 리비전(D3): 목록·한 판·가져오기 API, 에디터 대화상자 | T1 | B | — |
| T9 | 이미지 세부 조절(D13): 노드 속성, 변환기 두 모양, 메뉴·끌기, `sizes`, fixture, 왕복 69/69 | — | C | — |
| T10 | 키맵 설정(D14): `settings/editor` API·검사, 설정 화면·키 잡기, 에디터 적용 | T1 | C | 데이터: `settings/editor` |
| T11 | 에디터 보완: 자동 재시도(D15 1), 블록 이동(D6), 찾기·바꾸기(D7) | — | C | — |
| T12 | 독자 흐름(D20): 이벤트 검사, 공개 스크립트, `POST /api/track`(운영 호스트만), `readerEvents`·`readerDaily`, 90일 정리, 관리자 화면 2개, 목록 독자 열, `/about` 안내 한 줄, 스모크 | T2·T6 | D | 데이터: 새 컬렉션 2개(main 병합 뒤 쌓임) |
| T13 | 측정·처방: 글 상세 `Server-Timing`·프로파일·언어별 하이라이터(D16), OG `Server-Timing` → 규칙대로(D17), Fluid compute 확인 | — | E | E2(Fluid compute, 꺼져 있으면 사용자). D17 3번이면 Storage `og/` |
| T14 | MCP 도구 삭제(D8): 폴더, `package.json` 명령·의존성, Codex 설정 3줄(저장소 밖, 그 줄만 보이고 지움) | — | E | E1 |
| T15 | 검증: 스모크 2개, 브라우저 시나리오(8.4), 실제 기기(D18), `rebuild` 미리보기(8.6) | 모두 | 각 PR | 시험 데이터 |
| T16 | 작업 문서 `2026-11-XX-stage5-admin-app.md`, 진행 기록(감사 문서 11절 표·새 절), 이 Plan 15절, 감사 문서 11.3에 5단계 몫 | 모두 | 문서 | — |

- PR-A 병합 전에 태그 `rebuild-pre-stage5`를 단다(사용자 확인 뒤).
- 시험 데이터는 이름에 `stage5-test`를 붙이고 끝에 모두 지운다. 사용자 초안 7편과 공개 글은 건드리지 않는다.
- 분류 바꾸기(T6)는 운영 글의 발행본을 고친다. 운영 태그·카테고리로 시험하지 않는다. 시험 글 2편과 시험 카테고리·태그로 확인하고 되돌린다. `settings/taxonomy` 첫 저장은 기존 10개를 그대로 옮긴 값이어야 한다(공개 점검 그대로 통과).
- 독자 흐름(T12)은 운영 호스트에서만 저장하므로 미리보기에서는 쌓이지 않는다. 스모크는 처리기를 시험 표지로 불러 확인하고 지운다.

## 8. 검증 방법

### 8.1 자동 검사

| 항목 | 기준 |
|---|---|
| `pnpm lint`, `pnpm build` | 통과 |
| `pnpm test` | 580 + 새 테스트. 대상: 라우터, 목록 거르기·검색·정렬·빈 초안, 알림 계산, 분류 규칙(카테고리 key 형식·지우기 조건·별칭·동의어·태그 3개 한도), 이미지 노드 폭·정렬 fixture, 키맵 설정 검사, 자동 재시도, 추적 이벤트 검사(종류·크기·경로·상한), 날짜 요약 계산(방문·이동·들어온 곳) |
| `tsc --noEmit` | 0(빌드 또는 `astro sync` 뒤) |
| 번들 | `/admin` 첫 화면이 `EditorApp` 청크를 받지 않는다. 앱 청크 크기를 기록한다. 공개 페이지는 `astro-island` 0 그대로, 관리자 표시·추적 스크립트 합 2 KB 안 |
| 왕복 검사 | `pnpm smoke:roundtrip` 69/69 |
| API 스모크 | `pnpm smoke:api` 105/105(2단계 그대로) + `stage5-admin.mjs`(자산 목록, 출간 기록, 설정 왕복과 422, 시험 카테고리 만들기·key 바꾸기·지우기, 시험 태그 바꾸기·되돌리기, 시험 프로젝트 만들기·지우기, 리비전 가져오기, `retry`, Admin SDK로 만든 시험 사용자의 세션 요청 → 403 → 인증 사용자 삭제) + `stage5-track.mjs`(이벤트 검사 거부·허용, 요약 증가, 운영 호스트 아니면 저장 안 함). 끝에 시험 데이터 0 |
| 공개 점검 | `stage4-public.mjs`(PR-D 확장분 포함) + 2단계 공개 점검 그대로 통과. 푸터 "관리" 링크, 관리자 전용 요소는 기본 `hidden`. 공개 응답 `Set-Cookie` 없음 |

### 8.2 기준선 (2026-11-10, `c7701c1`)

`pnpm lint` 통과, `pnpm test` 580(39 파일), `pnpm build` 통과, `tsc --noEmit` 0(빌드 뒤). 문서만 바꾸므로 Plan 커밋 뒤에도 같다.

### 8.3 운영 데이터 기대값

시작: `entries` 69, `assets` 141, Storage `assets/` 37, `seriesMeta` 7, `publishLog` 2, `entryTombstones` 0, `settings`·`readerEvents`·`readerDaily` 없음. 끝: 같은 수 + `settings/editor`·`settings/taxonomy`(저장했으면) + 시험 줄 0. 사용자가 5단계 중에 쓴 글과 바꾼 분류는 그대로 둔다.

### 8.4 브라우저 확인 (localhost, 사용자 로그인)

| # | 시나리오 | 확인 |
|---|---|---|
| 1 | `/admin` 1280px | 왼쪽 메뉴, 이어 쓰기 3편, 표. 네트워크에 `EditorApp` 청크 없음 |
| 2 | 검색 "pintos", 종류 "프로젝트", 정렬 "발행일" | 즉시 줄고 주소가 바뀐다. 에디터로 갔다 돌아오면 같은 거르기 |
| 3 | 이어 쓰기 한 편 누름 | 에디터가 열리고 본문에 커서. "← 목록"은 다시 받지 않고 돌아온다 |
| 4 | 시험 글에서 입력 직후 목록으로 | 저장을 비우고 떠난다 |
| 5 | 390px 첫 화면 | 위 막대, 두 줄 행, `⋯` 메뉴의 숨기기 → 공개 주소 404 → 다시 보이기(시험 글) |
| 6 | 빈 초안 칩 | 시험 빈 초안만 지운다. 사용자 빈 초안은 칩에 보이고 지우지 않는다 |
| 7 | 알림 띠 | 정상이면 없다. 시험 줄(`purge: failed`)을 넣으면 띠 → "다시 비우기" → 사라짐 → 시험 줄 지움 |
| 8 | 이미지 라이브러리 | 141칸(60 + 더 보기), "쓰지 않는 것" 26(legacy), legacy 지우기 버튼 없음. 시험 이미지 1장으로 시험 실행 → 지우기 |
| 9 | 분류: 시험 카테고리 | 만들기 → 에디터 칸에 보임 → 시험 글 발행 → `/blog/category/<key>` → key 바꾸기 → 옛 주소 301 → 시험 글 옮기기 → 지우기 |
| 10 | 분류: 시험 태그 | 대상 글 목록 확인 → 바꾸기 → 공개 태그 바뀜 → 옛 태그 주소 301 → 되돌리기 |
| 11 | 새 프로젝트(시험) | 만들고 첫 Part 발행 → `/projects`에 보임 → 지움 |
| 12 | 이전 발행본(시험 글 2판) | 1판 미리보기 → 초안으로 가져오기 → 초안 버리기로 원래대로 |
| 13 | 이미지 폭 480 · 가운데 | 편집 모드에서 바로 보이고, 소스 모드에 `<p align="center"><img … width="480"></p>`, 공개 페이지 같은 모양 |
| 14 | 키 바꾸기 | 굵게를 `Mod+Shift+B`로 → 동작 → `Mod+Alt+B` 거부 → 기본값으로 |
| 15 | 찾기·바꾸기 | `Mod+F`, 모두 바꾸기, `Mod+Z` 한 번에 원래대로 |
| 16 | 블록 이동 | `Mod+Shift+↑/↓`, 모바일 바 버튼 |
| 17 | 푸터 "관리"·"고치기" | 시크릿 창: "관리" 보임, "고치기" 없음, "관리" → 사전 안내 화면. 관리자 로그인 뒤 일반 창: 글 상세에 "고치기" → 에디터. 로그아웃 뒤 "고치기" 없음 |
| 18 | 독자 화면 | 시험 표지 데이터로 막대·들어온 곳·다음 글·읽음 비율이 그려진다. 시험 데이터 지움 |

### 8.5 실제 기기 (D18)

Chrome 클립보드(Claude in Chrome), Safari 클립보드·iPhone 에디터 바·iPhone 목록·비관리자 로그인 거부(사용자). 결과를 작업 문서에 적는다.

### 8.6 `rebuild` 미리보기

1. 시험 글 발행 → 출간 기록에 부수 결과 칸(퍼지 ok, 백업 dispatched).
2. OG `Server-Timing` 콜드 3회(D17 1번) → 처방 뒤 다시 3회. 목표 3초 안.
3. 글 상세 `Server-Timing` 콜드 3회(D16). 렌더 준비 몫이 줄었는지 기록한다.
4. 독자 흐름: 미리보기에서는 저장하지 않는지(운영 호스트 검사) 확인한다.
5. D18 사용자 확인.
6. 시험 데이터 삭제 → 8.3의 끝 값.

### 8.7 운영 무영향

운영(main)은 5단계 코드를 갖지 않는다. 데이터는 더하기만 한다(`settings` 문서, `publishLog` 칸, 독자 컬렉션). 옛 `posts`·`series`는 그대로다. 규칙·인덱스를 바꾸지 않는다. 사용자가 5단계 앱으로 운영 글의 태그·카테고리·연재 정보를 바꾸면 `entries`가 바뀐다. 운영 main은 `entries`를 읽지 않으므로 운영 화면은 바뀌지 않는다. 비관리자 인증 기록 삭제는 `rebuild` 배포의 로그인에만 적용된다.

## 9. 롤백 방법

### 9.1 코드

- PR-A 병합 전에 태그 `rebuild-pre-stage5`를 단다.
- 되돌릴 때는 `rebuild`에서 병합 커밋을 `git revert -m 1`로 되돌린다.
- 앱을 되돌리면 3단계 최소 목록(`index.astro`)이 돌아온다. 에디터 주소 `/admin/edit/<id>`는 같다.
- 분류 데이터화(T6)를 되돌리면 공개 페이지는 코드 상수로 돌아간다. 그 사이 화면에서 만든 카테고리 key를 쓰는 글은 카테고리를 다시 정해야 한다(되돌리기 전에 `settings/taxonomy`와 코드 목록을 비교해 보고한다).
- MCP 도구는 git 기록(`c7701c1`)에 남는다.

### 9.2 데이터

| 상황 | 방법 |
|---|---|
| `settings/editor`가 에디터를 깨뜨린다 | 에디터는 틀린 값이면 기본 키로 연다(D14). 문서를 지우면 기본값이다 |
| `settings/taxonomy`가 틀렸다 | 문서를 지우면 코드 기본값(10개)이다. E3 뒤에는 백업 저장소 `raw/settings/taxonomy.json`이 이전 판을 갖는다 |
| 태그·카테고리 바꾸기를 되돌린다 | 같은 화면에서 다시 바꾼다. `publishLog`의 `retag`·`recategorize` 줄이 대상 글 ID와 옛 값을 갖는다. 별칭 표에서 그 줄을 지운다 |
| 연재·프로젝트 정보 | 백업 저장소 `raw/seriesMeta/<key>.json`(바꾸기 전 판)으로 되돌린다 |
| 리비전 가져오기 | 초안만 바꾼다. 초안 버리기로 발행본 내용으로 돌아간다 |
| 독자 데이터 | 컬렉션 2개를 지우면 된다. 다른 데이터와 이어지지 않는다 |
| 시험 데이터 | 끝에 지운다. 남은 데이터 0 확인 |

### 9.3 외부 설정

Fluid compute를 켰다면(E2) 대시보드에서 끌 수 있다. Codex 설정의 도구 줄(E1)은 지우기 전에 보인 3줄을 다시 넣으면 된다(도구 폴더도 git에서 되살려야 동작한다).

## 10. 외부 변경 목록

| # | 변경 | 시점 | 하는 사람 | 되돌리기 |
|---|---|---|---|---|
| E1 | `~/.codex/config.toml`의 `[mcp_servers.cruz-lab-knowledge]` 3줄 삭제(저장소 밖, 사용자 승인 2026-11-10 "도구 싹 지워") | T14 | Claude(그 줄만 보이고 지움) | 9.3 |
| E2 | (꺼져 있을 때만) Vercel 프로젝트 Fluid compute 켜기 | T13 | 사용자(대시보드) | 9.3 |
| E3 | 백업 저장소 `crucial-sub/cruz-lab-content`의 `scripts/export.mjs` 컬렉션 목록에 `{ name: 'settings', subcollections: [] }` 한 줄 더하기. 독자 컬렉션은 더하지 않는다 | T6 | Claude(그 저장소에 PR, 사용자 확인 뒤) | 그 줄을 지운다 |
| 데이터 | `settings/editor`·`settings/taxonomy` 새 문서, `publishLog` 새 칸, `readerEvents`·`readerDaily` 새 컬렉션(운영 호스트에서만, main 병합 뒤), 비관리자 Firebase 인증 기록 삭제 | T3·T4·T6·T10·T12 | 앱(사용자 동작·방문) | 9.2 |
| 시험 데이터 | 8.4·8.6의 시험 글·카테고리·태그·프로젝트·이미지·`publishLog` 줄·시험 인증 사용자·독자 시험 줄 | T15 | Claude | 끝에 모두 지운다 |

규칙·인덱스·함수 리전·버킷 CORS·Auth 승인 도메인·환경 변수는 바꾸지 않는다. 새 비밀값이 없다. 백업 저장소의 읽기 전용 서비스 계정은 `settings` 컬렉션도 읽을 수 있다(`datastore.viewer`).

이전 단계에서 남은 것(5단계 작업이 아님, 사용자 확인 뒤): 원격의 병합 끝난 브랜치 삭제(3단계 6개, 4단계 `stage4/plan`·`a-renderer`·`b-pages`·`c-projects-og`·`docs`·`d-blog-list`·`d-preview`), Secret Manager `GITHUB_TOKEN` 삭제(2단계 E6).

## 11. 위험과 대응

| 위험 | 대응 |
|---|---|
| 앱 안 화면 전환에서 저장 안 한 입력을 잃는다 | 떠나기 전에 `flush`. 실패하면 머물지 묻는다. `beforeunload`도 그대로. 시나리오 4 |
| 분류 데이터화가 공개 페이지를 깨뜨린다(문서 읽기 실패, 틀린 값) | 읽기 실패·검사 실패면 코드 기본값. 첫 저장 값은 기존 10개와 같아야 한다(스모크 비교). 공개 점검 그대로 통과 |
| 카테고리 key 바꾸기·태그 바꾸기가 발행본을 잘못 고친다 | 실행 전 대상 글 목록·수 확인. 트랜잭션(최대 500 쓰기, 지금 최대 24편). 기록으로 되돌린다. 시험은 시험 데이터로만 |
| 키맵 설정이 에디터를 못 쓰게 만든다 | 서버·화면 양쪽 검사. 틀린 값이면 기본 키. "기본값으로" 버튼 |
| 비관리자 인증 사용자 삭제가 관리자를 지운다 | 관리자 UID와 같으면 절대 부르지 않는다(단위 테스트). `ADMIN_UID` 없으면 지우지 않는다. 스모크는 Admin SDK로 만든 시험 사용자만 쓴다 |
| 푸터 "관리"로 로그인 시도가 늘어난다 | 권한은 서버가 막는다. 인증 기록은 바로 지운다. Google 로그인이라 비밀번호 대입 공격이 없다 |
| 공개 수집 API가 쓰레기 데이터를 받는다 | 크기·종류·경로·발행 글 ID 검사, 방문당 상한, 로봇 UA 거름, 운영 호스트만 저장. 요약은 관리자만 본다 |
| 독자 데이터가 비용을 만든다 | 무료 한도의 12% 안(하루 300 방문 기준). 넘어도 쓰기 10만 회당 $0.09. 관리자 화면은 요약 문서만 읽는다 |
| 개인정보 | 쿠키·오래 남는 식별자·IP·UA를 저장하지 않는다. 바깥 도메인만. `/about` 안내 한 줄 |
| legacy 썸네일이 무겁다(29.4 MB) | 지연 로드, 60칸씩. 새 자산이 먼저다(올린 때 내림차순) |
| 원시 `<img>` 표기가 기존 글을 바꾼다 | 폭·정렬이 있을 때만 쓴다. 기존 글은 0편이라 왕복 69/69. fixture로 고정 |
| `prosemirror-search`의 ProseMirror 판이 Tiptap과 다르다 | `pnpm why prosemirror-view`로 한 벌인지 본다. 두 벌이면 `@tiptap/pm`이 내보내는 판에 맞춘다(overrides) |
| OG 처방 3번이 Storage 파일을 남긴다 | 파일 이름에 리비전. 다시 발행·삭제 때 옛 파일을 지운다. 정리 API가 `og/`를 보지 않으므로 따로 지운다 |
| 운영 콜드 TTFB가 처방 뒤에도 1.5초를 넘는다 | D16 4번의 조건으로 main 병합 뒤 다시 본다. 병합을 막는 조건은 아니다 |
| 에디터 청크를 늦게 받아 첫 진입이 느려진다 | 목록에서 이어 쓰기 칸에 마우스를 올리면 미리 `import()` 한다 |
| PR 5개가 공개 코드를 겹쳐 고친다 | PR-B(분류)를 PR-D(추적)보다 먼저 병합한다(D19). PR마다 공개 점검 |

## 12. 사용자가 답할 결정 (요약. 모두 답함 2026-11-10, 답은 13절)

1. **D1 분류 관리.** (a) 태그 바꾸기·합치기와 글의 카테고리 바꾸기만 브라우저에서, 카테고리 목록은 코드. (b) a + 카테고리 목록도 브라우저에서(데이터베이스로 옮김) **(처음 권장 a, 사용자 질문 뒤 b로 바꿈)**. (c) 관리 화면 없음.
2. **D2 연재·프로젝트 정보 화면.** (a) 화면 1개(제목·설명·프로젝트 칸, 새 프로젝트) **(권장)**. (b) 프로젝트만. (c) 화면 없음.
3. **D3 5.2의 선택 기능.** 리비전 보기·되돌리기 **(권장: 넣음)**, 비공개 미리보기 링크·예약 발행·조회수(권장: 뺌). 조회수는 사용자 요청으로 독자 흐름 1·2·3단계로 넓혔다.
4. **D4 공개 사이트 입구.** 처음 안: (a) 헤더 연필(본인만) **(권장)**, (b) 푸터 "관리"(본인만), (c) 떠 있는 버튼. 사용자 제안으로 "푸터 '관리'를 모두에게 + 로그인·거부 화면 다듬기"가 되었다.
5. **D5 링크 카드.** (a) 미룬다 **(권장)**. (b) 넣는다.
6. **D6 블록 순서 바꾸기.** (a) 블록 이동 명령만 **(권장)**. (b) 명령 + 드래그 핸들. (c) 드래그 핸들만. (d) 미룬다.
7. **D7 찾기·바꾸기.** (a) 넣는다 **(권장)**. (b) 미룬다.
8. **D8 MCP 도구.** (a) 백업 저장소 사본을 읽는다 **(처음 권장)**. (b) 데이터베이스 직접. (c) `projects` 범위 삭제. (d) 그대로. 사용자 질문 뒤 객관 평가를 하고 "도구를 지운다"를 권했다.

Claude 판단으로 정한 것(승인 때 함께 확인): D9 단일 앱·자체 라우터·에디터 지연 로드, D10 레이아웃·첫 화면·목록, D11 알림 띠·출간 기록·`publishLog` 칸, D12 이미지 라이브러리, D13 이미지 세부 조절 표기와 메뉴, D14 키맵 설정, D15 에디터 보완, D16 콜드 TTFB 기준을 운영으로 옮기고 렌더 준비부터 줄임, D17 OG 첫 요청 처방 순서, D18 실제 기기 확인, D19 PR 5개 + 문서 PR과 main 병합 준비의 자리, D20 독자 흐름 설계(탭 세션, 개인정보 원칙, 수집 항목, 저장·화면). D1 b·D2·D4·D8의 세부 설계도 Claude 판단이다.

## 13. 사용자 결정

| 결정 | 답 | 날짜 |
|---|---|---|
| D1 | b. 카테고리 목록까지 브라우저에서 만들고 바꾼다. 태그 이름 바꾸기·합치기, 글의 카테고리 한꺼번에 바꾸기도 넣는다. 사용자: "장기적으로 보면 카테고리든 태그든 브라우저 안에서 손쉽게 수정 가능하도록 하는 게 더 좋은 거 아니야?" | 2026-11-10 |
| D2 | a. 연재·프로젝트 화면 1개(연재 제목·설명, 프로젝트 정보, 새 프로젝트, 메타 패널 key 제안) | 2026-11-10 |
| D3 | 리비전 보기·되돌리기: 넣는다. 비공개 미리보기 링크: 뺀다. 예약 발행: 뺀다. 조회수: 공개 목록에는 넣지 않고 관리자에서 본다. 사용자가 "어떤 날 몇 명이 읽었는지, 그 독자가 또 어떤 글을 읽었는지"를 원해 독자 흐름 1·2·3단계 전부를 넣는다(D20) | 2026-11-10 |
| D4 | 푸터 "관리" 링크를 모두에게 보이고, 로그인 화면 사전 안내·정중한 거부 화면·비관리자 인증 기록 즉시 삭제를 넣는다. 헤더는 그대로. "고치기" 같은 관리자 전용 동작은 관리자 앱을 한 번 연 브라우저에서만 보인다. 거부 화면의 "이 관리자 앱을 만든 과정 보기" 링크는 그 글을 쓴 뒤 넣는다 | 2026-11-10 |
| D5 | a. 미룬다 | 2026-11-10 |
| D6 | a. 블록 이동 명령만 | 2026-11-10 |
| D7 | a. 넣는다 | 2026-11-10 |
| D8 | 도구를 모두 지운다("도구 싹 지워"). cruz-lab 프로젝트 글은 재건이 끝난 뒤 작성 전략을 함께 세워 새로 쓴다 | 2026-11-10 |

**결정 중에 바로잡거나 더한 것(2026-11-10).**

1. D1: 질문의 낱말이 두 뜻이었다("글을 다른 카테고리로 옮기기"와 "카테고리 목록을 코드에서 데이터베이스로 옮기기"). 그림으로 다시 설명했다. 사용자의 장기 방향을 듣고 권장을 a에서 b로 바꿨다.
2. D3: 조회수 비용을 확인했다. Firestore 무료 한도 하루 쓰기 20,000·읽기 50,000, 넘으면 쓰기 10만 회당 $0.09. Vercel Hobby 함수 호출 월 1,000,000회(Fluid compute가 꺼진 옛 방식이면 100,000회). Vercel Web Analytics는 Hobby 월 50,000 이벤트. Umami Cloud 무료 요금제는 월 10만 이벤트·6개월 보관이다(방문 경로 보고서가 무료 요금제에서 되는지는 확인하지 못했다). 관리자 앱에서 보려는 목적이라 직접 만든다.
3. D3: "다른 날까지 같은 독자로 잇기"는 기기에 오래 남는 익명 ID가 필요하고 유럽 ePrivacy는 그런 저장에 동의를 요구한다. 그래서 한 번의 방문 안에서만 잇는다(D20).
4. D4: 관리자 표시가 어떻게 브라우저를 구별하는지(브라우저 저장 공간의 메모, 시크릿 창에서는 안 보임, 다른 브라우저는 그 브라우저에서 한 번 로그인해야 보임) 설명했다. 보안은 숨기든 안 숨기든 같다는 점을 사용자가 짚었다. 실측: 390px 헤더 377px, 연필을 더하면 409px.
5. D8: 객관 평가(3.D8)와 MCP 위상 출처: [MCP is dead, long live MCP](https://chrlschn.dev/blog/2026/03/mcp-is-dead-long-live-mcp/), [Is MCP dead in 2026?](https://tyk.io/learning-center/is-mcp-dead-in-2026-why-enterprises-still-need-mcp/), [MCP vs Skills](https://www.heyuan110.com/posts/ai/2026-07-04-cli-skills-vs-mcp/), [MCP founder's vision for 2026](https://obot.ai/blog/mcp-is-just-getting-started-founders-vision-2026/). 대부분 블로그 글이라 수치는 참고만 했다.
6. 측정: 미리보기 콜드를 세 번 쟀다(1.3). 4단계 D7의 기준을 운영으로 옮겼다(D16).

## 14. 뒤로 미룬 것 (상기 목록)

4단계 Plan 14절을 이어받는다. 5단계는 재건의 마지막 단계다. 여기 남는 항목은 "재건 뒤, 사용자가 원할 때"다. Claude는 main 병합 준비 세션에서 이 목록을 한 번 보여 준다.

| 항목 | 미룬 이유 | 다시 물을 시점 | 넣을 때 비용(어림) |
|---|---|---|---|
| **cruz-lab 프로젝트 글 다시 쓰기와 작성 전략** | 지금 3편(옛 CMS 2편, MCP 1편)이 낡았다. 사용자 요청: 프로젝트 글과 블로그 글의 차이, PDF 포트폴리오와의 차별점과 쓰는 법, 몇 편, 편별 주제, 글 구성을 함께 세운다 | **재건(main 병합)이 끝난 뒤 바로** | — |
| 로그인 거부 화면의 "이 관리자 앱을 만든 과정 보기" 링크 | 그 글이 아직 없다(D4) | 위 글을 쓴 뒤 | 30분 |
| 링크 카드 | D5 답 | 재건 뒤 | 1~2일 |
| 드래그 핸들 | D6 답(블록 이동 명령만) | 블록 이동 명령을 써 본 뒤 | 반나절~1일 |
| 비공개 미리보기 링크 | D3 답 | 발행 전 초안을 남에게 보여 줄 일이 생길 때 | 반나절~1일 |
| 예약 발행 | D3 답 | 사용자가 원할 때 | 1일 |
| 다른 날까지 같은 독자로 잇기 | D20 개인정보 원칙. 동의 배너가 필요하다 | 사용자가 원할 때 | 1일 + 동의 화면 |
| Google Search Console 등록 | 검색 엔진 검색어는 사이트가 알 수 없다. 만들 것이 아니라 등록(무료) | 사용자가 원할 때 | 30분(사용자) |
| 백업 Action 실패 알림 | GitHub API 읽기 권한 토큰이 필요하다 | 백업 실패가 실제로 문제가 될 때 | 반나절 |
| 슬래시 메뉴 순서·기본 보기 모드 설정 | 요구 없음 | 사용자가 원할 때 | 반나절 |
| 전역 검색 팔레트 | 4단계 D2 | 글이 100편을 넘거나 사용자가 원할 때 | 1일 |
| 댓글(giscus) | 요구 없음 | 사용자가 원할 때 | 반나절 |
| 404 최신 글 3개 | prerender 유지 | 필요하면 | 반나절 |
| editorJson v2 | 3단계 8절 7 | 깊이 한도 문제가 생길 때 | 1일 |
| 본문 HTML·목차 미리 계산 | D16 4번 조건 | main 병합 뒤 운영 콜드 측정 결과로 | 1일 |

## 15. 구현과 다른 것 (구현 중 추가)

구현 세션이 Plan과 다르게 하거나 Plan이 정하지 않은 것을 판단하면 작업 문서 5절에 적고 여기에 요약한다.

**PR-A(T1~T4, 2026-11-11, [PR #22](https://github.com/crucial-sub/cruz-lab/pull/22)).** 원본은 [작업 문서](./2026-11-11-stage5-admin-app.md) 5절 1~27이다. 요약:

1. 메뉴·라우터는 만든 화면만 안다(글, 출간 기록). 나머지는 각 PR이 더한다. 행 메뉴 "독자 보기"는 PR-D.
2. 에디터에서 돌아오면 목록을 다시 받지 않고, 에디터가 떠날 때 알린 값으로 그 줄만 고친다. "← 목록"은 마지막 거르기로 돌아간다. 열면 본문에 커서(초안 끝, 발행 글 처음).
3. 빈 초안 "모두 지우기"는 종류·검색을 따르고, 직전에 목록을 다시 받아 아직 빈 초안만 지운다.
4. 목록 API에 `publicPath`(발행본 slug 기준)를 더했다. 알림 계산 순수 함수는 `src/lib/publish-log.ts`로 나눴다. 출간 기록 쪽 커서는 줄 ID다.
5. 로컬의 "다시 비우기"는 `skipped`라 띠를 지우지 않는다(실제 퍼지 성공은 미리보기에서 확인).
6. 거부 응답 `details.authRecordDeleted`, 지웠을 때만 "방금 로그인 기록은 지웠습니다". 푸터 "관리"·"고치기"에 `nofollow`.
7. 빌드 결과의 `/admin`은 에디터 CSS(gzip 11 KB)를 `<link>`로 싣는다(Astro의 동적 import CSS 모음). 에디터 JS는 받지 않는다.
8. 에디터 불러오기 실패 화면, 401이면 로그인 화면, `Shift+N`은 키 자리(`KeyN`)로도 듣는다.
9. `stage2-api.mjs`의 초안 버리기 뒤 기대값을 D15 2에 맞췄다(105 → 106건).

**PR-A 리뷰 뒤(2026-11-11).** 원본은 작업 문서 5절 28~33과 6절이다. 요약:

10. 비관리자 인증 기록은 `ADMIN_UID`가 실제 인증 사용자일 때만 지운다(D4 4 보강. 설정 오류로 관리자 기록을 지우지 않게).
11. 빈 초안 판정은 "초안 상태 + 제목이 빈" 글만 본문을 읽는다. 공백만 있는 제목은 빈 초안이 아니다.
12. 빈 초안 "모두 지우기"는 이 기기 오프라인 보관함에 있는 글을 남긴다. 목록에서 지우면 보관 초안도 지운다. 에디터가 404를 받으면 목록 줄을 뺀다. 알림 띠의 보관 초안은 목록에 있는 글만 센다.
13. 첫 화면의 숨김·다시 보임·삭제 뒤 알림 띠를 다시 받는다. 캐시 비우기 실패면 문구가 다르다.
14. 라우터의 글 ID는 한글(가-힣)도 받는다(slug 규칙과 같은 글자, T7 대비).
15. 고치지 않은 한계: 다른 배포의 "다시 비우기"가 운영 실패 알림을 지울 수 있다. 세션 요청이 서버에 닿지 않으면 비관리자 인증 기록이 남는다(드문 경우다. 사전 안내 문구는 사용자가 그대로 두기로 했다, 2026-11-11).

**PR-B(T5~T8, 2026-11-11, 브랜치 `stage5/b-manage`).** 원본은 작업 문서 5절 34~57이다. 요약:

16. 카테고리 목록은 `settings/taxonomy`다. 공개 읽기는 메모 60초·실패면 코드 기본값, 관리자 쓰기 검사·관리자 목록·OG는 메모 없이 읽는다(다른 인스턴스의 새 카테고리를 거절하지 않게, 낡은 OG가 하루 남지 않게).
17. 저장 문서의 태그 검사는 형식만 본다(동의어는 저장 API가 데이터로 본다). 분류 일괄 바꾸기는 초안 version을 올리고, 변경이 없던 글은 `fromDraftVersion`도 맞춘다. 리비전·`updatedAt`은 그대로다.
18. 합치기는 따로 있는 동작(`merge`)이다. key 바꾸기는 있는 key를 거절한다. 별칭은 잇고(두 번 건너지 않게) 되살아난 값의 줄은 지운다. 태그의 새 이름은 코드 규칙으로만 정규화한다(되돌리기).
19. 분류·연재 기록 줄의 `entryId`는 `taxonomy`·`series`이고 `op`·`from`·`to`·`affected`(글 옮기기는 `previous`)를 둔다. 여러 글 퍼지는 글 태그 50개씩 + 목록 한 번이다.
20. 연재 정보 버전은 문서 `updateTime`이다(칸을 더하지 않는다). 글 0편인 연재·프로젝트 정보 "지우기"를 더했다(8.4 11). 연재를 프로젝트로 바꾸는 길은 없다.
21. 리비전 가져오기는 옛 판의 분류를 지금 분류에 맞춘다. 지금 발행본과 같은 판은 가져오지 않는다.
22. `publicPathFor`를 `public-paths.ts`로 옮겼다(관리자 첫 청크에 zod가 들어오지 않게, 159 → 86 KB). 목록 API에 `categoryLabel`을 더했다.
23. 커버·OG 팔레트는 카테고리 key로 고른다. OG 글꼴 서브셋은 코드 기본값 그대로다. `settings/taxonomy`는 기본 10개 값으로 남겼다. E3(백업 저장소 `settings`)은 사용자 확인 뒤다.

**PR-B 리뷰 뒤(2026-11-11).** 원본은 작업 문서 5절 58~68과 6.5~6.8이다(치명 0, 중요 3, 경미 17, 모두 고침). 요약:

24. 자산 정리 재검사는 이전 발행본(`revisions`)도 본다. 1판에만 쓰는 이미지는 지우지 않는다(2단계 정리 규칙도 같이 바뀐다).
25. 동의어 태그 → 카테고리 301은 태그 페이지가 데이터로 한다. 미들웨어는 태그 주소 정규화만 한다.
26. 초안 저장은 옛 카테고리 key를 별칭으로 바꾸고, 버전 검사 뒤에 목록 밖 카테고리를 거절한다. 분류를 읽지 못하면 검사 없이 저장한다.
27. 묶음 줄(분류·연재)의 퍼지 실패는 다시 시도 줄만 지운다. 다시 비우기는 실패한 묶음 줄들의 `purged`를 모두 비운다. 연재 기록 줄은 트랜잭션 안에서 쓴다.
28. 프로젝트 링크는 http·https만 받는다.

**PR-C(T9~T11, 2026-11-11, 브랜치 `stage5/c-editor`).** 원본은 작업 문서 5절 69~90이다. 요약:

29. 명령의 id·이름·묶음·범위·기본 키는 명령 표(`command-keys.ts`, 순수 데이터)에 있다. 키 검사는 `keymap-settings.ts`(순수, zod 없음)이고 서버·설정 화면·에디터가 함께 쓴다.
30. 막는 키를 넓혔다: Shift를 함께 누른 브라우저 키, 맥 ⌃Tab, 편집 기본 키(Mod+C·V·X·A, Mod+Shift+V), Win 키, 수식 키 없는 키(F1~F12 예외). 플랫폼 키 하나만 지울 수 있게 `KeyBinding` 값이 null일 수 있다. 저장 API는 기본값과 같은 줄을 뺀다.
31. 키 판정기는 키를 누를 때 명령 목록을 읽는다(`handleKeyDown` 플러그인). 열 때 받은 설정이 에디터를 다시 만들지 않고 적용된다. 설정 화면에서 바꾼 키는 다음에 여는 에디터부터다. 옛 명령 id는 무시한다.
32. 찾기는 명령 하나(Mod+F, 페이지 범위, 편집 모드만)이고 막대가 찾기·바꾸기 두 줄이다. 입력하는 대로 결과를 고르고 스크롤한다. 바꾸기는 `closeHistory`로 앞의 입력과 묶지 않는다.
33. 블록 이동: 목록 항목은 항목 단위, 표는 표 전체, 못 옮기면 감싼 블록. 끝에서도 키를 받는다. 툴바에는 없고 팔레트·모바일 바(9개)에 있다.
34. 자동 재시도: 네트워크 오류는 매번 먼저 기기에 보관한다. 기다리는 동안 "(1/3)"과 "다시 시도". 409·413·422 밖의 4xx도 다시 보내지 않는다. 온라인 복귀면 바로 보낸다.
35. 이미지 폭·정렬은 "이미지만 있는 단락"(표 칸·체크 항목에서 처음 쓰이는 블록·영상 제외)에만 쓴다. 에디터 표시도 같은 판정(데코레이션)이라 보이는 대로 저장된다. 폭 없는 `<img>`·`<p align="left">`도 이미지로 읽는다. 그런 단락이 있는 여러 블록 목록 항목은 느슨한 목록으로 쓴다. `sizes`는 폭이 720보다 작을 때 `(max-width: Wpx) 100vw, Wpx`다.

**PR-C 리뷰 뒤(2026-11-11).** 원본은 작업 문서 5절 91~100과 6.9~6.12다(치명 0, 중요 6, 경미 20, S1 = B1. 경미 1건만 이유를 적고 두었다). 요약:

36. 붙여넣은 HTML의 `width`는 이미지 폭이 되지 않는다(에디터 표지 `data-width`만 읽는다). 공개 글을 복사해 붙이면 최대 변형 폭이 원시 HTML로 저장되던 결함이다.
37. 기본 키와 같은 값은 키 검사에서 뺀다(선택 풀기 Escape를 바꿀 수 없던 결함). 막는 키에 커서 이동·지우기 키, F5·F11·F12, Mod+R, 맥 ⌃ 편집 키·Space 조합을 더했다.
38. 블록 이동·바꾸기는 앞·뒤 입력 모두와 묶지 않는다. 찾기는 인라인 원자를 걸치는 결과를 빼고, 막대의 단추에서 Mod+Z가 에디터를 되돌린다.
39. 설정 화면: 깨진 문서도 저장할 수 있고, 409에서 화면 값을 남기며, 저장하지 않은 변경은 떠나기 전에 묻는다(앱 컨텍스트 `registerLeaveGuard`).
40. 폭만 정한 새 자산 이미지에 비율로 height를 붙인다. 세미콜론 없는 이름 참조로 읽힐 `&`가 있는 원시 이미지 HTML은 읽지 않는다.

## 부록 A. 계획 문서 5절 요구와 5단계 처리

| 출처 | 요구 | 5단계 처리 |
|---|---|---|
| 5.1 A3 | 비공개 글이 관리자 목록에 없음 | 2단계에서 해결. 숨김 탭 |
| 5.1 A8 | 대시보드 수가 기기마다 다름 | 3단계에서 해결(서버 집계) |
| 5.1 A10 | 관리자 SSR이 인증 없이 데이터를 넣음 | 2단계에서 해결(미들웨어). 앱은 API로 읽는다 |
| 5.2 상태 모델 | 초안·발행·비공개·예약 | 초안·발행·숨김은 2단계. 예약은 뺐다(D3) |
| 5.2 리비전 | 이전 판 보기·되돌리기 | D3(넣음) |
| 5.2 미리보기 링크 | 서명 토큰 주소 | D3(뺌) |
| 5.2 글 안 연재 지정 | 메타 패널 | 3단계에서 해결. key 제안을 더한다(D2) |
| 5.2 태그 관리 | 이름 바꾸기·합치기·글 수 | D1 |
| 5.2 이미지 라이브러리 | 목록·쓰는 글·미사용 삭제 | D12 |
| 5.2 프로젝트 글 편집 | 에디터로 고치기 | 4단계에서 해결(고치기). 새로 만들기는 D2 |
| 5.2 출간 기록 | 서버 로그 | `publishLog`(2단계) + 화면(D11) |
| 5.2 통계 | 조회수 | 독자 흐름(D3·D20) |
| 5.2 모바일 관리 | 목록·이어 쓰기·발행 전환 | D10 |
| 5.3 진입 | 헤더 "쓰기", `Shift+N` | 푸터 "관리"(D4). `Shift+N`은 관리자 앱 안에서만(D10). 공개 페이지에 전역 키를 두지 않는다(입력 칸과 겹침) |
| 5.3 오늘 기록 | 노트 즉시 생성 | D10 |
| 5.3 발행 체크 패널·문제 있을 때만 배너 | | 패널은 3단계. 띠는 D11 |
| 5.3 백업 | 보이지 않게 | 2단계에서 해결 |
| 5.4 M1 | 자체 틀, 960~1200px | D10 |
| 5.4 M2·M3 | 문제 있을 때만, 출간 직전에만 호출 | API는 2단계, 카드는 3단계가 지웠다. 띠는 D11 |
| 5.4 M4 | 상태별 서버 집계 | 3단계 |
| 5.4 M5 | 프로필 사진 | 3단계가 지웠다 |
| 5.4 M6 | 표·상태 거르기·검색·숨김 포함 | D10 |
| 5.4 M11 | 모바일 | D10 |

## 부록 B. 이전 단계에서 넘어온 항목

| 출처 | 항목 | 5단계 처리 |
|---|---|---|
| 3단계 작업 문서 8절 4 | 에디터 청크 1.7 MB | D9(지연 로드), D15 3 |
| 3단계 작업 문서 8절 5 | 저장 실패 자동 재시도 | D15 1 |
| 3단계 작업 문서 8절 7 | editorJson 깊이 | D15 4(바꾸지 않음) |
| 3단계 작업 문서 8절 10 | 초안 버리기 뒤 변경 표시 | D15 2 |
| 3단계 작업 문서 8절 13 | iOS 모바일 바 | D18 |
| 3단계 Plan 14절 | 드래그 핸들, 찾기·바꾸기, 키맵 | D6(블록 이동 명령), D7, D14 |
| 4단계 Plan 14절 | 이미지 세부 조절(확정), 링크 카드, 키맵(확정), MCP 도구, 본문 미리 계산 | D13, D5(미룸), D14, D8(삭제), D16 |
| 4단계 작업 문서 5절 62 | project를 새로 만드는 API 없음 | D2 |
| 4단계 작업 문서 8절 3 | 클립보드 실제 브라우저 | D18 |
| 4단계 작업 문서 8절 4 | 글 상세 콜드 TTFB 1.44초 | 1.3 측정, D16 |
| 4단계 작업 문서 8절 5 | MCP 도구 | D8(삭제) |
| 4단계 작업 문서 8절 6 | OG 첫 요청 11초대 | 1.3 측정, D17 |
| 4단계 D5 | README·PUBLISHING·`.env.example` | D19(main 병합 준비 작업 단위) |
| 2단계 Plan 15절 | 병합 직전 4·직후 5 | D19(main 병합 준비 작업 단위) |
