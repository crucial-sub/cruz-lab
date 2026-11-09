# 재건 4단계 Plan: 공개 사이트

- 날짜: 2026-11-09
- 상태: **승인됨(2026-11-09). 4단계 끝(2026-11-10).** 사용자 결정 6건의 답은 13절, 미룬 기능과 "main 병합 직전" 항목은 14절에 있다. 12절 끝의 "Claude 판단"(D7~D18)도 함께 승인받았다. 구현 PR 3개(PR-A #15, PR-B #16, PR-C #17)는 `rebuild`에 병합됐다. 구현과 다른 것과 끝 상태는 15절, 결과는 [작업 문서](./2026-11-09-stage4-public-site.md)에 있다. 다음은 5단계 Plan이다.
- 브랜치: 이 Plan은 `stage4/plan`, [PR #14](https://github.com/crucial-sub/cruz-lab/pull/14)(대상 `rebuild`). 구현은 `rebuild`에서 작업 브랜치를 만들었다(`stage4/a-renderer`, `stage4/b-pages`, `stage4/c-projects-og`). 문서 PR(T9)은 `stage4/docs`, [PR #18](https://github.com/crucial-sub/cruz-lab/pull/18)이다. PR 대상은 `rebuild`다. main이 아니다.
- 근거: [계획 문서](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md) 3.3, 4.3, 6절(U1~U18), 8.3 "4. 공개 사이트", 8.4, 9절, 10.1, 10.2. [2단계 Plan](./2026-11-07-stage2-data-model-and-server-plan.md) D4(`kind`별 규칙), D6(srcset), D11(프로젝트 글), 7.4, 8절. [2단계 작업 문서](./2026-11-08-stage2-data-model-and-server.md) 2.3, 8절 2. [3단계 Plan](./2026-11-08-stage3-editor-plan.md) 2.3, 4.3, D3, D10, D11 9, 14절. [3단계 작업 문서](./2026-11-09-stage3-editor.md) 2.1·2.5, 5절(11·15·21·37·38·42·48·73), 7절, 8절 8·9·11·14.
- 시각 문서: [visual-plans/2026-11-09-cruz-lab-stage4-plan.html](./visual-plans/2026-11-09-cruz-lab-stage4-plan.html)

## 0. 결론 먼저

1. **공개 페이지에서 React를 뺀다(D9).** React 파일 19개 2,504줄(아일랜드 16개, `BlogPostList`, `MarkdownPostView`, `PostCover`)을 Astro 컴포넌트와 작은 `<script>`로 바꾼다. 공개 페이지는 React 런타임 청크(175 KB)와 framer-motion을 내려받지 않는다. React는 관리자(`/admin/*`)에만 남는다. JS를 꺼도 모든 공개 페이지가 읽힌다(계획 문서 9절).
2. **글 본문은 3단계 공유 파이프라인 `markdownToHtml`로 그린다(D7·D8).** 콜아웃·임베드·수식·영상 판정 `isVideoUrl`·원시 HTML 안전 처리를 그대로 받는다. 하이라이트는 rehype-highlight에서 Shiki로 바꾼다. 요청 때 렌더하고 메모리 캐시와 CDN 캐시를 쓴다. 3단계 작업 문서 8절 8이 닫힌다.
3. **글 상세에 목차, 제목 앵커, 연재 N/M·이전다음, 이전·다음 글, 코드 복사, 수정일을 더한다(D16).** 본문은 1차 색이고 폭은 68자(약 720px)다.
4. **주소 체계를 정한다(D11).** `/blog/category/<key>`(카테고리 key 10개 중 발행 글이 있는 것, 지금 9개)를 만든다. 카테고리와 뜻이 같은 태그 주소는 301로 그리로 보낸다. 글 주소 `/blog/<slug>`, 연재 리다이렉트 2개, 프로젝트 주소는 그대로다.
5. **노트가 공개된다(D12).** `/notes`(스트림)와 `/notes/<slug>`, `/notes/rss.xml`. 홈은 "한 줄 소개 + 최신 글 + 최신 노트"다.
6. **프로젝트 글은 `entries`(kind `project`)로 옮기고 `/projects`가 그것을 읽는다(사용자 결정 D1).** 연재 메커니즘 하나를 `/series`와 `/projects`가 각각 보여 준다(계획 문서 10.1 결정 4). 2단계 D11이 미룬 일이다.
7. **OG 이미지를 코드로 만든다(D13).** satori + resvg로 글·노트·프로젝트 글마다 `/og/<id>.png`를 요청 때 만든다. 카드 커버와 같은 디자인이다. CDN 캐시 태그로 재발행 때 함께 비워진다.
8. **디자인 토큰·타이포를 다시 정한다(D10).** 브랜드 색과 다크 기본은 유지한다. 타이포 스케일, 본문 폭, 헤더 한 줄, 푸터 링크, 404를 바꾼다. `.prose` CSS를 한 파일로 합쳐 에디터와 공개 페이지가 같이 쓴다. Pretendard는 dynamic subset으로 바꿔 글꼴 전송량을 줄인다.
9. **변환기 표기 옵션 2건을 닫는다(D14).** 단락 앞뒤 공백이 `&#x20;`로, 이미지 주소의 `&`가 `\&`로 저장되던 것을 고친다(3단계 작업 문서 8절 9·11).
10. **사용자 결정 6건에 모두 답했다(2026-11-09, 13절).** D1 프로젝트 글은 옮긴다. D2 검색은 `/blog` 필터만. D3 이미지 세부 조절은 4단계에서 빼고 5단계에 반드시 넣는다. D4 링크 카드는 미룬다. D5 README·PUBLISHING·`.env.example`은 재건이 끝난 뒤 main 병합 직전에 한 번 쓴다. D6 헤더는 Blog · Notes · Projects · About.

## 1. 출발점: 2026-11-09에 확인한 사실

모든 조회는 읽기 전용이다. 기존 글은 2단계 B1 덤프(`~/projects/cruz-lab-backups/20261108-152505-stage2-migrate/posts.json`, 56편에서 중복 1편 제외)로 셌다. 코드는 처음에 `origin/stage3/docs`(`4b2a96f`) 기준으로 읽었고, 결정을 받는 동안 PR #12·#13이 병합돼 `rebuild` 끝 `4357218` 기준으로 다시 확인했다. PR #13(에디터 사용 피드백)이 바꾼 것 중 4단계에 닿는 것은 `editor.css`의 코드 색 토큰이다(아래 표, D8·D10).

### 1.1 기존 글 55편

| 항목 | 값 | 뜻 |
|---|---|---|
| 카테고리 분포(발행 54편) | javascript 23, os 8, algorithm 5, data-structure 5, react-native 4, network 3, ai 2, computer-architecture 2, react 2. retrospective 1편(「크래프톤 정글 0주차 에세이」)은 초안이다 | 공개 글이 있는 카테고리는 9개다. 글이 없는 카테고리(지금 회고)는 탭을 숨긴다(D17) |
| 연재 | wesbos30(JavaScript), pintos 5편, proxy-lab 2편. `seriesMeta` 3 | `/series` 목록은 3줄이다. 메뉴 항목으로는 작다(D6) |
| 발행 시점(`pubDate`) | 2025-12 53편, 2026-04 2편 | 옛 CMS 이관 때 날짜가 몰려 있다. 연도별 구분은 의미가 적다. 목록은 날짜 내림차순 한 줄기다 |
| 표지 | 55편 모두 `heroImage`(Firebase Storage) 있음. `heroVideo` 0 | 글 상세 상단 표지는 유지한다. 카드와 OG는 코드로 그린다(U14) |
| 제목 길이(접두사 뺀 뒤) | 중앙 18자, 최대 54자 | OG 템플릿의 제목 2줄 기준 |
| 설명 길이 | 중앙 39자, 최대 84자, 빈 것 0 | 목록 행에 설명 1줄을 넣을 수 있다 |
| 제목 단계 | h2 중앙 3개(최대 9), h3 최대 16, h2·h3가 없는 글 0, 본문 h1이 있는 글 10 | 목차는 h2·h3다. 모든 글에 목차가 생긴다. 본문 h1은 글 제목과 겹치므로 h2 크기로 보인다 |
| 코드 블록 | 49편. 언어 12종(3단계 Plan 부록 A: javascript 138, c 33, python 27, jsx 16, objectivec 4, css 3, typescript 3, html 2, markdown 1, nasm 1, java 1, 없음 7) | Shiki 언어 묶음과 별칭의 근거 |
| 수식 | `$…$` 정규식 일치 10편. 3단계 왕복 검사의 실제 수식은 5곳 3편 | KaTeX CSS는 수식이 있는 글에만 넣는다 |
| 본문 이미지 | 104개. Firebase Storage 49, GitHub user-images 35, github.com 14, velog 6 | 외부 이미지 55개(53%)는 크기를 모른다. srcset은 새 자산(`assets/{id}`)에만 붙는다(D15) |
| 본문 크기 | 중앙 5.9 KB, 최대 25 KB | 요청 때 렌더해도 된다(D7) |
| 노트, 프로젝트 글 | 노트 0편. 프로젝트 글 8편과 프로젝트 4개는 저장소 파일(`src/content/projects`) | `/notes`는 비어 있을 수 있다. 프로젝트 이전은 D1 |
| 자산 문서 | 130개 모두 legacy(`variants: null`, `width`·`height` 없음) | legacy 이미지에는 srcset·크기를 붙일 수 없다 |

### 1.2 코드와 라이브러리

| 항목 | 값 | 확인 방법 |
|---|---|---|
| 공개 페이지 React | 아일랜드 16개 1,683줄(`InteractiveHero` 235, `ProjectCard` 172, `BlogCard` 141, `ContactSection` 140, `ExpCard` 133, `CursorFollower` 126, `RippleButton` 109, `SkillsSection` 99, `TextReveal` 96, `MagneticButton` 84, `TypeWriter` 76, `GlowCard` 75, `TiltCard` 73, `ThemeToggle` 57, `SkillCard` 48, `ScrollProgress` 19) + `BlogPostList` 560 + `MarkdownPostView` 172(서버 전용) + `PostCover` 89(서버 전용). 합계 2,504줄 | `wc -l` |
| `client:` 디렉티브 | 홈 5(`CursorFollower`·`ScrollProgress` idle, `InteractiveHero` load, `SkillsSection`·`ContactSection` visible), `PostsPreview` 4, `ProjectsPreview` 4, `ExperienceList` 2, `/blog` 2(`TextReveal`, `BlogPostList` load), `/series` 1, 태그·프로젝트 목록 카드 ×N, 헤더 `ThemeToggle` load | grep |
| framer-motion을 쓰는 곳 | 아일랜드 15개와 `BlogPostList`뿐 | grep. 지우면 의존성도 빠진다 |
| `.prose` CSS | 두 곳에 같은 130줄. `src/pages/blog/[...slug].astro`의 `<style is:global>`과 `src/editor/editor.css`(3단계 작업 문서 5절 37) | 코드 |
| `@tailwindcss/typography` | `prose prose-lg dark:prose-invert` 클래스와 `tailwind.config.mjs`의 typography 설정. 위 자체 CSS가 대부분을 덮어쓴다 | 코드 |
| 코드 하이라이트 | 공개: `rehype-highlight` + cdnjs `github-dark` CSS 외부 요청(`[...slug].astro`). 공유 파이프라인: `rehype-highlight`. 에디터 편집 영역: lowlight(`common` + `x86asm`, 드롭다운 20종 `CODE_LANGUAGES`) 에디터는 PR #13(2026-11-09)부터 GitHub 테마 색을 변수로 갖는다: 인라인 코드 `--code-inline-*`(빨간 글자·둥근 배경), 코드 블록 `--code-block-*`(다크 `#0d1117`·라이트 `#f6f8fa`), 구문 `--hl-*`. 공개 페이지는 아직 흰 글자 인라인 코드와 cdnjs `github-dark`다(3단계 작업 문서 2.10, 5절 74) | 코드 |
| Shiki | 3.12.2가 astro 5.13.8의 의존성으로 설치돼 있다. 직접 의존성이 아니라 pnpm에서는 import할 수 없다. 언어: 20종이 모두 있다. `objectivec`은 `objective-c`(별칭 `objc`), `nasm`은 `asm`으로 매핑해야 한다. 테마 `github-light-default`·`github-dark-default` 있음 | `node_modules/.pnpm` |
| satori, `@resvg/resvg-js` | 없다 | `node_modules` |
| 글 상세 | `MarkdownPostView.tsx`: react-markdown + remarkGfm + rehypeHighlight + rehypeRaw. `img` 영상 판정은 `endsWith`(3단계 8절 8). 본문 폭 `max-w-4xl`(896px), `p`·`li` 색 `--text-secondary`. 목차·앵커·이전다음·연재 표시·수정일 없음 | 코드, 계획 문서 4.5 |
| `/blog` | `BlogPostList`(client:load)가 55편을 props(JSON)로 받는다. HTML 353 KB(계획 문서 1편 4.2). 검색·그리드/리스트·정렬 4종·태그 패널(기본 열림) | 코드 |
| 홈 | 히어로(타이핑 롤 텍스트 5개, 따옴표 태그라인, 3문단, 버튼 2, 3D 틸트 사진) → Experience 아코디언 2 → 프로젝트 3 → 스킬 로고 11 → 최신 글 3 → Contact(GitHub·LinkedIn·이력서 PDF·이메일) | `src/pages/index.astro` |
| 헤더 | 왼쪽 "Cruz" 로고 + GitHub 아이콘 + `ThemeToggle`(React). 메뉴 Home·Blog·Series·Projects는 화면 상단 중앙 `fixed` 알약. `transition:persist` | `Header.astro` |
| 푸터 | 저작권 1줄 | `Footer.astro` |
| 404 | prerender. 큰 숫자 + 버튼 2개 | `404.astro` |
| `/series` | 2단계 임시 화면(📚 이모지, 카드 그리드). `/series/[slug]`의 slug는 연재 key | `src/pages/series/*` |
| `/projects/**` | prerender. 콘텐츠 컬렉션 `projects`(project.md 4 + 글 8, `@astrojs/mdx`). 본문 이미지 10개가 `../../../assets/img/projects/*` 상대 경로(png 6, webp 4). 표지 4개 중 2개가 svg(`placeholder.svg`, `stocklab.svg`). `src/assets/img/projects` 12 MB. 본문 안 `/blog/...` 내부 링크 2 | 코드, `du` |
| 공개 데이터 경로 | `listPublishedEntries()`는 모든 kind를 읽고 메모리 캐시(60초)한다. `content-posts.ts`는 kind `post`만 돌려준다. `publicPathFor`는 `post`만 주소를 만든다(`entry-rules.ts`). `CREATABLE_KINDS`는 `post`·`note` | `src/lib/server/entries.ts`, `content-posts.ts`, `entry-rules.ts` |
| 발행 규칙 | post: 제목·설명·slug·카테고리·본문. note: 본문만(slug 비면 `note-YYYYMMDD-HHmm`). project: 규칙 없음(2단계 D11) | `entry-rules.ts` `validatePublish` |
| 캐시·퍼지 | 공개 응답 `s-maxage=60, swr=86400`, 태그 `posts` / `posts,post-<id>`. 퍼지는 글 상세 삭제·목록 무효화(3단계 D7) | `cache-headers.ts`, `cdn-purge.ts` |
| 리다이렉트 | 미들웨어 → `redirects.ts`: `/series/wesbos`, `/series/크래프톤-정글`, 태그 정규화. 카테고리와 뜻이 같은 태그 주소(`/blog/tag/javascript` 등)는 그 카테고리의 글을 보인다. 최종 주소는 4단계 결정(2단계 Plan 7.4) | 코드 |
| RSS·사이트맵 | `/rss.xml` 글만. `sitemap-index.xml`(정적) + `sitemap-posts.xml`(글 + 연재) | 코드 |
| View Transitions | `BaseLayout`의 `<ViewTransitions />`(Astro 5에서는 `ClientRouter`의 옛 이름). `Reveal.astro`가 `astro:page-load`에 의존. 표지 이미지 `view-transition-name` | 코드 |
| 글꼴 | `PretendardVariable.woff2` 2,057 KB를 preload. JetBrains Mono 2개 × 92 KB | `public/fonts`, `BaseHead.astro` |
| 테마 | `html.dark` 기본(저장값 없으면 시스템 설정). 토큰은 `global.css` `:root`(다크) + `html.light`. 컨테이너 992px | `global.css`, `tailwind.config.mjs` |
| 쓰지 않는 자산 | `src/assets/img/crusub.png` 296 KB, `404-not-found.png`, `profile.svg`. `public/images/*.svg` 11개(스킬 로고)는 `SkillsSection`만 쓴다 | grep |
| 기준선 | `rebuild` 끝 `4357218`(PR #13 뒤): `pnpm lint` 통과, `pnpm test` 422(30 파일), `tsc --noEmit` 1(`TextReveal`). 3단계 끝(PR #12)은 398이었다. 이 worktree에서 다시 잰 값은 8.1 | 실행 |
| 함수 리전 | `icn1`(`vercel.json`). Firestore 서울 | 2단계 |

## 2. 목표와 범위

### 2.1 4단계가 끝나면 참이 되는 것

| 요구 | 출처 | 4단계 해결 방법 |
|---|---|---|
| 공개 페이지가 JS 없이 전부 읽힌다 | 계획 문서 9절, 4.3 | React 아일랜드 제거(D9). 상호작용은 `<script>` 3개(테마, 목록 필터, 글 상세 보조) |
| `/blog` HTML 100 KB 이하 | 9절 | 리스트형 행 54개(발행 글), props JSON 없음 |
| Lighthouse 모바일 성능 90 이상 | 9절 | JS 최소, 글꼴 subset, 이미지 lazy·크기 지정(D10·D15) |
| 홈: 이름 + 한 줄 + 최신 글 + 노트 + about 링크 | U2·U3, 6.2, 10.2 표 | D17 |
| 목록: 카테고리 1차 축, 태그 칩 1줄, 검색 1개, 리스트형 | U9·U10, 10.1 | D11·D17, 검색 범위는 D2 |
| 글 상세: 본문 1차 색·폭 65~75자, 목차, 앵커, 이전·다음, 연재, 코드 복사, 수정일 | U11·U12 | D16 |
| 코드 블록: Shiki, 복사 버튼, 라이트 테마 대비 | U13·U17 | D8 |
| 콜아웃·임베드·수식이 공개 페이지에서 그려진다 | 3단계 Plan D3 | 공유 파이프라인(D7) |
| 영상 주소 판정과 원시 HTML 안전 처리가 공개 페이지에 적용된다 | 3단계 작업 문서 8절 8 | 공유 파이프라인(D7) |
| 연재는 축소형이다: `/series/<key>`는 posts에서 생성, 글 상세에 N/M과 이전·다음 편 | 10.1 결정 3 | D16·D17 |
| 프로젝트와 연재가 메커니즘 하나(`series` 필드)를 쓴다 | 10.1 결정 4, 3.3 3 | D1(사용자 결정) |
| `/about` 1화면 + 이력서 PDF | 10.2 | D17 |
| 노트 공개 스트림 `/notes`와 홈 | 10.2 조건 1, 2단계 D4 | D12 |
| 헤더 한 줄, 푸터 링크(RSS·GitHub·이메일·사이트맵), 404 | U8·U16·U18 | D10·D17, 메뉴 구성은 D6 |
| 모션은 상태 변화에만. 커서·타이핑·틸트·글로우·마그네틱·리플·글자별 등장 제거 | U1·U2·U4·U5, 6.3 | D9 |
| 스킬 그리드·Experience를 홈에서 빼고 `/about`으로 | U6·U7 | D17 |
| 이모지 제목 제거 | U15 | `/series` 재설계 |
| 커버 체계 통일 | U14 | 카드·OG 모두 코드 커버(D13·D17) |
| OG 이미지 코드 생성 | 3.3 4, 8.3 | D13 |
| `tsc --noEmit` 오류 0 | 3단계 작업 문서 2.8 | `TextReveal.tsx` 삭제 |
| 변환기 표기 옵션(단락 끝 공백, 주소 `&`) | 3단계 작업 문서 8절 9·11 | D14 |

### 2.2 하는 것

1. 공유 파이프라인 확장: Shiki 주입, 목차·제목 id, 코드 블록 틀(언어 라벨·복사 버튼 자리), 새 자산 srcset, 변환기 표기 옵션 2건, `.prose` CSS 한 파일.
2. 글 상세 `/blog/<slug>` 재작성(D16). 요청 때 렌더 + 메모리 캐시(D7).
3. 토큰·타이포·레이아웃·헤더·푸터·404·테마 스크립트(D10). `ClientRouter` 제거.
4. 홈, `/about`, `/blog`, `/blog/category/<key>`, `/blog/tag/<tag>`, `/series`, `/series/<key>`, `/notes`, `/notes/<slug>`, `/notes/rss.xml`, 사이트맵 갱신(D11·D12·D17).
5. React 아일랜드 19개 파일과 Astro 섹션 컴포넌트 4개 삭제, 의존성 정리(6절).
6. 프로젝트 글 이전 스크립트와 `/projects/**` 재작성(D1 a를 고르면).
7. OG 이미지 엔드포인트와 템플릿, 글꼴 subset(D13).
8. 공개 페이지 점검 스크립트 확장, Lighthouse 측정, 미리보기 확인(8절).
9. README 미리보기 이미지 이동(T6). `README.md`·`PUBLISHING.md`·`.env.example`의 본문은 고치지 않는다(D5 답: 재건이 모두 끝난 뒤 main 병합 직전에 한 번 쓴다).

### 2.3 하지 않는 것

| 하지 않는 것 | 이유 또는 단계 |
|---|---|
| 관리자 앱 재구성, 헤더 "쓰기" 진입점, 태그·카테고리 관리, 이미지 라이브러리 | 5단계 |
| 본문 HTML·목차를 발행 때 미리 계산해 `published.html`·`toc`에 저장 | 하지 않는다(D7). 2단계 Plan 2.3이 "4단계"로 적은 항목이다. 요청 때 렌더로 같은 결과를 얻고 스키마를 바꾸지 않는다 |
| 댓글(giscus), velog 크로스포스팅, GitHub 프로필 README 자동 표시, `/lab` 섹션 | 계획 문서 3.3의 방향이지 8.3의 4단계 요구가 아니다. 사용자가 원하면 5단계 이후에 따로 정한다 |
| 전역 검색 팔레트(`Mod+K`) | D2의 답에 따른다. 권장은 미룸 |
| 이미지 임의 px 폭·정렬, 링크 카드 | D3·D4의 답에 따른다. 권장은 미룸 |
| 404에 최신 글 3개(U18) | 하지 않는다. 404는 prerender를 유지해 함수를 거치지 않는다(2단계 작업 문서 8절 3). 고정 링크(홈·블로그·노트·about)만 둔다 |
| 기존 글 URL 변경, `/series/<slug>` 리다이렉트 2개 변경, `/projects/<project>/<slug>` 변경 | 8.4. 모두 유지한다 |
| 기존 글 본문 일괄 변환(ZWSP, 글머리, 표기 옵션 적용) | 하지 않는다. 그 글을 실제로 고칠 때만 다시 쓴다(3단계 D1) |
| Firestore·Storage 규칙, 인덱스, 환경 변수, Vercel 설정 변경 | 필요 없다. 공개 읽기는 Admin SDK다. 프로젝트 이전도 Admin SDK로 쓴다 |
| 옛 `posts`·`series` 컬렉션 삭제, legacy 파일 26개 정리 | main 병합 뒤(2단계 작업 문서 8절 2) |
| 에디터 기능 변경 | 변환기 표기 옵션 2건(D14)과 미리보기 하이라이트 교체(D8)만. 드래그 핸들·찾기·바꾸기·키맵은 5단계 |
| 예약 발행, 조회수, 구독 | 요구 없음 |

## 3. 설계 결정

결정마다 누가 정하는지 적는다. "사용자 결정" 6건(D1~D6)은 12절에 모았다. "Claude 판단"(D7~D18)은 승인할 때 함께 확인한다.

### D1. 프로젝트 글 이전 (사용자 결정)

**문제.** 2단계 D11(사용자 결정 2026-11-08)은 프로젝트 글 8편의 이전을 "4단계에서 페이지와 함께" 하기로 했다. 지금 프로젝트 글은 저장소 파일이라 에디터로 고칠 수 없고, 블로그 글과 데이터 경로가 다르다(계획 문서 3.3 3, 4.7). `/projects`를 다시 만드는 시점은 4단계뿐이다.

| | **a. 4단계에서 `entries`로 옮기고 `/projects`가 그것을 읽는다 (권장)** | b. 화면만 다시 만들고 데이터는 저장소 파일로 둔다. 이전은 5단계 |
|---|---|---|
| 데이터 | `entries` 8편(kind `project`, status `published`, `series: { key: <프로젝트>, order: <Part> }`, 카테고리 null, 태그 없음). 문서 ID는 `project-<프로젝트>-<글 slug>`로 고정해 멱등하게 만든다. `seriesMeta/<프로젝트>`에 `project` 칸을 더한다(아래). 본문 이미지 10개는 2단계 자산 API 흐름(Node: sha256 → upload-url → PUT → finalize)으로 올리고 본문 주소를 가장 큰 변형으로 바꾼다. 더하기만 한다 | 변경 없음 |
| `/projects` | `seriesMeta`에 `project` 칸이 있는 연재를 프로젝트로 보인다. `/projects/<key>`는 첫 글로 302. `/projects/<key>/<slug>`는 글 상세와 같은 컴포넌트 + Part 탭 + 이전·다음. 주소는 지금과 같다 | 콘텐츠 컬렉션을 그대로 읽고 새 컴포넌트로 그린다(prerender 유지) |
| 에디터 | 프로젝트 글이 `/admin` 목록에 나오고 에디터로 열린다. 발행 규칙에 project를 더한다(제목·설명·slug·본문·연재 필수, 카테고리 선택). `publicPathFor`가 `/projects/<key>/<slug>`를 준다. 새 프로젝트 만들기(`CREATABLE_KINDS`)는 5단계 | 저장소 파일을 고쳐 배포한다(지금과 같다) |
| 지우는 것 | `src/content/projects/**`, `content.config.ts`, `project-posts.ts`, `src/assets/img/projects/**`(12 MB. README 미리보기 `cruz-lab.png`는 옮긴다), `@astrojs/mdx` | 없음 |
| 비용 | 스크립트(2단계 마이그레이션과 같은 틀: dry-run, 보고서, 멱등) + 규칙 + 페이지. 어림 1일 | 페이지만. 반나절 |
| 5단계와 겹침 | 없음 | 5단계가 `/projects`를 한 번 더 고친다 |
| 되돌리기 | 지정 ID 8편·자산 10개·`seriesMeta` 칸 삭제 스크립트. 운영(main)은 콘텐츠 컬렉션을 쓰므로 영향 없음 | — |

**`seriesMeta/<key>.project` 칸(a).** `{ longDescription, tags[], tech[], github?, demo?, featured, order, startDate?, endDate? }`. `seriesMetaSchema`에 선택 칸으로 더한다(더하기만). 커버 이미지는 저장하지 않는다. 카드와 OG는 코드 커버다(U14). 표지 4개 중 2개가 svg라 자산 규칙(2단계 D6)이 받지 않는 점도 이유다.

**권장 이유.** 10.1 결정 4("메커니즘 하나, 보기 둘")와 3.3 3("프로젝트 글과 블로그 글이 같은 데이터 경로")을 4단계가 아니면 이룰 때가 없다. 글 상세 컴포넌트(D16)를 그대로 쓰므로 프로젝트 글도 목차·코드 복사·Shiki를 함께 얻는다. 비용 차이는 반나절이다.

### D2. 검색 범위 (사용자 결정)

| | **a. `/blog` 안 필터만 (권장)** | b. a + 전역 검색 팔레트 |
|---|---|---|
| 동작 | 입력창 1개. 제목·설명·태그·카테고리 이름을 즉시 거른다(서버가 55행 모두를 그리고 `<script>`가 숨긴다). 결과 수를 보인다. `?q=`를 읽어 처음부터 거른다 | a에 더해 모든 페이지에서 `/` 또는 `Mod+K`로 팔레트. 글·노트·프로젝트 글의 제목·설명·태그 JSON 인덱스(`/search.json`, 캐시 태그 `posts`) |
| JS 없을 때 | 전체 목록이 그대로 보인다. 입력창은 숨긴다 | 팔레트 없음. a와 같다 |
| 본문 검색 | 없음 | 없음(인덱스에 본문을 넣지 않는다. 55편 본문 414 KB) |
| 구현 | `<script>` 1개, 약 60줄 | React 아일랜드 1개 또는 `<dialog>` + `<script>` 약 200줄. 인덱스 엔드포인트 1개 |
| 근거 | U9 "검색 1개 + 태그 칩 1줄". 55편 | 계획 문서 6.2 "전역 검색이 없다", 4.3 "React 아일랜드 0~2개(검색 팔레트 정도)" |

**권장 이유.** 발행 글 54편과 공개 카테고리 9개에서는 목록 페이지의 필터가 검색의 역할을 다한다. 팔레트는 글이 늘어 목록이 길어질 때 넣어도 늦지 않다. b를 고르면 React 없이 `<dialog>`로 만든다(D9의 "공개 페이지 React 0"을 지킨다).

### D3. 이미지 임의 px 폭·정렬 (사용자 결정, 3단계 Plan 14절 상기)

3단계 Plan 14절: "4단계 공개 렌더러 설계 때 다시 묻는다(원시 HTML 허용 여부를 그때 정한다)". 사용자 답(2026-11-08): "굉장히 좋은 기능, 나중에 반드시".

| | **a. 미룬다. 렌더러는 길을 열어 둔다 (권장)** | b. 4단계에 넣는다 |
|---|---|---|
| 렌더러 | 지금 파이프라인(rehype-raw + `rehype-strip-unsafe`)은 원시 `<img src alt width height>`와 `<p align="center">`를 이미 통과시킨다. 4단계는 이 동작을 유지하고 테스트로 고정한다. 소스 모드에서 `<img width="600">`을 쓰면 공개 페이지에 폭이 적용된다 | 같다 |
| 에디터·변환기 | 바꾸지 않는다. 지원하지 않는 HTML은 열 때 경고 + 텍스트(3단계 D10). 그래서 소스 모드로 넣은 `<img width>`는 편집 모드에서 저장하면 글자가 된다. 이 한계를 작업 문서에 적는다 | 이미지 노드에 `width`·`align` 속성. 폭이나 정렬이 있을 때만 원시 HTML `<img … width="600">` 또는 `<p align="center"><img …></p>`(GitHub README 관례, GitHub·백업 저장소에서 그대로 보인다)로 쓴다. 변환기가 `<img>`·`<p align>` HTML을 노드로 읽는다(3단계 `<br>`처럼 태그 2개만). 이미지 메뉴에 폭 입력·정렬 3개 |
| 비용 | 0 | 1~2일(3단계 Plan 14절 어림). 에디터(3단계 영역) 변경이 대부분이다 |
| 다시 물을 시점 | 5단계 Plan | — |

**권장 이유.** 4단계는 공개 페이지가 범위다. 이 기능의 일은 대부분 에디터와 변환기(3단계 영역)에 있다. 렌더러만 먼저 열어 두면 5단계에서 에디터 쪽만 더하면 된다.

### D4. 링크 카드 (사용자 결정, 3단계 Plan 14절 상기)

| | **a. 미룬다 (권장)** | b. 4단계에 넣는다 |
|---|---|---|
| 동작 | 지원 임베드(YouTube·CodeSandbox)가 아닌 주소 한 줄은 지금처럼 링크다 | 주소 하나만 있는 단락 중 임베드가 아닌 것을 카드(제목·설명·이미지·도메인)로 그린다 |
| 서버 | — | 발행 때 서버가 그 사이트의 OG 메타를 읽어 `linkCards/<sha256(url)>`에 저장한다(만료 30일, 실패하면 링크로 둔다). 렌더러가 그 문서를 읽어 카드로 그린다. 새 컬렉션 1개, 발행 API가 외부 사이트를 읽는다(SSRF 방지: http·https·공개 주소만, 타임아웃 5초, 크기 한도) |
| 에디터 | — | 미리보기는 카드 대신 링크(서버 데이터가 없다). 또는 미리보기용 읽기 API 1개 |
| 비용 | 0 | 1~2일 |
| 다시 물을 시점 | 5단계 Plan | — |

**권장 이유.** 발행 경로에 외부 사이트 읽기가 들어간다. 2단계가 발행 경로에서 외부 의존을 뺀 방향(계획 문서 1.1)과 반대다. 넣는다면 비동기(발행 뒤 백그라운드) 설계가 필요하고, 그것은 5단계 관리자 앱과 함께 보는 편이 낫다.

### D5. `README.md`·`PUBLISHING.md` 정리 (사용자 결정)

3단계 작업 문서 8절 14: `PUBLISHING.md` "지금 상태 (2단계 끝)" 절, `README.md` 환경 변수 절(`GITHUB_TOKEN`만 있고 `ADMIN_UID`·`BACKUP_DISPATCH_TOKEN`이 없다)과 "범위" 절의 GitHub 보상 흐름 문장이 2단계 끝 상태다.

| | **a. 4단계 마지막 작업(T9)에 넣는다 (권장)** | b. 지금 별도 문서 PR로 한다 | c. 5단계로 미룬다 |
|---|---|---|---|
| 내용 | 두 문서를 4단계 끝 상태로 한 번에 고친다(공개 페이지 구조, 노트 주소, OG, 환경 변수 목록) | 3단계 끝 상태로 고치고, 4단계 끝에 또 고친다 | 그대로 둔다 |
| 비용 | 반나절 안. 작업 문서와 같은 PR | 문서 PR 1개 + 새 세션 | 0 |

**권장 이유.** 4단계가 공개 사이트 구조를 바꾸므로 README의 "구조"·"디렉터리" 절도 함께 바뀐다. 두 번 고치지 않는다.

**사용자 답(2026-11-09): 재건이 모두 끝난 뒤, main 병합 직전에 한 번 쓴다.** 세 안 중 c에 가깝지만 시점을 "5단계"가 아니라 "5단계가 끝나고 main에 병합하기 직전"으로 정했다. 이유(사용자): 설명 문서는 모든 작업이 끝난 뒤 써야 가장 최신이고 과도기 내용이 섞이지 않는다. 5단계도 README의 구조 절을 바꾸므로 a보다 낫다. 범위는 `README.md`, `PUBLISHING.md`, `.env.example`이다. 원료는 각 단계의 Plan·작업 문서다. 단계 Plan·작업 문서·감사 문서 11절은 지금처럼 그때그때 쓴다(전역 규칙 3·7). 4단계에서 하는 일은 하나다: T6이 `src/assets/img/projects/`를 지울 때 README 첫 화면 이미지 `cruz-lab/cruz-lab.png`를 `.github/readme/cruz-lab-preview.png`로 옮기고 README의 그 경로 한 줄만 고친다(깨진 링크 방지, Claude 판단). 할 일은 감사 문서 11.3 "main 병합 직전에 할 일"에 적었다.

### D6. 헤더 메뉴 (사용자 결정)

| | **a. Blog · Notes · Projects · About (권장)** | b. Blog · Notes · Series · Projects · About |
|---|---|---|
| Series 진입 | `/blog` 상단의 "연재" 링크, 글 상세의 연재 상자, 푸터 | 메뉴 |
| 근거 | 연재는 3개이고 "쓸 일이 없는 것이 정상"(10.1). 메뉴 4개가 모바일 한 줄에 들어간다 | 지금 메뉴에 Series가 있다 |

로고 "Cruz"는 왼쪽, 메뉴는 그 옆 한 줄, 오른쪽에 테마 전환과 GitHub. 알약 `fixed` 메뉴는 없앤다(U8). 햄버거는 없다. "Home" 항목은 없다(로고가 홈 링크).

**실측(2026-11-09, Pretendard, 메뉴 14px·간격 16px·여백 16px, 아이콘 32px 2개).** a는 372px, b는 427px, b에서 GitHub 아이콘을 빼면 391px가 필요하다. 390px 휴대폰에서 a는 18px가 남고 b는 넘친다. a도 360px 폭에서는 12px가 넘치므로, **폭 380px 미만에서는 항목 간격과 좌우 여백을 12px로 줄인다**(계산상 약 352px).

**사용자 답(2026-11-09): a.** 사용자 질문("Series를 빼면 모바일에서는 연재 글을 어떻게 보나")에 답한 연재 입구 4곳을 구현 요구로 둔다: (1) `/blog` 제목 바로 아래 "연재 N개 보기 →" 링크(첫 화면), (2) 태그 칩(연재 3개는 같은 이름의 태그가 있다), (3) 글 상세 제목 바로 아래의 연재 상자(모바일에서도 목차 `<details>`보다 위)와 글 끝 연재 목차, (4) 푸터 "연재" 링크. 목록 행의 연재 배지("Pintos 2/5")는 링크가 아니라 표시다(행 링크 안의 링크는 A12와 같은 문제).

### D7. 렌더 시점: 요청 때 렌더 + 메모리 캐시 (Claude 판단)

2단계 Plan 2.3은 "본문 HTML·목차 미리 계산"을 4단계로 적었다. 계획 문서 8.1의 목표 스키마에는 `published.html?`과 `toc[]`가 있다.

| | **요청 때 렌더 (선택)** | 발행 때 미리 계산해 저장 |
|---|---|---|
| 흐름 | `/blog/<slug>` 요청 → `findPublishedEntryBySlug`(메모 60초) → `renderEntry(id, revision)`(메모리 캐시, 키 `render:<id>:<revision>`) → HTML + 목차 → CDN 60초 | 발행 API가 HTML·목차를 만들어 `published`에 저장. 페이지는 읽기만 |
| 렌더 비용 | 글 하나 수 ms~수십 ms(본문 최대 25 KB, Shiki는 미리 만든 highlighter). 같은 인스턴스에서는 한 번. CDN이 60초 저장 | 0 |
| 렌더러를 고치면 | 다음 요청부터 모두 새 결과 | 발행된 글 전부를 다시 발행하거나 재계산 스크립트가 필요하다 |
| 스키마 | 그대로 | `published.html`·`toc` 추가, 발행 API 변경, 900 KB 한도 재검토 |
| 미리보기 모드 | 같은 함수를 브라우저에서 부른다 | 미리보기는 어차피 요청 때 렌더다. 경로가 둘이 된다 |

**선택 이유.** 4·5단계에서 렌더러가 계속 바뀐다. 미리 계산하면 글 55편을 매번 다시 발행해야 한다. 요청 때 렌더의 비용은 CDN과 메모리 캐시 뒤에서 보이지 않는다. 뒤집는 조건: 미리보기(`rebuild`) 글 상세의 콜드 TTFB가 1.5초를 넘고 원인이 렌더면, 미리 계산을 5단계 Plan에서 다시 본다.

### D8. 하이라이트: Shiki (Claude 판단)

| 항목 | 정한 값 | 이유 |
|---|---|---|
| 패키지 | `shiki` 3.12.2를 직접 의존성으로 더한다(astro 의존성과 같은 버전이라 중복 설치가 없다). 세밀 번들: `@shikijs/core`의 `createHighlighterCoreSync` + `createJavaScriptRegexEngine` + 언어 20종 + 테마 2종. 전체 묶음(`shiki` 기본 export, 언어 200여 종)은 쓰지 않는다 | 서버 번들과 콜드 스타트. JS 엔진은 wasm이 필요 없어 Vercel 함수와 브라우저에서 같은 코드가 돈다 |
| 언어 | `CODE_LANGUAGES` 20종(`src/editor/extensions/lowlight.ts`)을 그대로 쓴다. 별칭 `objectivec` → `objective-c`, `nasm` → `asm`, `js`·`ts`·`py`·`sh`·`shell` 등 Shiki 기본 별칭. 모르는 언어와 언어 없음은 민무늬 `text`다 | 1.1의 12종 + 3단계 D10의 8종. 기존 글 251개가 모두 색칠된다 |
| 테마 | `github-light-default`·`github-dark-default` 듀얼 테마. `defaultColor: false`, CSS 변수(`--shiki-light`·`--shiki-dark`). `html.light`일 때 light 변수를 쓰는 CSS 10줄. 코드 블록 배경·글자·테두리와 인라인 코드는 테마 색이 아니라 PR #13의 `--code-*` 토큰을 쓴다. 그래서 편집 화면(lowlight `--hl-*`)과 공개 페이지(Shiki)의 바탕과 인라인 코드가 같고, 구문 색은 둘 다 GitHub 계열이다 | U17(라이트 테마 대비). 지금 사이트가 쓰는 cdnjs `github-dark`와 결이 같다. 외부 CSS 요청이 사라진다 |
| 파이프라인 | `markdownToHtml(markdown, { highlighter, assets? })`. 하이라이트 단계는 주입받은 highlighter로 `rehype-shiki`(자체, `@shikijs/rehype` 대신 20줄)를 돈다. highlighter가 없으면 민무늬다(왕복 검사·`normalizeForCompare`는 영향 없다) | 서버는 모듈 초기화 때 1회 만든다. 브라우저(에디터 미리보기)는 미리보기 모드 첫 진입 때 `import()`로 받는다(어림 250 KB gzip, 관리자만) |
| 코드 블록 틀 | rehype 플러그인이 `<pre>`를 `<figure class="code-block" data-lang="js"><div class="code-head"><span>js</span><button class="code-copy">복사</button></div><pre>…</pre></figure>`로 감싼다. 복사는 글 상세의 `<script>` 1개가 이벤트 위임으로 처리한다 | U13 복사 버튼. 미리보기에도 같은 틀이 보인다(버튼은 동작하지 않아도 된다) |
| 에디터 편집 영역 | lowlight 그대로(Tiptap `CodeBlockLowlight`). `highlight.js` 의존성은 남는다 | 편집 중 색은 편집 화면의 것이다. 미리보기와 공개 페이지는 Shiki로 같다 |
| 지우는 것 | `rehype-highlight`, cdnjs `<link>` | |

### D9. React 제거와 대체 (Claude 판단)

| 지금(React) | 대체 |
|---|---|
| `ThemeToggle`(client:load) | `ThemeToggle.astro` + 인라인 `<script>`(`localStorage` `theme`, `html.dark/.light`). `BaseHead`의 초기화 스크립트는 그대로 |
| `InteractiveHero`, `TypeWriter`, `MagneticButton`, `RippleButton`, `CursorFollower`, `ScrollProgress`, `TextReveal`, `TiltCard`, `GlowCard` | 삭제. 대체 없음(U1·U2·U4·U5). 히어로는 Astro 마크업 + CSS 진입 애니메이션 없음 |
| `ExpCard`, `ExperienceList.astro`, `SkillsSection`, `SkillCard`, `ContactSection` | 삭제. 내용은 `/about`으로(D17). 아코디언은 `<details>` |
| `BlogCard`, `PostsPreview.astro`, `ProjectsPreview.astro` | `PostCard.astro`(커버 있는 카드, 홈·프로젝트용), `PostRow.astro`(목록 행) |
| `PostCover.tsx`(서버 전용 React) | `PostCover.astro`. `post-cover.ts`(순수 함수)는 그대로 쓴다. OG 템플릿(D13)도 같은 함수를 쓴다 |
| `ProjectCard` | `ProjectCard.astro`(코드 커버 + 제목·설명·기술) |
| `BlogPostList` | 서버 렌더 행 + `SearchFilter.astro`(`<script>`). 그리드/리스트 토글, 정렬 4종, 태그 패널은 없앤다(U9) |
| `MarkdownPostView.tsx` | `PostArticle.astro`(D16) + `markdownToHtml` |
| `Reveal.astro`(스크롤 페이드인) | 삭제. "모션은 상태 변화에만"(6.3). `content-visibility: auto`는 긴 목록 섹션에 CSS 클래스로만 남긴다 |
| `<ViewTransitions />`(ClientRouter) | 삭제. CSS `@view-transition { navigation: auto; }`로 문서 간 전환을 받는 브라우저에서만 페이드. JS 라우터가 없으므로 `astro:page-load` 의존도 사라진다 |
| `@astrojs/react` | 남긴다. `/admin/login`(`AdminLogin.tsx`)과 에디터가 쓴다. 공개 페이지에는 `client:` 디렉티브가 0개다 |

공개 페이지에 남는 `<script>`는 3개다: 테마 전환, 목록 필터(D2), 글 상세 보조(코드 복사·목차 스크롤 스파이·앵커 복사). 모두 인라인 또는 `is:inline`이 아닌 Astro 번들 스크립트(수 KB)다.

### D10. 토큰·타이포·레이아웃·글꼴 (Claude 판단)

| 항목 | 지금 | 정한 값 | 이유 |
|---|---|---|---|
| 색 | 다크 기준 토큰 + `html.light`. 브랜드 에메랄드 `#10b981` | 유지. `--text-secondary`를 본문에 쓰지 않는다(본문은 `--text-primary`). 라이트 `--text-secondary`를 `#475569`로 낮춰 보조 글자 대비를 맞춘다 | U11. 두 테마 같은 수준(U17) |
| 글꼴 | Pretendard Variable woff2 2 MB 1파일 preload | Pretendard **dynamic subset**(공식 배포의 유니코드 범위 분할 woff2, 자체 호스팅, `unicode-range`). 첫 화면에 필요한 범위 2~3개만 preload. JetBrains Mono는 그대로 | 전송량. Lighthouse 90 목표 |
| 타이포 스케일 | `--typo-*` 변수(미사용) + Tailwind 기본 | `--text-xs 12 / sm 14 / base 17 / lg 19 / xl 22 / 2xl 27 / 3xl 34 / 4xl 42px`, 행간 본문 1.75, 제목 1.25. 글 제목 `clamp(28px, 4vw, 40px)`. 옛 `--typo-*`는 지운다 | 큰 타이포, 콘텐츠 우선(6.1 기준) |
| 폭 | 컨테이너 992px. 본문 `max-w-4xl` 896px | 컨테이너 `--container: 960px`. 글 본문 `--measure: 68ch`(약 720px). 목차는 1280px 이상에서 본문 오른쪽 240px | 65~75자(U11) |
| `.prose` | 두 곳에 복사본, `@tailwindcss/typography` 겹침 | `src/styles/prose.css` 한 파일. `editor.css`의 코드 색 토큰(`--code-*`, PR #13)도 여기로 옮긴다. 구문 색 `--hl-*`은 lowlight용이라 `editor.css`에 남는다. 공개 글·노트·프로젝트 글·에디터 편집 영역·미리보기가 모두 import한다. 콜아웃·임베드·코드 블록 틀·수식·표·이미지 규칙 포함. `@tailwindcss/typography`와 `tailwind.config.mjs`의 typography 설정은 지운다 | 3단계 작업 문서 5절 37 "4단계에서 한 곳으로 합친다" |
| 모션 | 커서·타이핑·틸트·글로우·마그네틱·리플·글자별 등장·스크롤 페이드인 | 링크·버튼 hover 색 1단계, 카드 hover 테두리, 문서 간 view transition 페이드만. `prefers-reduced-motion`은 유지 | 6.3 |
| 헤더 | 로고 왼쪽 + 알약 `fixed` 메뉴 중앙 + 아이콘 오른쪽 | 한 줄 `<header>`: 로고 · Blog · Notes · Projects · About(D6 a) · 테마 · GitHub. `position: sticky` 아님(스크롤하면 사라진다). 폭 380px 미만은 간격·여백 12px | U8 |
| 푸터 | 저작권 1줄 | 왼쪽 저작권, 오른쪽 링크: RSS(글)·RSS(노트)·GitHub·이메일(mailto)·사이트맵·about | U16 |
| 404 | prerender, 버튼 2개 | prerender 유지. 문구 + 링크 4개(홈·블로그·노트·about). 최신 글은 넣지 않는다(2.3) | U18 일부 |
| 자산 | `profile.png` 480 KB(히어로·기본 OG) | `/about`에서만 `astro:assets` `<Image>`로 작게 쓴다. 기본 OG는 D13. `crusub.png`·`404-not-found.png`·`profile.svg`·`public/images/*.svg` 11개는 지운다 | 쓰는 곳 없음 |

### D11. 주소 체계 (Claude 판단)

| 주소 | 내용 | 렌더 | 캐시 태그 |
|---|---|---|---|
| `/` | 홈 | SSR | `posts` |
| `/blog` | 글 목록 전체(카테고리 탭 "전체" 선택) | SSR | `posts` |
| `/blog/category/<key>` | 발행 글이 있는 카테고리(지금 9개). 같은 목록 컴포넌트, 탭 선택 상태. 글이 없으면 404 | SSR | `posts` |
| `/blog/tag/<tag>` | 태그 12개. 같은 목록 컴포넌트 | SSR | `posts` |
| `/blog/tag/<카테고리 동의어>` (`javascript`, `react`, `운영체제`, …) | **301 → `/blog/category/<key>`**. 2단계 Plan 7.4의 열린 항목을 닫는다. `redirects.ts`에 규칙 1개 추가(`categoryForSynonymTag`) | 미들웨어 | — |
| `/blog/<slug>` | 글. slug가 노트·프로젝트 글이면 그 kind의 주소로 301(slug 공간이 하나라서 가능하다) | SSR | `posts,post-<id>` |
| `/notes`, `/notes/<slug>`, `/notes/rss.xml` | D12 | SSR | `posts` / `posts,post-<id>` |
| `/series`, `/series/<key>` | 연재 목록·상세. `[slug].astro`를 `[key].astro`로 바꾼다 | SSR | `posts` |
| `/projects`, `/projects/<key>`, `/projects/<key>/<slug>` | D1 a면 SSR(entries). b면 prerender 그대로 | | `posts` / `posts,post-<id>` |
| `/about` | prerender | | — |
| `/og/<id>.png`, `/og/default.png` | D13 | SSR / prerender | `posts,post-<id>` |
| `/rss.xml`, `/sitemap-posts.xml`, `/robots.txt`, `/404` | 그대로. 사이트맵에 발행 글이 있는 카테고리·노트·프로젝트 글(D1 a)·`/about`을 더한다 | | `posts` |

- 카테고리 key는 `taxonomy.ts`의 값(`os`, `react-native` …)이다. 표시 이름은 `getCategoryLabel`.
- 캐시 태그와 TTL은 2단계 `setPublicPageCache` 그대로다. OG 이미지만 `s-maxage=86400`이다(D13).
- `/blog/tag/<tag>`에서 태그가 없으면 404(지금은 빈 목록 200). 사이트맵에는 발행 글이 있는 태그만 넣는다.

### D12. 노트 (Claude 판단)

| 항목 | 정한 값 | 이유 |
|---|---|---|
| `/notes` | 노트 스트림. 날짜 내림차순. 노트마다 날짜·제목(있으면)·본문 전체를 인라인으로 그린다(노트는 짧다). 영구 링크 아이콘. 50편이 넘으면 "더 보기"(`?before=`)를 그때 더한다 | 10.2 "짧고 거친 기록을 그날 올린다" |
| `/notes/<slug>` | 노트 1편. 제목이 없으면 `<title>`은 "노트 · 2026-11-09". OG 있음 | 공유 주소. 발행 토스트의 "공개 페이지 보기"가 열린다(`publicPathFor('note', slug)` → `/notes/<slug>`). 3단계 "노트는 아직 공개 주소가 없습니다(4단계)" 문구가 사라진다 |
| 홈 | 최신 노트 3편(날짜 + 첫 줄 120자). 0편이면 구역을 숨긴다 | 10.2 |
| RSS | `/notes/rss.xml` 별도. `/rss.xml`은 글만 그대로 | 구독자가 기대하는 것은 긴 글이다. 노트는 빈도가 높다 |
| 사이트맵 | 포함 | |
| 검색(D2) | `/blog` 필터는 글만. `/notes`는 필터 없음 | |
| 데이터 | `listPublishedEntries()`가 이미 모든 kind를 준다. `content-posts.ts`에 `getPublishedNotes()`를 더한다. `/blog/<노트 slug>` 요청은 `/notes/<slug>`로 301 | D11 |

### D13. OG 이미지 (Claude 판단)

| 항목 | 정한 값 | 이유 |
|---|---|---|
| 라이브러리 | `satori`(HTML/CSS 비슷한 객체 트리 → SVG) + `@resvg/resvg-js`(SVG → PNG). 엔드포인트 안에서 `import()`로 받아 다른 페이지의 콜드 스타트에 넣지 않는다. resvg 네이티브 바이너리가 Vercel(linux-x64)에서 안 되면 `@resvg/resvg-wasm`으로 바꾼다 | 8.3 "OG 이미지 생성(satori)". React 없이 쓴다(satori는 `{ type, props }` 객체를 받는다) |
| 주소 | `/og/<entry id>.png`(글·노트·프로젝트 글). `/og/default.png`(홈·목록·카테고리·태그·연재·about·404, prerender) | id는 slug가 바뀌어도 같다. 조회 1회(`entries/<id>`) |
| 디자인 | 1200×630. `post-cover.ts`의 팔레트·블롭·격자를 그대로 그린다(카드 커버와 같은 디자인, U14). 왼쪽 위 카테고리 표시 이름, 가운데 제목(최대 2줄, 54자 기준 글자 크기 2단계: 24자 이하 64px, 그 밖 52px), 아래 설명 1줄·날짜·`cruzlab.dev`. 노트는 "노트" 라벨 + 첫 줄. 프로젝트 글은 프로젝트 이름 + Part | 1.1 제목·설명 길이 |
| 글꼴 | Pretendard Bold **static** 글꼴을 서브셋해 `src/assets/fonts/og/Pretendard-Bold.subset.otf`로 둔다(KS X 1001 한글 2,350자 + ASCII + 라틴 확장 + 일반 구두점 + 화살표·기술 기호 일부. 어림 500 KB). satori는 woff2를 받지 않는다. Pretendard는 SIL OFL이라 서브셋과 재배포가 된다. 서브셋 생성은 `scripts/ops/og-font-subset.mjs`(devDependency `subset-font`)로 한 번 하고 결과를 커밋한다. Vercel 함수가 파일을 읽을 수 있게 어댑터 `includeFiles`에 넣는다 | 서브셋 밖 글자(한자 등)는 빈 네모가 된다. 55편 제목·설명의 글자 집합을 스크립트로 검사해 서브셋 범위를 정한다(11절) |
| 캐시 | `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=604800`, `Vercel-Cache-Tag: posts,post-<id>`. 재발행하면 3단계 D7의 `dangerouslyDeleteByTag(post-<id>)`가 이미지도 비운다 | 소셜 크롤러는 한 번만 가져간다 |
| `BaseHead` | `image` prop을 없애고 `ogImage`(절대 주소)를 받는다. 글·노트·프로젝트 글은 `/og/<id>.png`, 그 밖은 `/og/default.png`. `og:image:width/height` 1200×630 유지 | 표지 이미지(heroImage)는 OG에 쓰지 않는다(3.3 4 "코드 생성으로 통일") |

### D14. 변환기 표기 옵션 2건 (Claude 판단)

3단계 작업 문서 8절 9·11. 둘 다 PR-A(3단계 변환기 `src/editor/markdown/from-doc.ts`, `src/lib/content/markdown.ts`)의 변경이다.

| | 현상 | 정한 것 | 렌더 |
|---|---|---|---|
| 9. 단락 앞뒤 공백 | 단락 끝에 공백이 있으면(낱말 뒤 스페이스를 친 채 자동저장) mdast-util-to-markdown이 `&#x20;`로 쓴다 | `from-doc.ts`가 블록(단락·제목·표 셀·목록 항목) 텍스트의 처음과 끝 공백을 지운다(마크 밖으로 민 뒤, 3단계 5절 20과 같은 자리). 하드 브레이크 앞뒤 공백도 지운다 | 같다. 브라우저는 블록의 처음·끝 공백을 그리지 않는다(정규화 규칙 3·6과 같은 근거) |
| 11. 주소의 `&` | 이미지·링크 목적지의 `&`가 `\&`로 쓰인다(`?alt=media\&token=`) | `image`·`link`(·`definition`은 없음) 핸들러를 덮어써 목적지를 이스케이프 없이 쓴다. 목적지에 공백·`(`·`)`·`<`·`>`·제어 문자가 있으면 `<…>`로 감싼다(CommonMark 목적지 규칙). 그 밖 이스케이프(제목 `"`)는 기본 동작 | 같다. CommonMark는 목적지 안의 `\&`와 `&`를 같은 글자로 읽는다(3단계 5절 73에서 확인) |

검증: fixture 2개 추가(끝 공백 단락, `&`가 있는 주소) + 왕복 55/55 + 두 번 왕복 안정성. 기존 글은 다시 쓰지 않는다(3단계 D1 b). 백업 저장소에는 그 글을 다음에 고칠 때 반영된다.

### D15. 이미지 렌더: 새 자산만 srcset·크기 (Claude 판단)

3단계 D11 9: "4단계 srcset 규칙: 최대 변형 주소만 `srcset`을 만들고, 작성자가 고른 w480·w960 주소는 그대로 둔다."

| 이미지 | 처리 |
|---|---|
| 새 자산(`assets/{id}/…` 주소, 자산 문서에 `variants`) | 페이지가 본문에서 자산 ID를 뽑아(`assetIdFromUrl`, 2단계) `assets` 문서를 한 번에 읽는다(`getAll`, 메모리 캐시 60초). 주소가 최대 변형이면 `srcset`(w480·w960·w1600·max 중 있는 것)과 `sizes="(min-width: 768px) 720px, 100vw"`, `width`·`height`를 붙인다. 주소가 w480·w960이면 그 변형의 `width`·`height`만 붙인다 | 
| legacy 자산(130개, `variants: null`, 크기 없음)과 외부 이미지(GitHub·velog 55개) | 주소 그대로. `loading="lazy" decoding="async"`만. 크기를 모르므로 `aspect-ratio`를 쓰지 않는다 |
| 글 상단 표지(`cover.kind === 'image'`) | `fetchpriority="high"`, lazy 아님. 55편 모두 legacy 주소라 크기가 없다 |
| 영상(`isVideoUrl`) | 3단계 규칙 그대로 `<video autoplay loop muted playsinline>`. `preload="metadata"`를 더한다 |

파이프라인은 `assets` 맵(ID → 자산 문서)을 옵션으로 받는다. 미리보기 모드는 맵 없이 부른다(srcset 없음, 모양은 같다).

### D16. 글 상세 구성 (Claude 판단)

위에서 아래 순서다. 프로젝트 글(D1 a)과 노트(`/notes/<slug>`)도 같은 `PostArticle.astro`를 쓴다(노트는 헤더가 작다).

1. 머리줄: 카테고리 링크 · 발행일 · 수정일(`lastPublishedAt`이 발행일과 다른 날이면 "수정 2026-11-09") · 읽기 시간.
2. 제목(h1) · 설명(1~2줄).
3. 연재 상자(연재 글일 때): 연재 제목 링크 · "N/M" · 이전 편·다음 편 제목 · "전체 N편 보기"(`<details>`로 연재 목차 펼침). 모바일에서도 목차보다 위에 둔다(D6 답). 프로젝트 글은 Part 탭(지금 `[slug].astro`의 탭과 같은 자리).
4. 표지 이미지(`cover.kind === 'image'`일 때).
5. 본문(`.prose`). 목차는 1280px 이상에서 오른쪽 `position: sticky`(h2·h3, 현재 위치 강조는 `<script>` IntersectionObserver). 그 아래 폭에서는 본문 위 `<details>`로 접힌다. 제목마다 `id`(github-slugger, 한글 유지)와 hover 때 보이는 `#` 앵커.
6. 태그 칩.
7. 이전·다음 글(발행순, 같은 kind). 연재 글이면 그 아래 연재 목차 전체(현재 글 강조).
8. 끝. 댓글·공유 버튼 없음.

코드 블록은 D8의 틀(언어 라벨 + 복사). 콜아웃·임베드·수식은 3단계 CSS 규칙을 `prose.css`로 옮긴다. KaTeX CSS는 렌더 결과에 `class="katex"`가 있을 때만 `<link>`로 넣는다(`katex/dist/katex.min.css?url`, Vite가 글꼴을 함께 낸다). 외부 링크는 파이프라인 규칙대로 새 창이다.

### D17. 홈·about·목록·연재 구성 (Claude 판단)

| 페이지 | 구성 |
|---|---|
| 홈 `/` | (1) 이름 "Cruz" + 한 줄(지금 태그라인을 한 문장으로: "사용자와 가장 가까운 곳에서 최적의 사용자 경험을 설계하는 개발자") + 2줄 소개 + "소개 →"(`/about`) · "프로젝트 →". 사진 없음. (2) 최신 글 3편 `PostCard`(코드 커버) + "모든 글 →". (3) 최신 노트 3편 + "모든 노트 →"(0편이면 숨김). 끝 |
| `/about` | 한 화면(약 1,200px 높이 안). 사진(작게) + 이름 + 한 줄 + 하는 일 3문장(지금 히어로 3문단을 줄인다) · 프로젝트 4개 한 줄씩(제목 · 한 줄 설명 · 링크) · 경력/교육 2줄(크래프톤 정글 10기 2025.07~12, 단국대 화학공학 2014~2020. 세부는 `<details>`) · 기술 한 줄(텍스트) · 연락처(GitHub, LinkedIn, 이메일) · 이력서 PDF(`src/assets/resume.pdf?url`). prerender. 글이 없어도 완전하다(10.2 조건 3) |
| `/blog`·카테고리·태그 | (1) 제목 "Blog" + 설명 1줄 + "연재 N개 보기 →"(D6 a의 연재 입구, 첫 화면). (2) 카테고리 탭(전체 + 발행 글이 있는 카테고리. 지금 9개, 글 수 표시, 가로 스크롤 가능). 글이 없는 카테고리 주소는 404이고 사이트맵에 넣지 않는다. (3) 태그 칩 12개(글 수 순, 줄바꿈 허용) + 검색 입력(D2). (4) 결과 수. (5) 행 목록: 날짜(`MM.DD`, 연도가 바뀌는 첫 행 앞에 연도 머리) · 제목 · 설명 1줄(모바일 숨김) · 읽기 시간 · 연재 배지(있으면. "Pintos 2/5", 링크 아님). 커버 없음(U10). 페이지네이션 없음(54편) |
| `/series` | 연재 3개 한 줄씩: 제목 · 설명 · N편 · 마지막 발행일. 이모지 없음 |
| `/series/<key>` | 제목 · 설명 · N편 · 총 읽기 시간 · 번호 매긴 글 목록(제목·날짜·읽기 시간). "시작하기" 버튼은 없앤다(첫 글이 목록 첫 줄이다) |
| `/projects`(D1 a) | 프로젝트 4개 `ProjectCard.astro`(코드 커버에 프로젝트 이름, 설명, 기술, GitHub·Demo). featured 구분 없이 `order`순(4개 모두 featured다) |
| `/projects/<key>/<slug>` | `PostArticle.astro` + Part 탭 + 이전·다음 Part |

### D18. PR 분할 (Claude 판단)

3단계와 같이 코드 PR 3개 + 문서 PR 1개다. 모두 대상은 `rebuild`다. 7절.

- **PR-A** `stage4/a-renderer`: T1·T2. 공유 파이프라인·글 상세. 공개 페이지 중 글 상세만 바뀐다. 다른 페이지는 그대로 React다.
- **PR-B** `stage4/b-pages`: T3·T4·T5. 토큰·레이아웃·홈·about·목록·연재·노트·React 삭제. PR-A 병합 뒤 `rebuild`에서 만든다.
- **PR-C** `stage4/c-projects-og`: T6·T7·T8. 프로젝트 이전(D1 a)·OG·검증. PR-B 병합 뒤.
- **문서 PR** `stage4/docs`: T9.

PR-A 병합 전에 태그 `rebuild-pre-stage4`를 단다.

## 4. 구조

### 4.1 파일

```
src/pages/
  index.astro                      # 홈 (D17)
  about.astro                      # prerender
  blog/index.astro                 # 목록 전체
  blog/category/[key].astro        # 발행 글이 있는 카테고리 (D11)
  blog/tag/[tag].astro             # 태그. 동의어는 미들웨어가 301
  blog/[...slug].astro             # 글 상세 (D16). 다른 kind의 slug면 301
  notes/index.astro, notes/[slug].astro, notes/rss.xml.ts   # (D12)
  series/index.astro, series/[key].astro                   # [slug] → [key]
  projects/index.astro, projects/[project]/index.astro(302), projects/[project]/[slug].astro   # D1 a: entries
  og/[id].png.ts                   # satori + resvg (D13)
  og/default.png.ts                # prerender
  rss.xml.ts, sitemap-posts.xml.ts, robots.txt.ts, 404.astro
src/layouts/
  BaseLayout.astro                 # ClientRouter 없음. prose.css는 글 페이지만 import
  components/BaseHead.astro        # ogImage, dynamic subset 글꼴 preload, @view-transition CSS
  components/Header.astro          # 한 줄 (D6·D10)
  components/Footer.astro          # 링크 (D10)
  components/ThemeToggle.astro     # <script>
src/components/
  post/PostArticle.astro           # 머리줄·제목·연재 상자·표지·본문·태그·이전다음 (D16)
  post/Toc.astro                   # 목차 + 스파이 <script>
  post/SeriesBox.astro, post/PrevNext.astro, post/PartTabs.astro
  post/post-scripts.ts             # 코드 복사·앵커·스파이 (글 상세 <script> 1개)
  blog/PostRow.astro, blog/PostCard.astro, blog/PostCover.astro, blog/CategoryTabs.astro, blog/TagChips.astro
  blog/SearchFilter.astro          # 입력창 + <script> (D2)
  notes/NoteItem.astro
  projects/ProjectCard.astro
  admin/AdminLogin.tsx             # 그대로 (React)
src/lib/content/
  markdown.ts                      # markdownToHtml(md, { highlighter?, assets? }) (D8·D15)
  highlighter.ts                   # createSiteHighlighter(): 세밀 번들 20 언어 + 테마 2, 별칭 (D8)
  rehype-shiki.ts                  # highlighter → 코드 블록 색 + figure 틀
  rehype-headings.ts               # id(github-slugger) + 목차 추출
  rehype-assets.ts                 # srcset·width·height (D15)
  (remark-callout, remark-embed, rehype-strip-unsafe, safe-url, embed-url: 3단계 그대로)
src/lib/server/
  render-entry.ts                  # renderEntry(entry): 메모 캐시(id·revision) + 자산 조회 + markdownToHtml (D7)
  og-image.ts                      # 템플릿 객체 트리 + satori + resvg (D13)
  entries.ts                       # getAssetsByIds(), 프로젝트(seriesMeta.project) 읽기 추가
src/lib/
  content-posts.ts                 # getPublishedNotes(), getPublishedProjects()(D1 a), 카테고리별·태그별 도우미
  public-paths.ts                  # 카테고리·태그·노트·OG 주소 함수 (페이지·사이트맵·redirects가 같이 쓴다)
  redirects.ts                     # 동의어 태그 → 카테고리 301 규칙 추가 (D11)
  entry-rules.ts                   # publicPathFor(note·project), validatePublish(project) (D1 a·D12)
  entry-schema.ts                  # seriesMetaSchema.project 선택 칸 (D1 a)
src/styles/
  global.css                       # 토큰 재정의 (D10)
  prose.css                        # 공개 글·에디터 공용 (D10)
  shiki.css                        # 듀얼 테마 변수 (D8)
  fonts.css                        # Pretendard dynamic subset @font-face
src/editor/
  editor.css                       # .prose 복사본 제거 → prose.css import
  ui/PreviewMode.tsx               # 첫 진입 때 highlighter import() (D8)
  markdown/from-doc.ts             # 표기 옵션 2건 (D14)
src/assets/fonts/og/Pretendard-Bold.subset.otf
public/fonts/pretendard/subset/*.woff2   # dynamic subset
scripts/migrate/stage4-projects.mjs      # D1 a: dry-run · 실행 · 되돌리기(지정 ID)
scripts/ops/og-font-subset.mjs           # 서브셋 1회 생성
scripts/smoke/stage4-public.mjs          # 2단계 stage2-public 확장 (8.2)
tests/unit/content-highlighter.test.ts, content-headings.test.ts, content-assets.test.ts,
           public-paths.test.ts, redirects.test.ts(추가), og-template.test.ts, editor-markdown.test.ts(fixture 2 추가)
```

### 4.2 데이터 흐름

```
GET /blog/<slug> ─▶ findPublishedEntryBySlug (메모 60초) ─▶ kind가 post? ─아니오─▶ 301 /notes|/projects
                                                           └예─▶ renderEntry(entry)
                                                                   ├─ 메모 render:<id>:<revision> HIT ─▶ { html, toc, hasMath }
                                                                   └─ MISS ─▶ assetIdFromUrl ×N ─▶ assets getAll(메모) ─▶ markdownToHtml(md, { highlighter, assets })
                                                                ─▶ PostArticle (이전·다음 = listPublishedEntries에서 이웃) ─▶ CDN s-maxage=60, 태그 posts,post-<id>
발행 ─▶ publishEntry ─▶ purgePublicCache: dangerouslyDeleteByTag(post-<id>) [글·OG], invalidateByTag(posts) [목록·RSS·사이트맵]
GET /og/<id>.png ─▶ entries/<id> ─▶ 템플릿(post-cover 팔레트) ─▶ satori ─▶ resvg ─▶ PNG, s-maxage=86400, 태그 posts,post-<id>
미리보기(에디터) ─▶ import('highlighter') 1회 ─▶ markdownToHtml(docToMarkdown(doc), { highlighter }) ─▶ .prose (prose.css 공용)
```

## 5. 2·3단계 대응표

화면과 그것이 쓰는 2·3단계 코드다. 2026-11-09 코드로 확인했다.

| 화면·동작 | 쓰는 것 | 확인한 것 · 바꾸는 것 |
|---|---|---|
| 홈, `/blog`, 카테고리, 태그, 연재 목록 | `listPublishedEntries()`(모든 kind, `select` 본문 제외, 메모 60초) → `getPublishedContentPosts()`(post만) | 그대로. 카테고리·태그 거르기는 메모리에서(55편) |
| 글 상세 | `findPublishedEntryBySlug(slug)`(직접 일치 → `slugHistory` 301) | 그대로. kind가 post가 아니면 그 kind 주소로 301(새 규칙) |
| 노트 | `listPublishedEntries()`의 kind `note` | `getPublishedNotes()` 추가. `publicPathFor('note')` → `/notes/<slug>`(지금 null) |
| 프로젝트(D1 a) | `listPublishedEntries()`의 kind `project` + `listSeriesMeta()`의 `project` 칸 | `seriesMetaSchema`에 선택 칸 추가(더하기만). `validatePublish`에 project 규칙. `publicPathFor('project')` |
| 본문 렌더 | `markdownToHtml`(3단계: callout·embed·math·strip-unsafe·영상·외부 링크·인라인 코드 클래스) | 옵션 객체 추가(D8·D15). 기존 호출(미리보기, 테스트)은 옵션 없이도 돈다 |
| 왕복 검사·정규화 | `normalizeForCompare`, `parseMarkdown`, `stringifyMarkdown`(`MARKDOWN_STRINGIFY_OPTIONS`) | 표기 옵션 2건(D14)은 `from-doc.ts`와 핸들러. `normalizeForCompare`는 바꾸지 않는다 |
| 이미지 변형 | `assets/{id}` 문서 `variants{w480,w960,w1600,max}`, `width`·`height`(2단계 D6) | `getAssetsByIds()` 추가(읽기만). legacy는 `variants: null` |
| 자산 ID 추출 | `assetIdFromUrl(url, bucket)`(`src/lib/asset-url.ts`, 브라우저 안전) | 그대로 |
| 캐시 헤더 | `setPublicPageCache(headers, tags)` | 그대로. OG만 별도 값 |
| 퍼지 | `purgePublicCache(id)`(글 상세 삭제, 목록 무효화) | 그대로. OG 이미지는 `post-<id>` 태그를 가지므로 함께 비워진다 |
| 리다이렉트 | `findPublicRedirect(pathname)`(연재 2, 태그 정규화) | 동의어 태그 → 카테고리 규칙 추가 |
| 카테고리 | `CATEGORIES`, `getCategoryLabel`, `categoryForSynonymTag`(`taxonomy.ts`) | 그대로 |
| 읽기 시간 | `published.readingTime`(서버가 발행 때 계산) | 그대로 |
| 발행 API | `POST …/publish` → `publicUrl` | note·project 주소가 생긴다. API 계약은 그대로 |
| 에디터 미리보기 | `PreviewMode.tsx` → `markdownToHtml` | highlighter 동적 import. `.prose`는 `prose.css`에서 |
| 에디터 CSS | `editor.css`의 `.prose` 복사본 | 제거하고 `prose.css` import. 코드 색 토큰 `--code-*`은 `prose.css`로 옮기고, lowlight 구문 색 `--hl-*`은 남긴다(PR #13) |
| 사이트맵·RSS | `getPublishedContentPosts`, `getPublishedSeriesList` | 카테고리·노트·프로젝트·about 추가 |

## 6. 지우는 것

### 6.1 파일

| 파일 | 줄 | 이유 |
|---|---|---|
| `src/components/islands/` 16개 전부 | 1,683 | D9. `ThemeToggle`은 Astro + `<script>`로 대체 |
| `src/components/blog/BlogPostList.tsx`, `MarkdownPostView.tsx`, `PostCover.tsx` | 821 | D9·D16. `PostCover`는 `.astro`로 다시 쓴다(`post-cover.ts`는 유지) |
| `src/components/ExperienceList.astro`, `PostsPreview.astro`, `ProjectsPreview.astro`, `Reveal.astro` | 274 | D9·D17 |
| `src/pages/blog/[...slug].astro`의 `<style is:global>` 130줄, `src/editor/editor.css`의 `.prose` 복사본 | 약 260 | `prose.css`로 합친다 |
| `src/pages/series/[slug].astro` | 221 | `[key].astro`로 다시 쓴다 |
| `src/content/projects/**`(12개), `src/content.config.ts`, `src/lib/project-posts.ts`, `src/assets/img/projects/**`(12 MB) | | D1 a. README 미리보기 `cruz-lab/cruz-lab.png`는 지우지 않고 `.github/readme/cruz-lab-preview.png`로 옮긴다(D5). 이전 뒤 왕복 검사와 공개 스모크가 통과한 다음 지운다 |
| `src/assets/img/crusub.png`, `404-not-found.png`, `profile.svg`, `public/images/*.svg` 11개 | | 쓰는 곳 없음(1.2) |
| `src/consts.ts` | | `SITE_TITLE`·`SITE_DESCRIPTION`을 `public-paths.ts` 또는 `BaseHead`로 옮긴다 |

지우기 전에 파일마다 import·호출이 없는지 grep한다(1단계 규칙).

### 6.2 의존성

| 지운다 | 이유 |
|---|---|
| `framer-motion` | 아일랜드만 썼다 |
| `react-markdown`, `rehype-highlight` | 공유 파이프라인 + Shiki |
| `@tailwindcss/typography` | `prose.css`(D10) |
| `@astrojs/mdx` | D1 a를 고르면. 콘텐츠 컬렉션이 없어진다 |

| 더한다 | 용도 |
|---|---|
| `shiki` 3.12.2(고정) | D8. `@shikijs/core`·`engine-javascript`·`langs`·`themes`는 이 패키지가 끌어온다 |
| `satori`, `@resvg/resvg-js` | D13 |
| `github-slugger` | 제목 id |
| `subset-font`(dev) | OG 글꼴 서브셋 1회 |

남는 것: `react`·`react-dom`·`@astrojs/react`(관리자), `highlight.js`·`lowlight`(에디터 편집 영역), `katex`·`rehype-katex`·`remark-math`, `rehype-raw`, `sharp`, `firebase`(로그인).

## 7. 작업 순서

구현은 새 세션에서 한다(전역 7번 규칙). 각 작업은 검증까지 끝낸다.

| # | 작업 | 의존 | PR | 외부 변경 |
|---|---|---|---|---|
| T1 | 공유 파이프라인 확장: `highlighter.ts`(20 언어·별칭·테마 2), `rehype-shiki`(색 + 코드 블록 틀), `rehype-headings`(id·목차), `rehype-assets`(srcset), `markdownToHtml` 옵션, `prose.css`·`shiki.css` 분리와 에디터 import, 미리보기 highlighter 동적 import, 변환기 표기 옵션 2건(D14) + fixture, 단위 테스트, 왕복 55/55 | — | A | — |
| T2 | 글 상세: `render-entry.ts`(메모), `PostArticle`·`Toc`·`SeriesBox`·`PrevNext`, 글 상세 `<script>`(복사·앵커·스파이), KaTeX CSS 조건부, cdnjs 링크 제거, 다른 kind slug 301, `[...slug].astro` 재작성. 이 시점에 홈·목록은 옛 화면 그대로다 | T1 | A | — |
| T3 | 토큰·타이포·레이아웃: `global.css`·`fonts.css`(dynamic subset), `BaseLayout`(ClientRouter 제거, `@view-transition`), `BaseHead`(ogImage, preload), `Header`·`Footer`·`ThemeToggle.astro`, 404 | — | B | — |
| T4 | 페이지: 홈, `/about`, `PostRow`·`PostCard`·`PostCover.astro`·`CategoryTabs`·`TagChips`·`SearchFilter`(D2), `/blog`·`/blog/category/[key]`·`/blog/tag/[tag]`, 동의어 301, `/series`·`/series/[key]`, `/notes`·`/notes/[slug]`·`/notes/rss.xml`, `publicPathFor('note')`, 사이트맵, `public-paths.ts` | T3 | B | — |
| T5 | React 아일랜드·섹션 컴포넌트·미사용 자산 삭제, 의존성 정리(6.2의 D1 무관 항목), `tsc` 0 확인, 번들 비교(공개 페이지에 `astro-island` 0, React 청크 참조 0) | T4 | B | — |
| T6 | 프로젝트 이전(D1 a): `stage4-projects.mjs`(dry-run → 보고서 → 사용자 확인 → 실행), 이미지 10개 업로드, `seriesMeta.project`, `validatePublish(project)`, `publicPathFor('project')`, `/projects/**` 재작성(`ProjectCard`·`PartTabs`), 왕복 검사 대상 +8, 콘텐츠 컬렉션·`@astrojs/mdx` 삭제, README 미리보기 이미지 이동(README는 그 경로 한 줄만) | T2·T4 | C | 데이터 더하기(사용자 확인) |
| T7 | OG 이미지(D13): 글꼴 서브셋(글자 집합 검사 포함), `og-image.ts` 템플릿, `/og/[id].png`·`/og/default.png`, `BaseHead` 연결, `includeFiles` | T3 | C | — |
| T8 | 검증: `stage4-public.mjs`, JS 끈 확인, Lighthouse(로컬 빌드), 390px, `rebuild` 미리보기(8.5) | T5·T6·T7 | C | 시험 데이터 |
| T9 | 작업 문서 `2026-11-XX-stage4-public-site.md`, 진행 기록(감사 문서 11절 표·11.9), 이 Plan 15절. `README.md`·`PUBLISHING.md`·`.env.example`은 고치지 않는다(D5 답) | 모두 | 문서 | — |

- PR-A는 글 상세만 바꾸므로 그 사이 `rebuild` 미리보기의 홈·목록은 옛 React 화면이다. 괜찮다(운영은 main이다).
- T2와 T4는 다른 파일이다. 그러나 T4가 T3의 토큰 위에 서므로 PR-B는 PR-A 병합 뒤에 시작한다(3단계 PR-B가 그랬듯 PR-A가 열려 있으면 그 위에서 시작하고 병합 뒤 `rebuild`로 옮긴다. 트리 차이 0).
- T6의 실행(데이터 쓰기)은 dry-run 보고서를 사용자가 본 뒤에 한다. 실행 전에 `entries` 덤프를 한 번 뜬다(`stage3-roundtrip.mjs --dump`와 같은 방식의 읽기 전용 덤프).
- T6 뒤에는 main에서 `src/content/projects/**`를 고치지 않는다(D1 답의 운영 규칙). 고쳤다면 `rebuild` → main 병합 직전에 `stage4-projects.mjs`를 다시 돌린다. 스크립트는 원본 파일의 해시를 `legacy` 표지처럼 기록하고, 에디터로 고친 `entries` 글(초안 버전이 이전 때와 다름)은 덮지 않고 충돌로 보고한다(2단계 5.4 재동기화와 같은 규칙).
- PR-A 병합 전에 태그 `rebuild-pre-stage4`를 단다.

## 8. 검증 방법

### 8.1 자동 검사

| 항목 | 기준 |
|---|---|
| `pnpm lint`, `pnpm build` | 통과 |
| `pnpm test` | 422 + 새 테스트. 대상: highlighter 별칭·모르는 언어·듀얼 테마 변수, 제목 id·목차(중복 제목, 한글), srcset(최대 변형·작은 변형·legacy·외부), 공개 주소 함수, 동의어 301, 표기 옵션 fixture 2(끝 공백, `&` 주소), OG 템플릿(제목 줄 수·글자 크기 단계), 발행 규칙 project |
| `tsc --noEmit` | **0**(1 → 0. `TextReveal` 삭제) |
| 번들 | `pnpm build` 뒤 `dist/client/_astro`에서 공개 페이지 HTML이 참조하는 `.js`를 센다. `astro-island` 0개. React 런타임 청크(`client.*.js`)는 `/admin/login`과 에디터만 참조한다. 에디터 청크는 기록만(3단계 8.1과 같다). 미리보기 highlighter 청크 크기를 기록한다 |
| 왕복 검사 | `pnpm smoke:roundtrip` 55/55(T1 뒤), 63/63(T6 뒤, project 8 포함) |
| API 스모크 | `pnpm smoke:api` 104/104(2단계 그대로. 4단계는 API 계약을 바꾸지 않는다) |

이 worktree 기준선(2026-11-09, `rebuild` 끝 `4357218`): `pnpm lint` 통과, `pnpm test` 422, `tsc --noEmit` 1(`TextReveal`). 11.8에 적는다.

### 8.2 공개 페이지 점검 (`scripts/smoke/stage4-public.mjs`, localhost)

2단계 `stage2-public.mjs`의 검사(글 상세 200·제목, 초안 404, 목록 수, 301, 연재 순서, RSS·사이트맵, 헤더)를 그대로 포함하고 더한다. `entries`는 읽기만 한다.

1. 글마다: 목차 항목 수 = 본문 h2·h3 수, `figure.code-block` 수 = 펜스 코드 블록 수, `.katex`가 있는 글에만 KaTeX `<link>`, `astro-island` 0, cdnjs 요청 0, `Vercel-Cache-Tag`에 `post-<id>`.
2. `/blog`: HTML 100 KB 이하, 행 수 = 발행 post 수(지금 54), 카테고리 탭(전체 + 9)의 글 수 합 = 발행 post 수, 태그 칩의 글 수.
3. `/blog/category/<key>`: 발행 글이 있는 카테고리(지금 9개)는 200이고 글 수 = 그 카테고리 발행 글 수. 글이 없는 카테고리(지금 `retrospective`)는 404. `/blog/tag/<동의어>` → 301 → 카테고리 주소 200.
4. `/notes`: 발행 노트 수(시험 노트 1편으로 확인). `/notes/<slug>` 200. `/blog/<노트 slug>` → 301 `/notes/<slug>`.
5. `/series`, `/series/<key>` 3개: 순서(2단계 검사 그대로).
6. `/projects`, `/projects/<key>/<slug>` 8개(D1 a): 200, 제목, 이미지 주소가 `assets/`, Part 탭 수.
7. `/og/<id>.png`(글 3·노트 1·프로젝트 글 1): 200, `image/png`, 1200×630(PNG 헤더), 캐시 태그. `/og/default.png` 200.
8. `/rss.xml` item 수 = 글 수, `/notes/rss.xml` item 수 = 노트 수. 사이트맵에 발행 글이 있는 카테고리(지금 9)·노트·프로젝트 글·`/about`.
9. `/about`, `/404` 200(404는 상태 404).
10. 공개 응답 전부: `Set-Cookie` 없음.

### 8.3 브라우저 확인 (localhost)

| # | 시나리오 | 확인 |
|---|---|---|
| 1 | JS 끄고 홈·`/blog`·글 상세·`/notes`·`/about` | 모두 읽힌다. 검색 입력창은 보이지 않는다. 테마는 시스템 설정 |
| 2 | `/blog`에서 "pintos" 입력 | 행이 즉시 줄고 결과 수가 바뀐다. 카테고리 탭 클릭은 주소 이동 |
| 3 | 글 상세(코드·표·이미지·수식이 있는 글. 「큐(Queue)」 `LeFCqFhw9iubpp6OocVu` 등) 1280px | 오른쪽 목차, 스크롤하면 현재 항목 강조, 제목 hover 때 `#`, 코드 블록 언어 라벨·복사(클립보드 확인), 연재 상자(연재 글), 이전·다음 글 |
| 4 | 같은 글 390px | 목차가 본문 위 `<details>`, 표 가로 스크롤, 코드 가로 스크롤, 헤더 한 줄 |
| 5 | 라이트 테마 전환 | 코드 블록 색이 바뀐다(듀얼 테마). 본문·카드 대비 |
| 6 | 콜아웃·임베드·수식·영상 주소(쿼리 포함) 시험 글 | 공개 페이지에서 콜아웃 상자, iframe, KaTeX, `<video>`가 그려진다(3단계 8절 8 닫힘) |
| 7 | 시험 노트 발행 → 토스트 "공개 페이지 보기" | `/notes/<slug>`가 열린다. 홈·`/notes`에 보인다 |
| 8 | 프로젝트 글(D1 a) 열기 | Part 탭, 이전·다음 Part, 이미지(Storage 주소) |
| 9 | 문서 간 전환(Chrome) | 페이드. 지원하지 않는 브라우저는 그냥 전환 |

### 8.4 Lighthouse (로컬 `pnpm build` + `astro preview`, 모바일)

홈, `/blog`, 글 상세 1편, `/about`. 성능 90 이상이 목표다(계획 문서 9절). 못 미치면 원인(LCP 요소, 글꼴, 이미지)을 측정해 작업 문서에 적는다. 수치는 기록이지 통과 조건이 아니다. `rebuild` 미리보기에서도 한 번 잰다(CDN 포함).

### 8.5 `rebuild` 미리보기

1. 관리자 로그인 → 시험 글 발행(코드·콜아웃·이미지 1장) → `/blog/<slug>` 첫 요청 새 내용 → `/og/<id>.png` 200.
2. 제목을 고쳐 재발행 → `/og/<id>.png`가 새 제목(첫 요청 `MISS` 또는 `REVALIDATED`, 3단계 8절 12와 같은 기준).
3. 시험 노트 발행 → `/notes`·홈·`/notes/rss.xml`.
4. 프로젝트 글(D1 a) `/projects/<key>/<slug>` 200.
5. 시험 데이터 삭제 → 남은 데이터 0(`entries` 55 + project 8, `publishLog` 0, 새 자산은 프로젝트 이미지 10개만).

### 8.6 운영 무영향

운영(main)은 4단계 코드를 갖지 않는다. 데이터는 더하기만 한다(`entries` project 8편, `assets` 10개, `seriesMeta` 4개 문서에 `project` 칸). 옛 `posts`·`series`·콘텐츠 컬렉션은 그대로라 운영 페이지가 바뀌지 않는다. 규칙·인덱스·환경 변수·Vercel 설정을 바꾸지 않는다.

## 9. 롤백 방법

### 9.1 코드

- PR-A 병합 전에 태그 `rebuild-pre-stage4`를 단다.
- 되돌릴 때는 `rebuild`에서 병합 커밋을 `git revert -m 1`로 되돌린다.
- OG 엔드포인트만 빼면 `BaseHead`가 `/og/default.png`를 쓴다(prerender).

### 9.2 데이터

| 상황 | 방법 |
|---|---|
| 프로젝트 이전(D1 a)을 되돌린다 | `stage4-projects.mjs --rollback`: 지정 ID(`project-*`) 8편과 그 `revisions`, 자산 10개(문서 + Storage 파일), `seriesMeta.project` 칸을 지운다. 운영은 콘텐츠 컬렉션을 쓰므로 영향 없음. 저장소 파일은 git에 있다 |
| 시험 글·노트·자산 | 끝에 지운다. 남은 데이터 0 확인 |
| 표기 옵션(D14)으로 다시 쓴 글 | 4단계는 기존 글을 다시 쓰지 않는다. 바뀌는 것은 4단계 뒤 실제로 고친 글뿐이다. `revisions`가 이전 발행본을 갖는다 |

### 9.3 외부 설정

바꾸는 것이 없다.

## 10. 외부 변경 목록

| # | 변경 | 시점 | 하는 사람 | 되돌리기 |
|---|---|---|---|---|
| 데이터 | 프로젝트 글 8편 → `entries`, 이미지 10개 → Storage `assets/`, `seriesMeta` 4개 문서에 `project` 칸(D1 a) | T6, dry-run 보고서를 본 뒤 사용자 확인 | Claude(Admin SDK, 2단계 자산 API 흐름) | 9.2 |
| 시험 데이터 | 8.3·8.5의 시험 글·노트·자산 생성·삭제 | T8 | Claude | 끝에 모두 지운다 |

4단계는 규칙·인덱스·함수·환경 변수·Vercel 설정·버킷 CORS를 바꾸지 않는다. 새 비밀값이 없다. Pretendard(SIL OFL) 서브셋 파일을 저장소에 더한다(라이선스 파일 동봉).

2·3단계에서 남은 것(4단계 작업이 아님, 사용자 확인 뒤): 3단계 문서 [PR #12](https://github.com/crucial-sub/cruz-lab/pull/12) 병합. 원격의 병합 끝난 브랜치 삭제(`stage3/plan`, `stage3/a-markdown`, `stage3/b-editor`, `stage3/c-commands`, 병합 뒤 `stage3/docs`). E6 Secret Manager `GITHUB_TOKEN` 삭제.

## 11. 위험과 대응

| 위험 | 대응 |
|---|---|
| Shiki가 서버 번들과 콜드 스타트를 키운다 | 세밀 번들(20 언어 + 테마 2, JS 엔진). 모듈 초기화 때 1회 생성. 미리보기 글 상세 콜드 TTFB를 재서 기록한다. 1.5초를 넘으면 D7의 뒤집는 조건 |
| satori·resvg가 Vercel 함수에서 안 된다(네이티브 바이너리) | `@resvg/resvg-js`는 linux-x64 바이너리를 optionalDependencies로 받는다. 미리보기에서 첫 확인. 실패하면 `@resvg/resvg-wasm`으로 바꾼다(코드 5줄) |
| OG 글꼴 서브셋에 없는 글자가 제목에 있다(한자, 특수 기호) | T7에서 55편 + 프로젝트 글 제목·설명의 글자 집합을 스크립트로 뽑아 서브셋 범위에 더한다. 그래도 없는 글자는 satori가 빈 네모로 그린다. 서브셋 밖 글자가 생기면 작업 문서에 적는다 |
| 외부 이미지 55개(53%)는 크기를 몰라 레이아웃 이동(CLS)이 생긴다 | `loading="lazy"`로 첫 화면 밖에서 로드한다. 표지는 eager. CLS 수치를 Lighthouse에 기록한다. 외부 이미지를 자산으로 옮기는 일은 하지 않는다(범위 밖) |
| Pretendard dynamic subset이 요청을 100여 개로 나눈다 | `unicode-range`로 필요한 범위만 받는다. 첫 화면 범위 2~3개 preload. 전체 전송량이 지금(2 MB)보다 크게 줄어드는지 측정해 기록한다 |
| 문서 간 view transition이 일부 브라우저에서 없다 | 점진적 향상이다. 없으면 그냥 전환이다 |
| 노트·프로젝트 slug가 글 주소로 열린다(slug 공간 공유) | `/blog/<slug>`에서 kind를 보고 301(D11) |
| 프로젝트 이전 스크립트가 이미지 경로·내부 링크를 잘못 바꾼다 | dry-run 보고서(글마다 바뀐 주소 목록)를 사용자가 본 뒤 실행. 이전 뒤 옛 정적 페이지와 새 페이지의 본문 텍스트(태그 제거)를 비교하는 검사를 스모크에 넣는다. 왕복 검사 63/63 |
| 발행 규칙에 project를 더하면서 post·note 규칙이 바뀐다 | 기존 `entry-rules.test.ts`가 그대로 통과해야 한다. API 스모크 104/104 |
| 목록 필터 `<script>`가 없으면 입력창만 남는다 | `<noscript>` 스타일로 입력창을 숨긴다. 목록은 서버 렌더라 그대로 읽힌다 |
| `prose.css`를 합치면서 에디터 편집 영역 모양이 바뀐다 | 3단계 복사본과 규칙이 같다. 에디터 브라우저 확인 1회(기존 글 열기, 저장 없음) |
| `ClientRouter`를 빼면 `transition:persist`·`astro:page-load`에 기댄 코드가 깨진다 | 해당 코드는 `Header`(persist)와 `Reveal`(page-load)뿐이고 둘 다 지운다. grep으로 확인 |
| Lighthouse 90에 못 미친다 | 원인을 측정해 작업 문서에 적는다. 목표 미달은 보고 사항이지 병합 조건이 아니다 |
| `tsc` 0을 만든 뒤 새 오류가 생긴다 | PR마다 `tsc --noEmit` 0을 확인한다 |

## 12. 사용자가 답할 결정 (요약. 모두 답함 2026-11-09, 답은 13절)

1. **D1 프로젝트 글 이전.** (a) 4단계에서 `entries`(kind `project`)로 옮기고 `/projects`가 그것을 읽는다 **(권장)**. (b) 화면만 다시 만들고 데이터는 저장소 파일로 둔다. 이전은 5단계.
2. **D2 검색 범위.** (a) `/blog` 안 필터(제목·설명·태그·카테고리, JS 없으면 전체 목록) **(권장)**. (b) a + 전역 검색 팔레트(`/`·`Mod+K`, 제목·설명·태그 인덱스, React 없이 `<dialog>`).
3. **D3 이미지 임의 px 폭·정렬(3단계 Plan 14절 상기).** (a) 미룬다. 렌더러는 원시 `<img width>`·`<p align>`을 통과시켜 길을 열어 둔다. 5단계 Plan에서 다시 묻는다 **(권장)**. (b) 4단계에 넣는다(원시 HTML 표기, 변환기·에디터 메뉴, 1~2일).
4. **D4 링크 카드(3단계 Plan 14절 상기).** (a) 미룬다. 5단계 Plan에서 다시 묻는다 **(권장)**. (b) 4단계에 넣는다(발행 때 OG 메타 읽기, `linkCards` 컬렉션, 1~2일).
5. **D5 `README.md`·`PUBLISHING.md` 정리.** (a) 4단계 마지막 작업(T9)에 넣는다 **(권장)**. (b) 지금 별도 문서 PR. (c) 5단계로.
6. **D6 헤더 메뉴.** (a) Blog · Notes · Projects · About. Series는 `/blog` 안 링크 **(권장)**. (b) Blog · Notes · Series · Projects · About.

Claude 판단으로 정한 것(승인 때 함께 확인): D7 요청 때 렌더 + 메모리 캐시(미리 계산 없음), D8 Shiki 세밀 번들·듀얼 테마·코드 블록 틀·미리보기 동적 import, D9 React 전부 제거와 대체(테마 `<script>`, Reveal·ClientRouter 삭제, `@view-transition`), D10 토큰·타이포 스케일·본문 68ch·`prose.css` 한 파일·Pretendard dynamic subset·헤더 한 줄·푸터 링크·404 prerender 유지, D11 `/blog/category/<key>`와 동의어 태그 301·다른 kind slug 301, D12 노트 주소·스트림·별도 RSS, D13 OG `/og/<id>.png`(satori + resvg, 코드 커버 디자인, 서브셋 글꼴, 태그 퍼지), D14 표기 옵션 2건(블록 앞뒤 공백 제거, 목적지 `&` 이스케이프 제거), D15 새 자산만 srcset·크기, D16 글 상세 구성, D17 홈·about·목록·연재 구성, D18 PR 3개 + 문서 PR.

## 13. 사용자 결정

| 결정 | 답 | 날짜 |
|---|---|---|
| D1 | a. 4단계에서 `entries`(kind `project`)로 옮기고 `/projects`가 그것을 읽는다. 함께 정한 운영 규칙: 이전 뒤에는 main에서 프로젝트 `.md`를 고치지 않는다. 고쳐야 하면 `rebuild` → main 병합 직전에 이전 스크립트를 다시 돌린다(7절) | 2026-11-09 |
| D2 | a. `/blog` 안 필터만(제목·설명·태그·카테고리, JS 없으면 전체 목록). 전역 팔레트와 본문 검색은 하지 않는다(14절 상기 목록) | 2026-11-09 |
| D3 | a. 4단계에는 넣지 않는다. **사용자: "이미지 세부 조절 기능은 나중에 반드시 넣을 것."** 5단계에서 다시 묻지 않고 범위에 넣는다(14절). 4단계는 공개 렌더러가 원시 `<img width>`·`<p align>`을 그리는 동작을 테스트로 고정한다. 그동안 원시 이미지 HTML을 소스 모드에 직접 쓰지 않는다(편집 모드 저장 때 글자가 된다. 2026-11-09 실제 확인) | 2026-11-09 |
| D4 | a. 미룬다. 주소 한 줄 단락은 지금처럼 링크다. 5단계 Plan에서 다시 묻는다(14절). 넣게 되면 발행 응답 뒤 백그라운드(`waitUntil`)로 읽는 설계를 기본으로 한다(발행 중 동기 읽기는 하지 않는다) | 2026-11-09 |
| D5 | 재건이 모두 끝난 뒤(5단계 끝), main 병합 직전에 한 번 쓴다. 범위 `README.md`·`PUBLISHING.md`·`.env.example`. 4단계는 README 미리보기 이미지 이동과 그 경로 한 줄만 한다(T6). 할 일 목록은 감사 문서 11.3 | 2026-11-09 |
| D6 | a. Blog · Notes · Projects · About. Series는 헤더에 두지 않고 연재 입구 4곳(`/blog` 링크, 태그 칩, 글 상세 연재 상자, 푸터)으로 간다. 폭 380px 미만은 헤더 간격·여백 12px(D6 실측) | 2026-11-09 |

**결정 중에 바로잡거나 더한 것(2026-11-09).**

1. 공개 글은 55편이 아니라 54편이다. 「크래프톤 정글 0주차 에세이」 1편은 초안이다. 그래서 공개 카테고리는 9개이고(회고 0편), 글이 없는 카테고리는 탭을 숨기고 주소는 404다(1.1, D11, D17, 8.2).
2. D1: 이전 뒤 main에서 프로젝트 `.md`를 고치면 병합 직전에 이전 스크립트를 다시 돌린다. 에디터로 고친 글은 덮지 않고 충돌로 보고한다(7절).
3. D3: 에디터 변환기는 원시 `<img width>`·`<p align>`을 지원하지 않는 HTML로 보고, 편집 모드에서 저장하면 `\<img …>` 글자로 바꾼다. 공개 파이프라인은 그 HTML을 그대로 그린다(실제 실행으로 확인).
4. D4: 기존 글의 링크 카드 후보는 4편 5개 단락이다. 넣게 되면 발행 응답 뒤 백그라운드로 읽는다.
5. D5: README 첫 화면 이미지 `cruz-lab.png`가 D1 a로 지워지는 폴더에 있어, T6에서 `.github/readme/`로 옮긴다. "main 병합 직전에 할 일" 누적 목록을 감사 문서 11.3에 만들었다.
6. D6: 헤더 폭 실측과 380px 미만 간격 규칙, 연재 입구 4곳(D6 절).

## 14. 뒤로 미룬 것 (상기 목록)

3단계 Plan 14절을 이어받는다. 사용자가 "나중에 상기해 달라"고 한 항목이다. 적힌 시점에 Claude가 다시 묻는다.

| 항목 | 미룬 이유 | 다시 물을 시점 | 넣을 때 비용(어림) |
|---|---|---|---|
| 이미지 세부 조절(임의 px 폭과 정렬) | 3단계 Plan 14절. 4단계 D3 답(2026-11-09): a(4단계 제외). **"나중에 반드시 넣을 것"** | **5단계 Plan에 범위로 넣는다(묻지 않는다).** 이미지 노드 `width`·`align` 속성, 변환기의 `<img>`·`<p align><img></p>` 읽기·쓰기, 이미지 메뉴의 폭 입력·정렬 버튼. 기존 본문 이미지 104개(옛 주소·외부 주소)에도 쓸 수 있어야 한다 | 1~2일 |
| 링크 카드 | 3단계 Plan 14절. 4단계 D4 답(2026-11-09): a(미룸). 기존 글의 카드 후보는 4편 5개 단락(w3schools 2, studiomeal, hideoushumpbackfreak, gist JSON). 문법이 "주소 한 줄"로 같아 나중에 켜면 기존 글도 그대로 카드가 된다 | 5단계 Plan(다시 묻는다). 설계 기본값: 발행 응답 뒤 백그라운드 읽기, SSRF 방지(http·https, 사설 주소 차단, 5초, 1 MB), `linkCards/<해시>` 30일, 카드 이미지는 직접 불러오기(복사는 별도 비용) | 1~2일 |
| 드래그 핸들 | 3단계 사용자 답(2026-11-09): 써 본 뒤 정한다 | 5단계 Plan | 반나절 |
| 찾기·바꾸기 | 브라우저 찾기와 소스 모드로 대신한다 | 5단계 Plan | 반나절~1일 |
| 키맵 저장(`settings/editor`)과 설정 화면 | 5단계 관리자 앱 몫 | 5단계 Plan(확정) | 1일 |
| README·PUBLISHING·`.env.example` 최종본 | D5 답: 설명 문서는 모든 작업이 끝난 뒤 한 번 | main 병합 직전(감사 문서 11.3 목록) | 반나절 |
| 전역 검색 팔레트 | 4단계 D2 (a)를 고르면. 발행 글 54편에는 목록 필터로 충분하다 | 글이 100편을 넘거나 사용자가 원할 때 | 1일 |
| 댓글(giscus) | 요구에 없다(계획 문서 3.3의 방향) | 사용자가 원할 때 | 반나절 |
| 404 최신 글 3개 | prerender 유지(2.3) | 필요하면 5단계 이후 | 반나절(SSR 404 + 캐시) |
| 본문 HTML·목차 미리 계산 | D7 요청 때 렌더 | 미리보기 글 상세 콜드 TTFB가 1.5초를 넘으면 5단계 Plan. 4단계 미리보기 값은 1,444 ms(한 번 잼, 작업 문서 4.17). 5단계 Plan에서 더 재서 정한다(작업 문서 8절 4) | 1일 |
| `tools/cruz-lab-knowledge-mcp`의 프로젝트 기능 | 4단계 PR-C 사용자 결정(2026-11-10): 원본 폴더를 Plan대로 지우고 도구 코드는 고치지 않는다. 지금 `projects` 범위는 "폴더 없음" 오류를 낸다(작업 문서 5절 58) | 5단계 Plan(다시 묻는다). 물을 것: 도구가 Firestore `entries`(kind project)를 읽게 바꿀지. 도구 문서 정리는 main 병합 직전(감사 문서 11.3 5) | 어림하지 않았다 |

## 15. 구현과 다른 것 (구현 중 추가)

구현 세션이 Plan과 다르게 하거나 Plan이 정하지 않은 것을 판단하면 [작업 문서](./2026-11-09-stage4-public-site.md) 5절에 적고 여기에 요약한다.

**PR-A (T1·T2, 2026-11-09).** 작업 문서 5절 1~21.

1. 언어 목록을 `src/lib/content/code-languages.ts`로 옮겼다(서버 하이라이터가 lowlight를 끌어오지 않게). `shiki/core` 등 `shiki` 패키지의 하위 경로로 가져온다(`@shikijs/*`는 pnpm에서 직접 가져올 수 없다).
2. `MarkdownPostView.tsx`를 PR-A에서 지웠다(6.1은 T5). 의존성 삭제는 T5 그대로.
3. 카테고리 링크는 PR-B까지 동의어 태그 주소다(`categoryPath()` 한 함수. PR-B가 `/blog/category/<key>`로 바꾼다).
4. 파이프라인 출력에서 Tailwind 모양 클래스를 뺐다. 모양은 `prose.css`다. 표는 `div.table-scroll`(`role="region"`)로 감싼다. `renderMarkdown()`이 `{ html, toc, hasMath }`를 돌려준다.
5. 렌더 캐시는 글 ID당 한 칸 `Map`(10분)이다. 자산 조회·블록 하이라이트가 실패해도 글은 그린다.
6. 복사는 클립보드 API가 거부되면 `execCommand('copy')`로 한 번 더 한다. 제목 앵커는 터치 화면에서 숨기고 앞을 NBSP로 붙인다.
7. 스크롤 스파이는 IntersectionObserver가 아니라 passive `scroll` + rAF다(멀리 건너뛰기·문서 끝).
8. 타이포 스케일·본문 h1 크기·`@tailwindcss/typography` 제거는 PR-B(T3·T5) 몫으로 두었다. PR-A의 `prose.css`는 3단계 규칙 + 본문 1차 색 + 새 요소 규칙이다.
9. 정규화 규칙 7(사용자 결정 2026-11-09): `normalizeForCompare`가 블록(단락·제목·목록 항목·표 칸) 처음·끝 공백을 지운다. 5절 대응표의 "`normalizeForCompare`는 바꾸지 않는다"와 다르다. 3단계 변환기가 `&#x20;`로 저장한 사용자 시험 초안 1편을 D14가 다시 쓰면 렌더는 같은데 비교가 달랐다. 운영 왕복 59/59.

**PR-B (T3·T4·T5, 2026-11-10, [PR #16](https://github.com/crucial-sub/cruz-lab/pull/16)).** 작업 문서 5절 22~51(구현 20, 리뷰 뒤 10).

1. `/projects` 두 페이지의 아일랜드·Reveal을 PR-B에서 걷어냈다(`ProjectCard.astro`, `prose.css`). 데이터는 콘텐츠 컬렉션 그대로이고 T6은 데이터 출처만 바꾼다. `/about`의 프로젝트 4줄은 파일에 적었다(prerender가 Firestore를 읽지 않게).
2. `BaseHead`는 `ogImage` 이름만 바꾸고 기본 이미지는 T7까지 프로필 사진이다(`/og/default.png`가 아직 없다).
3. Pretendard 단일 파일을 지우고 subset 92개를 둔다. preload는 측정으로 고른 subset 3개(91·90·89), JetBrains Mono preload는 뺐다. 페이지당 글꼴 286~439 KB(이전 2,057 KB). Lighthouse 모바일(로컬, 3회 중앙값): 홈 74 → 86, `/blog` 50 → 93, 글 상세 73 → 76, `/about` 90. LCP는 12.9~22.2초 → 2.7~4.5초, 시뮬레이션 FCP는 1.6~1.7초 → 2.4~3.2초(작업 문서 4.9).
4. JS가 없으면 시스템 테마를 따른다(라이트 값을 미디어 쿼리에 한 번 더). 검색창·테마 버튼은 `data-js-only` + noscript 스타일로 숨긴다.
5. 컨테이너는 바깥 폭 960px(내용 928px)다. 1280px 이상 글 상세 그리드는 컨테이너 밖까지 넓힌다(본문 68ch 유지). Tailwind `container` 플러그인은 껐고, Tailwind 글자 크기 유틸리티는 그대로다(토큰은 공개 컴포넌트·`prose.css`만).
6. 전역 링크 색 규칙의 우선순위를 낮췄다(`a:where(…)`). 방문 링크 색을 지웠다.
7. 노트 목록은 등호 조건 두 개로 읽는다(복합 색인 없음). 없는 카테고리·태그·연재·노트 주소는 그 페이지가 안내 화면(`NotFound.astro`)을 직접 그리고 404다(`/series/<없음>`은 302 → 404). 빈 404 응답은 운영에서 `/404.html`을 네트워크로 다시 받으므로 쓰지 않는다(리뷰 중요 3).
8. 사이트맵(`sitemap-posts.xml`)에 글 있는 카테고리·태그·노트를 더했다. 홈·목록 페이지는 `@astrojs/sitemap`이 이미 모은다.
9. 카테고리 탭은 글 수 많은 순이다(Plan이 정하지 않음). 태그 칩은 모든 목록 페이지에서 전체 태그다.
10. `github-mark` SVG 2개도 지웠다(6.1 목록 밖, 헤더를 인라인 SVG로 바꿔 쓰는 곳이 없다). `scripts/smoke/stage2-public.mjs`의 목록·동의어 태그 검사를 새 화면에 맞게 고쳤다.
11. 리뷰 뒤: 안전 처리가 할 일 체크 상자(읽기 전용)만 남긴다(3단계부터 지워졌다). `renderMarkdown`에 `idPrefix`(노트 스트림). 노트의 카테고리·태그는 글자. Tailwind 통합의 base.css 자동 주입을 껐다(CSS 중복, 페이지당 약 17 KB). 에디터 태그 칩 CSS를 `editor.css`로 옮겼다.

**PR-C (T6·T7·T8, 2026-11-10, [PR #17](https://github.com/crucial-sub/cruz-lab/pull/17)).** 작업 문서 5절 52~84(구현 22, 리뷰 뒤 11).

1. 이전 표지는 `legacy`가 아니라 새 선택 칸 `projectSource`다(2단계 재동기화가 프로젝트 글을 삭제 후보로 보지 않게). 에디터로 지운 글은 `publishLog` 삭제 기록으로 알아본다. 원본 위치는 `--source-root`(원본을 지운 뒤 main checkout), 날짜는 원본 파일의 git 첫·마지막 커밋.
2. seriesMeta 4개는 새 문서다(기간은 `YYYY-MM` 글자). `chapterLabel`은 옮기지 않는다(모두 "Part <order>"). 왕복 검사는 63이 아니라 69편이다(사용자 초안 2편 증가).
3. (사용자 결정) `tools/cruz-lab-knowledge-mcp`가 읽던 `src/content/projects`를 Plan대로 지웠다. 도구의 프로젝트 기능은 "폴더 없음" 오류를 낸다. 도구 문서는 main 병합 직전 목록(감사 문서 11.3 5)에, Firestore 전환은 5단계 Plan에.
4. 프로젝트 글은 머리줄 첫 칸이 프로젝트 이름, 연재 상자 자리가 Part 탭, 이전·다음이 Part 순서다. 프로젝트 정보(`seriesMeta.project`)가 없으면 404. `/projects/**`는 SSR + 캐시 태그(`posts`, 글은 `posts,post-<id>`). `publicPathFor`가 연재를 받는다.
5. OG 카드는 카드 커버에서 필름 노이즈를 빼고 격자를 기울이지 않는다(satori 미지원, 기울인 격자 + 흐림이 한 장 3초). 글자는 NFC로 맞추고 그림으로 보이는 이모지(💡)만 뺀다. 서브셋 391 KB·2,704글자, 지금 글의 서브셋 밖 글자 0. cmap 판독기는 직접 썼다. OG 404는 글자 응답, 글 조회는 메모 없음.
6. 점검 스크립트 `stage4-public.mjs`는 2단계 점검을 끝에 돌리고, 옛 프로젝트 페이지 비교는 옵션이다. 이전·다음 이름표 조사를 고쳤다.
7. 리뷰 뒤: 되돌리기는 실행 기록(`migration.json`)에 있는 자산·seriesMeta 문서만 지우고, 에디터로 고친 글은 빼고, 글을 먼저 지운다. 재동기화 갱신은 읽은 시각을 전제 조건으로 쓰고 빠진 이미지의 usedBy를 고친다. 에디터로 지운 프로젝트 글도 삭제 표지(`entryTombstones`)를 쓴다. 2단계 재동기화가 seriesMeta의 `project` 칸을 남긴다. API 스모크의 낡은 기대값 3개(PR-B 목록·노트 주소)를 고쳤다(105/105).

**T9 (문서 PR, 2026-11-10, 브랜치 `stage4/docs`, [PR #18](https://github.com/crucial-sub/cruz-lab/pull/18)).** 작업 문서 2.10.

1. 7절 T9의 범위(작업 문서, 감사 문서 11절 표·11.9, 이 15절)에 3단계 T10(PR #12)과 같은 두 곳을 더했다. 감사 문서 8.3의 5단계 행에 4단계 결과를 이어받는다는 한 줄을 썼다. 이 Plan 14절에 콜드 TTFB 측정값과 MCP 도구 상기 행을 더했다(사용자 결정 2026-11-10 "5단계 Plan에서 다시 묻는다").
2. 감사 문서 11.3의 6에 재동기화 주의 두 가지를 더했다(2단계 재실행은 프로젝트 글을 지움 후보로 보지 않는다. 이전 스크립트는 CDN을 비우지 못한다). 4단계 몫(2·3·5·6)은 빠진 것이 없다.
3. `README.md`·`PUBLISHING.md`·`.env.example`은 고치지 않았다(D5 답).

**4단계 끝 상태(2026-11-10).**

1. 병합: Plan `b2583ed`, PR-A `2b32907`, PR-B `2ca985d`, PR-C `34df87f`. 되돌리기 기준 태그 `rebuild-pre-stage4` = `b2583ed`(9.1).
2. 검증(작업 문서 4.12~4.17): lint 통과, 테스트 573, `tsc` 0, 빌드 통과, 운영 왕복 69/69, 공개 점검 871/0 + 2단계 324/0, API 스모크 105/105, 공개 페이지 `astro-island` 0, 미리보기 확인 8.5 전부.
3. 8.5-5의 기대값과 다른 끝 상태: `entries` 69(Plan은 55 + project 8. 사용자 초안이 늘었다, 작업 문서 5절 57), `publishLog` 2(Plan은 0. PR-B 시험 노트의 발행·삭제 기록, 작업 문서 4.11). 4단계가 더한 자산은 프로젝트 이미지 10개다(`assets` 131 → 141, 작업 문서 4.13·4.17). 시험 데이터는 0이다.
4. 외부 설정 변경 0(10절의 "데이터"·"시험 데이터" 밖의 변경 없음, 작업 문서 3절).
5. 5단계 Plan으로 넘기는 것: 14절 상기 목록, 작업 문서 8절 3~6(클립보드 실제 브라우저 확인, 글 상세 콜드 TTFB, MCP 도구, OG 첫 요청 11초대). 읽을 순서는 작업 문서 7절이다.

## 부록 A. 계획 문서 6.1 요구(U1~U18)와 4단계 처리

| # | 요소 | 4단계 처리 | 결정 |
|---|---|---|---|
| U1 | 커스텀 커서 + 트레일 | 삭제 | D9 |
| U2 | 타이핑 롤 텍스트 | 삭제. 한 문장 고정 | D9·D17 |
| U3 | 따옴표 태그라인 + 3문단 | 홈은 한 줄 + 2줄. 3문단은 `/about`에서 3문장으로 | D17 |
| U4 | 글자별 회전 등장 | 삭제 | D9 |
| U5 | 3D 틸트·글로우·마그네틱·리플 | 삭제. hover 1단계 | D9·D10 |
| U6 | 스킬 로고 그리드 | 삭제. `/about`에 텍스트 한 줄 | D17 |
| U7 | Experience 아코디언 | `/about` 2줄 + `<details>` | D17 |
| U8 | 알약 메뉴 + 분리된 로고 | 한 줄 헤더 | D6·D10 |
| U9 | 목록 컨트롤 과다 | 카테고리 탭 + 태그 칩 + 검색 1개 | D2·D11·D17 |
| U10 | 3열 카드 그리드 | 리스트형 행. 커버는 홈 최신 글 3편에만 | D17 |
| U11 | 본문 회색, 896px, 목차 없음 | 1차 색, 68ch, 목차 | D10·D16 |
| U12 | 목차·이전다음·시리즈·코드 복사·앵커 없음 | 모두 추가. 공유 버튼은 없음 | D16 |
| U13 | cdnjs 테마, 복사 없음, 파일명 없음 | Shiki 듀얼 테마, 복사, 언어 라벨. 파일명(`meta`)은 라벨에 함께 보인다 | D8 |
| U14 | 시리즈 카드 vs 블로그 카드 커버 불일치 | 카드·프로젝트·OG 모두 코드 커버 | D13·D17 |
| U15 | 이모지 제목 | 삭제 | D17 |
| U16 | 푸터 저작권 1줄 | RSS·GitHub·이메일·사이트맵·about | D10 |
| U17 | 라이트 테마 미검증 | 듀얼 테마 코드, 보조 글자 대비 조정, 브라우저 확인 5 | D8·D10 |
| U18 | 404 | 링크 4개. 최신 글은 넣지 않는다 | D10 |

## 부록 B. 디자인 토큰·타이포 값 (D10)

| 토큰 | 다크 | 라이트 | 비고 |
|---|---|---|---|
| `--bg-app` / `--bg-surface` / `--bg-card` | `#0e0f12` / `#14161a` / `#1a1d23` | `#f8fafc` / `#ffffff` / `#f1f5f9` | 그대로 |
| `--text-primary` / `--text-secondary` | `#e7e9ee` / `#a8b0ba` | `#0f172a` / **`#475569`** | 라이트 보조 글자 대비(지금 `#334155`는 1차와 차이가 작다) |
| `--border` | `#262a31` | `#e2e8f0` | 그대로 |
| `--brand` / `--brand-hover` / `--brand-weak` / `--brand-tint` | `#10b981` / `#059669` / `#34d399` / `#07221b` | 같음 | 그대로 |
| `--container` | `960px` | | 지금 992px |
| `--measure` | `68ch` | | 글 본문 폭 |
| `--text-xs … --text-4xl` | 12 / 14 / 17 / 19 / 22 / 27 / 34 / 42px | | 본문 `--text-base` 17px, 행간 1.75 |
| `--leading-body` / `--leading-heading` | 1.75 / 1.25 | | |
| `--font-sans` / `--font-mono` | Pretendard Variable(dynamic subset), JetBrains Mono | | |
| `--radius-*` | 8 / 12 / 16 / 20 / 24 / 999px | | 그대로 |
| 모션 | `transition: color .15s, border-color .15s, background-color .15s` | | hover만 |

Tailwind 설정은 토큰 이름을 그대로 쓴다(`bg-bg-app`, `text-text-primary` …). `typography` 플러그인과 설정은 지운다. `container` 설정은 `--container`로 바꾼다.
