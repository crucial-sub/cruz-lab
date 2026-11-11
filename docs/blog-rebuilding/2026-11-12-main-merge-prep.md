# 재건 main 병합 준비 작업 문서

- 날짜: 2026-11-11 ~ 2026-11-12
- 근거: [감사 문서 11.3](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md#113-브랜치와-되돌리기-전략-2026-11-06-결정) "main 병합 직전에 할 일" 1~12, [2단계 Plan 15절](./2026-11-07-stage2-data-model-and-server-plan.md#15-main-병합-직전직후-절차-2단계-이후-참고), [5단계 작업 문서 7·8절](./2026-11-11-stage5-admin-app.md#7-다음-작업), [5단계 Plan 14절](./2026-11-10-stage5-admin-app-plan.md#14-뒤로-미룬-것-상기-목록)
- 순서표(visual plan): [visual-plans/2026-11-11-cruz-lab-main-merge-plan.html](./visual-plans/2026-11-11-cruz-lab-main-merge-plan.html) (소스 `.src.html`). 사용자가 2026-11-12에 기본값으로 승인했다.
- 진행 기록: 감사 문서 11절 표, 11.12
- 브랜치: `stage6/merge-prep`(`origin/rebuild` `aa874f5`에서 생성, PR #27 병합 뒤). 대상은 `rebuild`다. 커밋 `fec2b0f`, [PR #28](https://github.com/crucial-sub/cruz-lab/pull/28).

## 1. 현재 상황

| 항목 | 상태 |
|---|---|
| 순서표와 결정 | 사용자가 기본값으로 승인(2026-11-12, 2절) |
| 사전 점검 | 끝(3절). 마이그레이션 · 재동기화 모두 바꿀 것 0 |
| 설명 문서 3개 | 끝(4.1). 커밋 전 |
| 검증 | 스모크 · 왕복 · lint · `tsc` · 빌드는 5단계 끝 값과 같다(5절). `pnpm test`는 기기 부하로 흔들린다(5.2) |
| 미리보기 확인(PR-B~D 몫) | 끝(5.4). 시험 데이터 0 |
| E3 | 끝(4.2). 사용자 병합 뒤 백업 수동 실행 성공, `raw/settings/taxonomy.json` 생김 |
| 실기기 확인 | 1차(5.7): 이미지 메뉴 2건 안 됨 → 6.2 · 6.3 수정(PR #28). 재확인 1차(5.10): 선택 표시가 회색으로 남고 단추를 두 번 눌러야 됨 → 6.5 수정(커밋 전). 관리자 목록 390px 됨. iPhone 재확인 남음 |
| 코드 수정 | Shiki 한도(6.1), 이미지 속성 덮어쓰기(6.2), 노드 선택 중 루트 caret 색(6.3). 테스트 4개 더함 |
| 커밋 · PR | 사용자 승인(2026-11-12) 뒤 커밋 `fec2b0f`, [PR #28](https://github.com/crucial-sub/cruz-lab/pull/28)(대상 `rebuild`). 사용자가 병합했다(`0f1fddf`). 병합 뒤 미리보기에서 6.2 · 6.3 수정을 확인했다(5.8) |
| 사용자 몫 | 고친 뒤 iPhone 다시 확인(7절 6). PR #28 · E3 병합과 Vercel Production 변수는 끝 |
| 병합 직전 재실행 · 병합 · 병합 뒤 측정 | 남음(7절) |
| 찾은 문제 | 6절 4건(6.4는 재현되지 않음) |

## 2. 순서표와 사용자 결정

11.3의 1~12를 병합 전 · 병합 · 병합 뒤로 나눴다. 사용자는 2026-11-12에 결정 5건을 모두 기본값으로 정했다.

| 결정 | 답 |
|---|---|
| D1 운영 Firestore에 시험 데이터를 만드는 스모크·미리보기 확인 | 한다. 이름에 `stage5-test`를 붙이고 끝에 지운다 |
| D2 백업 저장소 `settings` PR(E3) | 지금(병합 전) |
| D3 병합 직전 마이그레이션 시험 실행이 0건일 때 | `--apply`로 B1 덤프만 남긴다 |
| D4 `rebuild` → main 병합 방식 | merge commit |
| D5 병합 뒤 운영 측정 | 이 세션에서 병합 직후에 |

| 시점 | 항목 | 11.3 | 누가 |
|---|---|---|---|
| 병합 전 | 설명 문서 3개(README · PUBLISHING · `.env.example`), MCP 설명 삭제 | 3, 5 | Claude |
| 병합 전 | lint · test · build · `tsc`, 스모크 | — | Claude |
| 병합 전 | `rebuild` 미리보기 PR-B~D 몫 | 10 | Claude |
| 병합 전 | 실기기 확인(로그아웃 뒤 "고치기", D18) | 10 | 사용자 |
| 병합 전 | Vercel Production 환경 변수 `ADMIN_UID`, `BACKUP_DISPATCH_TOKEN` | 1(15절 3) | 사용자 |
| 병합 전 | E3 백업 저장소 PR | 10 | Claude(병합은 사용자) |
| 병합 전 | Auth 승인 도메인 `www.cruzlab.dev` | 1(15절 4) | 바꾸지 않음(3.3) |
| 병합 바로 전 | 2단계 마이그레이션 시험 실행 → `--apply`(B1 덤프), 프로젝트 글 재동기화 시험 실행 | 1(15절 1·2), 2, 6 | Claude(사용자 확인 뒤) |
| 병합 | `stage6/merge-prep` → `rebuild`, `rebuild` → main | — | 사용자 |
| 병합 뒤 | 운영 로그인, 재발행 `x-vercel-cache`, 콜드 3회, 독자 흐름 첫 수집, 스크립트 크기 | 4, 7, 8 | Claude · 사용자 |
| 병합 뒤 | 옛 데이터 · 규칙 · 브랜치 정리, 프로젝트 글 전략 | 9, 12 | 별도 작업 단위 |

## 3. 사전 점검 (읽기만, 2026-11-11 23시대 KST)

### 3.1 2단계 마이그레이션 시험 실행

`node --env-file=.env scripts/migrate/stage2-entries.mjs`(쓰지 않음). 옛 `posts` 56개, 옛 `series` 2개, 기존 `entries` 69개.

| 판정 | 수 |
|---|---|
| create | 0 |
| update | 0 |
| skip | 55 |
| conflict | 0 |
| skip-deleted-in-rebuild | 0 |
| delete-candidate | 0 |
| exclude | 1 (2단계 D3 중복 글 `hah2lSGUxneSHRSDhm1r`) |

- 자산: Storage 167개(legacy 대상 130, `assets/` 37), assets 문서 쓰기 0. 쓰지 않는 legacy 파일 26개(병합 뒤 정리 몫).
- 오류 0, 경고 0. 옛 운영 CMS로 새로 쓰거나 고친 글이 없다. 그래서 `--propagate-deletes`도 지울 것이 없다.

### 3.2 프로젝트 글 재동기화 시험 실행

원본은 `origin/main`(`8f03a17`)의 임시 worktree다. 주 checkout은 `rebuild` 브랜치라 원본이 없다. `node --env-file=.env scripts/migrate/stage4-projects.mjs --source-root <임시 worktree>`.

- 프로젝트 4개, 글 8편, 본문 이미지 10개. 판정: skip 8, create 0, update 0, conflict 0.
- 경고 1(4단계부터 같음): `project-cruz-lab-cruz-lab-knowledge-mcp` 본문의 `/blog/why-everyone-talks-about-mcp`가 발행 글이 아니다. 이 글은 프로젝트 글 다시 쓰기(11.3의 9) 때 다룬다.
- main에는 4단계 이전 뒤 새 커밋이 없다(`origin/rebuild..origin/main` 0개). 그래서 `--apply`가 필요 없다.

### 3.3 Auth 승인 도메인

Identity Toolkit 설정을 서비스 계정으로 읽었다(GET만). 목록: `localhost`, `cruz-lab.firebaseapp.com`, `cruz-lab.web.app`, `cruz-lab.vercel.app`, `cruzlab.dev`, `rebuild` 미리보기 주소. `www.cruzlab.dev`는 없다.

Firebase Auth SDK는 승인 도메인을 하위 도메인까지 허용한다. `@firebase/auth` 1.11.1 `dist/esm/index-1970027f.js` 10189~10191행의 주석은 "domain.com = *.domain.com OR domain.com"이다. 그래서 `cruzlab.dev`가 `www.cruzlab.dev`를 덮는다. 바꾸지 않는다. 병합 뒤 운영 로그인으로 최종 확인한다. 안 되면 사용자가 `www.cruzlab.dev`를 더한다(더하기라 되돌리기 쉽다).

운영 `https://cruzlab.dev/`는 `https://www.cruzlab.dev/`로 307을 보낸다(같은 경로 유지). 지금 운영 함수는 `iad1`이다. `rebuild`의 `vercel.json`은 `icn1`이다.

### 3.4 Vercel 환경 변수

`vercel` CLI가 없어 읽지 못했다. 2단계 작업 문서 3절 E4에 따르면 `ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`은 Preview에만 있다. Production에 없으면 병합 뒤 운영 관리자 API가 503(`ADMIN_NOT_CONFIGURED`)이다. 사용자가 대시보드에서 두 변수에 Production을 더한다.

### 3.5 코드가 읽는 환경 변수

`src` 아래 `import.meta.env`·`process.env` 이름: `PUBLIC_FIREBASE_*` 6개, `FIREBASE_ADMIN_*` 3개, `ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`, `PUBLIC_ADMIN_EMAIL`, `VERCEL`(Vercel이 넣는다).

`PUBLIC_ADMIN_EMAIL`은 `src/lib/firebase-auth-client.ts`의 `getClientIdToken`·`getClientAdminIdToken`만 읽는다. 이 두 함수를 부르는 곳이 없다. 그래서 `.env.example`에서 뺐다. 함수 삭제는 병합 뒤 정리(Vercel `PUBLIC_ADMIN_EMAIL` 삭제, 2단계 Plan 15절 병합 직후 4)와 함께 한다.

## 4. 한 일

### 4.1 설명 문서 (11.3의 3·5)

| 파일 | 내용 |
|---|---|
| `README.md` | 재건 끝 상태로 다시 썼다. 한눈에 보기(관리자 앱 · 에디터 · 독자 흐름 행), 핵심 구현(관리자 앱 · 입구와 인증 · 저장과 출간 · 독자 흐름 · 분류와 연재), 구조(Admin app), "Astro와 React 역할 분리"(공개 페이지 React 0), "독자 흐름은 개인정보 없이" 절, 기술 스택(Framer Motion · MDX · Content Collections 빼고 Shiki · satori · resvg · zod · Vitest · `icn1`), 디렉터리(`src/admin`, `api/track.ts`, `lib/tracker`, `notes`·`og`), 환경 변수, 범위(`ADMIN_UID`, 보상 흐름 없음). MCP 설명 8곳을 지웠다: `grep -n -i mcp README.md` 0줄. prettier로 표를 맞췄다 |
| `PUBLISHING.md` | "재건 브랜치"와 "지금 상태(2단계 끝)"를 지웠다. 로그인, 글 쓰기, 발행, 숨기기·삭제·이전 발행본, 관리 화면 표(7개 메뉴), 백업, 점검(명령 5개와 쓰기 여부 표) |
| `.env.example` | 코드가 읽는 변수만 둔다. 뺀 것: `PUBLIC_SITE_URL`, `GITHUB_TOKEN`(코드가 읽지 않음), `PUBLIC_ADMIN_EMAIL`(3.5). 더한 것: `FIREBASE_ADMIN_*` 3개, `ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`. 버킷 예시를 `.firebasestorage.app`으로, 설정 순서에 승인 도메인을 더했다 |

### 4.2 E3 백업 저장소 PR (11.3의 10)

[crucial-sub/cruz-lab-content#1](https://github.com/crucial-sub/cruz-lab-content/pull/1). `scripts/export.mjs`의 `COLLECTIONS`에 `{ name: 'settings', subcollections: [] }`와 주석 두 줄(settings 내용, 독자 흐름은 내보내지 않음). `node --check` 통과. 사용자가 병합했다(2026-11-12, `a1990cf`). 그 뒤 백업 Action을 수동으로 한 번 돌렸다(`workflow_dispatch`, 실행 43068767183, 성공). `raw/settings/taxonomy.json`이 생겼다(카테고리 10개, version 219).

### 4.3 코드 수정 (6절의 원인, 사용자 승인 2026-11-12)

| 파일 | 내용 |
|---|---|
| `src/lib/content/shiki-languages.ts` | `SHIKI_TOKENIZE_TIME_LIMIT_MS = 5000`. `codeHighlighterFromCore`가 `codeToHast`에 `tokenizeTimeLimit`로 넘긴다. 서버(Oniguruma)와 에디터 미리보기(JS 엔진)가 함께 쓴다(6.1) |
| `src/editor/ui/image-layout.ts` | `setImageAttrsKeepingSelection(tr, pos, attributes)`: 트랜잭션의 지금 문서에서 노드 속성을 읽어 더하고 노드 선택을 둔다. 그 자리에 노드가 없으면 false(6.2) |
| `src/editor/ui/ImageNodeView.tsx` | `updateKeepingSelection`이 위 함수를 쓴다. 그린 때의 `node.attrs`를 쓰지 않는다. `NodeSelection` 가져오기를 지웠다(6.2) |
| `src/editor/editor.css` | `.tiptap-body.ProseMirror-hideselection { caret-color: transparent; }`(6.3) |
| `tests/unit/code-highlighter.test.ts` | "Shiki 줄당 토큰화 시간 한도" 1건 |
| `tests/unit/editor-image-attrs.test.ts` | "지금 문서의 속성에 더하고 노드 선택을 지킨다" 2건, "노드 선택 중 편집 루트의 캐럿 색" 1건 |

세 수정 모두 실패하는 테스트를 먼저 쓰고(빨강 확인) 고쳤다. prettier는 두 파일에서 관계없는 줄도 바꿔서, 바꾼 줄만 남겼다(원래 파일도 prettier 기준과 달랐다).

### 4.4 코드 수정 2차 (iPhone 재확인 뒤, 6.5)

| 파일 | 내용 |
|---|---|
| `src/editor/ui/touch-select.ts`(새) | `selectNodeWithoutFocus(view, pos, env)`: 에디터 포커스를 풀고(포커스가 에디터 안일 때만) DOM 선택을 비운 뒤 노드 선택을 둔다. 고를 수 없는 자리면 false. `commitFocusedInputIn(menu, active, markMenu)`: 메뉴 안 입력 칸에 포커스가 있으면 "메뉴 안" 표시를 켜고 blur한다 |
| `src/editor/ui/ImageNodeView.tsx` | 이미지·영상 요소에 네이티브 리스너: 터치(`pointerType` touch·pen)로 누른 `mousedown`은 기본 동작과 전파를 막고 `selectNodeWithoutFocus`를 부른다. 마우스는 지금처럼 ProseMirror가 받는다. 메뉴 요소에 네이티브 `mousedown` 리스너: 입력 칸이 아니면 기본 동작과 전파를 막는다(포커스가 편집 루트로 가지 않는다). 크기·정렬 단추는 먼저 `commitPendingInput`(입력 중인 칸 반영)을 부른다 |
| `src/editor/editor.css` | `.editor-chip:hover`를 `@media (hover: hover)` 안으로 옮겼다(iPhone에서 누른 단추에 hover 테두리가 남았다) |
| `tests/unit/editor-touch-select.test.ts`(새) | 5건: 포커스 풀기 → DOM 선택 비우기 → 노드 선택 순서, 포커스가 밖이면 blur 없음, 노드가 아닌 자리, 입력 칸 반영과 그 밖의 경우 |

## 5. 검증

### 5.1 자동 검사 (2026-11-12 00시대 KST, 문서 변경 뒤)

| 검사 | 결과 | 5단계 끝(4.17) |
|---|---|---|
| `pnpm lint` | 통과 | 통과 |
| `tsc --noEmit`(빌드 뒤) | 0 | 0 |
| `pnpm build` | 통과 | 통과 |
| `pnpm test` | 아래 5.2 | 918 통과 |
| 관리자 앱 첫 청크 `AdminApp.*.js` | 116,712바이트 | 116,712바이트 |

### 5.2 테스트와 기기 부하

이 시간에 다른 Claude 세션(다른 프로젝트)이 ffmpeg로 영상을 처리했다. load average가 8~48이었다. 이 세션이 끌 대상이 아니다.

| 실행 | 결과 |
|---|---|
| `pnpm test` 1회 | 917/918. 실패 1: 하이라이터 |
| `pnpm test` 2회 | 916/918. 실패 2: 하이라이터 두 파일(6.1) |
| 두 하이라이터 파일만 | 1회 31/32(실패 1), 2회 32/32 |
| `pnpm test` 3회(load 8~11) | 실패 6: 5초 시간 초과 4개(스키마 비교, 찾은 수, 이미지 업로드, 하이라이터 색칠), 하이라이터 엔진 비교 2개 |
| `vitest run --maxWorkers=2 --testTimeout=60000`(load 30~48) | 916/918. 실패 2: 엔진 비교(자체 한도 30초 초과), OG `timing에 단계 5개`(자체 한도 초과) |
| 위 두 파일만, `--testTimeout=60000` | 엔진 비교는 30초 초과 1, OG 파일은 16/16 통과 |

판단: 실패는 모두 기기 부하 때문이다. 하나는 테스트 시간 초과이고, 다른 하나는 6.1의 Shiki 시간 한도다. 이 브랜치는 코드를 바꾸지 않았다(`git diff --stat`: `README.md`, `PUBLISHING.md`, `.env.example`, `docs/`만). 그래서 테스트 대상 코드는 5단계 끝(918 통과, 부하 없는 때)과 같다. 부하가 없을 때 한 번 더 돌린다(7절).

### 5.3 스모크 (빌드 결과 4403 · 개발 서버 4404)

| 스모크 | 빌드 결과 | 개발 서버 | 5단계 끝 |
|---|---|---|---|
| `stage4-public.mjs`(+ 2단계 공개 점검) | 1,380/0 + 324/0. `/blog` 93,308바이트, 공개 스크립트 2,038바이트 | 1,231/1 + 324/0. 실패 1은 `/blog` 크기(개발용 속성, 5단계부터 같다) | 1,380/0 + 324/0 |
| `stage5-admin.mjs` | 252/252 | 252/252 | 252/252 |
| `stage5-track.mjs` | 178/178 | 178/178 | 178/178 |
| `smoke:api`(`stage2-api.mjs`) | 106/106 | 106/106 | 106/106 |
| `smoke:roundtrip` | 69/69(Firestore 읽기) | — | 69/69 |

`stage5-admin.mjs`의 "정리 단계가 지운 남은 데이터: settings/taxonomy 시험 값"은 key 바꾸기 시험이 남긴 별칭을 정리 단계가 지운 것이다. 그 뒤 검사가 분류 문서에 시험 값이 없음을 확인한다(252건에 포함).

### 5.4 `rebuild` 미리보기 확인 (11.3의 10, 2026-11-12 00:47~00:56 KST)

배포는 `aa874f5`(PR #27 병합). 앱 브라우저의 기존 관리자 로그인을 썼다.

| 몫 | 확인 | 결과 |
|---|---|---|
| PR-B | 분류 화면에서 시험 카테고리 `stage5-test 분류`(`stage5-test-cat`) 만들기 → 지우기 | 만들기 알림, 목록 11개. 지우기는 확인 창 → 시험 실행 창("바뀌는 글이 없습니다") → 지움. 목록 10개 |
| PR-B | 동의어 태그 주소 | `/blog/tag/javascript` → `/blog/category/javascript`, `운영체제` → `os`, `reactnative` → `react-native`, `에세이` → `retrospective`. 일반 태그 `pintos`는 넘기지 않는다. 브라우저는 넘김 상태 코드를 보이지 않는다. 301 코드는 로컬 2단계 공개 점검이 확인했다 |
| PR-B | 이미지 라이브러리 | 전체 141, 쓰는 것 115, 쓰지 않는 것 26, legacy 130, 영상 3. 60칸 + 더 보기 81 |
| PR-C | 이미지 폭·정렬 시험 글(`stage5-test 이미지 폭 정렬`, API로 만들고 발행) | 발행 응답 purge ok, backup dispatched. 공개 HTML: 가운데 480 → `<p align="center">`, `height="306"`, `sizes="(max-width: 480px) 100vw, 480px"`. 폭 320 → `height="204"`, `sizes="(max-width: 320px) 100vw, 320px"`. 1280px 화면: 가운데 이미지 양쪽 여백 104px, 폭만 준 이미지는 왼쪽. 에디터도 두 이미지를 그 폭으로 그린다. 자산은 프로젝트 글이 쓰는 `G2LBtrJwobLTtgOmBbjy`(2040×1300) |
| PR-C | 키 설정 저장 → 에디터 적용 | 설정 화면에서 "제목 바꾸기(2 → 3 → 단락)"에 `⌃⇧5`를 잡아 저장(`settings/editor` version 1). 에디터에서 첫 단락에 `⌃⇧5` → `H2` |
| PR-D | 미리보기 방문이 저장되지 않음 | 관리자 표시를 지우고 공개 페이지 3개(`/blog`, 글 하나, `/notes`)를 열었다. `/api/track` 204 세 번. `readerEvents` 0, `readerDaily` 0 그대로 |
| PR-D | 관리자 독자 화면 빈 상태 | `/admin/readers`: 수 칸 모두 0, 막대 0, "이 기간에 기록이 없습니다". 관리자 표시는 다시 생겼다 |

시험 글을 지웠다(purge ok, backup dispatched, 고아 자산 0). 지운 글 주소는 404다. 백업 Action이 발행·삭제 알림 두 번 모두 성공했다. 백업 저장소 기록에 시험 글의 발행·삭제 커밋이 남는다(5단계 PR-A 확인과 같다).

정리: 출간 기록 시험 줄 4개(카테고리 만들기·지우기, 시험 글 발행·삭제)와 `settings/editor`(처음에 없었다)를 Admin SDK로 지웠다. 자산 `G2LBtrJwobLTtgOmBbjy`의 `usedBy`는 프로젝트 글 하나로 돌아왔다.

### 5.5 운영 데이터 끝 수

`entries` 69(초안 7, 시험 표지 0), `publishLog` 2, `assets` 141, `seriesMeta` 7, `settings`는 `taxonomy`만, `readerEvents` 0, `readerDaily` 0, `entryTombstones` 0, Storage `assets/` 파일 37. 5단계 끝 수와 같다. `settings/taxonomy`는 카테고리 10개, 별칭 0개(`categoryAliases`·`tagAliases` 빈 객체)다. version은 219다. 스모크와 미리보기 확인이 저장할 때마다 올렸다. 내용은 기본값과 같다.

### 5.6 코드 수정 뒤 검증 (2026-11-12 02시대 KST)

| 검사 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `pnpm build` | 통과 |
| `tsc --noEmit` | 0 |
| `pnpm test`(load 18) | 919/922(새 테스트 4개 포함). 실패 3: 스키마 비교(5초 초과), `insertImageFiles`(501ms), 하이라이터 색칠(14초). 세 파일을 따로 돌리면 8/8, 16/16, 14/14 통과. 엔진 비교 테스트는 이번에 통과했다 |
| 공개 점검(빌드 결과) | 1,380/0 + 324/0. `/blog` 93,308바이트, 공개 스크립트 2,038바이트(그대로) |

### 5.7 사용자 실기기 확인 (11.3의 10, 2026-11-12 01시대 KST)

| 항목 | 결과 |
|---|---|
| Vercel Production 환경 변수(`ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`) | 사용자가 Production을 체크했다(3.4 끝) |
| 로그아웃 뒤 글 상세 "고치기" | 처음에는 남았다. 다시 해 보니 사라졌다(6.4) |
| 코드 복사(Chrome · Safari) | 됨 |
| iPhone Safari 에디터 모바일 바 | 됨 |
| iPhone 목록 390px | 사용자는 블로그 목록을 봤다(됨). 이 항목은 관리자 글 목록(`/admin`)이다. 다시 확인 때 함께 본다(7절) |
| 관리자가 아닌 Google 계정 → 거부 화면 | 됨 |
| 이미지 메뉴(iPhone Safari) | 안 됨 2건: 이미지를 누르면 연두색 선택 표시가 메뉴까지 덮음(6.3), 폭 입력 뒤 "가운데"가 안 됨(6.2) |

사용자 확인 중에 제목 없는 초안 5편(기기 `macbook` 3, `iphone` 2, 01:08~01:25 KST)과 자산 3개(Storage 파일 9개)가 생겼다. 사용자가 만든 것이라 이 작업은 건드리지 않는다. 운영 데이터 수는 `entries` 74(초안 12), `assets` 144, Storage `assets/` 46이다. 지우려면 사용자가 `/admin`의 빈 초안 칩과 이미지 라이브러리에서 지운다.

### 5.8 PR #28 병합 뒤 `rebuild` 미리보기 재확인 (2026-11-12 02:30 KST 무렵, 배포 `0f1fddf`)

앱 브라우저의 관리자 로그인으로 시험 초안(`stage5-test 이미지 메뉴 재확인`, 이미지 하나)을 만들고 에디터에서 열었다.

| 확인 | 결과 |
|---|---|
| 글을 쓸 때 편집 루트 `caret-color` | `rgb(16, 185, 129)`(브랜드 초록 그대로) |
| 이미지를 눌러 노드 선택 | 루트에 `ProseMirror-hideselection`, 루트 `caret-color` `rgba(0, 0, 0, 0)`(투명). 6.3의 수정이 배포됐다 |
| 6.2 재현 순서(폭 200 입력 → `pointerdown → pointerup → mousedown → blur → mouseup → click` "가운데"를 한 작업 안에) | blur 뒤 폭 200 · 정렬 없음, **click 뒤 폭 200 · 가운데**. 노드 선택과 메뉴가 남는다. 단락 `data-align="center"`, 래퍼 폭 200px. 수정 전에는 click 뒤 폭이 없어졌다 |

시험 초안을 지우고 출간 기록 시험 줄 1개를 Admin SDK로 지웠다. iOS의 실제 선택 표시는 사용자 iPhone으로 본다(7절 6).

### 5.9 코드 수정 2차 뒤 검증 (2026-11-12 03시 무렵 KST, load 2.3)

lint 통과, `pnpm test` **927/927**(55 파일, 새 테스트 5개 포함), 빌드 통과, `tsc --noEmit` 0. 기기 부하가 낮을 때는 5.2 · 5.6의 실패가 하나도 나지 않았다. 그 실패들이 부하 때문이었다는 것을 확인했다.

iOS 동작은 앱 브라우저(Chromium)로 확인할 수 없다. `rebuild` 미리보기 배포 뒤 Claude가 합성 터치 이벤트로 순서를 확인하고, 사용자가 iPhone으로 확인한다(7절 6).

### 5.10 사용자 iPhone 재확인 1차 (PR #28 배포 뒤, 2026-11-12 02:41~02:48 KST)

| 항목 | 결과 |
|---|---|
| 이미지를 누를 때 선택 표시 | 안 됨. 연두색이 회색으로 바뀌었을 뿐 선택 표시가 그대로다(사용자 스크린샷) |
| 크기 · 정렬 단추 | 안 됨. 첫 탭에는 검은 테두리만 생기고, 두 번째 탭에 눌린다 |
| 폭 입력 → 가운데 | 폭 120 · 오른쪽 정렬이 적용된 화면을 보냈다(두 번 눌러서) |
| 관리자 글 목록(`/admin`) 390px | 됨 |

## 6. 찾은 문제

### 6.1 Shiki 줄당 시간 한도로 코드 색이 빠질 수 있다

**현상.** 이 기기의 부하가 높을 때(load average 37, 다른 프로그램 ffmpeg가 CPU 340%) `pnpm test`가 918개 중 1~2개 실패했다. 실패는 실행마다 달랐다.

- `tests/unit/content-highlighter.test.ts` "드롭다운 언어 20종과 기존 글 별칭이 모두 색칠된다": 5초 시간 초과.
- `tests/unit/code-highlighter.test.ts` "서버(Oniguruma)와 에디터 미리보기(JS 엔진)의 결과 … 같은 HTML": javascript · typescript 등 8개 언어가 달랐다.

두 파일만 다시 돌리면 통과했다.

**원인.** Shiki는 한 줄을 토큰화하는 시간에 한도를 둔다. `@shikijs/core` 3.12.2의 `tokenizeTimeLimit` 기본값은 500ms다(`dist/index.mjs` 902행). 한도를 넘으면 그 줄의 나머지는 색 없는 토큰 하나가 된다. 이 저장소는 이 옵션을 주지 않는다(`src/lib/content/shiki-languages.ts` `codeHighlighterFromCore`). 확인한 것:

1. 새 프로세스에서 JS 엔진 첫 호출 시간(정규식 컴파일 포함): javascript 345ms, typescript 339ms, sql 179ms, python 77ms. 부하가 더 높으면 500ms를 넘는다.
2. 같은 코드 한 줄을 새 하이라이터 두 개로 그렸다. `tokenizeTimeLimit: 1`이면 색 span 1개, `0`(한도 없음)이면 14개다.

**영향.** 5단계 작업 문서 8절 10의 "SQL 함수 이름 색이 실행마다 달랐다(원인 미확인)"도 같은 원인일 수 있다. 서버(Oniguruma)도 같은 한도를 쓴다. 콜드 함수에서 첫 줄 토큰화가 500ms를 넘으면 그 글의 코드 줄 일부가 색 없이 그려지고, 그 HTML이 다음 퍼지까지 CDN에 남을 수 있다. 운영에서 실제로 생겼는지는 확인하지 못했다.

**처리.** 사용자 결정(2026-11-12): 고친다. 한도를 5초로 올렸다(4.3). 한도는 남겨 이상한 정규식이 함수나 탭을 오래 묶지 않게 했다.

### 6.2 iPhone: 폭 입력 뒤 "가운데"가 적용되지 않는다

**현상(사용자 iPhone).** 이미지 메뉴에서 폭을 입력하고 "가운데"를 누르면 이미지가 원래 자리에 그대로다.

**찾은 과정.**

1. 첫 가설("메뉴 안을 누르는 중" 표시가 blur 전에 꺼진다)을 iOS 시뮬레이터(iPhone 16, iOS 18.2)의 작은 재현 페이지로 시험했다. 틀렸다. 순서는 `pointerdown → pointerup → (약 1.7초 뒤) mousedown → 입력 칸 blur → mouseup → click`이고, blur 때 표시는 켜져 있었다. mousedown부터 click까지 15ms 안이다. blur의 `relatedTarget`은 편집 루트(contenteditable)였다.
2. 둘째 가설: blur(폭 반영)와 click(정렬)이 React가 다시 그리기 전에 연달아 와서, click이 그린 때의 속성(폭 없음)에 덮어쓴다. `rebuild` 미리보기 에디터(앱 브라우저)에서 같은 순서를 한 작업 안에 보냈다. 결과: blur 뒤 폭 200 · 정렬 없음, click 뒤 **폭 없음** · 정렬 가운데. 가설이 맞았다.
3. 폭이 없는 이미지는 본문 폭을 채운다. 그래서 가운데여도 "그대로"로 보였다.

**원인.** `ImageNodeView.tsx`의 `updateKeepingSelection`이 `tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attributes })`로 React props의 `node.attrs`를 썼다. 데스크톱은 누르는 동작 사이에 다시 그릴 시간이 있어 드러나지 않았다(5단계 리뷰 B4는 Mac Safari의 포커스 문제였다).

**처리.** 지금 문서의 노드 속성에 더한다(4.3). 확인은 `rebuild` 미리보기 배포 뒤 같은 재현 순서와 사용자 iPhone으로 한다(7절).

### 6.3 iPhone: 이미지를 누르면 연두색 선택 표시가 메뉴까지 덮는다

**현상(사용자 iPhone 스크린샷).** 이미지를 누르면 이미지와 메뉴 글자 위에 연두색 반투명 표시와 선택 손잡이가 생긴다.

**찾은 과정.** 앱 브라우저에서 이미지를 실제로 눌러 노드 선택을 만들고 읽었다.

- 편집 루트(`.tiptap-body`, ProseMirror 루트)에 `ProseMirror-hideselection`이 붙는다. DOM 선택은 이미지를 감싼 범위다(접히지 않음).
- 하위 요소(단락)의 `caret-color`는 투명이다. **루트의 `caret-color`는 `rgb(16, 185, 129)`(브랜드 초록)이다.**
- ProseMirror 공식 CSS(`prosemirror-view/style/prosemirror.css` 24행)는 `.ProseMirror-hideselection { caret-color: transparent; }`로 루트 자신을 투명하게 한다. Tiptap이 넣는 CSS는 `.ProseMirror-hideselection * { caret-color: transparent; }`로 하위 요소만 투명하게 한다. `editor.css`는 `.tiptap-body { caret-color: var(--brand); }`다.
- iOS WebKit은 선택 강조와 손잡이를 편집 루트의 caret 색으로 칠한다. 스크린샷의 손잡이도 초록이다.

**원인.** 노드 선택 중에도 루트의 caret 색이 브랜드 초록이라, iOS가 노드 선택 범위(이미지 + 노드 뷰 안의 메뉴)를 초록으로 칠했다. iOS 동작은 실기기에서 확인해야 한다(시뮬레이터 확인은 기기 부하로 사용자 요청에 따라 그만뒀다).

**처리.** 노드 선택 중에는 루트도 투명하게 한다(4.3). 메뉴를 노드 뷰 밖으로 빼는 큰 변경은 하지 않았다.

**결과: 부족했다.** iPhone 재확인(5.10)에서 선택 표시가 회색으로 남았다. 요구는 "이미지를 누르면 선택 표시 없이 메뉴만 뜬다"였다. 이 수정은 표시의 색만 바꿨다. 색이 원인이라고 보고 "해결"이라고 보고한 것은 잘못이었다. 진짜 원인과 수정은 6.5다. caret 색 규칙은 데스크톱 노드 선택에도 맞는 값이라 남긴다.

### 6.4 로그아웃 뒤 "고치기"가 남음 (재현되지 않음)

사용자 순서: 로그인 상태로 글 탭을 열어 둠 → 다른 탭에서 관리자 화면에 들어가 로그아웃 → 글 탭을 새로고침 → "고치기"가 보임(누르면 로그인 화면). 다시 해 보니 사라졌다.

확인한 것: 두 로그아웃 경로(앱 메뉴, 에디터 메뉴)가 모두 `clearAdminHint`를 부른다. 로그인 화면은 자동으로 다시 로그인하지 않는다. CSS는 `[hidden]`일 때 숨긴다. 새로고침은 표시 스크립트를 다시 돌린다. 앱 브라우저에서 표시를 지우고 뒤로 가기를 해도 숨었다. 원인을 찾지 못했다. 추측으로 고치지 않았다(8절 3).

### 6.5 iPhone: 이미지를 누르면 선택 범위가 생기고, 메뉴 단추를 두 번 눌러야 된다

**현상(5.10).** 이미지를 누르면 이미지와 메뉴 위에 회색 선택 표시가 생긴다. 크기 · 정렬 단추는 첫 탭에 검은 테두리만 생기고 두 번째 탭에 눌린다.

**원인.**

1. 이미지를 누르면 ProseMirror가 노드 선택을 두고 에디터에 포커스를 준다. 이때 DOM 선택은 이미지 노드 뷰 전체를 감싼 범위다(5.8: 접히지 않은 범위). 메뉴는 노드 뷰 안에 있으므로 범위 안에 든다.
2. iOS는 포커스가 있는 편집 영역의 선택 범위를 칠한다. `caret-color`가 투명이어도 회색으로 칠했다(5.10). 그래서 색을 바꾸는 것으로는 없어지지 않는다.
3. iOS는 선택 범위 안의 첫 탭을 선택을 다루는 데 쓰고 페이지에 click을 보내지 않는다. 그래서 범위 안에 있는 메뉴 단추는 첫 탭에 hover 스타일(`.editor-chip:hover`의 테두리)만 남고 두 번째 탭에 눌렸다.
4. 메뉴 단추를 누르면 iOS가 편집 루트에 포커스를 준다(6.2의 재현 페이지: blur의 `relatedTarget`이 편집 루트). 그러면 범위가 다시 생긴다.

**처리(4.4).** 터치로 이미지를 누르면 ProseMirror에 넘기지 않고 포커스 없이 노드 선택만 둔다. 에디터 포커스가 없고 DOM 선택이 비어 있으면 ProseMirror는 DOM 범위를 만들지 않는다. 노드 뷰의 선택 상태는 상태의 노드 선택을 따르므로 메뉴는 뜬다. 메뉴를 누를 때는 포커스를 옮기지 않는다. 입력 중인 폭은 단추 처리 전에 반영한다. 터치 기기에서는 hover 테두리를 그리지 않는다. 키보드도 내려간다. 메뉴를 노드 뷰 밖으로 빼는 큰 변경은 하지 않았다.

**한계.** 이 판단은 코드 · 5.8의 DOM 관찰 · 6.2의 iOS 재현 페이지에 기댄다. iOS에서 실제로 선택 표시가 없어지고 단추가 한 번에 눌리는지는 iPhone으로만 확인할 수 있다(7절 6).

## 7. 다음 작업

**병합 전.**

1. ~~Vercel Production 환경 변수~~ 끝(사용자, 2026-11-12, 5.7).
2. ~~실기기 확인 6줄~~ 했다(5.7). 이미지 메뉴 2건은 고쳤다(6.2, 6.3).
3. ~~E3 PR 병합과 백업 수동 실행~~ 끝(4.2).
4. ~~6.1 처리 결정~~ 고친다(사용자, 2026-11-12, 4.3).
5. ~~커밋 · 푸시 · PR · 병합~~ 끝(커밋 `fec2b0f`, [PR #28](https://github.com/crucial-sub/cruz-lab/pull/28), 병합 `0f1fddf`).
6. PR 병합 뒤 `rebuild` 미리보기에서: ~~(a) Claude의 6.2 재현 순서~~ 끝(5.8, 폭 200 · 가운데). ~~(c) 노드 선택 중 루트 `caret-color`~~ 끝(5.8, 투명). (b) 사용자 iPhone 재확인 1차(5.10): 선택 표시가 회색으로 남고 단추를 두 번 눌러야 됨 → 6.5 수정. 관리자 목록 390px 됨. 6.5 수정을 `rebuild`에 넣은 뒤 Claude가 합성 터치 이벤트로 순서를 확인하고, 사용자가 iPhone으로 다시 본다(이미지를 누르면 선택 표시 없이 메뉴만, 단추가 한 번에 눌림, 폭 입력 → 가운데). 6.5 수정과 5.8~5.10 기록은 브랜치 `stage6/ios-image-menu`(`0f1fddf`에서 생성)의 PR로 넣는다.

**병합 바로 전 (Claude, 사용자 확인 뒤).**

7. 기기 부하가 낮을 때 `pnpm test`를 다시 돌린다(922 기대, 5.2 · 5.6).
8. 2단계 마이그레이션 시험 실행 → 0건이면 `--apply`(B1 덤프만, D3). 0건이 아니면 보고서를 보이고 묻는다.
9. 프로젝트 글 재동기화 시험 실행(`origin/main` 원본). 0건이면 `--apply`가 필요 없다.
10. 8~9부터 병합까지 옛 운영 CMS(`www.cruzlab.dev/admin`)로 글을 쓰지 않는다.

**병합 (사용자).**

11. `rebuild` → main PR을 merge commit으로 병합한다(D4). `stage6/merge-prep` → `rebuild` PR은 5에서 먼저 병합한다.

**병합 뒤 (이 세션, D5).**

12. 운영 `www.cruzlab.dev/admin` 관리자 로그인(사용자, 3.3의 마무리).
13. 재발행 첫 요청의 `x-vercel-cache`(11.3의 4): `stage5-test` 글 발행 → 공개 주소 첫 요청 → 글 지우기.
14. 운영 콜드 글 상세 TTFB 3회(11.3의 7): 쿼리로 CDN 우회, `inst` desc `req 1`과 작은 dur만 센다. 기준 1.5초.
15. 독자 흐름 첫 수집(11.3의 8): `readerDaily/{오늘}`이 생기는지, 관리자 본인 방문이 빠지는지. 공개 스크립트 크기를 운영 HTML에서 다시 잰다. Server-Timing을 둘지 정한다(5단계 8절 11).

**병합 뒤 별도 작업 단위.**

16. 병합 뒤 정리(2단계 Plan 15절 병합 직후 5 + 11.3의 12): 옛 `posts` · `series` 삭제(백업 뒤), 규칙 "클라이언트 접근 전부 거부", 옛 인덱스 4개, Vercel `GITHUB_TOKEN` · `PUBLIC_ADMIN_EMAIL`(+ 3.5의 쓰지 않는 함수), `data/post-archive/`, Storage `series-covers/` 3개, 원격 병합 끝난 브랜치(3단계 6, 4단계 7, 5단계 7, `stage6/merge-prep`), Secret Manager `GITHUB_TOKEN`, legacy 자산 26개. 항목마다 사용자 확인.
17. cruz-lab 프로젝트 글 작성 전략(11.3의 9, 5단계 Plan 14절 첫 줄): 사용자와 함께 세운다.

## 8. 열린 질문

1. ~~6.1 Shiki 줄당 시간 한도~~ 닫음(2026-11-12, 사용자 답: 고친다. 한도 5초, 4.3).
2. **Auth 승인 도메인에 `www.cruzlab.dev`를 명시할지.** 지금 판단: 더하지 않는다(3.3). 병합 뒤 운영 로그인이 안 될 때만 더한다.
3. **로그아웃 뒤 "고치기"가 남은 일(6.4).** 재현되지 않았다. 다시 생기면 순서(어느 탭·기기에서 로그아웃했는지)를 적는다. 안전장치 후보: 로그인 화면이 열리면 관리자 표시를 지운다. 단점: 로그인한 관리자가 로그인 화면만 열어도 "고치기"가 `/admin`을 다시 열 때까지 사라진다. 지금 판단: 넣지 않는다.
4. **이미지 메뉴가 노드 뷰 안에 있는 구조(6.3).** iOS는 노드 선택 범위를 메뉴까지 포함해 다룬다. caret 색 수정으로 표시가 사라지지 않으면 메뉴를 노드 뷰 밖(편집 영역 밖의 떠 있는 요소)으로 옮긴다. 이것은 큰 변경이라 병합 뒤 별도 작업이다.
5. **5단계 작업 문서 8절 열린 질문.** 1 · 3 · 4 · 6 · 7 · 8 · 10은 그대로 둔다(순서표의 "바뀌지 않는 것", 사용자가 기본값 승인). 5(Safari 이미지 메뉴)는 6.2 · 6.3과 7절 6에서 다룬다. 9 · 11 · 12는 7절 15 · 14에서 다룬다.
6. **사용자가 확인 중에 만든 제목 없는 초안 5편과 자산 3개(5.7).** 사용자가 지울지 정한다.
7. **`rebuild` 미리보기를 다른 사람이 볼 수 없다(사용자 질문 2026-11-12).** 미리보기에는 Vercel 로그인 보호가 걸려 있다(11.3 "2~5단계 흐름" 3). 그래서 친구가 열면 Vercel 로그인 화면이 뜬다. 또 독자 흐름은 운영 주소(`www.cruzlab.dev`)의 방문만 저장한다(D20, `src/lib/tracker/events.ts`의 `PRODUCTION_HOST`). 미리보기 방문은 보호를 풀어도 저장되지 않는다(5.4 PR-D). 그래서 친구 방문으로 하는 독자 흐름 시험은 main 병합 뒤 운영 주소에서 한다(7절 15). 병합 전에 미리보기를 보여 주려면 사용자가 Vercel의 보호 설정을 바꿔야 한다(외부 설정, 사용자 결정).
