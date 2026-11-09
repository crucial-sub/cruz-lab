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
| PR-C (T5 명령·키맵·슬래시·팔레트·툴바·입력 규칙·임베드·수식·모바일·개요, T7 최소 목록·301·옛 화면 삭제) | 구현·검증·리뷰 끝(2026-11-09). 브랜치 `stage3/c-commands`(`origin/rebuild` `03698b5` = PR #10 병합 커밋에서 생성). 테스트 398(+108), `tsc` 9 → **1**(TextReveal만), lint·빌드 통과, 왕복 55/55, API 스모크 104/104. 리뷰(6.3) 치명 0·중요 4·경미 11을 고쳤다(중요 4는 사용자 결정). 브라우저 시나리오 7·14·17·18 통과(4.6), 미리보기 확인 8.5 끝(4.7). 시험 데이터 0. 커밋은 사용자 확인 뒤 |
| T9 (E2 버킷 CORS, 브라우저 확인, 미리보기 확인) | 모두 끝. E2는 PR-B(3절). 시나리오 19개 중 15개는 PR-B(4.5), 7·14·17·18은 PR-C(4.6). 미리보기 확인 8.5는 PR-C(4.7) |
| 외부 변경 | E2 버킷 CORS(2026-11-09 08:07 KST 무렵, 사용자 승인). Plan 값에 `http://localhost:4322`를 더했다(3절) |
| 운영 데이터 | 기존 글은 읽기만 했다. PR-B: 시험 글 2편·시험 자산 2개·publishLog 6줄을 만들었다가 모두 지웠다(4.5). PR-C: 시험 글 3편(localhost 2, 미리보기 1)·시험 자산 1개·publishLog 5줄을 만들었다가 모두 지웠다(4.6·4.7). 끝 상태: `entries` 55, `publishLog` 0, `entryTombstones` 0, `assets` 130(기존 그대로), Storage `assets/` 0 |

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

`src/lib/server/cdn-purge.ts`: `post-<id>`는 `dangerouslyDeleteByTag`, `posts`는 `invalidateByTag`(D7). 로컬은 `skipped` 그대로. 단위 테스트(`cdn-purge.test.ts`)가 `@vercel/functions`를 가짜로 바꿔 두 호출을 확인한다. 미리보기 확인(8.5)은 4.7.

### 2.7 T5: 명령, 입력 규칙, 임베드·수식 입력, 모바일, 개요 (PR-C)

| 파일 | 내용 |
|---|---|
| `src/editor/commands/registry.ts` | 명령 41개(`createCommands(actions)`). D9 인터페이스 + `scope`(editor·page)·`isAvailable`·`inToolbar`(5절 55). 키 문자열은 이 파일에만 있다(부록 B). 화면 동작(이미지 고르기, 링크·수식 창, 모드, 저장, 발행, 패널, 팔레트)은 주입한 `actions`가 한다 |
| `src/editor/commands/keymap.ts` | 순수 함수: `detectPlatform`, `normalizeKey`(표준 형태), `formatKey`(`⌘⇧2` / `Ctrl+Shift+2`), `applyKeymapOverrides`, `findKeyConflicts`, `usesModAlt`, `shortcutEntries`. `overrides`는 3단계에서 빈 객체다 |
| `src/editor/commands/filter.ts` | 순수 함수: `filterCommands`(제목·id, 공백·`-` 무시, 시작 > 포함, 최근 사용 순), `recordRecent`·`readRecent`·`writeRecent`(`localStorage` `cruz-lab:editor-recent`) |
| `src/editor/commands/shortcuts.ts` | `stripCommandKeys`(Tiptap 확장의 명령 키 제거, 구조 키는 유지, 스키마 불변), `RegistryShortcuts`(에디터 범위 키 → `addKeyboardShortcuts`), `createPageKeyHandler`·`createPageKeyListener`(페이지 범위 키 → 창 `keydown`, prosemirror `keydownHandler` 재사용, 조합 중·처리됨·자동 반복 무시) |
| `src/editor/commands/slash.ts`, `SlashMenu.tsx`, `CommandList.tsx`, `CommandPalette.tsx` | 슬래시 메뉴(`@tiptap/suggestion` + `ReactRenderer`. 코드 안 금지, `isAvailable` 거름, 최대 12개), 공용 목록(아이콘·이름·키 표기), 팔레트(`Mod+K`. 편집 모드면 그 자리에서 쓸 수 있는 명령, 아니면 페이지 범위만) |
| `src/editor/extensions/input-rules.ts` | 더한 입력 규칙: 인용 첫 줄 `[!note] `(tip·warning) → 콜아웃, 글머리 항목 첫머리 `[ ] `·`[x] ` → 그 항목만 체크 목록, 빈 단락 `$$`+공백·Enter → 수식 입력 창. 임베드: 빈 단락에 지원 주소 붙여넣기, 지원 주소만 있는 단락 끝 Enter → 임베드 노드(`embedOfTextblock`, `embedPasteTransaction`). DOM 없이 돈다 |
| `src/editor/state/summary.ts` | 순수 함수: `extractOutline`(문서 순서, 중첩 포함), `countCharacters`(코드 포인트), `summarizeDoc`(읽기 시간은 서버와 같은 `calculateReadingTime`) |
| `src/editor/ui/Toolbar.tsx` | 데스크톱(768px 이상) 툴바. block·mark·insert 묶음, 묶음 사이 구분선, `isAvailable`로 숨김(표 명령은 표 안에서만), `useEditorState` 문자열 선택자로 활성 표시 |
| `src/editor/ui/MobileBar.tsx` | 768px 미만, 에디터 포커스 중 키보드 위 고정(D12 7버튼: 굵게·제목 순환·목록·인용·이미지·되돌리기·메타). `window.visualViewport`의 `height`·`offsetTop`. `keyboardInset` 순수 함수 |
| `src/editor/ui/Outline.tsx` | 개요(제목 트리, 누르면 이동)·글자 수(공백 포함·제외)·읽기 시간. 메타 패널 아래 |
| `src/editor/ui/CodeBlockView.tsx` | 코드 블록 노드 뷰: 언어 `select`(`CODE_LANGUAGES` 20종 + 모르는 기존 값 유지) |
| `src/editor/ui/EmbedNodeView.tsx` | 임베드 노드 뷰: 제공자·주소·삭제 줄 + 16:9 iframe(`detectEmbed` 주소만, sandbox·referrerpolicy). 선택 전에는 투명 막(누르면 선택) |
| `src/editor/ui/Dialogs.tsx` | `LinkDialog`(주소. 비우면 풀기. `safeUrl` 검사), `MathDialog`(LaTeX textarea + KaTeX 미리보기. Mod+Enter 저장. 기존 노드는 삭제 버튼) |
| `src/editor/ui/EditorApp.tsx` | 레지스트리 생성·`runCommand`(최근 사용 기록), 페이지 키 리스너, 요약 300ms 디바운스(편집·소스 모두), 링크·수식 저장(수식은 `pos` 검증), 이미지 고르기(`<input type=file>`), 개요 이동, 팔레트·모바일 바·툴바 연결, 발행 재진입 방지 |
| `src/editor/ui/editor-extensions.ts` | 화면용 묶음: 스키마의 image·codeBlock·embed·Mathematics를 같은 자리에서 노드 뷰·클릭 편집 판으로 바꿔 끼우고(`stripCommandKeys` 적용), 업로드·입력 규칙·단축키·슬래시·Placeholder를 더한다. 스키마는 같다(테스트로 고정) |
| `src/editor/ui/TopBar.tsx`, `MetaPanel.tsx` | ⋯ 메뉴에 "명령 팔레트". 640px 미만에서는 발행 버튼이 메타 시트 맨 위(D12). 패널 아래 개요 |
| `src/editor/ui/class-names.ts` | `classNames`(조건부 클래스. 5절 51의 규칙을 공용 함수로) |
| `src/editor/editor.css` | 코드 블록 언어 select, 임베드 노드 뷰 |
| `tests/unit/editor-{keymap,command-filter,summary,commands,shortcuts,input-rules}.test.ts`, `tests/unit/helpers/headless-editor.ts` | 108개. 헤드리스 도우미: `makeHeadlessEditor`(DOM 없음 + 상태 플러그인), `typeText`(입력 규칙 플러그인의 `handleTextInput` 직접 호출), `pressKey`(가짜 keydown을 플러그인 순서대로) |

### 2.8 T7: 최소 목록, 옛 주소 301, 삭제 (PR-C)

| 파일 | 내용 |
|---|---|
| `src/layouts/AdminPage.astro` | 관리자 화면 공통 틀(전체 화면, `global.css`, 테마 초기화, noindex). 최소 목록과 에디터 페이지가 쓴다 |
| `src/pages/admin/index.astro` | 최소 목록(D2 a). 서버 렌더, React 없음. 상태 탭(`?status=`)과 수, 제목·종류·상태·발행 뒤 변경·수정일(서울 시각), 에디터 링크. "새 글"·"새 노트"는 **POST 폼**(5절 68). 로그아웃은 `DELETE /api/admin/session` |
| `src/pages/admin/posts/new.astro` | POST만 받는다. GET은 `/admin`으로 302. Origin 검사(403). `createEntry(kind)` → 303 |
| `src/pages/admin/posts/index.astro`, `src/pages/admin/edit/index.astro` | 옛 주소 `/admin/posts`, `/admin/edit?slug=` → `/admin` 301 |
| 지움(2,468줄) | `src/components/admin/{PostList,AdminDashboard,AdminLayout,AdminGuard}.tsx`, `src/hooks/useAdminAuth.ts`, `src/lib/{markdown-publish,editor-drafts,publish-status,publish-verification,publish-feedback}.ts`, `docs/cms-rebuild-tracker.md`, `docs/editor-engine-evaluation.md`, `scripts/evaluate-markdown-pipeline.mjs`, `fixtures/editor-roundtrip-stress.md`. 지우기 전 grep: 서로끼리와 `README.md`(5절 72)만 참조했다 |
| 의존성 | 지움: `@codemirror/*` 4개, `@lezer/highlight`, `@uiw/react-codemirror`, `browser-image-compression`, `remark-breaks`, 스크립트 `editor:evaluate`. 더한 것 없음 |
| `tsc --noEmit` | 9 → 1(`TextReveal`, 4단계에서 지운다) |

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

PR-C(2026-11-09): `pnpm lint` 통과. `pnpm test` **398**(+108: 순수 함수 30, 레지스트리·단축키·입력 규칙 61, 리뷰 수정 17). `tsc --noEmit` **1**(`TextReveal`만. Plan 8.1의 기준 9 → 1). `pnpm build` 통과. 에디터 청크 `EditorApp` **1,795,133바이트(gzip 547,952)**(4.4). 왕복 검사 55/55(구현 뒤, 시험 데이터 정리 뒤). API 스모크 104/104(4.3).

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

PR-C(2026-11-09). `origin/rebuild`(`03698b5`)와 PR-C를 같은 방법으로 빌드해 비교했다.

| 구분 | 결과 |
|---|---|
| 공개 페이지 청크(BlogCard, BlogPostList, InteractiveHero, ProjectCard, ScrollProgress, SkillsSection, TextReveal, ThemeToggle, TiltCard, proxy, use-spring, index, ContactSection)와 공유 React 런타임 `client`(175,550바이트) | 크기 모두 같다 |
| 에디터 청크 `EditorApp` | 1,720,672 → **1,795,133바이트**(gzip 547,952). +73 KB: 명령·메뉴·팔레트·대화상자·lucide 아이콘 41개·`@tiptap/suggestion` |
| 지워진 청크 | `AdminDashboard`(11,163), `AdminLayout`(5,272), `PostList`(14,493) |
| `AdminLogin` | 1,836 → 158,401. 지운 화면이 함께 쓰던 `firebase-auth-client` 청크(157,765)가 유일한 사용자인 로그인 섬에 합쳐졌다. 합계는 같다. 로그인 페이지만 내려받는다 |

### 4.6 브라우저 확인 (PR-C, localhost:4323, 사용자 로그인)

시험 글 2편(`xN7EurdVHSPmY2HY7xqG`, `0AV4axjDpz2XkIj6Zt0u`)을 "새 글" POST 폼으로 만들어 썼다. 기존 글은 열기만 했다. 둘 다 끝에 지웠다.

| # | 시나리오 | 결과 |
|---|---|---|
| 1·2 (다시) | 기존 글 「큐」 열기 → 팔레트 열고 닫기, 개요 이동, 390px 전환 → 4초 이상 | 통과. `draft.version` 1, `updatedAt` 2026-03-31T11:47:11.502Z 그대로(API와 Admin SDK로 전후 확인). 툴바 19개, 코드 블록 언어 select 2개(`python`), 개요 6개 이상, "글자 4,826자 · 공백 제외 3,637자 · 6분 읽기" |
| 7 | 입력 규칙 `## `, `> `, ```` ```js ````, `- [ ] `, 슬래시 `/콜아웃`, 한글 문장 + `**굵게**`, `$$ ` | 통과. 저장된 마크다운: `## 제목 시험` / `> 인용 한 줄` / ```` ```js\nconst a = 1\n``` ```` / `- [ ] 할 일` / `> [!note]\n> 메모 글` / `한글 문장과 **굵게** 조사를 붙여` / `$$\nx^2\n$$`. 방법은 아래 참고 |
| 7 | `Mod+K` 팔레트, `Mod+Shift+2`(맥 키 결정 전 ⌘⇧2), 슬래시 `/표` | 통과. 팔레트 31개(키 표기 `⌘⇧2`…), Esc로 닫힘. ⌘⇧2 → 제목 2. `/표` → 메뉴 1개 → Enter → 머리 행 있는 3×3 표, `/표` 글자 삭제 |
| 17 | 빈 단락에 YouTube 주소 붙여넣기, 다른 사이트 주소 붙여넣기, CodeSandbox 주소 입력 뒤 Enter | 통과. YouTube → 임베드 노드(iframe `youtube-nocookie.com/embed/dQw4w9WgXcQ`), `example.com` → 링크 그대로, CodeSandbox → 임베드(`codesandbox.io/embed/abc123`). 저장된 마크다운 `https://youtu.be/…` / `<https://example.com/a>` / `https://codesandbox.io/s/abc123`(주소 한 줄씩). 미리보기도 iframe 2개 |
| 18 | 툴바 "수식 블록" → 창에 `E = mc^2` 저장 | 통과. 창 안 KaTeX 미리보기, 편집 영역 `[data-type=block-math] .katex`, 저장 `$$\nE = mc^2\n$$`, 미리보기 `.katex` 2개, 소스 모드에 `$$`, 새로고침 뒤 같음. 수식을 누르면 창에 `E = mc^2`와 삭제 버튼 |
| 14 | 390×844 | 통과. 상단 바 발행 버튼 숨김, 툴바 숨김, 포커스하면 모바일 바(굵게·제목 바꾸기·글머리 목록·인용·이미지·되돌리기·메타 패널, 화면 아래 0px), 메타 시트 맨 위에 발행 버튼. 글자 입력 → "저장됨" v6 |
| 13 (다시) | 삭제 | 통과. ⋯ → 삭제 → "삭제" → "정말 삭제" → `/admin`, API 404 |
| T7 | 최소 목록, 옛 주소 | 통과. `/admin` 탭 "전체 55 · 초안 1 · 발행됨 54 · 숨김 0", 55행. 로그인 없이 `/admin/posts`·`/admin/edit?slug=`·`/admin/posts/new`는 미들웨어가 먼저 302 로그인. 로그인 뒤 `/admin/posts` → `/admin`. 새 글 폼 `method=post`, 쿠키 없는 POST는 302 로그인 |

참고:

- **시나리오 7의 입력 방법.** 앱 브라우저 도구의 `type`은 입력 규칙을 일으키지 않는다(공유 노트). 사용자 키보드 입력은 두 번 시도했지만 글자가 시험 글에 들어오지 않았다(원인 모름. 패널 포커스로 추정). 대신 페이지 안에서 `document.execCommand('insertText', false, 글자)`를 한 글자씩 불렀다. 이 경로는 실제 DOM 변경 → ProseMirror `DOMObserver` → `handleTextInput`으로 들어가, 브라우저에서 키를 칠 때와 같은 입력 규칙 코드가 돈다. Enter·⌘↩·⌘⇧2·⌘K는 실제 키 이벤트(`key` 도구)다. 한글은 완성 글자로 넣었다. IME 조합 중 동작은 헤드리스·코드 검토로만 확인했다(리뷰 6.3 "확인한 것").
- 임베드·이미지 드롭은 PR-B와 같이 합성 이벤트(`ClipboardEvent`, `DragEvent` + `DataTransfer`)다.

### 4.7 `rebuild` 미리보기 확인 (8.5, 2026-11-09, 사용자 승인·로그인)

미리보기 주소 `cruz-lab-git-rebuild-crucialsubs-projects.vercel.app`(PR-B 코드, `03698b5`). 시험 글 `SbOBchxXpumSI4aSCtSd`(slug `prc-preview-check-20261109`).

| 단계 | 결과 |
|---|---|
| 1. 새 글 → 본문 → 이미지 1장 드롭 → 발행 | 통과. 미리보기 origin에서 Storage PUT → finalize까지 됐다(E2 CORS). 자산 `4z00qUwzEGucI6AAXNKd`(w480·w960·w1200). 발행 토스트 "발행됨 · 공개 페이지 보기" |
| 2. 글 주소 첫 요청 | `x-vercel-cache: MISS`, 새 내용(제목·본문·이미지). 두 번째 `HIT`. `/blog` 첫 `MISS`(이 edge에 캐시가 없었다) → 두 번째 `HIT`, 새 글 제목 있음 |
| 3. 본문 수정 → 다시 발행 → 글 주소 첫 요청 | **`x-vercel-cache: REVALIDATED`**, 새 내용(수정한 문장 있음). 두 번째 `HIT`. `/blog`는 `STALE`(D7대로 `invalidateByTag`) |
| 4. 삭제 → 남은 데이터 | 삭제 2회 확인 → `/admin`. API 404, 공개 주소 404. publishLog 3줄(publish 2·delete 1)과 고아 자산 1개(문서 + Storage 파일 3개)를 Admin SDK로 지웠다(지정한 ID만). 백업 커밋은 Plan 8.5대로 다음 예약 실행이 정리한다 |

D7의 목표("발행 직후 글 주소 첫 요청이 새 내용")는 맞다. 다만 Plan 8.5 2가 예상한 헤더 값 `MISS`와 달리, 기존 캐시가 있던 주소의 재발행 뒤 첫 요청은 `REVALIDATED`였다(8절 12).

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

PR-C(2026-11-09 15:49 KST, 사용자 승인): `pnpm smoke:api -- --base http://localhost:4323` → **검사 104건, 실패 0건**(실행 ID 20261109064917). 목록 수 `{"draft":2,"published":54,"hidden":0}`(초안 2는 기존 에세이 1편과 4.6의 시험 글). PR-C는 API를 바꾸지 않는다. 개발 서버는 4323이다(4321·4322는 다른 checkout의 서버가 쓰고 있었다).

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

PR-C에서 판단한 것:

55. **D9 인터페이스에 세 칸을 더했다.** `scope`(`editor` | `page`): 페이지 범위 명령(저장·발행·모드·패널·팔레트)은 에디터 밖(소스·미리보기 모드, 제목 칸)에서도 키가 돌아야 한다. `isAvailable`: 그 자리에서 쓸 수 있는지(표 명령은 표 안에서만, 넣기 명령은 코드 블록·표 셀 밖에서만). 슬래시·팔레트·툴바가 같은 판정으로 거른다. `inToolbar`: 툴바에 그릴지(기본은 block·mark·insert 전부. 단락·제목 순환·콜아웃 팁·주의는 뺀다).
56. **키는 두 길로 받는다.** 에디터 범위는 Tiptap `addKeyboardShortcuts`(`RegistryShortcuts`, 우선순위 200), 페이지 범위는 창 `keydown`(prosemirror의 `keydownHandler`를 그대로 써서 판정 규칙이 같다). 둘은 겹치지 않는다(테스트). Tiptap 확장이 스스로 거는 명령 키(`Mod-Alt-1`, `Mod-Shift-s`, `Mod-b`, `Mod-Enter` 등)는 `stripCommandKeys`가 뺀다. Enter·Tab·Backspace·Shift-Enter 같은 구조 키는 남긴다. 스키마는 바뀌지 않는다(테스트).
57. **Plan 4.1에 없는 파일.** `commands/filter.ts`·`slash.ts`·`CommandPalette.tsx`(4.1의 `SlashMenu`·`CommandPalette`·`CommandList`를 나눔), `extensions/input-rules.ts`(더한 입력 규칙과 임베드 붙여넣기), `state/summary.ts`(개요·글자 수), `ui/CodeBlockView.tsx`·`EmbedNodeView.tsx`·`class-names.ts`, `layouts/AdminPage.astro`, `pages/admin/edit/index.astro`(옛 `?slug=` 주소 301). 4.1의 `ConflictDialog.tsx`·`OfflineRestoreDialog.tsx`는 PR-B의 `Dialogs.tsx` 안에 있다.
58. **콜아웃·체크 목록 입력 규칙은 두 단계다.** `> `(StarterKit) 뒤 `[!note] `를 치면 그 인용이 콜아웃이 된다. `- `(StarterKit) 뒤 `[ ] `를 치면 **그 항목만** 체크 목록이 된다(리뷰 6.3 중요 2). 떼어 낸 앞뒤 글머리 목록은 마크다운에서 다른 글머리 문자(`-`·`*`)로 쓰여 다시 열어도 둘로 남는다. Tiptap 기본 규칙 `[ ] `(단락에서)도 그대로 돈다.
59. **수식 입력은 대화상자다.** 빈 단락의 `$$`+공백(또는 Enter)이 창을 연다. 글자 중간의 `$$`는 건드리지 않는다. 표 셀 안에서는 열지 않는다. Tiptap 기본 규칙(`$$x$$` → 인라인, `$$$x$$$` → 블록)은 남아 있다. 창은 KaTeX 미리보기(`throwOnError: false`)를 보이고 `Mod+Enter`로 저장한다. 수식 노드를 누르면 같은 창이 열린다(고치기·삭제). 인라인 수식의 줄바꿈은 공백으로 바꾼다(`$…$` 안의 줄바꿈은 수식을 끊는다). 저장할 때 창을 열 때의 자리에 같은 수식이 있는지 확인한다(리뷰 6.3 경미 7).
60. **임베드는 세 길로 만든다.** 빈 단락에 지원 주소 하나를 붙여넣기(`handlePaste`), 지원 주소만 있는 단락 끝에서 Enter, 소스 모드·기존 글의 주소 한 줄(변환기). 다른 주소는 Link 확장의 붙여넣기(링크)에 맡긴다. 노드 뷰는 iframe 위에 선택 전 투명 막을 둔다(누르면 노드 선택, 한 번 더 누르면 재생).
61. **슬래시 메뉴는 `@tiptap/suggestion` + `ReactRenderer`다.** `/` 뒤 글자로 `title`·`id`를 거른다(공백·`-` 무시. `/제목2`가 "제목 2"를 찾는다). 코드 블록·인라인 코드 안에서는 열지 않는다. `isAvailable`로 거른다. 최대 12개. 최근 사용 순은 `localStorage` `cruz-lab:editor-recent`(8개). 목록이 비면 방향키를 받지 않는다(리뷰 6.3 경미 11).
62. **팔레트는 모드에 따라 목록이 다르다.** 편집 모드면 그 자리에서 쓸 수 있는 명령 전부, 소스·미리보기 모드면 페이지 범위 명령만. Enter는 수식 키 없이 눌렀을 때만 고른다(Mod+Shift+Enter 발행 키와 겹치지 않게. 대화상자도 같다, 리뷰 6.3 경미 10).
63. **툴바 활성 표시는 `useEditorState` 문자열 선택자다.** 명령마다 "쓸 수 있음·활성" 두 글자를 이어 붙인 문자열이 바뀔 때만 다시 그린다. `EditorApp`은 키 입력마다 다시 그리지 않는다(2.2 #5).
64. **모바일 기준은 두 폭이다.** 768px 미만: 툴바 숨김, 포커스 중 모바일 바(D12 7버튼). 640px 미만: 상단 바의 발행 버튼을 숨기고 메타 시트 맨 위에 둔다(D12 "발행 버튼은 메타 시트 안"). 모바일 바는 `pointerdown`·`mousedown` 기본 동작을 막아 포커스(화면 키보드)를 지킨다. iOS Safari 확인은 하지 않았다(8절 13).
65. **개요 항목은 문서 안 제목 순번으로 찾아간다.** 요약은 편집 300ms 디바운스(D13). 소스 모드에서도 글자를 디바운스 파싱해 요약을 갱신한다(리뷰 6.3 경미 8). 소스·미리보기 모드에서 개요를 누르면 편집 모드로 바꾼 뒤 이동한다. 좁은 화면에서는 시트를 닫는다.
66. **코드 블록 언어는 노드 뷰의 `select`다.** 목록은 `CODE_LANGUAGES` 20종. 목록에 없는 기존 값(`js` 등)은 항목으로 보여 유지한다. 하이라이트는 lowlight 장식이 그대로 맡는다.
67. **관리자 화면 틀 `AdminPage.astro`를 뽑았다.** 에디터 페이지의 `<html>`·테마 초기화를 최소 목록과 같이 쓴다. 최소 목록은 `listEntriesForAdmin({ status })`를 직접 부르고 서울 시각으로 보인다. 글 수에 상한이 없다(55편. 5단계가 다시 만든다).
68. **`/admin/posts/new`는 POST 폼만 받는다(Plan D2 a의 GET과 다름. 사용자 결정 2026-11-09, 8절 3).** 세션 쿠키가 `SameSite=Lax`라 다른 사이트의 링크(GET)로는 빈 초안이 생기지 않는다. 쓰기 요청은 Origin도 같아야 한다(403). 만들면 303으로 에디터에 간다. GET은 `/admin`으로 302.
69. **옛 주소 301은 페이지 파일에서 한다.** `posts/index.astro`·`edit/index.astro`가 `Astro.redirect('/admin', 301)`. 로그인 없으면 미들웨어가 먼저 302 로그인으로 보낸다(관리자 경로 규칙).
70. **맥에서 제목 2·3·4와 단락 키는 `⌃⇧2/3/4/0`이다(Plan 부록 B의 `Mod+Shift`와 다름. 사용자 결정 2026-11-09).** macOS의 `⌘⇧3`·`⌘⇧4`는 스크린샷 키라 브라우저에 오지 않는다(리뷰 6.3 중요 4). 그 밖 OS는 Plan 그대로 `Ctrl+Shift+숫자`. `keys.mac`·`keys.other`가 처음으로 다른 값을 갖는다. 팔레트·툴바 표기는 플랫폼대로다.
71. **리뷰 6.3 뒤 고친 동작.** 발행은 진행 중 재진입을 막고 페이지 키는 자동 반복(`event.repeat`)을 버린다(중요 1). 넣기 명령(이미지·표·구분선·수식)은 코드 블록 안에서, 블록 노드는 표 셀 안에서도 쓸 수 없다(중요 3). 링크 넣기는 `safeUrl` 검사를 먼저 한다(경미 5). 임베드 `renderHTML`의 판정 실패 주소는 링크가 아니라 글자다(경미 13, 5절 22를 코드에 맞췄다). `HardBreak`의 `Mod-Enter`를 뺐다(경미 12. `Shift-Enter`는 남는다. 코드 블록 나가기 `Mod-Enter`는 core 키맵이라 남는다).
72. **`README.md`의 옛 CMS 설명(CodeMirror, `markdown-publish.ts`, `editor-drafts.ts`)은 고치지 않았다.** Plan 6.1 밖이다. 문서 PR(T10)에서 고친다.
73. **이미지 주소의 `&`가 마크다운에 `\&`로 쓰인다.** mdast-util-to-markdown이 링크 목적지의 `&`를 이스케이프한다(`?alt=media\&token=…`). CommonMark는 목적지 안의 `\&`를 `&`로 읽어 렌더는 같다(4.7에서 공개 페이지 이미지 확인). 백업 저장소에서 주소를 복사하면 `\`가 붙는다. PR-A 변환기의 동작이고 PR-C에서 바꾸지 않았다(8절 11).

알려진 한계(고치지 않음):

- **겹친 마크의 바깥·안 순서.** ProseMirror 마크는 순서가 없다. `**[링크](u)**`와 `[**링크**](u)`, `**_x_**`와 `_**x**_`는 같은 문서가 된다. 변환기는 동률일 때 링크 > 기울임 > 굵게 > 취소선으로 쓴다. 기존 55편은 이 순서로 모두 통과했다(4.2 집계 2건 포함). 새로 쓰는 글에서는 저자가 순서를 고를 수 없고, 렌더 차이는 CSS(`prose a`·`strong` 굵기)에 달렸다.
- **섞인 체크 목록.** `- [ ] a
- b`는 모두 체크 항목이 된다. 기존 글에는 체크 항목이 0건이다.
- **콜아웃 표시의 대소문자.** `[!Note]`는 `[!note]`로 다시 쓰인다. 비교 파서에는 콜아웃 플러그인이 없어 왕복 검사에서는 다르게 보인다(가짜 실패). 기존 글에는 없다.
- **지원하지 않는 HTML 블록이 다음 줄을 삼킨 경우.** CommonMark HTML 블록(7형)은 빈 줄까지 이어진다. `<br />` 바로 다음 줄에 글이 붙어 있으면 그 글까지 경고 대상이 된다. 기존 글 59개 `<br>`는 모두 홀로 있다(왕복 경고 0건이 근거).
- **(PR-B) 소스 모드를 떠나는 시점에 따라 표기가 다르다.** 소스에서 고친 글자가 저장된 뒤(또는 저장 중) 편집 모드로 오면 소스 원문을 유지한다. 저장 예약만 있고 아직 보내지 않았으면 편집 모드 표기(정규화)로 저장한다. 렌더는 같다(리뷰 경미 17).
- **(PR-B) 오피스 앱에서 복사하면 텍스트 대신 이미지가 올라갈 수 있다.** 클립보드에 HTML과 PNG가 같이 오면 파일을 우선한다(리뷰 경미 21, 추측). 써 보고 바꾼다.
- **(PR-B) 대화상자에 포커스 가두기가 없다.** Esc로 닫는 것만 있다(리뷰 경미 22). 5단계 관리자 앱의 공통 대화상자에서 다룬다.
- **(PR-C) Tiptap 기본 입력 규칙 `---`는 표 셀 안에서 표를 가른다.** PR-C 전부터 있던 동작이다(리뷰 6.3 중요 3의 재현 중 발견). 레지스트리의 구분선 명령은 셀 안에서 막았다. 입력 규칙은 StarterKit 것이라 두었다. 되돌리기로 복구한다.
- **(PR-C) `Mod+Shift+M`(보기 모드 순환)은 Chrome의 프로필 메뉴 키와 같다.** 페이지가 `preventDefault`하므로 에디터 페이지에서는 모드 순환이 먼저 돈다. 다른 브라우저는 확인하지 않았다.
- **(PR-C) 한글 IME 조합 중 동작은 브라우저에서 직접 확인하지 않았다.** Tiptap의 입력 규칙은 조합 중 돌지 않고, 팔레트·대화상자·페이지 키는 `isComposing`을 본다(리뷰 6.3 "확인한 것"). 4.6의 한글 입력은 완성 글자 삽입이다.
- **(PR-C) 임베드 iframe은 노드를 선택해야 재생한다.** 선택 전 투명 막이 클릭을 받는다. 편집 중 실수로 재생되는 것을 막는 대신 한 번 더 눌러야 한다.
- **(PR-C) 사용자 키맵 덮어쓰기는 빈 객체다.** `applyKeymapOverrides`·`findKeyConflicts`는 있지만 저장·설정 화면은 5단계다(D9).

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

### 6.3 PR-C

새 리뷰어(별도 에이전트, 읽기 전용, 2026-11-09)가 커밋 전 작업 트리를 검토했다. 헤드리스 Tiptap으로 재현했다. 치명 0, 중요 4, 경미 11건이었다. 중요 1~3과 경미 5·7·8·9·10·11·12·13은 실패하는 테스트를 먼저 쓰거나(17개) 코드를 고쳤다. 중요 4는 사용자 결정으로 닫았다.

| 지적 | 처리 |
|---|---|
| 중요 1: 키·팔레트로 발행하면 재진입·자동 반복으로 두 번 이상 돈다(revision·publishLog·퍼지·백업이 중복) | 고침. `publishingRef`로 재진입을 막고, 창 키 리스너가 `event.repeat`를 버린다(`createPageKeyListener`, 테스트) |
| 중요 2: `- [ ] ` 규칙이 목록 전체를 체크 목록으로 바꾼다 | 고침(5절 58). `liftListItem`을 먼저 하고 글자를 지운다(prosemirror `liftOutOfList`는 `tr.mapping`으로 위치를 검사해, 앞선 단계가 있으면 실패한다). 항목 여러 개 테스트 2개 |
| 중요 3: 이미지·표·구분선·수식 명령과 `$$` 규칙이 표 셀·코드 블록을 둘로 가른다 | 고침(5절 55·71). `isAvailable`(코드 블록 밖, 블록 노드는 표 밖)과 `$$` 규칙의 셀 검사. 테스트 9개. Tiptap 기본 `---` 규칙은 알려진 한계 |
| 중요 4: 맥 `⌘⇧3`·`⌘⇧4`는 스크린샷 키라 제목 3·4 키가 오지 않는다(Plan 결정) | 사용자 결정(2026-11-09): 맥은 `⌃⇧2/3/4/0`(5절 70) |
| 경미 5: 링크 넣기 경로가 `javascript:` 주소를 거르지 않는다 | 고침. `safeUrl` 검사 뒤 넣는다 |
| 경미 6: 모바일 바가 `mousedown`에서 포커스를 잃을 수 있다(추측) | 고침. `mousedown`도 막는다 |
| 경미 7: 수식 창이 열 때의 `pos`를 그대로 써 다른 노드를 고칠 수 있다 | 고침(5절 59). 저장 때 같은 자리·같은 수식인지 확인한다 |
| 경미 8: 소스 모드에서 개요가 낡아 다른 제목으로 간다 | 고침(5절 65). 소스 글자도 디바운스 요약한다 |
| 경미 9: "지금 저장"의 `blocked` 문구가 업로드가 아닐 때도 업로드를 말한다 | 고침. 문구를 "업로드 중이거나 입력이 이어지고 있다"로 바꿨다 |
| 경미 10: 대화상자·팔레트의 Enter가 `Mod+Shift+Enter` 발행과 겹친다 | 고침(5절 62). 수식 키 없는 Enter만 받고 `preventDefault`한다 |
| 경미 11: 슬래시 결과가 없을 때 방향키가 막힌다 | 고침(5절 61) |
| 경미 12: `HardBreak`의 `Mod-Enter`가 레지스트리 밖에 남는다 | 고침(5절 71). 테스트 |
| 경미 13: 임베드 `renderHTML`이 판정 실패 주소를 링크로 그린다(5절 22와 다름), 낡은 주석 | 고침(5절 71). 테스트 |
| 경미 14: 문서가 PR-C를 따라오지 않았다(1절, 5절, README) | 이 문서를 갱신했다. README는 5절 72 |
| 경미 15: 테스트 빈틈(화면용 스키마 비교, 페이지 키 래퍼, 항목 여러 개 체크 규칙, 표·코드 안 넣기 명령 등) | 화면용 스키마 비교·페이지 키 리스너·체크 규칙·넣기 명령·`Mod-Enter`·임베드 renderHTML 테스트를 더했다. 슬래시 플러그인 자체(코드 안 금지·범위 삭제)와 `saveLink`·`saveMath`·`jumpToHeading`은 브라우저 확인(4.6)으로 대신했다 |

리뷰어가 확인한 것: 화면용 확장 묶음의 스키마가 기본 스키마와 같다(노드 22·마크 5의 순서·속성·content·group·excludes). `stripCommandKeys`가 `Mod-Alt-0~6`, `Mod-Alt-c`, `Mod-Shift-s·b`, `Mod-b·i·e`, 목록 3종, undo 키 5개를 빼고 구조 키는 남긴다. 명령 키 문자열은 registry 밖에 없다. 에디터 범위 키와 페이지 범위 키는 겹치지 않는다. 열기만 하면 저장하지 않는다(D1 b. PR-C 확장에 `appendTransaction`이 없고 노드 뷰가 열 때 속성을 바꾸지 않는다). 한글 IME: Tiptap `run`은 조합 중 돌지 않고, 팔레트·링크 창·페이지 키는 `isComposing`을 본다. 임베드 iframe 주소는 `detectEmbed` 결과(허용 호스트 2개)뿐이다. KaTeX는 `throwOnError: false`, `trust` 기본 false. 최소 목록은 Astro가 이스케이프하고 미들웨어가 세션을 검사한다. 지운 파일의 참조가 없다. 부록 B 키·슬래시 이름, D12 버튼 7개, D13 300ms 디바운스가 맞고 14절의 미룬 기능은 들어가지 않았다.

## 7. 다음 작업

1. ~~[PR #9](https://github.com/crucial-sub/cruz-lab/pull/9) 병합~~ 끝(2026-11-09, `4010bd0`). `stage3/b-editor`의 기준을 `4010bd0`으로 옮겼다.
2. PR-B 마무리: 리뷰·수정, 브라우저 시나리오 15개, E2, API 스모크, 시험 데이터 0, PR #9 병합 뒤 기준 이동(`4010bd0`)까지 끝났다(2026-11-09). 커밋 `dfe1220`(코드)·`2df00d6`(문서), 푸시, [PR #10](https://github.com/crucial-sub/cruz-lab/pull/10)(대상 `rebuild`)까지 했다. 남은 것: PR #10 병합(사용자 확인).
3. ~~PR-C~~ 구현·검증·리뷰 끝(2026-11-09, 4.6·4.7·6.3). 남은 것: 커밋·푸시·PR(대상 `rebuild`)은 사용자 확인 뒤. 그 뒤 PR 병합도 사용자 확인 뒤.
4. 문서 PR(T10): 이 문서 마무리, 진행 기록 11.7, Plan 15절, `README.md`의 옛 CMS 설명 교체(5절 72), 드래그 핸들 상기(Plan 14절) 답 기록. 새 세션에서 한다(전역 7번 규칙).
5. `rebuild` 미리보기에서 사용자가 실제 키보드로 입력 규칙·슬래시·단축키를 한 번 써 본다(4.6은 `execCommand` 경로다). 맥 키 `⌃⇧2/3/4/0`이 손에 맞는지도 그때 본다.

## 8. 열린 질문

1. ~~PR-B는 PR-A가 `rebuild`에 병합된 뒤 `rebuild`에서 가지를 치는가, 아니면 `stage3/a-markdown` 위에 쌓는가.~~ 닫음: PR-A 병합 뒤 `rebuild`로 리베이스한다. PR-B 세션 시작 때(2026-11-09) PR #9가 아직 열려 있어 `stage3/a-markdown`(`13a0825`) 위에서 시작했다. 사용자 답으로 PR #9를 병합했다(merge commit `4010bd0`). `4010bd0`의 트리가 `13a0825`와 같아(파일 차이 0) 커밋 전 작업 트리를 그대로 두고 기준만 `4010bd0`으로 옮겼다. PR-B의 PR 대상은 `rebuild`다.
2. ~~기울임 표기를 Plan 4.2의 `_`가 아니라 `*`로 쓰는 것(5절 11).~~ 사용자가 이 상태로 진행을 승인했다(2026-11-09).
3. ~~`/admin/posts/new`의 GET 생성~~ 닫음: 사용자 결정(2026-11-09)으로 POST 폼으로 바꿨다(5절 68). GET은 `/admin`으로 보낸다.
4. 에디터 청크 1,711 KB(gzip 523 KB). lowlight `common`을 쓰는 언어만 동적으로 가져오거나 KaTeX를 수식이 있을 때만 가져오면 줄 수 있다. 관리자만 쓰는 페이지라 급하지 않다. 5단계 Plan에서 다시 본다.
5. 저장 실패 상태(`error`)에서는 새 입력이 상태를 바꾸지 않는다(멈춘 채 "다시 시도"를 기다린다). 입력을 계속하면 내용은 에디터에 있고, 다시 시도하면 최신 내용을 보낸다. 사용자가 써 보고 자동 재시도가 더 나으면 바꾼다. 메타 검사 실패와 blob 주소는 멈추지 않는다(다음 입력에서 다시 본다).
6. ~~브라우저 확인 중 생긴 빈 시험 글 `qoRxy9TjMCrBmNAWuw1c`~~ 이 글을 시나리오 3~13의 시험 글로 쓰고 지웠다. 왕복 검사는 다시 55/55다.
7. editorJson 깊이 한도. 지금은 한도를 넘는 문서만 editorJson 없이 저장한다(5절 43). 중첩이 깊은 글이 늘어 JSON을 먼저 여는 이점(D5)이 중요해지면 `doc`을 JSON 문자열로 두는 v2 형식을 검토한다(D5 변경, 사용자 결정).
8. 공개 페이지 `MarkdownPostView.tsx`의 영상 판정은 `endsWith`라 쿼리 붙은 영상 주소를 `<img>`로 그린다. 3단계는 공개 렌더를 바꾸지 않는다. 4단계에서 공유 파이프라인으로 바꾸면 함께 고쳐진다. 그 전에 새 영상을 올려 발행하면 `rebuild` 미리보기의 공개 페이지에서 깨져 보인다. 같은 이유로 공개 페이지는 원시 HTML의 iframe을 그대로 그린다(미리보기는 지운다, 5절 42).
9. 단락 앞뒤의 공백이 `&#x20;`로 저장된다. 입력 중 자동저장 때 단락 끝에 공백이 있으면(낱말 뒤 스페이스) 변환기가 공백을 문자 참조로 쓴다(PR-A 변환기, mdast-util-to-markdown 규칙). 렌더는 같지만 백업 저장소에서 읽기 불편하다. 단락 끝 공백을 지우면 렌더가 같으므로 변환기에서 지울지 PR-C 또는 문서 PR에서 정한다.
10. 초안 버리기 뒤에도 `hasUnpublishedChanges`가 참이다. 서버는 버전으로 판정한다(`draft.version != published.fromDraftVersion`, 2단계 D4). 초안 버리기는 버전을 올리므로 내용이 발행본과 같아도 "발행 뒤 변경 있음"이 보인다. 2단계 API 정의라 3단계에서는 바꾸지 않는다. 5단계 목록 설계 때 다시 본다.
11. 이미지 주소의 `&`가 마크다운에 `\&`로 쓰인다(5절 73). 렌더는 같다. 백업 저장소 가독성 문제다. 9와 함께 변환기 표기 옵션을 정할 때 본다(문서 PR 또는 4단계).
12. 재발행 뒤 글 주소 첫 요청의 `x-vercel-cache`가 `MISS`가 아니라 `REVALIDATED`였다(4.7). 내용은 새 것이라 D7의 목표는 맞다. `dangerouslyDeleteByTag` 뒤 Vercel이 보고하는 값이 환경에 따라 다를 수 있다. 운영(main) 병합 뒤 실제 글 재발행 때 한 번 더 본다.
13. 모바일 바의 `visualViewport` 위치는 앱 브라우저(데스크톱 Chromium, 화면 키보드 없음)에서만 확인했다. iOS Safari에서 흔들리면 D12대로 하단 고정으로 떨어뜨린다. 사용자 iPhone으로 `rebuild` 미리보기를 써 볼 때 본다.
