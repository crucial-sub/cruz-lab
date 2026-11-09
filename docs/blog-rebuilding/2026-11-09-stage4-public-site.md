# 재건 4단계 작업 문서: 공개 사이트

- 날짜: 2026-11-09 (PR-A 구현), 2026-11-10 (PR-B 구현)
- Plan: [2026-11-09-stage4-public-site-plan.md](./2026-11-09-stage4-public-site-plan.md) (승인 2026-11-09, PR #14 병합 `b2583ed`)
- 진행 기록: [계획 문서 11.9](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md#119-4단계-구현-진행-기록-2026-11-09)
- 브랜치: `stage4/a-renderer`(PR-A, [PR #15](https://github.com/crucial-sub/cruz-lab/pull/15), `rebuild`에 병합 `2b32907`), `stage4/b-pages`(PR-B, `2b32907`에서 생성). 대상은 `rebuild`다. PR-C `stage4/c-projects-og`, 문서 PR `stage4/docs`는 아직이다.
- 상태: **PR-A(T1·T2) 병합. PR-B(T3·T4·T5) 구현·검증·리뷰 수정 끝(6.2).** 커밋·푸시·PR은 사용자 확인 뒤다.

## 1. 현재 상황

| 항목 | 상태 |
|---|---|
| PR-A (T1 공유 파이프라인, T2 글 상세) | 끝. [PR #15](https://github.com/crucial-sub/cruz-lab/pull/15) `rebuild` 병합(`2b32907`). 테스트 504, 왕복 59/59, 공개 스모크 322/0, 글 상세 점검 378/0. 리뷰 치명 0·중요 1·경미 12(6.1). 태그 `rebuild-pre-stage4`(`b2583ed`) |
| PR-B (T3 토큰·레이아웃, T4 페이지, T5 React 삭제) | 구현·검증·리뷰 수정 끝(2026-11-10). 브랜치 `stage4/b-pages`(`origin/rebuild` `2b32907`에서 생성). 204파일(글꼴 subset·라이선스 93개 포함). 글꼴·lockfile을 빼면 108파일, +3,871·−4,190줄(문서 포함). 테스트 526(+22), `tsc` **0**, lint·빌드 통과, 운영 왕복 59/59, 2단계 공개 스모크 324/0, PR-B 공개 점검 602/0, 공개 페이지 `astro-island` 0, 브라우저 확인(4.10). 리뷰 치명 0·중요 3·경미 15 → 중요 3·경미 10 고침(6.2). 커밋 전 |
| PR-C (T6·T7·T8), 문서 PR (T9) | 아직. PR-B 병합 뒤 새 세션(7절) |
| 외부 변경 | 없음 |
| 운영 데이터 | PR-A는 읽기만 했다. PR-B는 사용자 승인(2026-11-10)으로 시험 노트 1편(`PqVMdc6m0mTvrsEOrAgt`, slug `note-20261110-0054`)을 만들어 발행하고 확인 뒤 지웠다(4.11). 남은 것: `publishLog` 2건(발행·삭제, 승인한 대로). `entries` 59(공개 post 54, 초안 5: 에세이 1편 + 사용자 시험 초안 4편)로 처음과 같다. 사용자 시험 초안은 건드리지 않았다 |

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

### 2.3 T3: 토큰·타이포·레이아웃 (PR-B)

| 파일 | 내용 |
|---|---|
| `src/styles/global.css` | 다시 썼다(부록 B). 색 토큰은 그대로, 라이트 `--text-secondary` `#475569`. 글자 크기 `--text-xs … --text-4xl`(12~42px), `--leading-body` 1.75·`--leading-heading` 1.25, `--font-sans`·`--font-mono`, `--container` 960px, `--gutter` 16px(380px 미만 12px), `--measure` 68ch, `--transition-colors`. 옛 `--typo-*`·`--link-visited`와 히어로·커서·shimmer 애니메이션을 지웠다. JS가 없으면 시스템 테마를 따른다(5절 26). 링크 색 규칙은 `a:where(…)`(5절 28). `.container`·`.site`·`.site-main` 규칙. `@view-transition { navigation: auto }`(동작 줄이기 설정이면 끔) |
| `src/styles/fonts.css` | 새 파일. Pretendard Variable 1.3.9 dynamic subset 92개(공식 CSS에서 파일 주소만 바꿈) + JetBrains Mono 2개. `global.css`가 `@import` |
| `public/fonts/pretendard/subset/*.woff2` 92개, `LICENSE.txt` | npm `pretendard@1.3.9`(OFL-1.1)의 `dist/web/variable/woff2-dynamic-subset`. 합계 2,960,892바이트. 단일 파일 `PretendardVariable.woff2`(2,057,688바이트, 같은 판)는 지웠다 |
| `tailwind.config.mjs` | typography 플러그인·설정 삭제. `corePlugins.container: false`. `fontFamily`는 `var(--font-sans)`·`var(--font-mono)`. 색·모서리 이름은 그대로 |
| `src/layouts/BaseLayout.astro` | `ViewTransitions`(ClientRouter) 삭제. head 슬롯은 PR-A 자리 그대로(5절 27). `body.site`, `main.site-main` |
| `src/layouts/components/BaseHead.astro` | `image` → `ogImage`(기본값은 PR-C까지 프로필 사진, 5절 23). preload는 subset 91·90·89만(측정, 5절 24). JetBrains Mono preload 삭제. JS 전용 요소를 숨기는 noscript 스타일. 노트 RSS `alternate` 추가. 사이트 이름·설명은 `public-paths.ts`에서 |
| `src/layouts/components/Header.astro` | 한 줄: 로고 · Blog · Notes · Projects · About · 테마 · GitHub(D6 a). sticky 아님. 현재 메뉴 `aria-current="page"`(`/series`는 Blog). 380px 미만 간격 12px. GitHub 아이콘은 인라인 SVG(`currentColor`) |
| `src/layouts/components/ThemeToggle.astro` | 새 파일. 버튼 + 클라이언트 스크립트. 아이콘은 CSS가 `html.light`로 고른다. 버튼 이름은 "라이트 테마로 전환"/"다크 테마로 전환". `data-js-only` |
| `src/layouts/components/Footer.astro` | 왼쪽 저작권, 오른쪽 링크 7개: 연재 · RSS · 노트 RSS · GitHub · 이메일 · 사이트맵 · About(D10, D6 답의 연재 입구 4) |
| `src/pages/404.astro` | prerender 유지. 문구 + 링크 4개(홈·블로그·노트·소개) |
| `src/styles/prose.css` | 크기를 토큰으로(본문 `--text-base`·`--leading-body`, h1·h2 `--text-2xl`, h3 `--text-xl`, h4 `--text-lg`, h5·h6 `--text-base`). 본문 h1은 h2와 같은 모양. typography가 주던 것: 목록 표시(disc·decimal·circle·square, `::marker` 보조 색), 할 일 목록, 각주, `kbd`, 인용 첫·끝 여백. 코드 글꼴 `--font-mono`. JS가 없을 때의 라이트 코드 토큰 |
| `src/styles/shiki.css` | JS가 없을 때 시스템 라이트면 light 변수 |
| `src/components/post/PostArticle.astro` | 클래스 `prose`만. 크기 토큰. 1280px 이상 그리드를 컨테이너 밖까지 넓힌다(5절 29). 노트 변형(`kind="note"`): 작은 제목, "노트 · 날짜", 읽기 시간 없음 |
| `src/components/post/post-scripts.ts` | `astro:page-load` 재연결 삭제(ClientRouter 삭제) |
| `src/editor/ui/EditorApp.tsx`, `PreviewMode.tsx` | 클래스 `prose prose-lg max-w-none dark:prose-invert` → `prose`. 공개 주소가 없는 kind의 발행 토스트 문구(노트는 이제 주소가 있다) |

### 2.4 T4: 페이지 (PR-B)

| 파일 | 내용 |
|---|---|
| `src/pages/index.astro` | 홈(D17): "Cruz" + 한 줄 + 2줄 소개 + 소개 → · 프로젝트 →, 최신 글 3편 `PostCard`, 최신 노트 3편(노트가 없으면 숨김). 사진·애니메이션 없음 |
| `src/pages/about.astro` | 새 파일, prerender(D17). 사진 96px(`astro:assets` `<Image>`, 1x·2x) · 이름 · 한 줄 · 하는 일 3문장 · 프로젝트 4줄 · 경력/교육 2줄(정글은 `<details>`) · 기술 한 줄 · 연락처 3 + 이력서 PDF. 프로젝트 목록은 파일에 적었다(5절 22) |
| `src/pages/blog/index.astro`, `blog/category/[key].astro`(새), `blog/tag/[tag].astro` | 같은 `BlogList`. 카테고리는 모르는 key·글 없는 카테고리면 404, 태그는 글이 없으면 404(3단계까지는 빈 목록 200). 404 방식은 2.6 |
| `src/components/blog/BlogList.astro` | 제목 · 설명 · "연재 N개 보기 →" → 카테고리 탭 → 태그 칩 + 검색 → 결과 수 → 연도 묶음 행 → 빈 결과 안내(D17) |
| `PostRow.astro`, `PostCard.astro`, `PostCover.astro`, `CategoryTabs.astro`, `TagChips.astro`, `SearchFilter.astro` | 행(MM.DD · 제목 · 설명(640px 미만 숨김) · 연재 배지 · 읽기 시간), 커버 카드(홈), 코드 커버(PostCover.tsx를 옮김, hover 모션 없음), 탭(가로 스크롤), 칩, 검색(D2: 제목·설명·태그·카테고리 이름, `?q=`, 결과 수, 빈 연도 묶음 숨김, `data-js-only`). 행·카드는 제목 링크 하나를 가상 요소로 넓힌다(5절 33) |
| `src/lib/blog-list.ts`, `src/lib/search-filter.ts` | 새 파일. 탭·칩·연재 배지·연도 묶음·검색 글자(순수 함수). 검색어 비교는 브라우저 번들에 들어가므로 다른 모듈을 가져오지 않는다 |
| `src/pages/series/index.astro`, `series/[key].astro`(`[slug]`에서 이름 바꿈) | 연재 한 줄씩(제목 · 설명 · N편 · 마지막 발행일), 상세는 번호 목록(제목·날짜·읽기 시간). 이모지·시작하기 버튼 없음. 없는 연재는 404(3단계까지는 `/404`로 302) |
| `src/pages/notes/index.astro`, `notes/[slug].astro`, `notes/rss.xml.ts` | 새 파일(D12). 스트림은 노트 본문을 `renderEntry`로 그린다(수식이 있으면 KaTeX CSS). 상세는 `PostArticle kind="note"`, 다른 kind slug는 301. 노트 RSS(제목 없으면 "노트 · 날짜", 설명은 첫 줄) |
| `src/components/notes/NoteItem.astro`, `src/lib/content/excerpt.ts` | 노트 하나(날짜 영구 링크 · 제목 · 본문 · `#`). 본문 첫 줄 발췌(코드·수식·원시 HTML·구분선 건너뜀, 120자) |
| `src/lib/server/entries.ts`, `src/lib/content-posts.ts` | `listPublishedNoteEntries()`(5절 30), `toPublicEntry()`로 공통화. `resolveEntryPageBySlug(slug, kind)`·`resolveNotePageBySlug`, `getAdjacentPosts(id, kind)`, `getPublishedNoteEntries()` |
| `src/lib/entry-rules.ts` | `publicPathFor('note')` → `/notes/<slug>`. project는 아직 null(PR-C) |
| `src/lib/public-paths.ts` | `categoryPath` → `/blog/category/<key>`(PR-A 7절 3), `notePath`, `BLOG_INDEX_PATH`, `SITE_TITLE`·`SITE_DESCRIPTION`(옛 `src/consts.ts`) |
| `src/lib/redirects.ts` | 동의어 태그 → `/blog/category/<key>` 301. 정규화가 필요한 주소(`/blog/tag/JavaScript`)도 한 번에 간다 |
| `src/pages/sitemap-posts.xml.ts`, `rss.xml.ts` | 사이트맵에 글 있는 카테고리·태그, 노트를 더했다(5절 35). RSS는 사이트 이름 import만 바꿈 |
| `src/pages/projects/index.astro`, `projects/[project]/[slug].astro`, `src/components/projects/ProjectCard.astro` | 아일랜드·Reveal을 걷어냈다(5절 22). 목록은 `ProjectCard.astro`(코드 커버 · 설명 · 기술 · GitHub·Demo, order 순). 글은 `prose.css` |
| `src/pages/blog/[...slug].astro` | `ogImage` prop 이름만 |

### 2.5 T5: 삭제와 의존성 (PR-B)

| 지운 것 | 줄·크기 | 확인 |
|---|---|---|
| `src/components/islands/` 16개 | 1,683줄 | grep: 가져오는 곳 없음 |
| `src/components/blog/BlogPostList.tsx`, `PostCover.tsx` | 649줄 | `PostCover.astro`로 대체 |
| `src/components/ExperienceList.astro`, `PostsPreview.astro`, `ProjectsPreview.astro`, `Reveal.astro` | 274줄 | 홈·연재·프로젝트에서 뺐다 |
| `src/pages/series/[slug].astro` | 221줄 | `[key].astro` |
| `src/consts.ts` | 5줄 | `public-paths.ts`로 |
| `src/assets/img/crusub.png`, `404-not-found.png`, `profile.svg`, `github-mark.svg`, `github-mark-white.svg`, `public/images/*.svg` 11개 | 약 0.4 MB | github-mark 두 개는 헤더를 인라인 SVG로 바꿔 쓰는 곳이 없어졌다(Plan 6.1 목록 밖, 5절 36) |
| `public/fonts/pretendard/PretendardVariable.woff2` | 2,057,688바이트 | dynamic subset으로 대체 |
| 의존성 `framer-motion`, `react-markdown`, `rehype-highlight`, `@tailwindcss/typography` | lockfile −106줄 | `pnpm remove`. `astro.config.mjs`의 `optimizeDeps.include`에서 `framer-motion`을 뺐다. `@astrojs/mdx`는 PR-C(D1) |

남은 React: `@astrojs/react`·`react`·`react-dom`(관리자 로그인과 에디터), `lucide-react`(에디터 명령 목록).

### 2.6 리뷰 뒤 수정 (PR-B, 6.2)

| 파일 | 내용 |
|---|---|
| `src/components/NotFound.astro`(새), `src/lib/server/not-found.ts`(새), `404.astro`, 카테고리·태그·연재·노트 상세 페이지 | 없는 주소는 페이지가 안내 화면을 직접 그리고 `markNotFound()`(404, `X-Astro-Reroute: no`). `BaseHead`·`BaseLayout`에 `noindex` prop(5절 31) |
| `src/lib/content/rehype-strip-unsafe.ts`, `prose.css` | 할 일 체크 상자만 남긴다(읽기 전용, `accent-color` 브랜드)(5절 42) |
| `src/lib/content/markdown.ts`, `src/lib/server/render-entry.ts`, `notes/index.astro` | `idPrefix` 옵션과 접두사별 렌더 캐시 칸, 노트 스트림에 `n-<id>-`(5절 43) |
| `PostArticle.astro` | 노트의 카테고리·태그는 글자(5절 44) |
| `Header.astro` | `aria-current` `page`/`true`, 360px 미만 메뉴 가로 스크롤(5절 45) |
| `astro.config.mjs` | `tailwind({ applyBaseStyles: false })`(5절 46) |
| `src/editor/editor.css` | `.tag`·`.tag-sm`(5절 47) |
| `BaseHead.astro` | 테마 초기화는 저장소 읽기만 `try`(5절 48) |
| `search-filter.ts`, `blog-list.ts`, `excerpt.ts` | 검색 `#`·카테고리 key, 발췌는 첫 단락·제목·표 칸까지(5절 49) |
| `content-posts.ts` | `getAllContentTags`와 `ContentPost`의 안 쓰는 칸 4개 삭제(5절 50) |
| `PostRow`·`PostCard`·`ProjectCard`·`series/*` | 포커스 표시를 `a:focus-visible::after`로(5절 33) |
| `sitemap-posts.xml.ts` | 홈·목록 페이지 4개를 뺐다(`sitemap-0.xml`에 있다)(5절 35) |

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

### 4.6 자동 검사 (PR-B, 2026-11-10)

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과 |
| `pnpm test` | 526 통과(36 파일). PR-A 504 + 22(구현 16 + 리뷰 뒤 6): `blog-list.test.ts` 10(탭 순서·글 없는 카테고리, 칩 순서·인코딩, 연재 배지, 서울 연도 경계, 검색 글자·낱말 일치·NFD, 첫 줄 발췌 3, MM.DD), `content-posts.test.ts` +5(노트 slug 301, project slug 404, 노트 상세 조회 2, 노트끼리 이웃, `notePath`), `redirects.test.ts` +1(동의어 태그 301 8경우). 리뷰 뒤: 할 일 체크 상자, id 접두사 2, 렌더 캐시 칸, 발췌 목록·표, 검색 `#`·카테고리 key. 바뀐 규칙에 맞춰 고친 것: 카테고리 주소, `publicPathFor('note')`, 노트 slug 처리, `/blog/tag/javascript` |
| `tsc --noEmit` | **0**(PR-A 1 → 0. `TextReveal.tsx` 삭제). 새 worktree는 `pnpm astro sync`를 먼저 돌린다 |
| `pnpm build` | 통과. 경고 2(기존): 500 KB 넘는 청크(에디터·하이라이터), 로컬 Node 24 → Vercel Node 22 |

### 4.7 왕복 검사·공개 스모크·공개 점검 (읽기만)

| 검사 | 결과 |
|---|---|
| 운영 왕복 `pnpm smoke:roundtrip` | 59/59 |
| `scripts/smoke/stage2-public.mjs`(5절 37) | 빌드 결과(localhost:4390) 324/0, 개발 서버(localhost:4326) 324/0 |
| PR-B 공개 점검(Plan 8.2의 1·2·3·4·8·9·10, 공유 노트 `stage4-pr-b-public-check.mjs`, 빌드 결과) | 리뷰 수정 뒤 점검 602건, 실패 0(처음 578/0에 404 4종·사이트맵 중복 검사를 더했다). 글 54편마다 목차 = h2·h3(합 467), 코드 틀 = 펜스(합 258), KaTeX 링크는 수식 글 3편만, `astro-island` 0, cdnjs 0, 캐시 태그 `post-<id>`. `/blog` 67,027바이트(100 KB 이하), 행 54, 탭 전체 54 + 카테고리 9(합 54), 칩 15(글 수 일치). 카테고리 9개 200·행 수 일치, 회고 404, 모르는 key 404, 동의어 태그 12개 모두 301 → `/blog/category/<key>`. 태그 15개 200·행 수 일치, 없는 태그 404. `/notes` 200·노트 0 = 발행 노트 0, 홈 최신 노트 구역 없음. RSS item 54, 노트 RSS item 0, 사이트맵에 카테고리 9·태그 15(글 없는 카테고리 없음), `sitemap-0.xml`에 `/about`. `/about` 200, `/no-such-page` 404(안내 문구), `/series`·`/series/pintos`·`/projects` 200·아일랜드 0. `/blog/category/no-such`·`/blog/tag/no-such-tag`·`/series/no-such`·`/notes/no-such`는 404·안내 화면·캐시 헤더 없음·`noindex`. 사이트맵에 목록 페이지 4개 중복 없음. 응답 105개 모두 `Set-Cookie` 없음 |
| 상태 코드(개발 서버, curl) | `/blog/tag/javascript`·`/blog/tag/JavaScript` → 301 `/blog/category/javascript`, `/blog/tag/운영체제` → 301 `/blog/category/os`, `/series/wesbos` → 301 `/series/wesbos30`, `/series/nope`·`/notes/none-such`·`/blog/category/retrospective` 404 |

노트는 처음에 0편이라 단위 테스트로만 확인했다. 사용자 승인으로 시험 노트를 발행해 실제 데이터로 다시 확인했다(4.11).

### 4.8 번들 (빌드 결과 비교, Plan 8.1)

이전 = PR-A 빌드(`fc15333`, `rebuild` `2b32907`과 트리가 같다). 이후 = PR-B 빌드. 두 빌드 결과(`.vercel/output`)를 각각 Node로 띄워 같은 주소를 받았다. "첫 화면 JS"는 HTML의 `<script src>`·아일랜드 주소에서 정적 import를 따라간 `_astro` 파일 합이다(인라인 스크립트 제외).

| 페이지 | HTML 바이트(이전 → 이후) | `astro-island` | 첫 화면 JS 바이트(gzip) | React 청크 |
|---|---|---|---|---|
| `/` | 85,364 → 22,257 | 20 → 0 | 368,857(127,544) → 0 | 참조 → 없음 |
| `/blog` | 355,068 → 67,027 | 3 → 0 | 345,021(115,292) → 0 | 참조 → 없음 |
| `/blog/tag/pintos` | 48,481 → 21,732 | 6 → 0 | 327,712 → 0 | 참조 → 없음 |
| `/blog/category/os` | (없음) → 24,586 | 0 | 0 | 없음 |
| 글 상세(「UserProgram - 시스템 콜 동작 흐름」) | 101,075 → 98,084 | 1 → 0 | 204,620(66,607) → 2,407(1,194, `post-scripts`) | 참조 → 없음 |
| `/series` · `/series/pintos` | 17,112 · 24,411 → 14,216 · 15,918 | 2 · 1 → 0 | 318,945 · 204,620 → 0 | 참조 → 없음 |
| `/notes` · `/about` | (없음) → 13,936 · 18,406 | 0 | 2,407 · 0 | 없음 |
| `/projects` · 프로젝트 글 | 35,292 · 23,042 → 21,600 · 20,291 | 5 · 1 → 0 | 325,102 · 204,620 → 0 | 참조 → 없음 |
| 404 | 12,843 → 12,172 | 1 → 0 | 204,620 → 0 | 참조 → 없음 |
| `/admin/login` | 13,068 → 15,301 | 2 → 1 | 363,021 → 346,580 | 참조(그대로, 관리자) |

- 공개 페이지의 남은 스크립트는 인라인이다: 테마 초기화(420바이트), 테마 버튼(460바이트), 목록 검색(1,046바이트, `/blog`·카테고리·태그). 글 상세·`/notes`는 `post-scripts` 파일 하나(2,360바이트).
- React 런타임 청크(`client.*.js` 175,550바이트, `index.*.js`)는 `/admin/login`만 참조한다. 에디터(`/admin/edit/*`)는 `client:only`라 참조한다(Plan 8.1과 같다).
- CSS(페이지당 링크 합): 이전 108,140 → 이후 69,812~82,772바이트(리뷰 뒤 Tailwind 중복 제거로 약 17 KB 더 줄었다. 처음 87,051~99,919). 전역 CSS 69,812바이트(gzip 18,602) 중 57 KB가 `fonts.css`다.
- 에디터 청크 `EditorApp.*.js` 1,813,923바이트(gzip 555,489, PR-A 1,813,979). 미리보기 하이라이터 청크 1,584,737바이트(그대로).
- `_astro` 파일 124 → 106개.

### 4.9 Lighthouse (PR-B, 로컬 빌드 결과, 모바일, Plan 8.4)

측정 방법은 5절 41이다. 이전 = PR-A 빌드(`rebuild`와 같은 트리). Lighthouse 12.8.2, 모바일 기본값. 기록이지 통과 조건이 아니다(Plan 8.4).

시뮬레이션 조절(Lighthouse 기본, 3회 중앙값. 이후 = 리뷰 수정 뒤 빌드):

| 페이지 | 성능(이전 → 이후) | FCP | LCP | TBT | CLS | 전송량 | 접근성 |
|---|---|---|---|---|---|---|---|
| 홈 | 74 → **86** | 1.7 → 3.0초 | 22.2 → 3.3초 | 9 → 0 ms | 0 → 0 | 5,757 → 848 KiB | 88 → 100 |
| `/blog` | 50 → **93** | 1.7 → 2.4초 | 15.3 → 2.7초 | 1,263 → 0 ms | 0.009 → 0 | 2,713 → 765 KiB | 84 → 100 |
| 글 상세(「UserProgram - 시스템 콜 동작 흐름」) | 73 → **76** | 1.6 → 3.2초 | 12.9 → 4.5초 | 0 → 0 ms | 0.073 → 0.079 | 2,693 → 1,023 KiB | 96 → 100 |
| `/about` | (없음) → **90** | 2.7초 | 3.0초 | 0 ms | 0 | 833 KiB | 100 |

리뷰 수정 전 빌드의 중앙값은 홈 85, `/blog` 92, 글 상세 79, `/about` 89였다. 글 상세의 3회 값은 수정 전 79·82·75, 수정 뒤 77·72·76으로 겹친다(흔들림 안의 차이). 목표 90 이상은 `/blog`·`/about`이다.

실제 조절(`--throttling-method=devtools`, 1회):

| 페이지 | 성능(이전 → 이후) | FCP | LCP | TBT |
|---|---|---|---|---|
| 홈 | 86 → **97** | 1.6 → 2.1초 | 3.0 → 2.1초 | 340 → 40 ms |
| 글 상세 | 92 → **93** | 2.2 → 2.2초 | 3.0 → 2.3초 | 0 → 190 ms |

원인(측정):

1. **LCP가 크게 줄었다.** 이전 홈은 2 MB 글꼴 + 3 MB 이미지(히어로 사진·스킬 로고)를 받았다. 지금 홈은 이미지가 없고 글꼴 subset 12개(371 KB)다. LCP 요소는 홈이 소개 단락, 글 상세가 표지 이미지(Firebase Storage, legacy라 크기 없음)다.
2. **시뮬레이션의 FCP가 1.6~1.7 → 2.4~3.2초로 늘었다.** 실제 조절에서는 홈 1.6 → 2.1초, 글 상세 2.2 → 2.2초다. preload한 subset 3개가 첫 그리기 전에 끝난다(실제 조절 기록에서 FCP 전에 끝난 글꼴 요청 3개, 이전은 0개). 시뮬레이션은 첫 그리기 전에 끝난 요청을 FCP 경로에 넣고 느린 4G로 다시 계산하므로 더 크게 늘어난다. preload를 뺀 실험(같은 빌드, 프록시로 preload만 제거)은 홈 FCP 3.8초로 나아지지 않았다. 그래서 preload는 그대로 둔다.
3. **글 상세 CLS 0.079**는 legacy 이미지(크기 모름, Plan 11절의 알려진 위험)다. 이전 0.073과 비슷하다.
4. **1회 값은 흔들린다.** 같은 빌드의 홈이 72·85·85·91, 글 상세 TBT가 1,100 ms·0 ms로 나왔다(로컬 CPU 상태). 그래서 3회 중앙값을 적는다.
5. 단일 2 MB 파일로 되돌린 실험(같은 빌드, 프록시로 CSS만 교체)은 홈 FCP·LCP 11.7초, 글 상세 LCP 12.5초였다. dynamic subset이 LCP에 결정적이다.

`rebuild` 미리보기(CDN·brotli)에서 다시 잰다(7절 2).

### 4.10 브라우저 확인 (PR-B, localhost:4326 개발 서버, 앱 브라우저, Plan 8.3의 1·2·4·5·7·9)

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | JS 끄고 홈·`/blog`·글 상세·`/notes`·`/about`(헤드리스 Chrome + CDP, 5절 40) | 모두 읽힌다. `html`에 테마 클래스가 없고, 시스템 다크면 `#0e0f12`, 시스템 라이트면 `#f8fafc`·글자 `#0f172a`. 검색창·테마 버튼 숨김. `/blog` 행 54개 모두 보임. 코드 복사 버튼 숨김. 가로 넘침 0 |
| 2 | `/blog`에서 "pintos" 입력 | 54 → 5행, 결과 수 "5편 / 전체 54편", 2026 묶음 숨김, 주소 `?q=pintos`. `?q=스택`으로 새로 열면 입력창에 "스택", 1편. 카테고리 탭은 링크(주소 이동) |
| 4 | 390px·360px | 헤더 한 줄(390px: 로고 16~58, 메뉴 74~280, 도구 310~374 / 360px: 간격 12px, 도구 오른쪽 끝 348). 글 상세 순서 머리 → 연재 상자 → 표지 → 목차 `<details>` → 본문. `/blog` 탭 가로 스크롤, 칩 줄바꿈, 설명 숨김. 가로 넘침 0 |
| 4 | 1280px 글 상세(「큐(Queue)」) | 글 영역 969px(컨테이너 밖까지), 본문 689px, 목차 240px. 본문 17px·행간 29.75px, h2 27px, 목록 disc. 가로 넘침 0 |
| 5 | 라이트 전환(테마 버튼) | `html.light`, 저장값 `light`, 버튼 이름 "다크 테마로 전환", 달 아이콘. 바탕 `#f8fafc`, 본문 `#0f172a`, 보조 `#475569`(부록 B), 코드 바탕 `#f6f8fa`, 토큰·인라인 코드 `#cf222e` |
| 7 | 시험 노트 발행 → 토스트 → `/notes/<slug>` | 4.11 |
| 9 | 문서 간 전환(Chromium 앱 브라우저, `/blog` → 헤더 About) | `@view-transition` 규칙이 있고, 떠나는 페이지의 `pageswap` 이벤트에 `viewTransition`이 있다(전환 시작). 현재 메뉴 About |
| — | 에디터(「큐(Queue)」 열기만, typography 삭제 뒤) | 편집 영역 클래스 `tiptap-body prose`, 본문 17px·행간 1.75, h2 27px·h3 22px, 목록 disc(인용 안 포함), 인라인 코드 `#cf222e`(라이트), 표 있음. 미리보기: 코드 틀 2·Shiki 토큰 138·제목 앵커 14·표 상자 2, 목록 disc. 저장 없음: 초안 버전 1, 수정 시각 2026-03-31 그대로(Admin SDK 읽기) |
| — | 그 밖 화면 | 홈(이름·한 줄·2줄·링크, 최신 글 카드 3), `/about`(한 화면), `/series`(3줄), `/series/pintos`(5편 번호 목록), `/projects`(카드 4), 프로젝트 글(목록 disc, h2 27px, 아일랜드 0), 404(링크 4) |

리뷰 수정 뒤 다시 본 것:

| 시나리오 | 결과 |
|---|---|
| `/blog/tag/no-such` | 상태 404, 제목 "페이지를 찾을 수 없습니다", 링크 4, `noindex` |
| 글 상세 헤더 | Blog `aria-current="true"`(굵게), 그 밖 없음. 목록 disc 그대로(Tailwind 중복 제거 뒤) |
| 320px `/blog` | 메뉴가 가로로 스크롤한다. 도구 버튼과 겹치지 않음, 가로 넘침 0 |
| 키보드 Tab으로 `/blog` 행에 포커스 | 행 전체에 2px 테두리(`::after`) |
| 에디터 메타 패널 태그 칩(열기만) | 테두리 1px, 모서리 24px, 여백 2px 6px, 12px(3단계 값). 초안 버전 1 그대로. 설정을 바꾼 뒤 열려 있던 개발 서버는 에디터가 빈 화면이었고(504 Outdated Optimize Dep), 다시 켜니 정상이었다 |

콘솔 오류: 개발 서버를 다시 켤 때의 Vite WebSocket 재연결 오류만 있다(PR-A와 같다). 확인 뒤 앱 브라우저의 테마 저장값을 지웠다.

### 4.11 시험 노트 (PR-B, Plan 8.3 7·8.2 4, 사용자 승인 2026-11-10)

localhost:4326에서 관리자 화면으로 노트 1편을 만들어 발행하고, 확인한 뒤 지웠다. 운영 사이트는 `entries`를 읽지 않으므로 운영 화면은 바뀌지 않았다.

| 단계 | 결과 |
|---|---|
| 만들기 | `/admin` → 새 노트 → 소스 모드에 단락 · `## 소제목` · 인라인 코드·굵게 · 할 일 2개(빈 것·체크) · `js` 코드 블록. 제목 없음. 문서 ID `PqVMdc6m0mTvrsEOrAgt`. 에디터의 입력 규칙(`## `)은 이 도구의 글자 입력으로는 돌지 않아 소스 모드로 썼다 |
| 미리보기 | 체크 상자 2개(빈 것·체크된 것, 둘 다 disabled), 제목 id `소제목` |
| 발행 | 토스트 "발행됨 · 공개 페이지 보기"(캐시 비우기·백업 알림 실패 표시 없음). 링크 `/notes/note-20261110-0054`. 링크는 새 창이라 앱 브라우저에서는 탭이 생기지 않아 주소를 직접 열었다 |
| `/notes/<slug>` | 제목·`<title>` "노트 · 2026-11-10", 머리줄은 날짜만, 목차 `<details>`, 체크 상자 2개, 코드 틀 1·복사 버튼, 헤더 Notes `aria-current="true"`. 태그·이전다음 없음(노트 1편) |
| `/notes` | 노트 1개, 날짜 영구 링크와 `#`, 본문 id `n-PqVMdc6m0mTvrsEOrAgt-소제목`(접두사) |
| 홈 | 최신 노트 구역: 날짜 + 첫 줄 "PR-B 시험 노트입니다. 확인 뒤 바로 지웁니다." |
| `/blog/note-20261110-0054` | 301 → `/notes/note-20261110-0054` |
| `/notes/rss.xml` | item 1(제목 "노트 · 2026-11-10", 설명 = 첫 줄) |
| 공개 점검(빌드 결과, 노트 1편) | 608건, 실패 0. 노트 수·상세 200·캐시 태그 `post-<id>`·`/blog/<노트>` 301·홈 구역·노트 RSS·사이트맵에 노트 |
| 삭제 | 에디터 메뉴 → 삭제 → 정말 삭제. 관리자 목록 전체 59 |
| 남은 데이터(Admin SDK 읽기) | 문서 없음, `revisions` 0, `entryTombstones` 0(이관 글이 아니라 쓰지 않음), 자산 131(처음과 같음), `publishLog` 2(발행·삭제). `/notes/<slug>` 404, `/notes` "아직 노트가 없습니다", 홈 노트 구역 없음 |

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

PR-B(T3·T4·T5, 2026-11-10)에서 판단한 것:

22. **`/projects` 화면의 아일랜드를 PR-B에서 걷어냈다(Plan은 `/projects/**` 재작성을 T6에 뒀다).** T5가 아일랜드 16개를 모두 지우고, 공개 페이지 `astro-island` 0이 PR-B의 끝 기준이다. 그래서 `ProjectCard.tsx`·`Reveal`을 쓰던 두 페이지를 고쳤다. 목록은 `ProjectCard.astro`(D17의 코드 커버 카드, props만 받음), 글은 `Reveal`만 빼고 `prose.css`를 붙였다. 데이터는 콘텐츠 컬렉션 그대로다. T6은 데이터 출처만 바꾸면 된다. `/about`의 프로젝트 4줄은 파일에 직접 적었다. `/about`은 prerender이고 "글이 없어도 완전"해야 한다(10.2 조건 3). T6 뒤에 프로젝트 데이터가 Firestore로 가도 이 페이지는 그대로다. 주소 `/projects/<key>`는 바뀌지 않는다.
23. **OG prop 이름만 `ogImage`로 바꾸고 기본 이미지는 그대로다.** D13의 `/og/default.png`는 T7(PR-C)이 만든다. 지금 바꾸면 PR-C 병합 전까지 OG 이미지가 404다. 글 상세는 표지 이미지, 그 밖은 프로필 사진이다(3단계와 같다).
24. **글꼴: 단일 2 MB 파일을 지우고, preload는 측정으로 골랐다. JetBrains Mono preload는 뺐다.** 홈·`/blog`·글 상세 2편·`/about`·`/series`의 본문 글자를 subset 범위에 대 보니 모든 페이지에서 91 > 90 > 89 순으로 가장 많았다(파일 38·21·22 KB). 페이지마다 실제로 받는 subset은 11~17개, 286~439 KB다(3단계는 2,057 KB 한 파일). 코드 글꼴은 코드가 있는 글에서만 쓰므로 preload하지 않는다. `fonts.css`(57 KB, 92개 `@font-face`)는 전역 CSS에 들어간다(전역 CSS gzip 18.6 KB).
25. **subset 파일 92개와 라이선스를 저장소에 둔다.** Plan 10절의 "라이선스 파일 동봉"을 본문 글꼴에도 적용했다(`public/fonts/pretendard/LICENSE.txt`).
26. **JS가 없으면 테마는 시스템 설정을 따른다(Plan 8.3 1).** 3단계까지는 JS가 없으면 늘 다크였다(클래스가 없으면 `:root`의 다크 값). `@media (prefers-color-scheme: light) { html:not(.dark):not(.light) {…} }`에 라이트 값을 한 번 더 쓴다(`global.css`·`prose.css`·`shiki.css`). 같은 값이 두 곳에 있다는 주석을 달았다. JS로만 동작하는 요소(테마 버튼, 검색창)는 `data-js-only` + noscript 스타일로 숨긴다(Plan 11절의 검색창 대응을 테마 버튼에도 썼다). noscript 안 스타일은 문자열로 넣는다. 템플릿에 직접 쓰면 Astro가 CSS 중괄호를 식으로 읽어 head 전체가 깨졌다(개발 중 확인).
27. **head 슬롯은 PR-A 자리(BaseHead 바로 뒤)에 두고, 틀 CSS는 `global.css`에 둔다.** BaseHead에 슬롯을 자식으로 넘기거나 `BaseLayout.astro`에 `<style>`을 두면 astro-eslint-parser가 파일을 읽지 못했다(`Unknown token … expected "<style"`). PR-A 때와 같은 자리면 HTML 파서가 head에 넣는다.
28. **전역 링크 색 규칙의 우선순위를 낮췄다(`a:where(:not([class*='text-']))`).** 이전 규칙(0,1,1)이 컴포넌트의 스코프 링크 규칙(0,1,1)과 같아 순서에 따라 탭·칩 글자가 브랜드 초록이 됐다(개발 중 확인). 지금은 요소 하나(0,0,1)라 컴포넌트 규칙이 늘 이긴다. Tailwind preflight의 `a { color: inherit }`보다는 뒤에 있어 이긴다. 방문한 링크 색(`--link-visited` 청록)은 지웠다(hover 색 한 단계, 6.3).
29. **컨테이너는 좌우 여백을 포함해 960px(내용 928px)이다. 1280px 이상 글 상세 그리드는 컨테이너 밖까지 넓힌다.** 3단계 Tailwind 컨테이너는 992px(내용 960px)였다. 부록 B의 960px을 바깥 폭으로 읽었다. 그러면 본문 68ch(약 690px) + 간격 40px + 목차 240px이 928px에 들어가지 않는다. 이 폭에서만 음수 바깥 여백으로 가운데에 둔다(1280px 화면에서 글 영역 969px, 본문 689px, 가로 넘침 0). Tailwind `container` 플러그인은 `var()`를 미디어 쿼리에 쓸 수 없어 껐다.
30. **노트 목록은 `status == published`와 `kind == note` 등호 조건 두 개로 읽고 메모리에서 정렬한다.** 등호 조건만이라 복합 색인이 필요 없다(외부 변경 없음). 운영에서 읽어 오류 없이 0편을 받았다(`/notes` 200). 메모 키는 `entries:` 접두라 발행 때 `invalidateEntriesCache`로 함께 비워진다.
31. **없는 카테고리·태그·연재·노트 주소는 그 페이지가 안내 화면(`NotFound.astro`)을 직접 그리고 상태만 404로 둔다(리뷰 뒤 바꿈, 6.2 중요 3).** 처음에는 `new Response(null, { status: 404 })`로 prerender 404 화면을 그리게 했다. 운영(Vercel)에서는 Astro가 그때 `/404.html`을 네트워크로 다시 받는다(`App.#renderError`). 로그인 보호가 걸린 `rebuild` 미리보기에서는 그 요청이 막힐 수 있다. 지금은 `markNotFound()`(`status = 404`, `X-Astro-Reroute: no`)로 PR-A 글 상세와 같은 방식이다. 캐시 헤더를 붙이지 않아 CDN에 저장되지 않는다. `404.astro`도 같은 컴포넌트를 쓰고, 404 화면은 모두 `noindex`다.
32. **Tailwind의 글자 크기 유틸리티는 바꾸지 않았다.** 관리자 화면이 `text-sm` 등을 쓴다. 토큰(`--text-*`)은 공개 컴포넌트와 `prose.css`가 쓴다. 에디터 편집 영역·미리보기 본문은 typography `prose-lg`의 18px에서 17px(공개 페이지와 같음)이 됐다.
33. **목록 행·카드·연재 항목은 제목 링크 하나를 가상 요소로 넓혀 전체를 누르게 했다.** 링크 이름이 제목만이고(날짜·설명이 섞이지 않는다), 행 안에 링크가 겹치지 않는다(연재 배지는 표시만, D6 답). 포커스 표시는 전체를 덮는 가상 요소(`a:focus-visible::after`)에 그린다(리뷰 뒤 바꿈, 6.2 경미 11. 처음에는 `:has()`). 카드는 `overflow: hidden`이라 안쪽에 그린다.
34. **카테고리 탭은 글 수 많은 순(같으면 taxonomy 순), 태그 칩은 글 수 많은 순(같으면 한국어 순서라 한글이 영문 앞)이다. 카테고리·태그 페이지의 칩도 전체 태그다.** D17은 칩을 "글 수 순"으로만 정했다. 탭 순서는 정하지 않았다. 칩은 지금 15개다(Plan 1.1의 12개는 Plan 작성 때 값).
35. **사이트맵(`sitemap-posts.xml`)에 글 있는 카테고리 9·태그 15·노트를 더했다.** `@astrojs/sitemap`의 `sitemap-0.xml`은 prerender 페이지와 매개변수가 없는 SSR 페이지(`/`·`/blog/`·`/notes/`·`/series/`)를 이미 모은다. 처음에는 이 넷을 `sitemap-posts.xml`에도 넣어 겹쳤다(리뷰 뒤 뺐다, 6.2 경미 7). `/about`도 `sitemap-0.xml`에 있다(빌드에서 확인).
36. **`github-mark.svg`·`github-mark-white.svg`도 지웠다(Plan 6.1 목록 밖).** 헤더 GitHub 아이콘을 `currentColor` 인라인 SVG로 바꿔 쓰는 곳이 없어졌다. 다크·라이트 두 그림을 고를 필요도 없어졌다.
37. **`scripts/smoke/stage2-public.mjs`의 두 검사를 새 화면에 맞게 고쳤다.** 목록은 React props JSON이 아니라 서버가 그린 행(`<li … data-post-row>`)을 세고, 동의어 태그는 200이 아니라 카테고리로 301 → 그 목록의 행 수를 본다. 발행 노트는 `/blog/<slug>` 404 대상에서 뺐다(301이 맞다). 그대로 두면 `pnpm smoke:public`이 PR-B 뒤에 실패한다.
38. **홈 2줄·`/about` 3문장은 3단계 히어로 3문단을 줄여 썼다.** 새 사실을 더하지 않았다. 경력 세부(`<details>`)는 3단계 경력 카드의 항목 8개를 4문장으로 줄였다. 기술 목록은 스킬 그리드 11개 이름 그대로다. 연락처(GitHub·LinkedIn·이메일·이력서)는 3단계 연락처 구역의 값이다.
39. **검색은 공백으로 나눈 낱말이 모두 들어 있어야 맞다(NFC·소문자). 입력하면 `history.replaceState`로 `?q=`를 고친다.** 방문 기록을 쌓지 않는다. 결과 수는 "N편 / 전체 M편", 행이 모두 숨은 연도 묶음은 머리도 숨긴다. `hidden` 속성이 컴포넌트의 `display: grid`에 지지 않게 `[hidden] { display: none }`를 따로 둔다.
40. **(검증) JS 끈 확인은 헤드리스 Chrome + CDP `Emulation.setScriptExecutionDisabled`로 했다.** 앱 브라우저는 JS를 끌 수 없고, `--blink-settings=scriptEnabled=false`는 캡처가 끝나지 않았다. 스크립트는 세션 스크래치에 있다(저장소 밖).
41. **(검증) Lighthouse는 로컬 빌드 결과(`.vercel/output`)를 Node로 띄우고 gzip 프록시를 앞에 둬 쟀다.** Vercel 어댑터는 `astro preview`가 없다. 3회 중앙값을 적는다(1회 값은 같은 페이지가 72~85로 흔들렸다). 4.9.

리뷰(6.2) 뒤에 판단한 것:

42. **안전 처리가 할 일 목록의 체크 상자만 남긴다(`rehype-strip-unsafe`, 6.2 중요 2).** 3단계부터 `input`을 모두 지워 공개 페이지·미리보기에서 할 일의 완료 여부가 보이지 않았다. typography가 있을 때는 글머리표라도 보였는데, PR-B의 `prose.css`가 할 일 목록의 글머리표를 지워 아무 표시도 없게 됐다. 지금은 `type=checkbox`인 `input`만 남기고 속성을 `type`·`checked`·`disabled`(늘 켬)로 다시 쓴다. 원시 HTML 체크 상자도 같다. 그 밖 `input`은 지운다. 기존 글 55편에 할 일 목록은 없다(B1 덤프). 왕복 검사(`normalizeForCompare`)는 이 단계를 쓰지 않는다(59/59 그대로).
43. **`renderMarkdown`에 `idPrefix` 옵션을 더했다(6.2 경미 5).** `/notes` 스트림은 노트마다 `n-<id>-`를 붙여 그린다. 제목·각주 id, 그 id를 가리키는 `#주소`·`aria-describedby`가 바뀐다. hast에서 바꾸므로 코드 글자는 그대로다. `renderEntry`는 접두사가 다르면 다른 칸에 둔다(노트 상세와 스트림이 한 칸씩).
44. **노트의 카테고리·태그는 링크가 아니라 글자다(6.2 경미 4).** 카테고리·태그 목록 주소는 글(post)만 보이므로 노트만 쓰는 태그는 404가 된다.
45. **헤더 `aria-current`는 메뉴 주소 그 자체면 `page`, 그 아래(글 상세·연재·노트 상세)면 `true`다(6.2 경미 12).** 모양은 같다. 폭 360px 미만(Plan 기준 밖)에서는 메뉴가 가로로 스크롤한다(6.2 경미 6. 320px에서 도구 버튼과 겹쳤다).
46. **Tailwind 통합의 base.css 자동 주입을 껐다(`applyBaseStyles: false`, 6.2 경미 10, 3단계부터 있던 문제).** `global.css`가 `@tailwind` 지시문을 갖고 모든 페이지 틀(BaseLayout·AdminPage)이 가져온다. 켜 두면 preflight·utilities가 한 벌 더 나갔다. 페이지당 CSS가 약 17 KB(gzip 약 4 KB) 줄었다(4.8). 링크 색 규칙(5절 28)이 preflight와 같은 우선순위라 CSS 순서에 기대던 것도 없어졌다. 설정을 바꾼 뒤 열려 있던 개발 서버는 의존성 묶음이 낡아 에디터가 빈 화면이었다(504 Outdated Optimize Dep). 다시 켜면 된다.
47. **에디터 메타 패널의 태그 칩 규칙(`.tag`·`.tag-sm`)을 `editor.css`로 옮겼다(6.2 중요 1).** `global.css`를 다시 쓰며 지웠는데 `MetaPanel.tsx`가 아직 쓴다. 값은 3단계와 같다(브라우저에서 확인).
48. **테마 초기화 스크립트는 저장소 읽기만 `try`로 감싼다(6.2 경미 13).** 저장소가 막혀도 시스템 설정으로 클래스를 정한다. 그래서 테마 버튼의 이름·아이콘이 실제 테마와 맞는다.
49. **목록 검색은 낱말 앞의 `#`를 떼고, 카테고리 key(`os` 등)도 찾는다(6.2 경미 14).** 노트 첫 줄 발췌는 첫 단락·제목·표 칸까지 내려간다(6.2 경미 8. 목록·표 글자가 붙었다).
50. **죽은 코드를 지웠다(6.2 경미 9).** `getAllContentTags()`, `ContentPost`의 `content`·`heroImage`·`heroVideo`·`isPublic` 칸(옛 React 카드가 썼다).
51. **새 파일만 prettier로 정리했다.** 기존 파일은 원래 형식이 맞지 않던 것이 많아(PR-A 인계 노트 4) 손대지 않았다.

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

### 6.2 PR-B

새 리뷰어(별도 에이전트, 읽기 전용)가 커밋 전 작업 트리를 검토했다. lint·테스트·`tsc`를 돌리고, 의심 입력을 임시 파일로 돌려 보고, 개발 서버를 앱 브라우저·curl로 읽었다(쓰기 요청·`/admin` 없음). 치명 0, 중요 3(1건은 추측), 경미 15건이었다. 중요 3건과 경미 10건을 고쳤다. 고친 것마다 테스트를 더했다(6개: 체크 상자 1, id 접두사 2, 렌더 캐시 칸 1, 발췌 1, 검색 1).

| 지적 | 처리 |
|---|---|
| 중요 1: `global.css`에서 `.tag`·`.tag-sm`을 지웠는데 `MetaPanel.tsx:187`이 쓴다(관리자 화면 회귀) | 고침(5절 47) |
| 중요 2: 안전 처리가 GFM 체크 상자(`input`)를 지워 공개 페이지·미리보기에 할 일 표시가 없다(3단계부터. PR-B가 글머리표까지 지움) | 고침(5절 42) |
| 중요 3(추측): 빈 404 응답은 운영에서 `/404.html`을 네트워크로 다시 받는다. 보호된 미리보기에서 막힐 수 있다. 글 상세(PR-A)와 방식이 갈린다 | 고침. Astro 5.13.8 코드(`App.#renderError`)로 확인했다(5절 31) |
| 경미 4: 노트의 태그·카테고리 링크가 글 목록(404일 수 있음)으로 간다 | 고침(5절 44) |
| 경미 5: `/notes` 스트림에서 제목·각주 id가 겹친다 | 고침(5절 43). 노트 본문의 h1이 스트림의 제목 순서(h2 뒤 h1)를 깨는 것은 그대로다(노트는 짧고 제목이 드물다) |
| 경미 6: 320px에서 헤더 메뉴가 도구와 겹친다 | 고침(5절 45). Plan 기준(360px 이상)은 원래 지켰다 |
| 경미 7: `/`·`/blog`·`/notes`·`/series`가 `sitemap-0.xml`과 겹친다 | 고침(5절 35) |
| 경미 8: 노트 발췌가 목록·표 글자를 붙인다 | 고침(5절 49) |
| 경미 9: 죽은 코드·낡은 주석 | 고침(5절 50, `prose.css` 주석) |
| 경미 10: Tailwind CSS가 두 번 나간다(3단계부터) | 고침(5절 46) |
| 경미 11: stretched link의 포커스 표시가 `:has()`에만 기댄다 | 고침(5절 33) |
| 경미 12: 하위 페이지에서도 `aria-current="page"` | 고침(5절 45) |
| 경미 13: 저장소가 막히면 테마 클래스가 없다 | 고침(5절 48) |
| 경미 14: `#pintos`·카테고리 key로 찾지 못한다 | 고침(5절 49) |
| 경미 15: 홈·`/projects`가 커버 날짜·기술 글자 때문에 JetBrains Mono(92 KB)를 받는다. 홈·사이트맵이 노트 본문을 읽는다. 404에 `noindex`가 없다(기존). `content-visibility` 클래스 없음 | `noindex`만 고쳤다(5절 31). 글꼴은 커버 디자인(OG와 같은 모양, U14)이라 두었다(첫 화면 LCP에 들지 않는다, 4.9). 노트 본문 읽기는 노트가 늘면 본다(노트 0편). `content-visibility`는 영향이 거의 없어 넣지 않았다 |
| 테스트 빈틈: `listPublishedNoteEntries`, 사이트맵 순수 함수, 검색 DOM, 할 일 fixture, 발췌 목록·표, 스모크의 404 4종·노트 301 | 할 일·발췌는 테스트를 더했다. 404 4종(상태·안내 화면·캐시 헤더 없음·`noindex`)과 사이트맵 중복은 공개 점검 스크립트에 더했다(602/0). Firestore 목업·DOM 테스트는 하지 않았다(jsdom 없음, 브라우저 확인 4.10). 노트 301은 시험 노트가 필요하다(8절 2) |

리뷰어가 확인한 것: 동의어 태그 301(대문자·공백·NFD·끝 슬래시, 무한 리다이렉트 없음), 옛 연재 주소 2개, `/notes/<글 slug>` → `/blog/<slug>` 301(인코딩·캐시 태그, 왕복 루프 없음), 404의 캐시 헤더 없음, 공개 응답 `Set-Cookie` 없음, `/blog` 약 61 KB, 검색(결과 수·빈 묶음·`?q=`·공백만이면 `?q=` 삭제·`[hidden]`), 테마 버튼, 360·375px 페이지 10개 가로 넘침 0, 1280px 본문 688px·17px/1.75·본문 h1 = h2 = 27px, `prose.css` 단독(목록·표·각주·kbd·인용), 보안(`set:html`은 파이프라인 결과 2곳과 상수 하나, 외부 링크 `noopener noreferrer`, `?q`는 `value`·`textContent`로만), 남은 참조 없음(지운 파일·의존성), D6·부록 B·D11·D12·D16·D17·연재 입구 4곳. 구현자 판단 13건 중 11건 타당, 2건 재고(404 방식·사이트맵 중복, 둘 다 고침).

## 7. 다음 작업

**끝난 것.** PR-A(T1·T2) 병합(`2b32907`). PR-B(T3·T4·T5) 구현·검증·리뷰 수정(1~6절). PR-B는 커밋 전이다.

**다음 것.**

1. ~~사용자 확인~~ 끝: 시험 노트는 확인하고 지웠다(4.11). 커밋·푸시·PR(대상 `rebuild`)은 사용자 승인(2026-11-10).
2. (T8) 미리보기에서 `curl -i <미리보기>/blog/tag/no-such`로 SSR 404의 본문·헤더를 본다(5절 31, 리뷰 중요 3의 운영 확인).
3. PR-B 병합 뒤 `rebuild` 미리보기에서 글 상세 콜드 TTFB(D7 뒤집는 조건 1.5초)와 Lighthouse(CDN 포함)를 잰다. 로컬 값은 4.9.
4. PR-C(T6·T7·T8)는 새 세션이다. PR-B에서 넘기는 것:
   - `/projects` 목록은 `ProjectCard.astro`(props만 받음)다. T6은 데이터 출처(`entries` kind `project` + `seriesMeta.project`)만 바꾼다. 프로젝트 글은 `PostArticle` + Part 탭으로 다시 쓴다(D16·D17). 지금 프로젝트 글은 `Reveal`만 뺀 3단계 화면에 `prose.css`를 붙였다.
   - `/about`의 프로젝트 4줄은 파일에 있다(5절 22). key 4개(`llm-yatcha`·`stock-lab`·`cruz-lab`·`jungle-tetris`)가 T6의 `seriesMeta` key와 같고 `/projects/<key>` → 첫 글 302가 남으면 고칠 것이 없다.
   - 새 SSR 페이지(`/projects/<key>/<slug>`)의 없는 주소는 `markNotFound()` + `NotFound.astro`로 그린다(5절 31). 빈 404 응답을 돌려주지 않는다.
   - `publicPathFor('project')`는 아직 null이다. T6이 `/projects/<key>/<slug>`를 더한다. 에디터의 "이 종류는 아직 공개 주소가 없습니다" 토스트는 그 뒤 쓰이지 않는다.
   - `BaseHead`의 `ogImage` 기본값을 `/og/default.png`로, 글·노트 상세는 `/og/<id>.png`로 바꾼다(T7, D13). 노트 상세도 OG를 받는다(D12).
   - T8 `scripts/smoke/stage4-public.mjs`는 공유 노트의 `stage4-pr-a-post-detail-check.mjs`(PR-A)와 `stage4-pr-b-public-check.mjs`(PR-B)를 합쳐 옮긴다. PR-B 점검은 저장소 경로를 절대 경로로 가져오므로 옮길 때 상대 경로로 바꾼다.
   - JS 끈 확인은 CDP 방식(5절 40), Lighthouse는 빌드 결과 + gzip 프록시 방식(5절 41)을 다시 쓸 수 있다. 두 스크립트는 공유 노트에 남겼다.
   - 콘텐츠 컬렉션·`@astrojs/mdx` 삭제는 T6이다(Plan 6.2).

## 8. 열린 질문

1. ~~운영 왕복 검사 58/59(4.2)~~ 닫음: 사용자가 a안(정규화 규칙 7)을 골랐다(2026-11-09). 59/59(5절 21).
2. ~~시험 노트로 노트 화면을 확인할지~~ 닫음: 사용자가 "지금 확인하고 삭제"를 골랐다(2026-11-10). 4.11.
3. 실제 브라우저(Chrome·Safari)의 클립보드 API 경로 확인(PR-A에서 넘어옴). 이 앱 브라우저는 권한이 거부돼 대체 경로만 확인했다.
