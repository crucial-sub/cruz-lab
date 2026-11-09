# 재건 4단계 작업 문서: 공개 사이트

- 날짜: 2026-11-09 (PR-A 구현)
- Plan: [2026-11-09-stage4-public-site-plan.md](./2026-11-09-stage4-public-site-plan.md) (승인 2026-11-09, PR #14 병합 `b2583ed`)
- 진행 기록: [계획 문서 11.9](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md#119-4단계-구현-진행-기록-2026-11-09)
- 브랜치: `stage4/a-renderer`(PR-A). 대상은 `rebuild`다. PR-B `stage4/b-pages`, PR-C `stage4/c-projects-og`, 문서 PR `stage4/docs`는 아직이다.
- 상태: **PR-A(T1·T2) 구현·검증·리뷰 끝.** 리뷰(6절) 치명 0·중요 1·경미 12 중 중요 1과 경미 10건을 고쳤다. 사용자 결정(2026-11-09): 정규화 규칙 7 추가(5절 21), 커밋·푸시·PR, PR을 열 때 태그 `rebuild-pre-stage4`.

## 1. 현재 상황

| 항목 | 상태 |
|---|---|
| PR-A (T1 공유 파이프라인, T2 글 상세) | 구현·검증·리뷰 끝(2026-11-09). 브랜치 `stage4/a-renderer`(`origin/rebuild` `b2583ed` = PR #14 병합 커밋에서 생성). 테스트 504(+82), `tsc` 1(`TextReveal`, 그대로), lint·빌드 통과, 덤프 왕복 55/55, 운영 왕복 59/59(규칙 7 뒤), 공개 스모크 322/0, 글 상세 점검 378/0, 브라우저 확인(4.5). 리뷰 치명 0·중요 1·경미 12(6절). 사용자 승인으로 커밋·푸시·PR(7절) |
| PR-B (T3·T4·T5) | 아직. PR-A 병합 뒤 새 세션(7절) |
| PR-C (T6·T7·T8), 문서 PR (T9) | 아직 |
| 외부 변경 | 없음 |
| 운영 데이터 | 읽기만 했다. 왕복 검사·공개 스모크·글 상세 점검·초안 버전 확인 모두 읽기다. 시험 글을 만들지 않았다. `entries` 59(공개 post 54, 초안 5: 에세이 1편 + 사용자 시험 초안 4편). 사용자 시험 초안은 건드리지 않았다 |

## 2. 한 일

### 2.1 T1: 공유 파이프라인 확장 (PR-A)

| 파일 | 내용 |
|---|---|
| `package.json` | `shiki` 3.12.2, `github-slugger` 2.0.0(둘 다 정확한 버전). 둘 다 이미 `node_modules`에 있던 버전이라 새로 받은 패키지가 없다 |
| `src/lib/content/code-languages.ts` | 언어 20종 목록(`CODE_LANGUAGES`). 에디터 `lowlight.ts`에서 옮겼다. `lowlight.ts`는 다시 내보낸다(5절 1) |
| `src/lib/content/shiki-languages.ts` | 순수 함수 `resolveShikiLanguage`(별칭 `objectivec` → `objective-c`, `nasm` → `asm`, 대소문자 무시, 모르는 언어 → `text`), 테마 쌍 `SHIKI_THEMES` |
| `src/lib/content/highlighter.ts` | `createSiteHighlighter()`: `shiki/core`의 `createHighlighterCoreSync` + JS 정규식 엔진 + 언어 20 + 테마 2(`github-light-default`·`github-dark-default`). `defaultColor: false`라 토큰 색은 CSS 변수만 나간다. 펜스 값 끝 줄바꿈 하나를 뗀다. `getSiteHighlighter()`는 서버 공용(처음 부를 때 한 번 만든다) |
| `src/lib/content/rehype-shiki.ts` | `remarkCodeMeta`(펜스 meta → `data-meta`. rehype-raw가 `node.data`를 버리기 때문), `rehypeCodeBlocks`(`pre > code`를 `figure.code-block[data-lang]` + 머리줄(언어·meta 라벨, `hidden` 복사 버튼)로 감싼다. 하이라이터가 있으면 `<pre>`를 Shiki 결과로 바꾼다) |
| `src/lib/content/rehype-headings.ts` | 모든 제목에 id(github-slugger, 한글 유지, 같은 글자 `-1`). 페이지 요소 id(`main-content` 등)는 먼저 예약한다. 제목 끝에 NBSP + `a.heading-anchor`(`aria-label="제목 링크: …"`). h2·h3를 `file.data.toc`에. 각주 머리는 건드리지 않는다 |
| `src/lib/content/rehype-assets.ts` | D15. 새 자산 최대 변형 주소면 `srcset`(있는 변형, 같은 폭 한 번) + `sizes` + `width`·`height`. 작은 변형이면 그 크기만. legacy·외부·다른 버킷은 그대로. 원시 `<img width>`의 크기는 지킨다 |
| `src/lib/content/markdown.ts` | 정규화 규칙 7(블록 처음·끝 공백, 사용자 결정, 5절 21). `renderMarkdown(md, { highlighter?, assets? }) → { html, toc, hasMath }`, `markdownToHtml(md, opts)`(html만). 순서: rehype-raw → strip-unsafe → 제목 → KaTeX → 수식 표시 → 코드 틀 → 주소·영상 규칙 → 표 스크롤 상자 → srcset. `rehype-highlight`를 뺐다. 모양 클래스(Tailwind)를 붙이지 않는다. 이미지 `decoding="async"`, 영상 `preload="metadata"`. 표는 `div.table-scroll[tabindex=0]`로 감싼다. D14: `image`·`link` 핸들러를 덮어써 목적지를 `encodeDestination`으로 쓴다 |
| `src/editor/markdown/from-doc.ts` | D14: 단락·제목·표 셀 블록의 처음·끝 공백과 하드 브레이크 앞뒤 공백을 지운다(마크·링크 안까지, NBSP는 남김). 공백만 있는 단락은 빈 단락처럼 쓰지 않는다 |
| `src/styles/prose.css` | `.prose` 한 파일. 3단계 복사본 두 벌(공개 글 페이지 `<style is:global>`, `editor.css`)을 합쳤다. 코드 색 토큰 `--code-*`(PR #13)을 옮겼다. 더한 것: 본문 단락·목록 1차 색(D16), 제목 앵커(hover·focus 때만, 터치 화면은 숨김), 제목 `scroll-margin-top`, 코드 틀, 이미지 `height: auto`, 영상 폭 100%, 표 스크롤 상자, 블록 수식 가로 스크롤, 콜아웃·임베드(editor.css에서 옮김) |
| `src/styles/shiki.css` | 듀얼 테마. `.shiki span[style]`만 `--shiki-dark`, `html.light`면 `--shiki-light`. 바탕·기본 글자는 `--code-*` 토큰 |
| `src/editor/editor.css` | `.prose` 복사본, 코드 토큰, 콜아웃·임베드 규칙을 지우고 `prose.css`·`shiki.css`를 `@import`. lowlight 구문 색 `--hl-*`과 편집 영역 규칙은 남겼다 |
| `src/editor/ui/PreviewMode.tsx` | 미리보기 첫 진입 때 `import('@/lib/content/highlighter')`. 받기 전에는 민무늬, 받으면 다시 그린다. 실패하면 다음 진입 때 다시 받는다 |
| `tests/fixtures/markdown/edge-spaces.md`, `url-ampersand.md` | D14 fixture 2개(fixture 12개) |
| `tests/unit/content-highlighter.test.ts`(16), `content-headings.test.ts`(14), `content-assets.test.ts`(11), `content-markdown.test.ts`(+9), `editor-markdown.test.ts`(+19) | 69개(리뷰 뒤 13개, 규칙 7 3개 포함). 별칭·민무늬·듀얼 변수·끝 줄바꿈·이스케이프·틀·meta·펜스 수, 제목 id·중복·예약 id·목차 글자·앵커·각주·hasMath, srcset·작은 변형·legacy·외부·원시 `<img width>`·`<p align>`(D3)·표 상자, `encodeDestination`(문자 참조·꺾쇠·괄호·끝 `\`·다시 읽기), D14 변환(문서 → fixture 그대로, NBSP, 공백 단락, 코드 마크 패딩, `&token=`, 자동 링크) |

변환기·파이프라인은 지금처럼 Node에서 돈다(상대 경로 `.ts` import). `markdown.ts`는 `highlighter.ts`를 가져오지 않는다(타입만). 그래서 왕복 검사와 미리보기 첫 화면은 Shiki 없이 돈다.

### 2.2 T2: 글 상세 (PR-A)

| 파일 | 내용 |
|---|---|
| `src/pages/blog/[...slug].astro` | 다시 썼다. `resolvePostPageBySlug` → 301(예전 slug, 다른 kind) 또는 글. `renderEntry`·이전다음·연재를 함께 읽는다. 글이면 캐시 `posts,post-<id>`, 없으면 404(저장 안 함). 수식이 있으면 `katex.min.css?url`을 `<link slot="head">`로 넣는다. cdnjs `github-dark` 링크를 지웠다 |
| `src/lib/server/render-entry.ts` | D7. `renderEntry({ id, revision, markdown })`: 글 ID마다 한 칸(발행본 번호가 같고 10분 안이면 재사용). 본문의 새 자산 ID를 뽑아 `getAssetsByIds` → `renderMarkdown(md, { highlighter: getSiteHighlighter(), assets })`. 자산 조회가 실패하면 srcset 없이 그린다(리뷰 경미 7) |
| `src/lib/server/entries.ts` | `PublicEntry.revision`(`published.revision`), `getAssetsByIds(ids)`(`getAll` + `fieldMask: ['variants']`, 메모 60초) |
| `src/lib/content-posts.ts` | `resolvePostPageBySlug(slug)`(옛 `resolveContentPostBySlug` 대체. 다른 kind는 `publicPathFor`가 주소를 주면 301, 아니면 404), `getAdjacentPosts(id)`(발행순 이웃) |
| `src/lib/public-paths.ts` | 새 파일. `categoryPath`(PR-A 동안 동의어 태그 주소, 5절 3), `tagPath`, `seriesPath`. PR-B(T4)가 넓힌다 |
| `src/lib/date-format.ts` | 서울 날짜 `YYYY-MM-DD`, 같은 날 비교 |
| `src/components/post/PostArticle.astro` | D16 순서: 머리줄(카테고리 · 발행일 · 다른 날이면 "수정 날짜" · 읽기 시간) → 제목 · 설명 → 연재 상자 → 표지(`fetchpriority="high"`, 영상 주소면 `<video>`) → 목차(1280px 미만 `<details>`) → 본문 → 태그 → 이전·다음 → 연재 목차 전체. 1280px 이상은 2열 그리드(본문 68ch + 목차 240px sticky). `role="status"` 알림 칸 |
| `src/components/post/Toc.astro`, `SeriesBox.astro`(top·bottom), `PrevNext.astro` | 목차(h3 들여쓰기, `aria-current="location"`), 연재 상자(N/M, 이전 편·다음 편, 전체 N편 `<details>` / 글 끝 전체 목록, 현재 글 `aria-current="page"`), 이전·다음 글(`rel="prev"`·`"next"`) |
| `src/components/post/post-scripts.ts` | 글 상세 `<script>` 1개. 코드 복사(이벤트 위임, 버튼 `hidden` 풀기, 실패 시 `execCommand` 대체, 2초 "복사됨"), 제목 앵커 클릭 때 주소 복사(이동은 기본 동작), 목차 스크롤 스파이(passive `scroll`·`resize` + rAF, 문서 끝이면 마지막 제목. 5절 15). `astro:page-load`에서 다시 붙인다(ClientRouter는 PR-B까지 남는다) |
| `src/layouts/BaseLayout.astro` | `<slot name="head" />` 한 줄(KaTeX CSS 자리). `</head>` 뒤라도 HTML 파서가 head에 넣는다 |
| `tests/unit/render-entry.test.ts`(5), `content-posts.test.ts`(8) | 리뷰 뒤 더했다. 자산 ID 뽑기, 같은 발행본 재사용·번호가 바뀌면 다시 그림, 자산 조회 실패에도 렌더, 하이라이트·수식 여부. `resolvePostPageBySlug`(글, 예전 slug 301 인코딩, 다른 kind는 주소가 없으면 404, 없음), `getAdjacentPosts`(노트 건너뜀, 양 끝), `categoryPath`·`tagPath`·`seriesPath` |
| 지움 | `src/components/blog/MarkdownPostView.tsx`(172줄). 가져오는 곳은 `[...slug].astro` 하나였다(grep). 의존성 `react-markdown`·`rehype-highlight`는 T5가 지운다(5절 2) |

## 3. 외부 변경

없다. 규칙·인덱스·환경 변수·Vercel·버킷 CORS를 바꾸지 않았다.

## 4. 검증 결과

### 4.1 자동 검사 (2026-11-09)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `pnpm test` | 504 통과(35 파일). 기준 422 + 82(구현 53 + 리뷰 뒤 26 + 규칙 7 3) |
| `tsc --noEmit` | 1(`TextReveal.tsx`, 기준 그대로. PR-B T5에서 지운다). 새 worktree에서는 `pnpm astro sync`를 먼저 돌려야 같은 값이 나온다(안 돌리면 `astro:content`·`import.meta.env` 오류가 더 나온다) |
| `pnpm build` | 통과. 경고 2(기존): 500 KB 넘는 청크(에디터), 로컬 Node 24 → Vercel Node 22 |

### 4.2 왕복 검사

| 입력 | 결과 |
|---|---|
| B1 덤프(`--dump`, 55편) | 55/55 |
| 운영 `entries`(`pnpm smoke:roundtrip`, 읽기만) | 처음 **58/59**(리뷰 수정 뒤에도 같다). 실패 1편은 사용자 시험 초안 `KAYlMJFTtTWG6DSyILzg`(제목 없음, 초안)였다. 원문에 3단계 변환기가 쓴 `&#x20;`(인라인 코드 뒤 단락 끝 공백)가 있다. D14 변환기는 그 공백을 지운다. 브라우저 렌더는 같다. `normalizeForCompare`가 블록 끝 공백을 같은 것으로 보지 않아 실패로 셌다. 사용자 결정으로 규칙 7을 더한 뒤 **59/59**(5절 21) |
| 표기 변화(운영, 59편) | 글머리 `*` 506개 → `-`, 구분선 `***` 108개 → `---`, ZWSP 981개 삭제, 본문 418,767 → 415,526바이트(3단계와 같은 규칙. 기존 글은 다시 쓰지 않는다) |

### 4.3 공개 스모크와 글 상세 점검 (localhost:4325, 읽기만)

| 검사 | 결과 |
|---|---|
| `scripts/smoke/stage2-public.mjs --base http://localhost:4325` | 점검 322건, 실패 0 |
| 글 상세 점검(Plan 8.2의 1. 스크래치 스크립트, 공개 post 54편) | 점검 378건, 실패 0. 목차 항목 467 = 본문 h2·h3 467, 코드 틀 258 = 펜스 코드 258(```math 제외), KaTeX `<link>`는 `.katex`가 있는 3편에만, cdnjs 0, `Vercel-Cache-Tag`에 `post-<id>`, `Set-Cookie` 없음, `astro-island` 글마다 1(헤더 `ThemeToggle`. PR-B가 지운다) |

글 상세 점검 스크립트는 T8의 `scripts/smoke/stage4-public.mjs` 씨앗으로 세션 공유 노트 폴더에 남겼다(`stage4-pr-a-post-detail-check.mjs`). 처음 돌릴 때 개발 모드가 `prose.css`를 `<style>`로 넣어 CSS 주석의 `<figure class="code-block">` 글자를 한 번 더 셌다. 주석 표기를 바꾸고 정규식을 `data-lang=`까지 보게 했다.

### 4.4 번들과 렌더 시간

| 항목 | 값 |
|---|---|
| 미리보기 하이라이터 청크 `highlighter.*.js` | 1,584,737바이트(gzip 229,613). 에디터 청크가 `import()`로만 참조한다. Plan 어림(gzip 약 250 KB) 안 |
| 에디터 청크 `EditorApp.*.js` | 1,813,979바이트(gzip 553,620, 리뷰 수정 뒤). 3단계 끝(1,797,947, gzip 548,887)보다 16,032바이트 크다(파이프라인 플러그인, github-slugger, 미리보기) |
| 글 상세 CSS `_slug_.*.css` | 11,919바이트(gzip 2,643). `prose.css`·`shiki.css`·컴포넌트 CSS |
| KaTeX CSS | `katex.min.*.css` 30,199바이트(gzip 7,999). `?url`로 가져와도 Vite가 처리해 글꼴 주소가 `/_astro/KaTeX_*`(해시)로 바뀐다. 수식 글에서만 요청한다 |
| 글 상세 HTML의 `astro-island` | 1(헤더 `ThemeToggle`, PR-B까지) |
| 렌더 시간(로컬, vitest) | Shiki 모듈 가져오기 142 ms, 생성 37 ms. 가장 긴 글(13,890자) 첫 렌더 176 ms, 두 번째 41 ms. 덤프 56편 합계 3.2초(편당 평균 58 ms). 같은 인스턴스·같은 발행본은 메모리 결과를 쓴다. 콜드 TTFB는 `rebuild` 미리보기에서 잰다(7절) |

### 4.5 브라우저 확인 (localhost:4325, 앱 브라우저, Plan 8.3의 3·4·5·6)

| # | 시나리오 | 결과 |
|---|---|---|
| 3 | 「큐(Queue)」 1280px | 오른쪽 목차 14항목, 스크롤하면 지난 제목이 `aria-current`로 강조된다(리뷰 뒤 다시: 맨 위 → 첫 제목, 긴 절 중간으로 건너뛰기 → 그 절 제목, 문서 끝 → 마지막 제목 「결론」, 강조 1개. 앱 브라우저 창이 숨어 rAF가 멈춰 있어 확인할 때만 rAF를 `setTimeout`으로 바꾸고 `astro:page-load`로 다시 붙였다). 제목 hover 때 `#`(불투명도 0 → 1, `aria-label` 있음). 코드 틀 2개(언어 라벨 `python`, 복사 버튼 보임). 복사: 이 앱 브라우저는 `clipboard-write` 권한이 `denied`다. 처음에는 "복사 실패"로 바르게 알렸다. `execCommand` 대체 경로를 더한 뒤 복사 이벤트의 선택 글자가 코드 첫 줄과 같고 버튼 "복사됨", 상태 알림 "코드를 복사했습니다"(5절 7). 표, 인라인 코드(빨간 글자). 이전 글 「스택」·다음 글 「우선순위 큐」, 태그, 카테고리 링크 |
| 3 | 연재 글 「UserProgram - 시스템 콜 동작 흐름」 1280px | 연재 상자 "Pintos 5/5", 이전 편, 전체 5편 `<details>`. 글 끝 연재 목록 5개, 현재 글 강조. 코드 틀 9개, `nasm` 블록 색칠(토큰 186개), 언어 있는 블록 중 민무늬 0 |
| 4 | 같은 글 390px | 순서: 머리 → 연재 상자 → 표지 → 목차 `<details>` → 본문. 페이지 가로 넘침 0(`scrollWidth` 390). 코드 가로 스크롤. 오른쪽 목차 숨김. 처음에는 터치 화면에서 `#`가 제목 아래 줄로 떨어졌다. 터치 화면은 앵커를 숨기고 앵커 앞을 NBSP로 바꿨다(5절 8) |
| 4 | 표 390px(「큐」, 「다익스트라」) | 표는 칸 안 줄바꿈으로 폭에 맞는다. 페이지 넘침 0. 넓은 표는 6번에서 확인 |
| 5 | 라이트 테마 | 코드 바탕 `#f6f8fa`, 토큰은 light 변수(`#1F2328` 등), 인라인 코드 `#cf222e`, 본문 1차 색 `#0f172a` |
| 6 | 콜아웃·임베드·수식·쿼리 붙은 영상·넓은 표 | 시험 글을 만들지 않았다. 공유 파이프라인(하이라이터 포함)으로 만든 HTML을 실제 글 페이지(「그래프」, KaTeX CSS가 들어간 글) 본문에 넣어 봤다. 콜아웃 3종(표시 글자 NOTE·TIP·WARNING, 왼쪽 선 색 3가지), YouTube iframe 16:9, 인라인·블록 KaTeX, `…flower.mp4?alt=media&token=abc` → `<video preload="metadata">` 재생(readyState 4), 넓은 표 상자 680/1000 가로 스크롤·페이지 넘침 0. 3단계 작업 문서 8절 8(공개 페이지의 쿼리 붙은 영상 주소)이 닫힌다 |
| — | 수식 글 「그래프」 | `<link rel="stylesheet" href="…katex.min.css">`가 head에 있고 KaTeX 글꼴이 로드된다. 수식 3곳(`$V$`, `$E$`)은 작성자가 쓴 수식이다. 옛 화면은 `$V$` 글자 그대로였다(remark-math가 없었다) |
| — | 에디터(기존 글 「큐(Queue)」 열기만) | 편집 영역: 인라인 코드 `rgb(255,123,114)`·배경 `rgba(255,123,114,0.1)`·반경 6px, 코드 블록 바탕 `#0d1117`, lowlight 키워드 빨강, 언어 선택 칩. 3단계 2.10 기록과 같다. 단락 글자는 1차 색(`rgb(231,233,238)`)이 됐다(D16, 의도). 미리보기: 처음 진입 때 `highlighter` 청크를 받고 Shiki 색·코드 틀(복사 버튼 숨김)·제목 앵커 14·표 상자가 공개 페이지와 같다. 저장 없음: 초안 버전 1, 수정 시각 2026-03-31 그대로(Admin SDK 읽기) |

콘솔 오류 0(개발 서버를 멈췄다 켤 때의 Vite WebSocket 재연결 오류만 있다).

## 5. Plan과 다르게 하거나 Plan이 정하지 않은 것

1. **언어 목록을 `src/lib/content/code-languages.ts`로 옮겼다.** Plan D8은 `CODE_LANGUAGES`(`src/editor/extensions/lowlight.ts`)를 그대로 쓰라고 했다. 그 파일을 서버 하이라이터가 가져오면 lowlight·highlight.js가 서버 번들에 들어간다. 목록만 옮기고 `lowlight.ts`가 다시 내보낸다. 목록은 하나다.
2. **`MarkdownPostView.tsx`를 PR-A에서 지웠다(Plan 6.1은 T5와 함께).** T2가 대체하는 컴포넌트이고 다른 곳이 가져오지 않는다. 남기면 죽은 코드다. 의존성 `react-markdown`·`rehype-highlight`는 Plan대로 T5가 지운다(그때까지 쓰는 곳이 없다).
3. **카테고리 링크는 PR-A 동안 동의어 태그 주소다(`/blog/tag/<동의어>`).** D16은 카테고리 링크, D11은 `/blog/category/<key>`다. 그 페이지는 PR-B(T4)가 만든다. 지금 그 주소로 걸면 PR-B 병합 전까지 `rebuild` 미리보기에서 404다. 지금 태그 페이지는 동의어 태그면 그 카테고리 글을 보인다. `categoryPath()` 한 함수에 모았다. PR-B는 이 함수만 `/blog/category/<key>`로 바꾸면 된다(7절).
4. **파이프라인 출력에서 Tailwind 모양 클래스를 뺐다.** 3단계 `rehypePublicRules`는 이미지에 `rounded-lg`, 영상에 `w-full rounded-lg`, 인라인 코드에 `rounded bg-bg-card px-1.5 py-0.5 text-sm`을 붙였다. 모양은 `prose.css`가 맡는다(D10 한 파일). 인라인 코드 클래스는 이미 `prose.css`의 `--code-*` 규칙이 덮고 있었다.
5. **`renderMarkdown()`을 더했다.** Plan 4.1은 `markdownToHtml(md, { highlighter?, assets? })`만 적었다. 글 상세는 HTML과 함께 목차와 수식 여부가 필요하다. `markdownToHtml`은 `renderMarkdown(...).html`이다.
6. **렌더 캐시는 `memo-cache`가 아니라 글 ID당 한 칸 `Map`이다(10분).** `memo-cache`는 만료된 키를 지우지 않는다. 키에 발행본 번호를 넣으면 재발행마다 옛 결과가 남는다. 글 ID당 최신 번호 하나만 두면 메모리가 발행 글 수에 묶인다. 10분은 자산 문서(srcset)가 바뀌는 경우 대비다.
7. **복사가 막히면 `document.execCommand('copy')`로 한 번 더 한다.** 클립보드 API는 권한 정책(iframe, 일부 내장 브라우저)에서 거부될 수 있다. 이 앱 브라우저가 그랬다. 그래서 복사 버튼은 클립보드 API가 없어도 보인다.
8. **제목 앵커는 터치 화면(`hover: none`)에서 숨기고, 앵커 앞은 NBSP다.** hover가 없는 화면에서 보이지 않는 앵커가 줄을 차지해 제목 아래에 빈 줄을 만들었다. NBSP는 앵커가 마지막 낱말과 떨어지지 않게 한다. 터치 화면의 제목 링크는 목차가 준다.
9. **표를 `div.table-scroll`(`tabindex="0"`)로 감싼다.** Plan 8.3 4는 "표 가로 스크롤"을 확인 항목으로만 적었다. `table`에 `display: block`을 주면 칸이 폭을 채우지 않는다. 그래서 상자로 감쌌다. 키보드로도 스크롤하게 `tabindex`를 줬다. 에디터 편집 영역의 표는 Tiptap이 그리므로 관계없다.
10. **페이지 head 슬롯을 `BaseLayout`에 더했다.** KaTeX CSS를 글 상세에서만 넣을 자리다. `BaseLayout` 재작성은 T3(PR-B)이고 이 한 줄은 그대로 옮기면 된다.
11. **글꼴 크기 기준 68ch.** `--measure: 68ch`는 `.post`(17px) 글꼴 기준이다. 1280px에서 본문 폭은 약 680px다(지금 컨테이너 992px 안에서 목차 240px + 간격 40px). 타이포 스케일(본문 17px, 행간 1.75)과 본문 h1을 h2 크기로 보이는 규칙(Plan 1.1)은 T3(PR-B, 토큰)에서 한다. PR-A의 `prose.css`는 3단계 규칙에 D16(1차 색)과 새 요소 규칙만 더했다.
12. **`shiki/core`로 가져온다.** Plan D8은 `@shikijs/core`의 `createHighlighterCoreSync`다. pnpm에서 직접 의존성이 아닌 `@shikijs/*`는 가져올 수 없다. `shiki/core`·`shiki/engine/javascript`·`shiki/langs/*`·`shiki/themes/*`가 같은 함수와 파일을 다시 내보낸다.
13. **코드 블록 머리줄이 비면 숨긴다.** 언어가 없고 복사 버튼이 숨은 경우(JS 없음, 미리보기)다. `:has()` 선택자다.
14. **(검증) 시험 글 대신 렌더 결과를 페이지에 넣어 확인했다(4.5의 6).** 브리프는 시험 글이 꼭 필요하면 먼저 묻게 했다. 파이프라인 결과는 단위 테스트로, 서버 경로는 실제 글 54편으로 확인했으므로 꼭 필요하지 않다고 판단했다. 실제 발행 경로는 `rebuild` 미리보기 확인(Plan 8.5, T8)에서 본다.

리뷰(6절) 뒤에 판단한 것:

15. **스크롤 스파이는 IntersectionObserver가 아니라 passive `scroll`·`resize` + rAF다(D16은 IntersectionObserver).** 관찰자는 제목이 기준 띠를 드나들 때만 알린다. 목차 클릭·End 키처럼 한 번에 멀리 건너뛰면 알림이 없어 강조가 낡았다(리뷰 경미 8). 스크롤마다 다음 프레임에 한 번만 계산한다. 문서 끝에서는 마지막 제목을 강조한다.
16. **단락 끝 줄바꿈은 공백을 지운 뒤 `<br>`로 바꾼다. 마크 안의 끝 줄바꿈도 바꾼다.** D14 공백 제거가 끝 줄바꿈 변환보다 뒤에 돌아 `a` + 줄바꿈 + 공백이 `a\`로 쓰였다(리뷰 중요 1). 마크 안 끝 줄바꿈 `**a\`+줄바꿈+`**`은 3단계부터 있던 문제다(경미 9). 공백만 있던 마크·링크는 지운다(경미 10).
17. **렌더 실패는 블록·자산 단위로 줄인다.** 하이라이터가 한 블록에서 실패하면 그 블록만 민무늬다. 자산 조회가 실패하면 srcset 없이 그린다. 글 전체가 500이 되지 않는다(리뷰 경미 7). 파이프라인 자체 실패는 그대로 500이다(다음 요청이 다시 그린다).
18. **접근 이름.** 복사 버튼 `aria-label="<언어> 코드 복사"`, 표 상자 `role="region" aria-label="표"`(리뷰 경미 11). 제목 앵커의 `aria-label`은 GitHub과 같은 방식이라 두었다.
19. **제목 id 보완.** slug가 비는 제목(이모지·문장 부호만)은 `section`, 각주 머리 id `footnote-label`을 예약, 제목 안 각주 번호는 목차 글자와 id에서 뺀다(리뷰 경미 2·4·5). 원시 HTML 코드 블록의 `<br>`은 줄바꿈으로 하이라이트한다(경미 6). 주소의 줄바꿈은 `&#xA;`로 쓴다(경미 3).
20. **목차가 없는 글은 1280px 이상에서도 한 열 가운데다.** 지금 공개 글은 모두 h2·h3가 있다(Plan 1.1). 노트(PR-B)를 위해서다(리뷰 경미 12).

사용자 결정(2026-11-09):

21. **정규화 규칙 7: 블록(단락·제목·목록 항목·표 칸) 처음·끝의 공백을 지운다(Plan 5절 대응표의 "`normalizeForCompare`는 바꾸지 않는다"와 다름).** 사용자가 a안을 골랐다. 근거는 D14와 같다: 브라우저는 블록의 처음·끝 공백을 그리지 않는다(규칙 3·6과 같은 근거). 링크·강조 안으로 들어가고, 코드·이미지·줄바꿈 같은 잎에서 멈춘다(그 옆 공백은 보인다). NBSP는 지우지 않는다. 테스트 3개(같은 경우 6, 다른 경우 4). 덤프 55/55, 운영 59/59.

## 6. 리뷰 결과

### 6.1 PR-A

새 리뷰어(별도 에이전트, 읽기 전용)가 커밋 전 작업 트리를 검토했다. 의심 입력을 임시 테스트로 직접 돌려 봤다(임시 폴더는 지웠다). 치명 0, 중요 1, 경미 12건이었다. 중요 1과 경미 10건을 고쳤다. 각 수정은 실패하는 테스트를 먼저 썼다(26개: 수정 13 + 리뷰가 짚은 테스트 빈틈 13).

| 지적 | 처리 |
|---|---|
| 중요 1: 단락 끝 줄바꿈 뒤 공백을 지우면 줄바꿈이 `\`로 쓰여 공개 렌더에 `\`가 보이고 두 번 왕복이 안정하지 않다(D14가 만든 회귀). 목록·인용·콜아웃 안도 같다 | 고침(5절 16) |
| 경미 2: 이모지·문장 부호만 있는 제목의 id가 빈 값·`-1` | 고침(5절 19) |
| 경미 3: 줄바꿈이 있는 주소를 `<…>` 안에 그대로 써 링크가 깨진다(기본 핸들러는 됐다) | 고침(5절 19) |
| 경미 4: 본문 제목이 각주 머리 id `footnote-label`을 가져간다 | 고침(5절 19) |
| 경미 5: 제목 안 각주 번호가 목차 글자·id에 들어간다 | 고침(5절 19) |
| 경미 6: 원시 HTML 코드 블록의 `<br>`을 버린다 | 고침(5절 19) |
| 경미 7: 자산 조회·하이라이트 실패가 글 전체 500이 된다 | 고침(5절 17) |
| 경미 8: 스크롤 스파이가 멀리 건너뛰기와 문서 끝을 놓친다. 대기 중 rAF를 취소하지 않는다 | 고침(5절 15) |
| 경미 9: 마크 안 끝 줄바꿈이 `\&#xA;`로 쓰인다(3단계부터) | 고침(5절 16) |
| 경미 10: 공백만 있던 링크가 빈 링크로 남는다 | 고침(5절 16) |
| 경미 11: 표 상자 이름 없음, 복사 버튼 이름이 모두 "복사", 앵커 이름이 길다 | 앞 둘 고침(5절 18). 앵커는 흔한 방식이라 둠 |
| 경미 12: 목차 없는 글도 1280px 이상에서 240px 빈 칸 | 고침(5절 20) |
| 경미 13: `lowlight.ts` 주석이 낡았다. 미리보기 오류 문구가 이스케이프 없이 innerHTML로 들어간다(3단계부터) | 둘 다 고침 |
| 테스트 빈틈: `render-entry`, `resolvePostPageBySlug`, `getAdjacentPosts`, `categoryPath` | `render-entry.test.ts`(5), `content-posts.test.ts`(8)를 더했다. `post-scripts`의 DOM 테스트는 jsdom이 없어 브라우저 확인(4.5)으로 대신했다 |

리뷰어가 확인한 것: 안전 처리 순서(strip-unsafe가 rehype-raw 바로 뒤, 그 뒤에 만드는 button·Shiki style·KaTeX는 남고 원시 `button.code-copy`는 지워진다), `javascript:` 우회(대소문자·앞 공백·엔티티)·`on*`·`srcset`·svg animate·iframe 모두 막힘, 펜스 언어·meta·제목 글자의 이스케이프, `set:html`은 본문 하나, D14 목적지 왕복(줄바꿈 제외, 고침), Shiki 별칭·CRLF·빈 코드·```` ```math ````, CSS 우선순위(typography `:where`보다 우선), 에디터 회귀 없음(옮긴 규칙 빠짐 없음, 단락 색 변경은 의도), ClientRouter 아래 중복 바인딩 없음, 301 인코딩·캐시 태그, 404 캐시 안 함, 자산 메모 키, D16·D8·D7과 맞음. 구현자 판단 (a)~(h)(5절 1~9)는 모두 타당하다고 봤다. 덧붙인 것: 렌더 캐시는 `invalidateEntriesCache`로 비워지지 않아 자산 변형 변경은 최대 10분 늦게 보인다(수용). `hover: none`인 키보드 달린 태블릿에서는 제목 앵커가 탭 순서에서 빠진다(수용, 목차가 같은 링크를 준다).

## 7. 다음 작업

**끝난 것.** PR-A(T1·T2) 구현·검증·리뷰 수정(1~6절). 커밋 전.

**다음 것.**

1. 사용자 승인(2026-11-09)으로 PR-A 커밋·푸시·PR(대상 `rebuild`), PR 링크 커밋, 태그 `rebuild-pre-stage4`(`b2583ed`) 푸시. PR 병합은 사용자 확인 뒤다.
2. PR-A 병합 뒤 `rebuild` 미리보기에서 글 상세 콜드 TTFB를 잰다(D7 뒤집는 조건 1.5초). 쿼리 붙은 영상 주소의 실제 발행 확인은 T8(8.5)에서 한다.
3. PR-B(T3·T4·T5)는 새 세션이다. PR-A에서 넘기는 것:
   - `src/lib/public-paths.ts` `categoryPath()`를 `/blog/category/<key>`로 바꾼다(5절 3).
   - 타이포 스케일·본문 h1 크기·라이트 `--text-secondary`(D10, 부록 B)를 토큰으로 넣을 때 `prose.css`의 크기 값을 그 토큰으로 바꾼다(5절 11).
   - `@tailwindcss/typography`를 지울 때 `prose.css`가 혼자 서야 한다. 지금은 typography가 주는 목록 표시(marker)·`figure`·`thead` 기본값 등에 기대는 곳이 있을 수 있다. 지운 뒤 에디터와 글 상세를 다시 본다. 글 상세·미리보기·편집 영역의 클래스 `prose prose-lg dark:prose-invert`도 `prose`만 남긴다.
   - `ClientRouter`를 지우면 `post-scripts.ts`의 `astro:page-load` 줄을 지운다.
   - `react-markdown`·`rehype-highlight` 의존성 삭제(T5).
   - `BaseLayout`의 `<slot name="head" />`를 새 레이아웃에도 둔다.
4. T8은 공유 노트의 `stage4-pr-a-post-detail-check.mjs`를 `scripts/smoke/stage4-public.mjs`로 옮겨 넓힌다.

## 8. 열린 질문

1. ~~운영 왕복 검사 58/59(4.2)~~ 닫음: 사용자가 a안(정규화 규칙 7)을 골랐다(2026-11-09). 59/59(5절 21).
2. 실제 브라우저(Chrome·Safari)의 클립보드 API 경로 확인. 이 앱 브라우저는 권한이 거부돼 대체 경로만 확인했다.
