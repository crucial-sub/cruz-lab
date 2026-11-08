# 재건 3단계 작업 문서: 에디터

- 날짜: 2026-11-09 (작성 중. PR마다 갱신한다)
- Plan: [2026-11-08-stage3-editor-plan.md](./2026-11-08-stage3-editor-plan.md) (승인 2026-11-08, PR #8 병합)
- 진행 기록: [계획 문서 11.7](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md#117-3단계-구현-진행-기록-2026-11-09)
- 브랜치: `stage3/a-markdown`(PR-A), `stage3/b-editor`(PR-B), `stage3/c-commands`(PR-C). 대상은 모두 `rebuild`다.

## 1. 현재 상황

| 항목 | 상태 |
|---|---|
| PR-A (T1 변환기·파이프라인, T2 왕복 검사) | 끝. 커밋 `44a41d6`(코드)·`ee31798`(문서), [PR #9](https://github.com/crucial-sub/cruz-lab/pull/9)(대상 `rebuild`). 사용자 승인으로 병합했다(2026-11-09, merge commit `4010bd0`). 되돌리기 기준 태그 `rebuild-pre-stage3`(`4bc465b`). 원격 브랜치 `stage3/a-markdown`은 남아 있다(삭제는 사용자 확인 뒤) |
| PR-B (T3 에디터 페이지, T4 이미지, T6 보기 모드, T8 퍼지) | 구현·검증·리뷰 끝(2026-11-09). 브랜치 `stage3/b-editor`. 처음에는 `stage3/a-markdown`(`13a0825`) 위에서 시작했고, PR #9 병합 뒤 `rebuild` 끝 `4010bd0` 위로 옮겼다(8절 1). 테스트 290, `tsc` 9(새 오류 0), 빌드 통과, 왕복 55/55, API 스모크 104/104. 리뷰(6.2) 치명 1·중요 10을 고쳤다. 브라우저 시나리오(8.4의 PR-B 몫 15개) 통과(4.5). 시험 데이터 0. 사용자 승인(2026-11-09)으로 커밋 `dfe1220`(코드)·`2df00d6`(문서), 푸시, [PR #10](https://github.com/crucial-sub/cruz-lab/pull/10)(대상 `rebuild`). 병합은 사용자 확인 뒤 |
| PR-C (T5 명령·모바일, T7 최소 목록·삭제) | 시작 전 |
| T9 (E2 버킷 CORS, 브라우저 확인, 미리보기 확인) | E2는 PR-B에서 했다(사용자 승인, 3절). 브라우저 확인 중 PR-B 몫도 PR-B에서 했다. 남은 것: 시나리오 7·14·17·18(T5), 미리보기 확인 8.5 |
| 외부 변경 | E2 버킷 CORS(2026-11-09 08:07 KST 무렵, 사용자 승인). Plan 값에 `http://localhost:4322`를 더했다(3절) |
| 운영 데이터 | 기존 글은 읽기만 했다. 시험 글 2편·시험 자산 2개·publishLog 6줄을 만들었다가 모두 지웠다. 끝 상태: `entries` 55, `publishLog` 0, `entryTombstones` 0, 새 자산 0, Storage `assets/` 0(4.5) |

## 2. 한 일

### 2.1 T1: 의존성, 스키마, 공유 파이프라인, 변환기 (PR-A)

| 파일 | 내용 |
|---|---|
| `package.json` | `@tiptap/*` 12개를 3.33.0으로 고정(core, pm, react, starter-kit, extension-list, extension-table, extension-image, extension-code, extension-code-block-lowlight, extension-mathematics, suggestion, extensions). lowlight, katex, remark-math, rehype-katex, unified, remark-parse, remark-stringify, remark-rehype, rehype-stringify, unist-util-visit, mdast-util-to-string. dev: @types/mdast, @types/hast, fake-indexeddb. 스크립트 `smoke:roundtrip` |
| `src/lib/content/embed-url.ts` | 임베드 주소 판정(순수 함수). YouTube(`youtu.be`, `watch?v=`, `shorts`), CodeSandbox(`/s/`, `/embed/`, `/p/`). 결과는 `youtube-nocookie.com/embed/<id>`, `codesandbox.io/embed/<id>` 둘뿐 |
| `src/lib/content/remark-callout.ts` | `detectCallout`(변환기와 공유) + remark 플러그인. `> [!note]` 첫 줄 → `div.callout.callout-note[data-callout]`. note·tip·warning만 |
| `src/lib/content/remark-embed.ts` | `embedOfParagraph`(변환기와 공유) + remark 플러그인. 지원 주소 하나만 있는 단락 → `div.embed > iframe`(lazy, sandbox, referrerpolicy) |
| `src/lib/content/markdown.ts` | `parseMarkdown`(remark-parse + gfm + math), `stringifyMarkdown`(Plan 4.2 표기 옵션), `markdownToHtml`(콜아웃·임베드·KaTeX·highlight.js + react-markdown 규칙 이식: 영상 확장자 → video, 외부 링크 새 창, 인라인 코드 클래스), `normalizeForCompare`(D1 규칙 1~5 + 규칙 6) |
| `src/editor/extensions/index.ts` | `createEditorExtensions()` = 스키마. StarterKit(h1~h6, underline 끔) + Code(excludes 'code') + BulletList·OrderedList(`spread` 속성) + CodeBlockLowlight(`meta` 속성) + TaskList·TaskItem(nested) + Table·TableRow·TableCell·TableHeader(셀 내용 `paragraph`) + Image(inline) + Callout + Embed + Mathematics |
| `src/editor/extensions/callout.ts`, `embed.ts`, `lowlight.ts` | 콜아웃 노드(`setCallout`·`unsetCallout`), 임베드 노드(atom, `setEmbed`, renderHTML은 iframe), lowlight `common` + 드롭다운 언어 목록 20종 |
| `src/editor/markdown/to-doc.ts` | mdast → ProseMirror JSON(Plan 4.2 표). ZWSP 제거, soft break → 공백, `<br>`만 HTML로 받음(줄 안 → hardBreak, 블록 → 버림), 그 밖 HTML·노드 → 텍스트 + 경고 |
| `src/editor/markdown/from-doc.ts` | ProseMirror JSON → mdast. 마크는 가장 긴 구간부터 감싼다. 단락 끝 hardBreak는 `<br>`. 빈 단락은 쓰지 않는다. 모르는 노드는 오류 |
| `src/editor/markdown/index.ts` | `markdownToDoc(md) → { doc, warnings }`, `docToMarkdown(doc) → string` |
| `tests/fixtures/markdown/*.md` (10) | 문법 항목별 fixture: 제목·단락, 인라인 마크, 링크·이미지, 목록, 코드, 표, 인용·콜아웃, 브레이크·HTML, 수식·임베드, 한글 혼합(ZWSP·`*`·`***`·`> 💡`) |
| `tests/unit/content-embed-url.test.ts`, `content-markdown.test.ts`, `editor-markdown.test.ts` | 60개. fixture마다 (a) 다시 쓴 마크다운의 렌더가 원문과 같다 (b) 두 번 왕복해도 같다 (c) 스키마 검사(`getSchema` + `nodeFromJSON().check()`) |

변환기와 파이프라인은 DOM이 없는 Node에서 돈다. `@/` 별칭을 쓰지 않고 상대 경로에 `.ts`를 붙여 Node 스크립트가 바로 가져온다(2단계 `entry-schema.ts`와 같은 규칙).

### 2.2 T2: 왕복 검사 (PR-A)

`scripts/smoke/stage3-roundtrip.mjs` (`pnpm smoke:roundtrip`). `entries`를 Admin SDK로 읽기만 한다. 글마다 `markdownToDoc` → 스키마 검사 → `docToMarkdown` → `normalizeForCompare` 비교 → 두 번째 왕복 안정성. `--dump <posts.json>`으로 B1 덤프를 대신 읽을 수 있다(오프라인 반복). `--report <경로>`로 마크다운 보고서를 쓴다.

결과(2026-11-09, `entries` 55편): **55/55 통과, 경고 0건.** 보고서 요약은 4.2.

### 2.3 T3: 에디터 페이지 (PR-B)

| 파일 | 내용 |
|---|---|
| `src/pages/admin/edit/[id].astro` | 전체 화면 SSR 페이지. `global.css` + KaTeX CSS + `editor.css`. BaseHead와 같은 테마 초기화 스크립트(`html.light`). `EditorApp`을 `client:only="react"`로 그린다(D13, M10) |
| `src/editor/ui/EditorApp.tsx` | 루트. 열기(D5: `resolveOpenDoc` → `setContent` → 기준), 보기 모드 전환(D8), 발행(저장을 먼저 끝낸 뒤 `POST publish`, 422는 칸별 이유), 숨김·다시 보임, 초안 버리기, 삭제(2회 확인), 로그아웃, 기기 이름, 테마 전환, `beforeunload`. 자동저장 판단은 `SaveController`에 맡기고 화면 상태(snapshot)만 넘긴다 |
| `src/editor/state/save-controller.ts` | 저장 컨트롤러(리뷰 뒤 추가, 5절 41). dirty·halt·blockers·running·force와 비교 기준(편집 기준, 서버 원문, 메타)을 가진다. 2초 디바운스, 조합 중 보류, blob 주소·메타 검사, 409 충돌, 네트워크 실패는 보관함(그 뒤 입력도 2초마다 보관), 401은 보관 뒤 로그인, "내 것으로 덮기"는 비교 없이 전송, 발행 전 `flush` |
| `src/editor/state/autosave.ts` | 자동저장 표시 상태(순수 리듀서). idle·dirty·saving·saved·offline·error·conflict. 같은 상태면 같은 객체를 돌려준다(키 입력마다 다시 그리지 않는다). 상태 문구 `describeSaveStatus` |
| `src/editor/state/change.ts` | `resolveOpenDoc`(editorJson 해시 검사), `buildEditorJson`·`editorJsonForSave`(`{ v: 1, markdownSha256, doc }`, Firestore 깊이 한도를 넘으면 null), `containsBlobUrl`, `validateDraftForSave`(서버 `draftInputSchema` + 태그 3개), `isSameMeta`, `sha256Hex`(Web Crypto) |
| `src/editor/state/offline-store.ts` | IndexedDB `cruz-lab-editor/drafts`, 글당 1칸 `{ id, baseVersion, draft, savedAt }` |
| `src/editor/state/device.ts` | 기기 이름 추정(UA)·저장(`localStorage` `cruz-lab:device`, 60자) |
| `src/editor/state/slug.ts` | 제목 → slug 제안(`SLUG_PATTERN` 준수) |
| `src/editor/state/api.ts` | `/api/admin/*` fetch 래퍼. `ApiClientError`·`NetworkError`. 422 details → 칸별 문구. XHR PUT(진행률). `uploadTransport` |
| `src/editor/ui/TopBar.tsx` | ← 목록, 상태 칩, 저장 상태(재시도), 모드 탭, 메타 토글, **발행**, ⋯ 메뉴(M9) |
| `src/editor/ui/MetaPanel.tsx` | 상태, 설명, slug(제목에서), 카테고리, 태그(최대 3, 입력 때 `normalizeTag`), 연재 key·순서, 표지(생성/이미지 업로드). 422 이유를 칸 아래에. lg 이상 320px 패널, 그 아래 시트 |
| `src/editor/ui/Dialogs.tsx` | 충돌(서버 정보, 내 변경 복사, 서버 것 열기, 내 것으로 덮기), 보관함 복원, 삭제, 기기 이름, 토스트, 변환 경고 배너 |
| `src/editor/ui/editor-extensions.ts` | 스키마 + 화면용 확장(이미지 노드 뷰, 업로드 플러그인, Placeholder) |
| `src/editor/editor.css` | 편집 영역·미리보기의 `.prose`(공개 글 페이지와 같은 규칙), 콜아웃·임베드, 표·체크 목록·수식·이미지 노드 뷰 |
| `src/editor/index.ts` | 공개 API(`createEditorExtensions`, 변환기, `EditorApp`) |
| `src/pages/admin/posts/new.astro` | 서버에서 `createEntry(kind)` → `/admin/edit/{id}` 302. 옛 `EditorPage`를 가져오던 파일이라 PR-B에서 바꿨다(5절 24) |
| 지움 | `src/components/editor/**`(10개, 3,323줄), `src/pages/admin/edit.astro`. 지우기 전 grep: 가져오는 곳은 `edit.astro`와 `posts/new.astro`뿐이었다 |

### 2.4 T4: 이미지 (PR-B)

| 파일 | 내용 |
|---|---|
| `src/editor/upload/upload-client.ts` | 형식·크기 검사(클라이언트 먼저) → SHA-256 → `upload-url`(`existing`이면 바로) → PUT(`requiredHeaders`만) → `finalize`. 전송은 주입(테스트는 가짜) |
| `src/editor/upload/paste-drop.ts` | 드롭·붙여넣기 플러그인과 명령(`insertImageFiles`·`retryImageUpload`·`cancelImageUpload`). 노드에 `src=blob:`·`uploadId`·진행률·오류를 적는다. 명령은 받은 `tr`에 단계를 쌓는다. 파일 객체는 `uploadId`로 기억해 같은 파일로 재시도. 업로드 결과도 `uploadId`로 기억해, 되돌리기·다시 실행으로 노드가 다시 나타나면 `appendTransaction`이 적용한다. 정보를 잃은 노드는 오류로 표시한다. `countUploadingNodes`(uploadId 또는 src가 blob:)가 자동저장 차단 수 |
| `src/editor/extensions/index.ts` | Image 노드에 `uploadId`·`uploadProgress`·`uploadError`(`rendered: false`) 추가(5절 27) |
| `src/editor/ui/ImageNodeView.tsx` | 업로드 진행률·실패(다시 시도·삭제), 선택 시 대체 텍스트·캡션·크기(작게 w480·보통 w960·크게 max) 메뉴. 영상 확장자는 `<video>`. 크기 메뉴는 새 자산(`assets/{id}/`)만 켠다 |
| `src/editor/upload/image-size.ts` | 크기 ↔ 변형 주소(없으면 null) |
| `src/lib/asset-url.ts` | 브라우저 안전 주소 파서(`storagePathFromUrl`·`extractStoragePaths`·`assetIdFromUrl`). `asset-refs.ts`가 가져다 다시 내보낸다(5절 25) |
| `src/pages/api/admin/assets/[id]/index.ts`, `admin-assets.ts` `getAssetForAdmin` | `GET /api/admin/assets/{id}` → `{ asset }`. 3단계의 유일한 새 API. `withAdminApi`, `serializeAsset` |
| 표지 | 메타 패널에서 파일 선택 → 같은 업로드 클라이언트 → `cover: { kind: 'image', url, assetId }` |
| `scripts/ops/bucket-cors.mjs` | 버킷 CORS 보기(기본, 읽기만)·`--apply`(Plan 10절 값)·`--reset`(빈 배열) |

### 2.5 T6: 보기 모드 3종 (PR-B)

| 모드 | 구현 |
|---|---|
| 편집 | Tiptap. `EditorContent`는 숨기기만 하고 내리지 않는다(상태 유지) |
| 소스 | `SourceMode.tsx` textarea(모노스페이스, 자동 높이). 들어갈 때 텍스트는 저장 안 된 편집 변경이 없으면 서버 원문, 있으면 `docToMarkdown`. 고치면 `{ markdown: 텍스트, editorJson: null }`로 저장. 나올 때 고쳤으면 `markdownToDoc` → `setContent` → 경고 배너(5절 29) |
| 미리보기 | `PreviewMode.tsx`: `markdownToHtml(docToMarkdown(doc))`를 `.prose`에 넣는다. 공유 파이프라인은 원시 HTML 안전 처리(`rehype-strip-unsafe.ts`)를 거친다(5절 42) |

리뷰 뒤 공유 파이프라인에 더한 것(PR-A 파일): `src/lib/content/safe-url.ts`(`safeUrl`·`isVideoUrl`·`VIDEO_EXTENSIONS`를 옮김. `markdown.ts`가 다시 내보낸다), `src/lib/content/rehype-strip-unsafe.ts`(rehype-raw 바로 뒤).

마지막 모드는 `localStorage` `cruz-lab:editor-mode`에 기억한다.

### 2.6 T8: 퍼지 방식 (PR-B)

`src/lib/server/cdn-purge.ts`: `post-<id>`는 `dangerouslyDeleteByTag`, `posts`는 `invalidateByTag`(D7). 로컬은 `skipped` 그대로. 단위 테스트(`cdn-purge.test.ts`)가 `@vercel/functions`를 가짜로 바꿔 두 호출을 확인한다. 미리보기 확인(8.5)은 PR-C의 T9에서.

## 3. 외부 변경

E2(버킷 CORS)를 넣었다(2026-11-09, 사용자 승인). 명령: `node --env-file=.env scripts/ops/bucket-cors.mjs --apply`.

| 항목 | 값 |
|---|---|
| 버킷 | `cruz-lab.firebasestorage.app` |
| E2 전 CORS(2026-11-09 조회) | `[]` (2단계 Plan 1절의 확인값과 같다) |
| 넣은 값 | origin `http://localhost:4321`, **`http://localhost:4322`**, `https://cruz-lab-git-rebuild-crucialsubs-projects.vercel.app`, `https://www.cruzlab.dev` · method `PUT` · responseHeader `Content-Type` · maxAge 3600 |
| Plan과 다른 점 | `http://localhost:4322`를 더했다. 4321을 메인 체크아웃의 개발 서버가 쓰고 있어 이 worktree의 개발 서버가 4322에 떴다. 사용자가 "Plan 값 + 4322"를 골랐다(5절 50) |
| 확인 | 설정 뒤 조회값이 위와 같다. 브라우저에서 이미지 2장이 Storage PUT → finalize까지 됐다(4.5 시나리오 6) |
| 되돌리기 | `scripts/ops/bucket-cors.mjs --reset` → `[]` |

## 4. 검증 결과

### 4.1 자동 검사 (PR-A, 2026-11-09)

| 항목 | 기준선(2026-11-08) | PR-A | PR-B (2026-11-09) |
|---|---|---|---|
| `pnpm lint` | 통과 | 통과 | 통과 |
| `pnpm test` | 112 | 185 (+73. 변환기·파이프라인 60 + 리뷰 지적 수정 13) | 290 (+105. 구현 53: 자동저장 리듀서 16, 열기·변경 판정 8, 보관함 4, 기기 이름 5, slug 4, 업로드 클라이언트·크기 11, 주소 파서 5, 퍼지 2. 리뷰 수정 52: 저장 컨트롤러 23, 업로드 확장 8, HTML 안전 처리·영상 판정 9, 변경 판정 7, 리듀서 5) |
| `tsc --noEmit` 오류 | 9 | 9 | 9 (새 오류 0. 옛 에디터 컴포넌트를 지웠지만 오류가 있던 파일은 `lib/`에 남아 수가 같다. PR-C의 T7이 지운다) |
| `pnpm build` | 통과 | 통과 | 통과. 에디터 청크 `EditorApp.*.js` **1,721 KB(gzip 526 KB)**(리뷰 수정 전 1,711 KB). 아래 4.4 |
| 왕복 검사 | — | 55/55 | 55/55(구현 뒤, 시험 데이터 정리 뒤 두 번. 중간 실행은 빈 시험 글이 있어 56/56) |
| API 스모크 | — | — | 104/104(4.3) |

### 4.5 브라우저 확인 (PR-B, localhost:4322, 사용자 로그인)

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | 기존 글 열기(「큐(Queue)」 `LeFCqFhw9iubpp6OocVu`: 표 13행·이미지 3·코드 2) | 통과. 첫 화면이 제목과 본문이다(M7). 800px 폭이라 메타 패널은 접혀 있다. 경고 배너 0, 상태 문구 없음 |
| 2 | 1의 글을 바꾸지 않고 편집 → 소스 → 미리보기 → 편집, 4초 이상 기다림 | 통과. 요청은 `GET /api/admin/posts/{id}` 하나뿐이다. `draft.version` 1, `draft.updatedAt` 2026-03-31T11:47:11.502Z 그대로(Admin SDK로 전후 확인). 소스 모드는 서버 원문(`*` 글머리, `<br />`)을 보인다 |
| 15 | ⋯ → 테마 전환 | 통과. `html.light`, 바탕 `rgb(248,250,252)`, 상단 바 `rgb(255,255,255)`, 제목 글자 `rgb(15,23,42)`. 흰 바탕 고정 없음(M10). 다시 다크로 돌렸다 |
| 10 | 빈 글 발행(시험 글 `qoRxy9TjMCrBmNAWuw1c`) | 통과. 422. 제목·본문은 본문 위, 설명·slug·카테고리는 메타 시트의 칸 아래에 이유가 붙는다. 토스트 "발행 조건: 본문이 필요합니다" |
| 3 | 제목·본문 입력 → 2초 | 통과. "저장됨 · 방금 · macbook". API `version` 3, `editorJson.v` 1, `device` macbook. 발행본이 없어 `hasUnpublishedChanges`는 false(서버 정의) |
| 4 | 같은 글을 탭 2개에서 열고 양쪽에서 고치기 | 통과. 늦은 탭에 충돌 화면(서버 버전 5·macbook·시각). "서버 것 열기" → 서버 내용, 저장 없음(v5 그대로). 다시 충돌 → "내 것으로 덮기" → 서버 버전 6 위에 내 내용으로 v7 |
| 5 | 오프라인 → 고치기 → 온라인 | 통과. 저장 요청만 실패하게 페이지의 `fetch`를 바꿔 흉내 냈다(앱 도구에 DevTools 오프라인이 없다). "오프라인 · 기기에 보관됨", IndexedDB 칸 baseVersion 7. 오프라인 중 더 쓴 글자도 2초 뒤 칸에 들어갔다. `online` 이벤트 → "저장됨" v8, 칸 삭제. 새로고침 뒤 내용 그대로, 복원 대화상자 없음 |
| 8 | 소스 모드에서 `<iframe>`·콜아웃·표·코드 붙여넣기 → 편집 모드 | 통과. 경고 배너 1건("지원하지 않는 HTML은 텍스트로 남습니다"), iframe은 글자로 남고 콜아웃·표·코드는 노드가 됐다. 소스에서 저장(v9, editorJson null) 뒤 돌아와 다시 저장하지 않았다 |
| 9 | 미리보기 | 통과. 콜아웃(`div.callout`, 초록 왼쪽 선), 표, 코드 하이라이트, h2 밑줄이 공개 글 페이지와 같은 규칙으로 그려진다. 원시 iframe은 그리지 않는다. 공개 페이지는 콜아웃을 `[!note]` 인용으로 그린다(4단계까지, Plan D3) |
| 6 | 이미지 2장 드롭(E2 뒤) | 통과. 합성 `drop` 이벤트(DataTransfer, 2000×1200 PNG 2장)로 넣었다. 자리표시 "업로드 중 0%", 상태 "업로드가 끝나지 않은 이미지가 있어 저장 대기" → 두 장 모두 `assets/{id}/w2000.webp`, 저장됨. 같은 파일을 다시 드롭하면 `upload-url` 한 번만 부르고(existing) PUT·finalize가 없다 |
| 19 | 업로드한 이미지에서 "작게" | 통과. `src`가 `w480.webp`로 바뀌고 저장됐다. 발행 뒤 공개 페이지에서 naturalWidth 480으로 보인다. 기존 글(「큐」)의 옛 이미지(`images/blog/…`)는 세 크기 모두 비활성("외부 주소나 옛 이미지는 크기를 고를 수 없습니다"). 선택만 했고 그 글은 v1 그대로다 |
| 11 | 채우고 발행 | 통과. 저장 전 검사도 확인했다: 연재 key에 `Bad Key`를 치면 `bad key`(소문자)가 되고, 저장하지 않고 "입력 값을 확인하세요 (연재)"와 칸 아래 이유를 보인다. 지우면 자동으로 저장된다. 발행 → 토스트 "발행됨 · 공개 페이지 보기", 응답 `purge: skipped`, `backup: skipped`. 공개 페이지에 새 글, 이미지 3장 |
| 12 | 숨기기 → 다시 보이기, 초안 버리기 | 통과. 숨김 → 공개 404(`cache: no-store`로 확인) → 다시 보이기 → 200. 본문을 고쳐 v14(`hasUnpublishedChanges` true) → 초안 버리기(`window.confirm`은 페이지에서 참으로 바꿨다) → v15, 본문이 발행본으로 돌아가고 그 뒤 저장 없음 |
| 16 | 새 노트 → 본문만 쓰고 발행 | 통과. `/admin/posts/new?kind=note` → 제목 칸 "제목 (선택)" → 발행 → "발행됨 · 노트는 아직 공개 주소가 없습니다(4단계)", slug `note-20261109-0821` |
| 13 | 삭제 | 통과. 노트와 시험 글 모두 "삭제" → "정말 삭제" 2회 → `/admin`으로 이동, API 404, 목록에 없음, 공개 404 |
| 정리 | 시험 데이터 | 시험 글 2편은 화면에서 지웠다. 남은 publishLog 6줄과 고아 자산 2개(문서 + Storage 파일 8개)를 Admin SDK로 지웠다(지정한 ID만). 끝 상태 `entries` 55, `publishLog` 0, `entryTombstones` 0, 새 자산 0, Storage `assets/` 0 |

참고:

- 처음 열 때 개발 서버가 `504 Outdated Optimize Dep`를 냈다. `pnpm build`가 같은 폴더에서 돈 뒤 Vite 의존성 캐시가 낡았기 때문이다. 개발 서버를 다시 띄워 해결했다(코드 문제 아님).
- 앱 브라우저 도구의 글자 입력은 입력 규칙(`## `, `- `)을 일으키지 않는다(키 이벤트 없이 글자를 넣는다). 시나리오 7(입력 규칙)은 PR-C에서 실제 키보드로 확인한다.
- 브라우저 확인 중 고친 것: 이미지 노드 뷰의 클래스 공백(5절 51), 메타 시트가 상단 바를 가림(5절 52), 연재 칸 폭(5절 53), 대체 텍스트 칸의 불필요한 반영(5절 54).

### 4.4 번들 (PR-B)

PR-A 끝(`stage3/a-markdown`)과 PR-B를 같은 방법으로 빌드해 `dist/client/_astro/*.js`를 비교했다(해시를 뺀 이름과 크기).

| 구분 | 결과 |
|---|---|
| 공개 페이지 컴포넌트 청크(BlogCard, BlogPostList, InteractiveHero, ProjectCard, ScrollProgress, SkillsSection, TextReveal, ThemeToggle, TiltCard, proxy, use-spring 등) | 크기 모두 같다. 해시는 바뀌었다(공유 청크 이름이 바뀌어 import 경로가 달라졌기 때문) |
| 공유 React 런타임 청크 `client.*.js` | 179,416 → 175,550바이트. 옛 에디터가 끌어오던 모듈이 빠져 3.9 KB 줄었다. 공개 페이지가 이 청크를 쓴다 |
| 지워진 청크 | `CodeMirrorEditor`(616 KB), `index.esm`(51 KB, CodeMirror), `firebase`(106 KB), `FullScreenEditor`, `PublishModal`, `EditorOverlays`, `EditorPage`, `editor-drafts`, `publish-feedback`, `AdminGuard` |
| 새 청크 | `EditorApp` 1,711,357바이트(gzip 522,760). `/admin/edit/[id]`만 내려받는다(`client:only`) |
| 관리자 청크 | `AdminLayout` 4,352 → 5,272(AdminGuard가 합쳐짐), `PostList`·`AdminDashboard` 수십 바이트 차이. PR-C가 지운다 |

에디터 청크가 큰 이유: lowlight `common`(highlight.js 약 40개 언어), KaTeX, remark·rehype 파이프라인(미리보기·변환기), Tiptap. Plan 8.1은 "기록만, 목표 없음"이다. 줄이는 방법(언어·KaTeX 동적 import)은 8절 열린 질문 4.

### 4.2 왕복 검사 보고서 요약 (T2)

| 항목 | 값 |
|---|---|
| 입력 | Firestore `entries` 55편 `draft.markdown` (B1 덤프 55편도 같은 결과) |
| 통과 | 55/55. 두 번째 왕복도 전부 같다 |
| 경고(지원하지 않는 HTML 등) | 0건 |
| 글머리 `*` → `-` | 506개 |
| 구분선 `***` → `---` | 108개 |
| ZWSP 삭제 | 981개 |
| 본문 크기 | 417,565 → 414,439바이트 |
| `$…$`가 수식으로 읽힌 곳 | 5개, 3편(`$O(1)$`, `$O(logE)$`, `$V$`, `$E$`). 저자가 수식 표기로 쓴 것이다. 에디터·미리보기는 KaTeX로 그리고, 공개 페이지는 4단계까지 글자 그대로 보인다. 왕복 결과 마크다운은 같다 |
| 판단용 집계(리뷰 뒤 추가) | ZWSP만 있는 단락 0, ZWSP 옆 줄바꿈 0, 겹친 마크 순서 패턴(`**[`, `**_`, `~~**` 등) 2(둘 다 통과), `<br`가 있는 표 행 0. 리뷰 6.1의 지적 3·7이 기존 글에는 해당하지 않는다는 근거다 |

처음 실행은 53/55였다. 실패 2편은 모두 `***굵은 기울임***`이었다. CommonMark는 이것을 `<em><strong>`으로 읽는데 변환기가 `<strong><em>`으로 썼다. 마크 감싸기 동률 순서를 "기울임이 굵게보다 바깥"으로 바꿔 55/55가 됐다(5절 7).

### 4.3 API 스모크 (8.3)

PR-A는 API를 바꾸지 않는다. PR-B는 읽기 전용 `GET /api/admin/assets/{id}`를 더하고 `cdn-purge.ts`만 바꿨다(로컬 `skipped`).

결과(2026-11-09 08:07 KST, 사용자 승인): `pnpm smoke:api -- --base http://localhost:4322` → **검사 104건, 실패 0건.** 목록 수 `{"draft":2,"published":54,"hidden":0}`(초안 2는 기존 에세이 1편과 8절 6의 빈 시험 글). 스모크는 자기 시험 데이터를 지운다. 실행 뒤 `publishLog` 0, 새 자산 0, Storage `assets/` 0을 확인했다.

## 5. Plan과 다르게 하거나 Plan이 정하지 않은 것

PR-A에서 판단한 것:

1. **표 열 정렬은 셀 속성이다.** Plan D10은 표 노드에 `align[]`을 두라고 했다. Tiptap 3.33의 `TableCell`·`TableHeader`에 이미 `align` 속성(`text-align` 스타일)이 있어 그것을 쓴다. 열의 모든 셀이 같은 값을 갖고, 다시 쓸 때는 첫 행 셀의 값을 읽는다. Tiptap의 셀 메뉴와 렌더를 그대로 얻는다.
2. **lowlight 등록 언어는 `common` 묶음이다.** Plan D10은 "기존 12종 + 8종"을 등록하라고 했다. 공개 페이지의 rehype-highlight 기본값이 `common`이라 같은 묶음을 써야 결과가 같다. `common`에 그 20종 중 19종이 있다. `nasm`은 highlight.js common에 없어 공개 페이지도 지금 그리지 않는다. 드롭다운 목록(`CODE_LANGUAGES`)은 20종 그대로다.
3. **Code 마크가 다른 마크와 겹친다.** Tiptap 기본값은 인라인 코드가 모든 마크를 밀어낸다(`excludes: '_'`). 기존 글의 `**`코드`**`(굵게 안의 코드)가 스키마 검사에서 떨어진다. `excludes: 'code'`(자기만)로 바꿨다. 이를 위해 `@tiptap/extension-code`를 직접 의존성으로 더했다(3.33.0).
4. **밑줄 마크를 끈다.** StarterKit 3의 Underline은 마크다운에 대응이 없다. 켜 두면 저장할 때 사라지는 마크가 된다.
5. **정규화 규칙 6: `<br>` 바로 앞뒤의 공백을 지운다.** 줄 안 원시 `<br />` 9개(1.1)를 변환기는 `\`+줄바꿈으로 다시 쓴다. hast에서 `<br>다음`과 `<br>\n다음`이 된다. 브라우저는 줄 끝과 줄 처음의 공백을 그리지 않으므로 렌더는 같다. 규칙 1~5만으로는 이 9개가 모두 실패한다. Plan 부록 A에 적었다.
6. **단락 끝 하드 브레이크는 `<br>`로 쓴다.** `\`가 단락 마지막 줄 끝에 오면 CommonMark는 글자 `\`로 읽는다. 원시 HTML `<br>`은 공개 페이지(rehype-raw)와 미리보기가 같은 `<br>`로 그린다.
7. **마크 감싸기 순서.** 고정 순서(링크 > 굵게 > 기울임 > 취소선)로 감싸면 `_기울임 **안의 굵게**_`가 `<em>…</em><strong><em>…</em></strong>`으로 갈라진다. 각 위치에서 가장 길게 이어지는 마크를 먼저 감싼다. 길이가 같으면 링크 > 기울임 > 굵게 > 취소선이다. CommonMark가 `***x***`를 `<em><strong>x</strong></em>`으로 읽기 때문이다(기존 글 2편).
8. **왕복 스크립트 `--dump` 옵션.** B1 덤프로 Firestore 없이 반복할 수 있다. 기본은 `entries` 읽기 전용이다.
9. **빈 단락은 마크다운에 쓰지 않는다.** 에디터의 빈 단락(Enter 두 번)은 마크다운에 대응이 없다. 저장하면 사라지고, 다시 열면 없다.
10. **지원하지 않는 HTML 경고는 노드마다 하나다.** `<span>…</span>`은 여는 태그와 닫는 태그가 각각 경고다. 기존 글에는 0건이다.

리뷰(6.1) 뒤에 판단한 것:

11. **기울임은 `*`로 쓴다(Plan 4.2는 `_`).** 사용자가 이 상태로 PR-A 진행을 승인했다(2026-11-09). `_`는 단어 안에서 강조를 열고 닫지 못한다. 그래서 mdast-util-to-markdown은 `*기울임*도`처럼 한글 조사가 바로 붙는 자리에서 이웃 글자를 문자 참조로 바꾼다(`_기울&#xC784;_&#xB3C4;`). 렌더는 같지만 백업 저장소와 GitHub에서 읽을 수 없는 마크다운이 된다. 한글 글에서는 매우 흔한 모양이라 `*`로 바꿨다. 되돌리려면 `MARKDOWN_STRINGIFY_OPTIONS.emphasis` 한 줄이다.
12. **하드 브레이크·줄 안 `<br>`·인라인 수식이 바깥 마크를 물려받는다.** 물려받지 않으면 `**가<br>나**`의 굵게가 둘로 갈라진다(`<strong>가</strong><br><strong>나</strong>`). ProseMirror는 인라인 노드에 마크를 허용한다. 스키마 검사를 통과한다.
13. **제목 안과 표 셀 안의 하드 브레이크는 `<br>`로 쓴다.** ATX 제목과 표 셀은 한 줄이라 mdast-util-to-markdown이 `break`를 공백으로 바꾼다. 줄바꿈이 사라진다. 단락 끝(6번)과 같은 방식으로 `<br>`을 쓴다. 셀 안의 단락 여러 개도 `<br>`로 잇는다.
14. **임베드 주소가 날 주소로 다시 읽히지 않으면 `<주소>`로 쓴다.** GFM 자동 링크는 끝의 `_ * ~ . , : ; ! ?`를 링크에서 뺀다. YouTube 공유 주소의 `si=` 값은 `_`로 끝날 수 있다. 날 주소로 쓰면 다시 열 때 임베드가 조용히 사라진다. 쓰기 전에 주소 한 줄을 다시 읽어 같은 임베드가 되는지 확인한다.
15. **공유 파이프라인이 `javascript:`·`data:` 주소를 비운다.** react-markdown의 `defaultUrlTransform`과 같은 규칙(`http`·`https`·`mailto`·`tel`·상대 경로만)을 `a[href]`·`img[src]`에 적용한다. 4단계 공개 페이지가 이 함수를 쓰므로 PR-A에서 넣었다.
16. **ZWSP 바로 옆의 줄바꿈은 없앤다(공백이 아니다).** CSS Text 3의 segment break 변환 규칙으로 브라우저는 U+200B 옆의 줄바꿈을 지운다. 변환기와 정규화가 같은 함수(`removeZwspAndSoftBreaks`)를 쓴다. 기존 글에는 0건이다(4.2 집계).
17. **머리 행보다 많은 표 셀은 자른다.** 공개 페이지(mdast-util-to-hast)가 그렇게 그린다. 자르지 않으면 숨어 있던 셀이 보인다.
18. **모르는 마크는 오류다.** 모르는 노드와 같은 규칙이다. 스키마에 없는 마크(밑줄 등)가 들어오면 저장이 조용히 내용을 잃지 않고 멈춘다.
19. **항목 안에 단락이 연이어 둘이면 느슨한 목록으로 쓴다.** 마크다운은 단락 둘을 빈 줄로만 나눈다. 빈 줄이 있으면 remark는 느슨한 목록으로 읽는다. 처음부터 느슨하게 써야 다시 열었을 때 JSON(`spread`)이 같다. 단락 + 중첩 목록은 빽빽한 채로 둔다.
20. **마크 안의 앞뒤 공백은 마크 밖으로 민다.** ` 굵게 `에 굵게를 걸면 마크다운 `** 굵게 **`는 강조가 아니다. mdast-util-to-markdown은 `**&#x20;굵게&#x20;**`로 피한다. 공백을 밖으로 밀어 `**굵게**`로 쓴다(prosemirror-markdown 방식). 링크는 안에 공백이 있어도 되므로 그대로 둔다.
21. **`nasm`을 lowlight에 등록한다(`x86asm` 별칭).** Tiptap code-block-lowlight는 등록되지 않은 언어를 자동 추측으로 색칠해 공개 페이지(민무늬)와 달라진다. `highlight.js`를 직접 의존성으로 더했다(lowlight가 이미 쓰는 버전). 4단계 공개 파이프라인도 같은 등록을 쓴다.
22. **임베드 노드의 renderHTML은 판정 실패 주소를 링크가 아니라 글자로 그린다.** JSON이 바뀐 경우에만 닿는 자리지만 `javascript:`가 올 수 있다.
23. **왕복 스크립트에 판단용 집계와 `--out`을 더했다.** ZWSP만 있는 단락, ZWSP 옆 줄바꿈, 겹친 마크 순서 패턴, `<br`가 있는 표 행 수. `--out <폴더>`는 실패 글의 원문과 다시 쓴 마크다운을 파일로 쓴다.

PR-B에서 판단한 것:

24. **`posts/new.astro`의 새 흐름을 PR-B에서 만들었다(Plan 7절은 T7·PR-C).** 옛 `EditorPage`를 가져오는 마지막 파일이라, 옛 에디터를 지우면 빌드가 깨진다. 서버에서 `createEntry(kind)`를 부르고 `/admin/edit/{id}`로 302한다(D2 a의 설명 그대로). GET으로 문서를 만드는 점은 8절 3.
25. **브라우저용 주소 파서 `src/lib/asset-url.ts`를 뽑았다.** `asset-refs.ts`는 `node:crypto`를 가져와 브라우저 번들에 넣을 수 없다. URL → 경로 함수를 옮기고 `asset-refs.ts`가 다시 내보낸다. 서버 동작은 같다(기존 테스트 그대로 통과).
26. **`getAssetForAdmin`을 `admin-assets.ts`에 더했다.** 읽기만 한다. `GET /api/admin/assets/{id}`가 쓴다.
27. **업로드 상태 속성 3개(`uploadId`·`uploadProgress`·`uploadError`)는 스키마의 Image 노드에 있다(`rendered: false`).** 변환기는 `src`·`alt`·`title`만 읽어 마크다운에 나가지 않는다. editorJson에는 `null`로 남는다. 노드 뷰는 화면용 확장이 `extend`로 붙인다. 스키마 함수는 DOM 없이 돈다.
28. **변경 판정 기준은 열기 직후 `editor.getJSON()`의 `docToMarkdown` 결과다.** 서버 JSON이나 파싱 결과가 아니다. Tiptap이 `setContent` 때 속성 기본값과 끝 단락을 채우므로 그 뒤 값을 기준으로 삼아야 "고치지 않으면 쓰지 않음"이 정확하다. 메타는 키 순서를 고정한 JSON 비교다(태그 순서 포함). 저장 성공 때 기준을 보낸 값으로 바꾼다.
29. **소스 모드 저장은 `{ markdown: 텍스트, editorJson: null }`이다.** D5의 "doc에서 마크다운을 만들고 해시를 적는다"는 편집 모드 규칙이다. 소스 모드에 들어갈 때 텍스트는 저장 안 된 편집 변경이 없으면 서버 원문(기존 글의 원문 확인용), 있으면 `docToMarkdown`이다. 나올 때 글자를 고쳤으면 다시 파싱해 문서를 바꾼다. 고치지 않았으면 문서를 건드리지 않는다.
30. **자동저장 제어는 리듀서(표시)와 동기 ref(제어: dirty·halt·blockers·running) 이중이다.** React의 dispatch는 비동기라 타이머와 발행 전 flush가 최신 상태를 바로 읽어야 하기 때문이다. 리듀서는 단위 테스트, ref 흐름은 브라우저 확인(8.4 2·3·4·5).
31. **저장 실패(400·413·5xx)는 자동으로 다시 시도하지 않는다.** 상단 바에 빨간 문구와 "다시 시도". 오프라인은 `online` 이벤트로 자동 전송한다. 401은 보관함에 둔 뒤 로그인으로 보낸다(Plan 11절).
32. **⋯ 메뉴에 "테마 전환"을 뒀다(D13 메뉴 목록에는 없다).** 에디터 페이지에는 사이트 헤더(토글)가 없어 M10 확인(8.4 15)에 필요하다. 사이트와 같은 `theme` 저장 키를 쓴다.
33. **`@tiptap/extensions`의 Placeholder를 화면용 확장으로 더했다.** 빈 문서 안내 문구다. 스키마는 바꾸지 않는다. 그 밖 단축키·툴바는 Tiptap 기본값만 쓴다(레지스트리는 PR-C).
34. **발행 전에 저장을 끝낸다(`flushSave`).** 저장이 오류·오프라인·충돌이면 발행하지 않고 알린다. 422의 `markdown` 칸 이유는 본문 위에, 나머지는 메타 패널의 칸 아래에 붙인다. 발행 뒤 `GET`으로 상태만 다시 읽는다(본문은 그대로).
35. **초안 버리기는 `window.confirm` 한 번이다.** D13은 삭제만 2회 확인을 요구한다. 버린 뒤 `GET`으로 문서를 다시 연다(발행본 내용).
36. **메타 패널은 1024px 이상에서 기본으로 열리고, 그 아래에서는 오른쪽 시트다.** 모바일 툴바와 키보드 위 고정은 PR-C(D12).
37. **`.prose` CSS를 `editor.css`에 복사했다.** 공개 글 페이지의 규칙은 그 페이지의 `<style is:global>`에만 있어 에디터 페이지에는 적용되지 않는다. 콜아웃·임베드 CSS는 여기서 처음 정한다(공개 페이지는 4단계). 4단계에서 한 곳으로 합친다.
38. **미리보기는 `dangerouslySetInnerHTML`이다.** 공유 파이프라인이 `a`·`img`의 프로토콜만 거르고 rehype-raw가 원시 HTML을 통과시킨다. 공개 페이지(react-markdown + rehype-raw)와 같은 수준이다. 관리자 본인의 글만 그린다.
39. **에디터 청크는 1,711 KB(gzip 523 KB)다.** Plan 8.1대로 기록만 했다(4.4). 줄이는 방법은 8절 4.
40. **버킷 CORS 스크립트 `scripts/ops/bucket-cors.mjs`를 더했다.** 기본은 지금 값 출력(읽기만), `--apply`는 Plan 10절 값, `--reset`은 빈 배열(Plan 9.3). 설정 전 값을 작업 문서에 적기 위해서다.

리뷰(6.2) 뒤에 판단한 것:

41. **자동저장 제어를 `SaveController` 클래스로 옮겼다(Plan 4.1 파일 목록에 없음).** 리뷰가 찾은 중요 지적 5건(2a·5·6·7·8)이 모두 EditorApp의 ref 흐름에 있었고, 그 흐름에는 테스트가 없었다. 판단 30의 "리듀서(표시) + ref(제어)"는 그대로다. ref 묶음이 테스트할 수 있는 클래스가 됐다. 전송·보관함·타이머는 주입한다.
42. **공유 파이프라인에 원시 HTML 안전 처리를 넣었다(`rehype-strip-unsafe.ts`).** 판단 38의 "공개 페이지와 같은 수준"은 틀렸다. react-markdown은 문자열 이벤트 속성을 붙이지 않지만, 미리보기의 innerHTML은 `onerror` 등을 그대로 실행한다. rehype-raw 바로 뒤에서 실행·이동·입력 요소(script, style, form, object, embed, base, meta, svg 애니메이션 등), `on*`·`srcdoc`·`srcset` 속성을 지우고, 주소 속성에 `safeUrl`을 적용한다. iframe은 임베드 주소(`youtube-nocookie`·`codesandbox`의 `/embed/<id>`)만 남기고 속성을 다시 쓴다. KaTeX의 `style` 속성은 남긴다(뒤에서 돈다). 4단계 공개 페이지가 같은 함수를 쓰므로 같은 처리를 받는다. 새 의존성(rehype-sanitize)은 더하지 않았다.
43. **editorJson이 Firestore 깊이 한도(경로 21)를 넘으면 `null`로 보낸다.** 3단 중첩 목록 안의 굵게·링크가 22가 되어 저장이 500으로 실패했다(리뷰 치명 1). D5 형식(`{ v: 1, markdownSha256, doc }`)은 그대로 두고, 그 문서만 열 때 마크다운에서 다시 만든다(D5의 "없으면 파싱" 경로). 기존 56편 중 2편(`ECRs5B0Il2NjXGdMiLJD`, `uEzeUv5PomrpaH7RE4dv`)이 해당한다(읽기 전용 집계). `doc`을 JSON 문자열로 저장하는 v2 형식은 D5를 바꾸므로 하지 않았다(8절 7).
44. **업로드가 끝나지 않은 이미지는 세 겹으로 막는다.** (a) 업로드 중에는 소스 모드로 가지 않는다. (b) `countUploadingNodes`는 `uploadId`가 없어도 src가 `blob:`이면 센다(복사해 붙여넣은 자리표시). 노드 뷰는 그 노드에 "삭제" 버튼을 보인다. (c) 저장 본문에 `blob:http(s)://`가 있으면 보내지 않는다.
45. **업로드 결과를 `uploadId`별로 기억하고 `appendTransaction`으로 다시 적용한다.** 되돌리기 중에 업로드가 끝나고 다시 실행하면 노드가 영원히 "업로드 중"으로 남았다(리뷰 중요 3). 결과도 파일도 없는 노드는 "업로드 정보를 잃었습니다" 오류로 표시한다. "다시 시도"는 파일이 있을 때만 보인다.
46. **발행은 저장 결과가 `saved`·`unchanged`일 때만 한다.** 업로드 중(blocked), 메타 오류(invalid), 조합 중(skipped), 오류·오프라인·충돌이면 이유를 알리고 발행하지 않는다(리뷰 중요 5).
47. **저장 전에 서버 규칙(`draftInputSchema` + 태그 3개)으로 검사한다.** 틀리면 보내지 않고 칸 아래에 이유를 붙인다. 멈추지 않고 다음 변경에서 다시 본다(리뷰 중요 8). 표지 "이미지"를 골라도 올리기 전에는 메타를 바꾸지 않는다. 연재 key는 입력할 때 소문자로 바꾼다.
48. **영상 판정은 쿼리·해시를 뗀 경로의 확장자로 한다(`isVideoUrl`).** 새로 올린 영상의 Firebase 주소는 `…original.mp4?alt=media&token=…`라 `endsWith`로는 영상이 아니었다(리뷰 중요 10). 공개 페이지(`MarkdownPostView.tsx`)는 4단계까지 그대로라 같은 문제가 남는다(8절 8).
49. **저장에 성공하면 `hasUnpublishedChanges`를 참으로 바꾸고, 고친 칸의 발행 이유를 지운다.** 리뷰 경미 20.

브라우저 확인(4.5) 중에 판단한 것:

50. **E2 CORS origin에 `http://localhost:4322`를 더했다(Plan 10절은 4321만).** 사용자 결정(2026-11-09). 4321은 주 checkout(`~/projects/cruz-lab`)의 개발 서버가 쓰고 있었고, 그 서버는 멈추지 않았다. 그래서 이 worktree의 개발 서버가 4322에 떴다.
51. **이미지 노드 뷰의 클래스를 배열로 잇는다.** 리뷰 중요 9를 앞 공백으로 고쳤지만 `prettier-plugin-tailwindcss`가 템플릿 문자열 조각의 앞 공백을 다시 지웠다(처음 버그의 원인도 이것이다). 앞으로 조건부 클래스는 템플릿 문자열 조각에 공백을 두지 않는다.
52. **메타 시트와 덮개는 상단 바(48px) 아래에서 시작한다.** 1024px 아래에서 시트를 열면 덮개가 상단 바를 덮어 "발행"을 눌러도 시트만 닫혔다.
53. **연재 key 칸이 좁아지던 것을 고쳤다.** 입력 칸 공통 클래스의 `w-full`이 순서 칸의 `w-16`을 이겨 key 칸이 눌렸다. 폭을 뺀 공통 클래스(`fieldClass`)를 따로 둔다.
54. **이미지 대체 텍스트·캡션 칸은 값이 바뀔 때만 반영한다.** 기존 글의 이미지를 선택했다가 포커스를 옮겨도 문서를 건드리지 않는다(D1 b).

알려진 한계(고치지 않음):

- **겹친 마크의 바깥·안 순서.** ProseMirror 마크는 순서가 없다. `**[링크](u)**`와 `[**링크**](u)`, `**_x_**`와 `_**x**_`는 같은 문서가 된다. 변환기는 동률일 때 링크 > 기울임 > 굵게 > 취소선으로 쓴다. 기존 55편은 이 순서로 모두 통과했다(4.2 집계 2건 포함). 새로 쓰는 글에서는 저자가 순서를 고를 수 없고, 렌더 차이는 CSS(`prose a`·`strong` 굵기)에 달렸다.
- **섞인 체크 목록.** `- [ ] a
- b`는 모두 체크 항목이 된다. 기존 글에는 체크 항목이 0건이다.
- **콜아웃 표시의 대소문자.** `[!Note]`는 `[!note]`로 다시 쓰인다. 비교 파서에는 콜아웃 플러그인이 없어 왕복 검사에서는 다르게 보인다(가짜 실패). 기존 글에는 없다.
- **지원하지 않는 HTML 블록이 다음 줄을 삼킨 경우.** CommonMark HTML 블록(7형)은 빈 줄까지 이어진다. `<br />` 바로 다음 줄에 글이 붙어 있으면 그 글까지 경고 대상이 된다. 기존 글 59개 `<br>`는 모두 홀로 있다(왕복 경고 0건이 근거).
- **(PR-B) 소스 모드를 떠나는 시점에 따라 표기가 다르다.** 소스에서 고친 글자가 저장된 뒤(또는 저장 중) 편집 모드로 오면 소스 원문을 유지한다. 저장 예약만 있고 아직 보내지 않았으면 편집 모드 표기(정규화)로 저장한다. 렌더는 같다(리뷰 경미 17).
- **(PR-B) 오피스 앱에서 복사하면 텍스트 대신 이미지가 올라갈 수 있다.** 클립보드에 HTML과 PNG가 같이 오면 파일을 우선한다(리뷰 경미 21, 추측). 써 보고 바꾼다.
- **(PR-B) 대화상자에 포커스 가두기가 없다.** Esc로 닫는 것만 있다(리뷰 경미 22). 5단계 관리자 앱의 공통 대화상자에서 다룬다.

## 6. 리뷰 결과

### 6.1 PR-A

새 리뷰어(별도 에이전트, 읽기 전용)가 커밋 전 작업 트리를 검토했다. 의심 입력 60여 건을 직접 돌려 봤다. 치명 0, 중요 7, 경미 11건이었다. 효과 기준으로 다시 나눠 고쳤다. 각 수정은 실패하는 테스트를 먼저 썼다(13개).

| 지적 | 처리 |
|---|---|
| 중요 1: 하드 브레이크·`<br>`·인라인 수식이 바깥 마크를 버려 `**가<br>나**`의 굵게가 갈라진다 | 고침(5절 12) |
| 중요 2: 표 셀·제목 안 하드 브레이크가 공백이 된다 | 고침(5절 13) |
| 중요 3: 겹친 마크의 바깥·안 순서를 복원하지 못한다 | 변환기로 못 고친다(ProseMirror 모델). 실데이터 집계 2건 모두 통과. 알려진 한계로 기록 |
| 중요 4: 끝이 `_`인 임베드 주소가 다시 열 때 사라진다 | 고침(5절 14) |
| 중요 5: `emphasis: '_'`가 한글 조사 앞에서 문자 참조를 만든다 | `*`로 바꿈. 사용자가 이 상태로 진행을 승인(5절 11) |
| 중요 6: 공유 파이프라인에 URL 프로토콜 필터가 없다 | 고침(5절 15) |
| 중요 7a: ZWSP만 있는 단락이 사라진다 | 실데이터 0건. 조치 없음(집계 추가) |
| 중요 7b: ZWSP 옆 줄바꿈을 공백으로 바꾼다(브라우저는 지운다) | 고침(5절 16). 실데이터 0건 |
| 경미 8: 머리 행보다 많은 셀이 보인다 | 고침(5절 17) |
| 경미 9: 섞인 체크 목록 | 알려진 한계 |
| 경미 10: 콜아웃 대소문자 가짜 실패 | 알려진 한계 |
| 경미 11: 지원하지 않는 HTML 블록의 2회 왕복 불안정 | 경고로 이미 실패하므로 두었다. 알려진 한계 |
| 경미 12: 모르는 마크를 조용히 버린다 | 고침(5절 18) |
| 경미 13: 빽빽한 목록 + 단락 둘 → 다시 열면 `spread` 달라짐 | 고침(5절 19) |
| 경미 14: `nasm` 미등록 → 에디터가 자동 추측 색칠 | 고침(5절 21) |
| 경미 15: 임베드 판정 실패 주소를 `<a href>`로 그림 | 고침(5절 22) |
| 경미 16: Plan D3 목록 밖 경로(`youtube.com/embed/`, `/live/`, `codesandbox.io/p/<x>`)를 받음 | 같은 호스트라 위험 없음. 그대로 두고 기록 |
| 경미 17: 스크립트 집계·`--out`·kind/status 열 | 고침(5절 23) |
| 경미 18: 테스트 빈틈 | 위 수정의 테스트 13개와 detectEmbed 적대 입력 테스트를 더했다 |

리뷰어가 확인한 것: detectEmbed는 userinfo·`#@`·하위 도메인 위장·유니코드 호스트·`..` 경로에 모두 null이고 iframe src는 허용 호스트 2개를 벗어날 수 없다. 스크립트는 Firestore를 읽기만 한다. 결정 1·2·4·5·6·8은 타당하고 3은 기존 글 때문에 필요하다.

### 6.2 PR-B

새 리뷰어(별도 에이전트, 읽기 전용, 2026-11-09)가 커밋 전 작업 트리를 검토했다. 첫 실행은 사용량 한도로 멈췄고 다시 실행했다. 헤드리스 Tiptap 에디터와 Firestore SDK 코드로 재현했다. 치명 1, 중요 10, 경미 11건이었다. 치명·중요는 모두 실패하는 테스트를 먼저 쓰고 고쳤다(52개).

| 지적 | 처리 |
|---|---|
| 치명 1: 3단 중첩 목록 + 굵게·링크면 editorJson이 Firestore 깊이 20을 넘어 저장이 항상 500 | 고침(5절 43). 기존 글 2편 해당 |
| 중요 2: `blob:` 주소가 저장된다(업로드 중 소스 모드, 복사·붙여넣기) | 고침(5절 44) |
| 중요 3: 되돌리기 중 업로드가 끝나고 다시 실행하면 영구 "업로드 중" 노드 | 고침(5절 45) |
| 중요 4: `insertImageFiles`·`retryImageUpload` 명령이 `RangeError: mismatched transaction` | 고침. 명령은 받은 `tr`에 쌓는다 |
| 중요 5: 업로드 중에 발행하면 마지막 변경 없이 발행 | 고침(5절 46) |
| 중요 6: "내 것으로 덮기"가 내용이 기준과 같으면 아무것도 보내지 않아 남의 내용을 발행할 수 있다 | 고침. 덮기는 비교 없이 보낸다(`force`) |
| 중요 7: 오프라인 뒤 입력은 보관하지 않는다 | 고침. 오프라인이면 2초마다 기기에 보관한다(전송은 온라인에서) |
| 중요 8: 표지 "이미지" 선택·연재 key 대문자로 400 → 저장이 멈춘다 | 고침(5절 47) |
| 중요 9: 이미지 노드 뷰 class가 `editor-imageis-selected`로 붙는다 | 고침(앞 공백) |
| 중요 10: 새로 올린 영상(쿼리 붙은 주소)이 `<img>`로 그려진다 | 고침(5절 48). 공개 페이지는 8절 8 |
| 중요 11: 미리보기가 원시 HTML의 `onerror` 등을 실행한다 | 고침(5절 42) |
| 경미 12: `/admin/posts/new` GET 생성, 옛 화면의 깨진 링크 | PR-C(T7). 8절 3에 실제 발생 사례를 더했다 |
| 경미 13: 401 뒤 beforeunload 경고와 "저장 중" 고착 | 고침(컨트롤러가 떠나는 상태로 바꾼다) |
| 경미 14: `changed`가 키 입력마다 새 객체 → 전체 다시 그리기, Toast 타이머 초기화 | 고침(같은 객체, `closeToast` 고정) |
| 경미 15: 실패한 업로드도 "업로드 중" 문구, blockers 갱신 누락 | 고침(문구 "업로드가 끝나지 않은 이미지", `setBlockers`로 일원화) |
| 경미 16: 초안 버리기·덮기 뒤 보관 칸이 남는다 | 고침(초안 버리기 `clearOffline`, unchanged 때 보관 칸 삭제) |
| 경미 17: 소스 모드 저장 시점에 따라 표기가 다르다 | 저장 중에는 끝난 뒤 비교하도록 고쳤다. 예약만 있는 경우는 알려진 한계 |
| 경미 18: 두 번째 `setContent` 실패를 무시 | 고침(실패하면 오류로 멈추고, 소스 모드에서는 소스에 머문다) |
| 경미 19: 200인데 본문이 JSON이 아니면 기준이 먼저 바뀐다 | 고침(버전 확인 뒤 기준을 바꾼다) |
| 경미 20: 저장 뒤 `hasUnpublishedChanges` 갱신 없음, 422 이유가 남는다 | 고침(5절 49) |
| 경미 21: 오피스 앱 복사 시 이미지 우선(추측) | 알려진 한계 |
| 경미 22: 제목 높이, 복사 실패 무음, 대화상자 포커스 | 제목 높이·복사 실패 문구는 고침. 포커스 가두기는 알려진 한계 |

리뷰어가 확인한 것: 열 때 `setContent(emitUpdate: false)` 안의 trailingNode·fixTables·autolink 트랜잭션은 update를 내지 않는다(헤드리스 재현). 모드 전환과 메타 패널만으로 저장하지 않는다. API 본문·409·422 해석이 서버와 맞다. 자산 GET은 미들웨어와 `withAdminApi`를 거치고 no-store다. XHR PUT은 `Content-Type`만 보내고 쿠키를 보내지 않는다. cdn-purge는 D7과 같다.

## 7. 다음 작업

1. ~~[PR #9](https://github.com/crucial-sub/cruz-lab/pull/9) 병합~~ 끝(2026-11-09, `4010bd0`). `stage3/b-editor`의 기준을 `4010bd0`으로 옮겼다.
2. PR-B 마무리: 리뷰·수정, 브라우저 시나리오 15개, E2, API 스모크, 시험 데이터 0, PR #9 병합 뒤 기준 이동(`4010bd0`)까지 끝났다(2026-11-09). 커밋 `dfe1220`(코드)·`2df00d6`(문서), 푸시, [PR #10](https://github.com/crucial-sub/cruz-lab/pull/10)(대상 `rebuild`)까지 했다. 남은 것: PR #10 병합(사용자 확인).
3. PR-C: T5 명령 레지스트리·키맵·슬래시·팔레트·툴바·모바일·개요, T7 최소 목록·옛 화면 삭제·`tsc` 재집계. T9 미리보기 확인(8.5, D7 헤더). 브랜치 `stage3/c-commands`.
4. 문서 PR: 이 문서 마무리, 진행 기록 11.7, Plan 14절 드래그 핸들 상기.

## 8. 열린 질문

1. ~~PR-B는 PR-A가 `rebuild`에 병합된 뒤 `rebuild`에서 가지를 치는가, 아니면 `stage3/a-markdown` 위에 쌓는가.~~ 닫음: PR-A 병합 뒤 `rebuild`로 리베이스한다. PR-B 세션 시작 때(2026-11-09) PR #9가 아직 열려 있어 `stage3/a-markdown`(`13a0825`) 위에서 시작했다. 사용자 답으로 PR #9를 병합했다(merge commit `4010bd0`). `4010bd0`의 트리가 `13a0825`와 같아(파일 차이 0) 커밋 전 작업 트리를 그대로 두고 기준만 `4010bd0`으로 옮겼다. PR-B의 PR 대상은 `rebuild`다.
2. ~~기울임 표기를 Plan 4.2의 `_`가 아니라 `*`로 쓰는 것(5절 11).~~ 사용자가 이 상태로 진행을 승인했다(2026-11-09).
3. `/admin/posts/new`는 GET으로 빈 초안을 만든다(D2 a 설명 그대로). 세션 쿠키가 `SameSite=Lax`라 다른 사이트의 링크를 눌러도 쿠키가 붙어 빈 초안이 생길 수 있다(내용은 비어 있고 지우면 된다). 옛 대시보드의 "새 글" 링크도 이 주소다. 실제로 2026-11-09 브라우저 확인 중 빈 글 1편이 생겼다(6절). PR-C의 T7이 최소 목록을 만들 때 POST 폼으로 바꿀지 정한다.
4. 에디터 청크 1,711 KB(gzip 523 KB). lowlight `common`을 쓰는 언어만 동적으로 가져오거나 KaTeX를 수식이 있을 때만 가져오면 줄 수 있다. 관리자만 쓰는 페이지라 급하지 않다. 5단계 Plan에서 다시 본다.
5. 저장 실패 상태(`error`)에서는 새 입력이 상태를 바꾸지 않는다(멈춘 채 "다시 시도"를 기다린다). 입력을 계속하면 내용은 에디터에 있고, 다시 시도하면 최신 내용을 보낸다. 사용자가 써 보고 자동 재시도가 더 나으면 바꾼다. 메타 검사 실패와 blob 주소는 멈추지 않는다(다음 입력에서 다시 본다).
6. ~~브라우저 확인 중 생긴 빈 시험 글 `qoRxy9TjMCrBmNAWuw1c`~~ 이 글을 시나리오 3~13의 시험 글로 쓰고 지웠다. 왕복 검사는 다시 55/55다.
7. editorJson 깊이 한도. 지금은 한도를 넘는 문서만 editorJson 없이 저장한다(5절 43). 중첩이 깊은 글이 늘어 JSON을 먼저 여는 이점(D5)이 중요해지면 `doc`을 JSON 문자열로 두는 v2 형식을 검토한다(D5 변경, 사용자 결정).
8. 공개 페이지 `MarkdownPostView.tsx`의 영상 판정은 `endsWith`라 쿼리 붙은 영상 주소를 `<img>`로 그린다. 3단계는 공개 렌더를 바꾸지 않는다. 4단계에서 공유 파이프라인으로 바꾸면 함께 고쳐진다. 그 전에 새 영상을 올려 발행하면 `rebuild` 미리보기의 공개 페이지에서 깨져 보인다. 같은 이유로 공개 페이지는 원시 HTML의 iframe을 그대로 그린다(미리보기는 지운다, 5절 42).
9. 단락 앞뒤의 공백이 `&#x20;`로 저장된다. 입력 중 자동저장 때 단락 끝에 공백이 있으면(낱말 뒤 스페이스) 변환기가 공백을 문자 참조로 쓴다(PR-A 변환기, mdast-util-to-markdown 규칙). 렌더는 같지만 백업 저장소에서 읽기 불편하다. 단락 끝 공백을 지우면 렌더가 같으므로 변환기에서 지울지 PR-C 또는 문서 PR에서 정한다.
10. 초안 버리기 뒤에도 `hasUnpublishedChanges`가 참이다. 서버는 버전으로 판정한다(`draft.version != published.fromDraftVersion`, 2단계 D4). 초안 버리기는 버전을 올리므로 내용이 발행본과 같아도 "발행 뒤 변경 있음"이 보인다. 2단계 API 정의라 3단계에서는 바꾸지 않는다. 5단계 목록 설계 때 다시 본다.
