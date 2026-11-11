# 블로그 구조 전수조사 (1) 현재 상태

- 날짜: 2026-11-06
- 브랜치: `fix/perf-and-ui-polish` (커밋 `156f586`, PR #2 병합됨)
- 짝 문서: [2026-11-06-blog-architecture-audit-2-problems-and-plan.md](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md)
- 시각 문서: [visual-plans/2026-11-06-cruz-lab-audit-1-current-state.html](./visual-plans/2026-11-06-cruz-lab-audit-1-current-state.html)

이 문서는 평가를 하지 않는다. 지금 블로그가 어떻게 이루어져 있는지만 사실로 적는다.

## 0. 조사 방법

기존 문서(`docs/`, `README.md`, `PUBLISHING.md`)는 참고하지 않았다. 아래를 직접 확인했다.

| 조사 대상 | 방법 |
|---|---|
| 소스 코드 | `src/` 아래 148개 파일 15,455줄을 전부 읽음. `content/`, `data/`, `scripts/`, `tools/`, `functions/`, 설정 파일도 읽음 |
| 실제 데이터 | Firebase Admin SDK로 Firestore `posts`, `series`, `comments` 컬렉션을 읽기 전용으로 조회 |
| 운영 중인 사이트 | `https://www.cruzlab.dev` 응답 헤더, HTML 크기, JS 크기를 `curl`로 측정. 헤드리스 Chrome으로 화면 캡처 |
| 빌드 산출물 | `dist/`(2026-11-05 로컬 빌드)와 `.vercel/output` 설정 |
| 이력 | `git log` 306개 커밋 (2025-09-22 ~ 2026-11-05) |
| 이전 세션 | "홈페이지 성능 및 UI 개선" 세션의 결과 커밋 `156f586`과 `docs/2026-11-05-perf-and-ui-polish.md` |

관리자 화면(에디터, 대시보드)은 로그인이 필요해 실행 화면을 캡처하지 못했다. 코드를 읽어서 정리했다. 2025-12에 찍은 사용자 스크린샷(`src/assets/img/projects/cruz-lab/`)을 참고 자료로 썼다. **2026-11-06 추가**: 1단계 세션이 사용자가 로그인한 localhost에서 실행 화면을 점검했다. 결과와 캡처는 2편 5.4절에 있다.

## 1. 한눈에 보기

### 1.1 기술 스택 (설치된 버전)

| 영역 | 사용 기술 | 버전 |
|---|---|---|
| 프레임워크 | Astro (`output: 'server'`, Vercel 어댑터) | 5.13.8 / `@astrojs/vercel` 9 |
| UI 라이브러리 | React (`@astrojs/react` 아일랜드) | 19.1.1 / 4.3.1 |
| 스타일 | Tailwind CSS 3 + `@tailwindcss/typography`, CSS 변수 토큰 | 3.4.17 |
| 모션 | framer-motion | 12.23.25 |
| 에디터 | CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-markdown`) | 4.25.3 |
| 마크다운 렌더 | react-markdown + remark-gfm + rehype-highlight + rehype-raw | 10.x |
| 백엔드 | Firebase Auth, Firestore, Firebase Storage (클라이언트 SDK 12.6.0), firebase-admin 13.7 | |
| 배포 | Vercel. 서버 함수 `nodejs22.x`, 함수 리전 `iad1`, 엣지 `icn1` | |
| 폰트 | Pretendard Variable, JetBrains Mono (self-host, `public/fonts`) | |

### 1.2 데이터가 있는 곳 (5곳)

| 저장소 | 무엇이 있나 | 수량 (2026-11-06 조회) |
|---|---|---|
| Firestore `posts` | 글 본문과 메타데이터. 공개 페이지가 읽는 원본 | 56개 문서 (published·public 55, draft·비공개 1) |
| Firestore `series` | 시리즈 메타와 글 순서 | 2개 (크래프톤 정글 22편, WesBos 21편) |
| Firestore `comments` | 보안 규칙만 있음 | 0개 |
| Firebase Storage | 썸네일(`images/heroes/`), 본문 이미지(`images/blog/`), 시리즈 커버(`images/series-covers/`) | 56개 글 모두 heroImage 있음. 동영상 0 |
| GitHub `data/post-archive/` | 출간 시 만든 마크다운 백업 | 3개 파일 (2026-04 이후 출간분) |
| GitHub `content/posts/` | 예전 출간 경로의 마크다운 원본 | 57개 파일 (2026-05-05까지 갱신) |
| GitHub `public/uploads/` | 예전 이미지 업로드 경로 | 비어 있음 (2026-04-01 정리됨) |
| 브라우저 `localStorage` | 글 초안(`cruz-lab-editor-draft:*`), 테마, 시리즈 읽음 기록 | 기기마다 다름 |
| 브라우저 `sessionStorage` | 마지막 출간 결과(`cruz-lab:last-publish-feedback`) | |

### 1.3 Firestore `posts` 문서 모양

```
slug, title, description, content(마크다운 문자열), heroImage(URL), heroVideo(''),
tags[], status('published'|'draft'), isPublic(bool), readingTime(분),
pubDate, updatedDate, createdAt, updatedAt (Timestamp)
```

- 43개 문서에 `seriesId`, `seriesOrder` 필드가 남아 있다. 현재 코드는 이 두 필드를 읽지 않는다.
- 본문 길이: 합계 265,846자, 평균 4,747자, 최대 13,890자.
- 발행 연도: 2025년 54편, 2026년 2편.

### 1.4 코드 규모

| 항목 | 값 |
|---|---|
| `src/` 파일 | 148개 (`.astro` 26, `.tsx` 46, `.ts` 24, 이미지·PDF 등 나머지) |
| `src/` 코드 줄 수 | 15,455줄 |
| 가장 큰 파일 | `FullScreenEditor.tsx` 781, `SeriesEditor.tsx` 729, `PostList.tsx` 579, `CodeMirrorEditor.tsx` 577, `BlogPostList.tsx` 559 |
| `client:` 디렉티브 | `client:visible` 19, `client:load` 4, `client:idle` 2, `client:only` 3 |
| framer-motion을 import하는 파일 | 28개 |
| 어디서도 import하지 않는 파일 | 15개 (6절 참고) |
| 클라이언트 JS 총량 (`dist/client/_astro/*.js`) | 1,436 KB. 가장 큰 청크: `CodeMirrorEditor` 616 KB, `client`(react-dom) 178 KB, `AdminGuard`(Firebase Auth 포함) 163 KB, `proxy`(framer-motion) 113 KB, `firebase` 106 KB |
| `node_modules` | 566 MB |

## 2. 글 한 편의 플로우

### 2.1 관리자 진입

1. 주소창에 `/admin`을 직접 입력한다. 공개 화면에는 관리자 링크가 없다.
2. `AdminGuard`가 `useAdminAuth`로 Firebase Auth 상태를 확인한다.
3. 로그인 전이면 "Google로 로그인" 버튼 하나가 있는 화면을 보여 준다.
4. `signInWithPopup`으로 로그인한다. 이메일이 `PUBLIC_ADMIN_EMAIL`과 다르면 바로 `signOut`하고 "관리자 권한이 없습니다"를 띄운다.
5. 같으면 대시보드를 그린다.

### 2.2 새 글 작성 화면 (`/admin/posts/new`)

- 이 페이지는 `prerender = true`다. `BaseLayout`을 쓰지 않고 자체 `<html>`을 가진다. 사이트 헤더·푸터가 없다.
- `EditorPage`가 `client:only="react"`로 붙는다. `AdminGuard` 안에서 `FullScreenEditor`를 `lazy` 로드한다.
- `FullScreenEditor`가 들고 있는 상태: `title`, `content`, `tags`, `tagInput`, `slug`, `description`, `heroImage`, `isPublic`, `originalSlug`, `originalPubDate`, 자동저장 상태, 초안 키.
- 화면 구성(위에서 아래): 제목 input → 굵은 짧은 구분선 → 태그 입력(Enter로 추가, 한글 조합 중 무시) → `EditorMetaPanel`(출간 준비도 5칸, slug, 설명 150자, 공개/비공개, 썸네일 미리보기와 업로드) → `CodeMirrorEditor`(최소 높이 55vh) → 하단 바.
- 하단 바 버튼: 나가기, 자동저장 상태 문구, 마크다운 내보내기, 마크다운 불러오기, 초안 폐기, 임시저장, 출간하기.
- slug는 자동 생성되지 않는다. `deriveSlug` 함수가 있지만 "마크다운 내보내기" 파일명에만 쓴다. 사용자가 메타 패널에서 직접 입력한다. 입력값은 소문자·영숫자·한글·하이픈만 남긴다.

### 2.3 초안 저장

- 저장 위치는 브라우저 `localStorage`뿐이다. 서버에는 초안이 없다.
- 키: 새 글은 `cruz-lab-editor-draft:draft:<uuid>`, 기존 글 수정은 `cruz-lab-editor-draft:<slug>`. 예전 키 `cruz-lab-editor-draft:new`도 읽는다.
- 저장 시점: 내용이 바뀌고 1.5초 뒤(디바운스), `Cmd/Ctrl+S` 또는 "임시저장" 버튼, 탭을 닫거나 숨길 때(`pagehide`).
- 저장하지 않은 변경이 있으면 `beforeunload`로 브라우저 경고를 띄운다.
- 초안 값: `title, description, content, tags, slug, heroImage, isPublic, updatedDate, readingTime`.
- "초안 폐기"는 키를 지우고, 수정 모드면 서버 원본을 다시 불러온다.

### 2.4 썸네일 넣기

1. 메타 패널의 "썸네일 업로드" 버튼 → 파일 선택(이미지·동영상).
2. `uploadCmsAsset(file, { storagePath: 'images/heroes' })`가 실행된다.
3. 관리자 ID 토큰을 `forceRefresh`로 받는다(인증 확인 단계).
4. 이미지는 브라우저 Canvas로 최대 1920×1080에 맞춰 줄인다. JPEG 품질 0.85. PNG는 PNG로 유지한다. 동영상은 그대로 올린다. 최대 50 MB.
5. Firebase Storage 클라이언트 SDK `uploadBytesResumable`로 올린다. 경로: `images/heroes/YYYY/MM/<파일명>-<timestamp>-<난수>.<확장자>`. `Cache-Control: public,max-age=31536000,immutable`.
6. `getDownloadURL()`이 돌려주는 토큰 포함 URL(`https://firebasestorage.googleapis.com/v0/b/.../o/images%2Fheroes%2F...?alt=media&token=...`)을 `heroImage` 문자열로 저장한다.
7. 카드 미리보기가 바로 바뀐다. 원본 파일은 보관하지 않는다.

썸네일이 쓰이는 곳: 글 상세 페이지 상단 이미지, OG 이미지(`og:image`). 목록 카드는 2026-11-05부터 `PostCover`가 코드로 그린 커버를 쓰고 썸네일을 쓰지 않는다.

### 2.5 본문 이미지 넣기

- 에디터 영역에 파일을 드롭하거나 클립보드 이미지를 붙여 넣는다. `image/*`만 받는다. 드롭은 첫 번째 파일 1개만 처리한다.
- 같은 `uploadCmsAsset`을 `storagePath: 'images/blog'`로 호출한다. 리사이즈·업로드 규칙은 썸네일과 같다.
- 업로드가 끝나면 커서 위치에 `![파일명](URL)`을 넣는다. 업로드 중에는 화면 오른쪽 아래에 `UploadProgress` 카드가 뜬다.
- 공개 페이지는 `react-markdown`의 `img` 컴포넌트로 `<img loading="lazy">`를 그린다. URL이 `.webm/.mp4/.mov`로 끝나면 `<video autoplay loop muted>`로 그린다.
- 별도 경로가 하나 더 있다. `POST /api/admin/upload-asset`은 파일을 GitHub 저장소 `public/uploads/<scope>/YYYY/MM/`에 커밋하고, `GET /api/admin/asset-preview`는 그 파일을 `raw.githubusercontent.com`에서 프록시한다. 현재 클라이언트 코드에서 `upload-asset`을 호출하는 곳은 없다. `resolveAdminAssetPreviewUrl`은 `/uploads/`로 시작하는 옛 URL만 프록시 주소로 바꾼다.

### 2.6 출간

1. "출간하기" → `PublishModal`이 열린다.
2. 모달이 `GET /api/admin/publish-status`를 부른다. 서버는 (a) ID 토큰 검증 (b) Firebase 환경변수 유무 (c) GitHub API로 저장소 권한·`main` 브랜치·`data/post-archive` 경로 확인(요청 3회) (d) `https://www.cruzlab.dev/blog`를 `fetch`해 200인지 확인 — 6개 항목을 돌려준다.
3. 6개가 모두 ready여야 "출간하기" 버튼이 활성화된다. 하나라도 실패하면 "출간 준비 확인 필요"로 막힌다.
4. 모달 왼쪽은 카드 미리보기(썸네일, 제목, 설명). 본문 렌더 미리보기는 없다. 오른쪽은 최종 확인 5항목, 시스템 상태, 출간 정보, "Markdown 내려받기".
5. 출간 → `POST /api/admin/publish-post`. 서버 순서:
   1. ID 토큰 검증 (`identitytoolkit accounts:lookup` REST 호출, 이메일 비교)
   2. Firestore에서 `originalSlug || slug`로 기존 글 조회 → `pubDate` 결정(기존 값 유지, 없으면 지금)
   3. 마크다운 직렬화(`generateMarkdownContent`) → GitHub Contents API로 `data/post-archive/YYYY-MM-DD-<slug>.md`를 PUT (기존 파일이면 sha를 먼저 GET)
   4. Firestore `posts` upsert: `slug`로 1건 검색, 있으면 `update`, 없으면 `add`. `status`는 `isPublic ? 'published' : 'draft'`
   5. Firestore 실패 시 방금 만든 GitHub 파일을 DELETE(보상)
   6. slug가 바뀌었으면 이전 slug의 백업 파일 DELETE
   7. 메모리 캐시 `posts:` 접두사 무효화
   8. 응답: `publicUrl, filePath, githubFileUrl, githubCommitUrl, githubCommitSha`
6. 클라이언트는 응답을 `sessionStorage`에 저장하고 로컬 초안 키를 지운 뒤 `/admin/posts`로 이동한다.
7. 포스트 관리 상단에 초록 배너가 뜬다. 버튼: 공개 페이지 보기, GitHub 파일 보기, 최신 커밋 보기, 반영 다시 확인(`POST /api/admin/publish-verify`: GitHub 파일 존재 + 공개 URL 200 확인).

출간 1회에 서버가 외부로 보내는 요청: 토큰 검증 1, Firestore 읽기 1·쓰기 1, GitHub GET 1·PUT 1 (slug 변경 시 GET·DELETE 추가). 모달을 열 때 추가로 토큰 검증 1, GitHub 3, 사이트 fetch 1.

### 2.7 수정

1. 포스트 관리 목록에서 제목 클릭 → `/admin/edit?slug=<slug>` (`prerender = true`, 독립 HTML).
2. `FullScreenEditor`가 `GET /api/posts/by-slug?slug=` 를 부른다. 이 API는 인증이 없고 `status`를 가리지 않는다.
3. 응답으로 상태를 채운 뒤, `localStorage`에 같은 slug의 초안이 있으면 초안 값으로 덮어쓴다. 어느 쪽이 최신인지 비교하지 않는다.
4. 출간하면 `originalSlug`로 기존 문서를 찾아 `update`한다. `pubDate`는 유지, `updatedDate`는 지금으로 바뀐다.

### 2.8 삭제

1. 포스트 관리 목록의 휴지통 → 확인 모달("GitHub 저장소의 markdown 파일을 삭제합니다").
2. `POST /api/admin/delete-post` → Firestore 문서 삭제 → GitHub `data/post-archive` 파일 삭제(실패해도 무시).
3. Storage의 썸네일·본문 이미지는 지우지 않는다. `content/posts`의 파일도 건드리지 않는다.
4. 로컬 초안 삭제는 `localStorage` 키만 지운다.

### 2.9 글 분류

- 분류 수단은 `tags` 배열 하나다. 자유 입력이고 대소문자를 구분한다. 현재 25종. 많이 쓴 태그: `javascript` 23, `크래프톤 정글` 22, `wesbos30` 21, `운영체제` 8. `크래프톤 정글`과 `크래프톤정글`이 따로 있다.
- 제목 앞 `[카테고리]` 접두사 관례가 있다. 57개 파일 중 55개가 `[Pintos]`, `[AI]`, `[자료구조]` 같은 접두사로 시작한다. 코드에서 이 접두사를 쓰는 곳은 `PostCover`의 큰 글자 라벨뿐이다.
- 카테고리 필드는 없다. 태그 페이지 `/blog/tag/[tag]`가 있다. 블로그 목록의 태그 필터는 단일 선택이다.

### 2.10 시리즈

- Firestore `series` 문서: `name, slug, description, coverImage, postIds[], postCount, order, isPublic, createdAt, updatedAt`.
- `postIds`는 글의 **문서 ID 또는 slug**다. 현재 2개 시리즈의 데이터는 문서 ID(예: `KiiHBex6dRJE3C8yyduf`)를 들고 있고, `SeriesEditor`가 새로 저장하면 slug를 넣는다. 조회 코드는 둘 다 매칭한다.
- 글 쪽에는 시리즈 정보가 없다(위 `seriesId` 잔존 필드는 읽지 않음). 시리즈 → 글 방향으로만 연결된다.
- 공개 화면: `/series`(카드 그리드, 총 읽기 시간), `/series/[slug]`(커버, 설명, 번호 매긴 목차, "시리즈 시작하기" 버튼). 홈의 Featured Series.
- 글 상세 페이지에는 시리즈 표시가 없다. `SeriesWidget`, `PostNavigation` 컴포넌트는 있으나 어느 페이지도 쓰지 않는다.
- 읽음 표시: `/series/[slug]`와 `SeriesCard`가 `localStorage['series-<slug>-read']`를 읽는다. 이 키에 값을 **쓰는 코드는 없다**. 진행률은 항상 0%다.
- 관리자: `/admin/series`(목록, 삭제), `/admin/series/new`, `/admin/series/edit?id=`. `SeriesEditor`는 `GET /api/admin/content-posts`(published만)로 글 목록을 받아 모달에서 다중 선택하고, framer-motion `Reorder`로 드래그 정렬한다. 저장은 `POST /api/admin/series`.
- `getAdminSeriesById`는 Admin SDK 스냅샷에 `seriesSnap.exists()`를 호출한다. Admin SDK의 `exists`는 함수가 아니라 불리언 속성이다. 이 코드 경로(`/api/admin/series?id=`, 시리즈 수정 화면)는 TypeError를 낸다. 실행으로는 확인하지 않았다.

### 2.11 `content/posts`와 `data/post-archive`

- `content/posts/` 57개는 2026-05-05까지 "✨ 새 포스트 발행 / 📝 포스트 수정 / 🗑️ 포스트 삭제" 커밋으로 갱신됐다. 커밋 작성자 메일이 GitHub noreply 주소다. 즉 GitHub API로 자동 커밋된 흔적이다. 같은 날 `data/post-archive/`에도 "포스트 백업 갱신" 커밋이 따로 있다. 한 번 출간에 커밋이 2개씩 생겼다.
- `functions/src/index.ts`는 비어 있다("Firestore → GitHub 미러 함수는 폐기"라는 주석만 있음). `functions/lib`에 빌드 산출물이 남아 있다.
  - **2026-11-06 정정**: 소스는 비어 있었지만 운영에는 옛 함수 `syncPostToGitHub`가 배포돼 있었다. 위 `content/posts` 자동 커밋의 출처가 이 함수다. 1단계에서 사용자 승인 뒤 삭제했다. 근거: [2026-11-06-stage1-immediate-repairs.md](./2026-11-06-stage1-immediate-repairs.md) 2.9절.
- `src/content.config.ts`는 `blog` 컬렉션을 `content/posts`에서 읽도록 정의한다. 코드 어디에도 `getCollection('blog')` 호출이 없다. 빌드할 때 57개 파일을 파싱만 한다.
- 대시보드의 "기존 markdown 글 이관" 버튼은 `POST /api/admin/import-content-posts`를 부른다. 서버는 `process.cwd()/content/posts`를 파일 시스템에서 읽어 Firestore에 upsert한다.
- 최신 2개 글(`ai-agent-context`, `rag-is-a-flow`)은 `content/posts`와 `data/post-archive` 양쪽에 있다. 두 파일은 frontmatter 표기(`tags` 한 줄 배열 vs 줄 단위 배열)와 끝 줄바꿈만 다르다.

### 2.12 마크다운 직렬화

- `src/lib/markdown-publish.ts`에 자체 frontmatter 파서와 직렬화기가 있다. YAML 라이브러리는 쓰지 않는다. 문자열 따옴표, 불리언, 숫자, `[a, b]` 배열, `- item` 배열, `|`·`>` 블록을 처리한다.
- `scripts/evaluate-markdown-pipeline.mjs`가 같은 로직을 복사해 두고 `fixtures/editor-roundtrip-stress.md`로 왕복 보존을 검사한다.
- 에디터의 "마크다운 불러오기"는 파일을 파싱해 상태를 덮어쓴다. "마크다운 내보내기"는 현재 상태를 파일로 내려받는다.

## 3. 관리자 페이지

### 3.1 라우트와 마운트 방식

| 경로 | 렌더 | 레이아웃 | React 마운트 방식 |
|---|---|---|---|
| `/admin` | SSR (`prerender = false`, 서버에서 글 목록 조회) | `BaseLayout` (사이트 헤더·푸터 있음) | `<AdminDashboard client:load>` |
| `/admin/posts` | SSR | `BaseLayout` | `<PostList client:only="react">` |
| `/admin/posts/new`, `/admin/edit` | 정적 (`prerender = true`) | 없음 (자체 `<html>`) | `<EditorPage client:only="react">` |
| `/admin/series`, `/admin/series/new`, `/admin/series/edit` | 정적 | `BaseLayout` | 인라인 `<script>`에서 `createRoot(...).render(...)` 직접 호출 |

세 가지 다른 마운트 방식이 공존한다. `/admin`과 `/admin/posts`는 서버가 `getPublishedContentPosts()`를 호출해 초기 데이터를 props로 넣는다. 서버 쪽에는 인증 검사가 없다. 인증은 모두 클라이언트 `AdminGuard`가 한다.

### 3.2 인증

- 클라이언트: Firebase Auth Google 팝업. 이메일을 `PUBLIC_ADMIN_EMAIL`과 비교.
- 서버 API: `Authorization: Bearer <idToken>` 헤더 → `verifyAdminIdToken`이 `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<API_KEY>`에 POST해서 이메일을 받아 비교한다. firebase-admin의 `verifyIdToken`은 쓰지 않는다. 관리자 API 호출마다 외부 HTTP 1회가 든다.
- Firestore 규칙(`firestore.rules`): `series` 읽기 모두, 쓰기 `request.auth != null`. `posts` 단건 읽기는 `isPublic && status=='published'`, **목록 읽기 `allow list: if true`**, 쓰기 `request.auth != null`. Storage 규칙: 읽기 모두, 쓰기 `request.auth != null`. 관리자 이메일 제한은 규칙에 없다.
- 서버 API는 Admin SDK로 쓰므로 위 규칙을 거치지 않는다.

### 3.3 대시보드 (`/admin`)

- 통계 3칸: 전체 포스트(= 발행 수 + 이 브라우저의 로컬 초안 수), 발행됨, 로컬 초안.
- 버튼: 새 포스트 작성, 포스트 관리, 기존 markdown 글 이관.
- "출간 시스템 상태" 카드: 페이지를 열 때마다 `publish-status`를 호출한다(GitHub API 3회 + 공개 사이트 fetch 1회 포함). 6개 체크와 출간 대상(저장소, 브랜치, 백업 경로, 공개 사이트)을 보여 준다.
- 최근 발행 포스트 5개(제목 클릭 → 수정 화면).

### 3.4 포스트 관리 (`/admin/posts`)

- 서버가 넣어 준 발행 글 + 이 브라우저의 로컬 초안을 합쳐 `updatedDate` 내림차순으로 보여 준다. 창에 포커스가 돌아오거나 `storage` 이벤트가 오면 초안을 다시 읽는다.
- 검색(제목·설명·태그), 필터(전체/발행됨/초안).
- 행마다: 상태 점, 제목(수정 링크), "발행됨/로컬 초안" 배지, "로컬 초안 있음" 배지, 설명 1줄, 태그 3개, 날짜, 읽기 시간, 보기(새 탭), 삭제.
- 비공개로 출간한 글(`status: 'draft'`)은 서버 목록에 들어오지 않는다. `getPublishedContentPosts()`가 published만 돌려주기 때문이다. 현재 Firestore에 그런 글이 1건 있다. 관리자 UI에서 이 글로 가는 링크는 없다.

### 3.5 시리즈 관리

2.10절 참고. 목록은 `GET /api/admin/series`로 전체(비공개 포함)를 받는다.

### 3.6 운영 보조 도구

| 도구 | 하는 일 |
|---|---|
| `scripts/publish-preflight.mjs` | `.env` 키, `astro.config` site, `content/posts` 존재, GitHub 권한, 공개 사이트 응답을 CLI에서 확인. 대상 경로가 `content/posts`로 적혀 있어 현재 백업 경로(`data/post-archive`)와 다르다 |
| `scripts/publish-verify.mjs` | slug로 GitHub 파일과 공개 페이지 응답 확인 |
| `scripts/evaluate-markdown-pipeline.mjs` | frontmatter 왕복 검사 |
| `scripts/generate-pwa-icons.js` | PWA 아이콘 생성 (PWA는 2026-10-14에 제거됨) |
| `tools/cruz-lab-knowledge-mcp/` | 프로젝트 문서·이력서를 읽는 로컬 MCP 서버 |
| `PUBLISHING.md`, `PUBLISH-SMOKE-TEST.md` | 2026-03 기준 출간 절차 문서 (루트) |
| `docs/` 27개 문서 | 2024-12 ~ 2026-11. `.gitignore`가 `docs/*`를 제외하고 2개만 추적 |

## 4. 공개 페이지 (탭별)

### 4.1 공통 레이아웃

- `BaseLayout`: `<BaseHead>`(메타, OG, 테마 스크립트, 폰트 preload) + `<ViewTransitions />` + 건너뛰기 링크 + `Header` + `<main class="container">` + `Footer`.
- `Header`: 왼쪽 "Cruz" 로고(`<h2><a><a>` 중첩 — `<a>` 안에 `<a>`), 오른쪽 GitHub 아이콘(sm 이상)과 `ThemeToggle`(React, `client:load`). 메뉴(Home 아이콘, Blog, Series, Projects)는 화면 상단 중앙에 `position: fixed`로 뜨는 알약 모양 바다. `transition:persist`.
- 컨테이너 폭 992px, 좌우 여백 16px. 테마: `html.dark` 기본, `html.light`로 전환. CSS 변수 토큰(배경 3단, 글자 2단, 브랜드 에메랄드 `#10b981`).
- `Footer`: "© 2026 Cruz. All rights reserved." 한 줄.
- `src/components/` 바로 아래의 `BaseHead.astro`, `Header.astro`, `Footer.astro`, `HeaderLink.astro`, `Hero.astro`, `FormattedDate.astro`는 Astro 블로그 템플릿 원본이다. `BaseLayout`은 `src/layouts/components/`의 파일을 쓴다.

### 4.2 페이지 표

| 경로 | 렌더 | 데이터 | CDN 캐시 | React 아일랜드 |
|---|---|---|---|---|
| `/` | SSR | Firestore posts + series | `s-maxage=60, swr=86400` | 21개 (아래 참고) |
| `/blog/` | SSR | Firestore posts (본문 제외) + 태그 목록 | 60초 | `BlogPostList client:load` 1개 + `TextReveal` |
| `/blog/[slug]` | SSR | Firestore posts 1건 | 60초 (404는 캐시 안 함) | 0개. `MarkdownPostView`는 React 컴포넌트지만 디렉티브 없이 서버에서만 렌더 |
| `/blog/tag/[tag]` | SSR | posts 전체를 받아 필터 | 60초 | `BlogCard client:visible` ×N |
| `/series/` | SSR | series + posts | 60초 | `SeriesCard client:visible` ×N |
| `/series/[slug]` | SSR | series 1건 + posts | 60초 | 0개. 인라인 스크립트로 읽음 체크 |
| `/projects/` | 정적 | `src/content/projects` 컬렉션 (프로젝트 4, 글 8) | Vercel 정적 | `ProjectCard client:visible` ×N |
| `/projects/[project]` | 정적 | 첫 글로 리다이렉트 | | |
| `/projects/[project]/[slug]` | 정적 | MDX `render()` | | 0개 |
| `/404` | 정적 | | | 0개 |
| `/rss.xml` | SSR | posts | `max-age=0` | |
| `/sitemap-index.xml` | 정적 | `@astrojs/sitemap` + `customSitemaps` | | |
| `/sitemap-posts.xml` | SSR | posts + series | `s-maxage=3600` | |
| `/robots.txt` | 정적 | `/admin/`, `/api/` 차단 | | |
| `/api/series-preview` | SSR | series | 60초 | |
| `/api/posts/by-slug` | SSR | posts 1건 (상태 무관, 인증 없음) | 없음 | |

운영 중인 사이트에서 측정한 값(2026-11-06 01:08 KST):

| 요청 | 응답 | 크기 | `x-vercel-cache` |
|---|---|---|---|
| `/` | 200 | 97.8 KB | MISS → 다음 요청 HIT (age 55) |
| `/blog/` | 200 | 353 KB | 같음 |
| `/blog/ai-agent-context` | 200 | 29.6 KB | |
| `/series/` | 200 | 23.4 KB | |
| `/projects/` | 200 | 35.1 KB | HIT (정적) |

60초 CDN 캐시는 동작한다. 함수 리전은 `iad1`(미국 동부), 엣지는 `icn1`(서울).

### 4.3 홈 (`/`)

위에서 아래 순서: `InteractiveHero`(client:load) → `Reveal` 안에 Experience 아코디언(`ExpCard` ×2, client:visible) → Featured Projects(`ProjectCard` ×3) → `SkillsSection`(로고 그리드 11개) → `SeriesPreview`(서버 데이터 전달, `SeriesCard` ×2) → Latest Posts(`BlogCard` ×3) → `ContactSection`(GitHub, LinkedIn, Resume PDF, Email 복사). 그 밖에 `CursorFollower`(client:idle, 포인터가 있는 기기에서 커스텀 커서+트레일), `ScrollProgress`(client:idle, 상단 진행 바).

히어로: "Hi There 👋, I'm Cruz" + `TypeWriter`로 역할 5개 순환("Software Engineer", "Performance Obsessed", …) + 따옴표 태그라인 + 소개 3문단 + 버튼 2개(마그네틱+리플) + 3D 틸트 프로필 일러스트. 진입 애니메이션은 CSS(`hero-rise` 등).

HTML 97.8 KB 중 아일랜드 props는 8.8 KB다. `astro-island` 21개는 `ThemeToggle` 1, `CursorFollower` 1, `ScrollProgress` 1, `InteractiveHero` 1, `ExpCard` 2, `TextReveal` 6, `MagneticButton` 3, `ProjectCard` 3, `SkillsSection` 1, `SeriesPreview` 1, `BlogCard` 3, `ContactSection` 1 중 디렉티브가 붙은 것들이다.

### 4.4 블로그 목록 (`/blog/`)

- 서버가 55개 글(본문 제외)을 `BlogPostList`에 props로 넘긴다(props 47.8 KB). HTML 전체는 353 KB다. 카드 55개의 서버 렌더 마크업(코드로 그린 커버 포함)이 대부분이다.
- `BlogPostList`(client:load, framer-motion): 검색(300ms 디바운스), 그리드/리스트 토글, 정렬 4종, 태그 필터 패널(기본 열림, 단일 선택, 태그별 개수, 마그네틱 버튼), 결과 수 카운터, `AnimatePresence` 레이아웃 애니메이션. 페이지네이션은 없다. 55개를 한 번에 그린다.
- `BlogCard`: `motion.div`(initial opacity 0 → `whileInView`) → `TiltCard`(3D) → `GlowCard`(마우스 추적 글로우) → 링크. 커버는 `PostCover`(카테고리 라벨, 메시 그라디언트, 노이즈, 격자). 태그 3개, 제목 2줄, 설명 2줄, 날짜, 읽기 시간. `seriesId` prop은 받지만 목록 데이터에 없어서 항상 비어 있다.

### 4.5 글 상세 (`/blog/[slug]`)

- 서버가 `MarkdownPostView`를 정적으로 렌더한다. 클라이언트 JS는 레이아웃의 `ThemeToggle`과 View Transitions뿐이다.
- 구성: "블로그로 돌아가기" → 태그 → 제목 → 날짜·읽기 시간 → 썸네일(있으면, `view-transition-name`) → 본문(`prose prose-lg`, 최대 폭 `max-w-4xl` = 896px).
- 본문 렌더: `react-markdown` + `remark-gfm` + `rehype-highlight`(코드 색) + `rehype-raw`(HTML 허용). 코드 테마 CSS는 `cdnjs.cloudflare.com`의 highlight.js `github-dark`를 `<link>`로 불러온다.
- 이 페이지에만 있는 `<style is:global>`이 `.prose` 색·여백을 다시 정의한다. 본문 단락(`p`, `li`) 색은 `--text-secondary`(회색)다. `tailwind.config`의 typography 설정과 별개다.
- 없는 것: 목차, 제목 앵커(`rehype-slug` 없음), 이전·다음 글, 관련 글, 시리즈 표시, 댓글, 공유 버튼, 코드 복사 버튼, 이미지 캡션, 수정일 표시.

### 4.6 시리즈 (`/series/`, `/series/[slug]`)

- 목록: 제목 "Series"(글자별 `TextReveal`), 카드(커버 사진, 제목, 설명, 글 수, 총 읽기 시간, 상대 시간). 카드는 3D 틸트.
- 상세: 커버 이미지, "📚 제목", 설명, 글 수·읽기 시간, 번호 매긴 글 목록(제목, 설명, 읽기 시간, 날짜), "시리즈 시작하기" 버튼.

### 4.7 프로젝트 (`/projects/`, `/projects/[project]/[slug]`)

- `src/content/projects/<project>/project.md`(메타: 제목, 설명, 이미지, 태그, 기술, GitHub, featured, order)와 `<project>/<slug>.md`(글: `entryType: post`, `project`, `order`, `chapterLabel`, `status`).
- 목록: Featured 4개(현재 전부 featured), 카드(이미지, 태그, 제목, 설명, 기술 5개, GitHub·Demo 링크). 카드 전체 클릭은 `window.location.href`로 이동.
- 글: 브레드크럼, 챕터 배지, 제목, 설명, 파트 탭(글이 2개 이상일 때), `prose` 본문(Astro `render()`), 이전·다음 기록 카드.
- 이 콘텐츠는 저장소 파일이고 관리자 화면에서 편집할 수 없다. 블로그 글과 데이터 경로가 완전히 다르다.

## 5. 마크다운 편집기

### 5.1 구성

- `@uiw/react-codemirror`의 `<CodeMirror>`에 `value={defaultValue}`를 주고, `onUpdate`에서 `docChanged`일 때 `onChange(doc.toString())`을 호출한다. `key={editorKey}`로 초안 로드·불러오기 때 에디터를 새로 만든다.
- `basicSetup`: 줄 번호 끔, 접기 끔, 자동완성 끔, 검색 키맵 켬.
- 확장: `drawSelection`, `highlightActiveLine`, `highlightSpecialChars`, `indentOnInput`, `bracketMatching`, 들여쓰기 2칸, `markdown({ addKeymap: true })`, 커스텀 `HighlightStyle`(heading, link, quote, strong, emphasis, monospace, list, literal, meta 9개 태그), 줄 바꿈, placeholder, 커스텀 keymap, 드롭·붙여넣기 핸들러.
- 표시 방식: **소스 모드**다. `#`, `**`, `[]()` 기호가 그대로 보이고 색만 다르다. 미리보기 창, 분할 보기, 라이브 프리뷰, WYSIWYG은 없다. 2025-12 스크린샷의 WYSIWYG 화면(렌더된 H1·인용구·코드 블록)은 현재 코드에 없다. `docs/obsidian-live-preview-migration-plan.md`, `docs/editor-engine-evaluation.md` 같은 문서가 있지만 현재 코드는 이 문서들과 다르다.
- 글꼴: Pretendard, 1.02rem, 줄 높이 1.95, 본문 폭 992px. 테마는 `localStorage.theme`와 `<html class>`를 감시해 다크/라이트를 바꾼다. 에디터 페이지 자체는 `bg-white`라 바깥은 항상 흰색이다.

### 5.2 단축키 (12개, `createKeymap`)

| 키 | 동작 |
|---|---|
| `Mod+Shift+P` | 빠른 삽입 패널 |
| `/` (빈 줄에서) | 빠른 삽입 패널 |
| `Mod+B`, `Mod+I` | `**`, `*` 감싸기 |
| `Mod+K` | `[텍스트](https://)` 삽입, URL 선택 |
| `Mod+Alt+1/2/3` | 제목 토글 |
| `Mod+Alt+C` | ```` ```ts ```` 코드 블록 |
| `Mod+Alt+Q` | `> ` 접두 |
| `Mod+Alt+L` | `- [ ] ` 접두 |
| `Mod+S` | 임시저장 |
| `Mod+Shift+/` | 단축키 도움말 (document 레벨 리스너) |

그 밖에 `@codemirror/lang-markdown`의 기본 키맵(Enter로 목록 이어가기, Shift+Enter 등)이 붙는다. 단축키를 바꾸거나 추가하는 UI·설정은 없다. 키맵은 컴포넌트 안에 하드코딩된 closure다.

### 5.3 빠른 삽입 (슬래시 명령)

- 항목 9개 고정: 제목 1·2·3, 체크리스트, 글머리 목록, 인용구, 코드 블록, 표, 구분선.
- 2열 버튼 그리드 모달이다. 검색 입력, 방향키 이동, Enter 선택이 없다. 마우스 클릭으로만 고른다.
- 열기: 빈 줄에서 `/`, `Mod+Shift+P`, 에디터 오른쪽 위 `+` 버튼.
- 사용자 정의 항목, 플러그인 등록 지점은 없다.

### 5.4 그 밖의 동작

- 이미지: 2.5절.
- 읽기 시간: `FullScreenEditor` 안의 `calculateReadingTime`은 공백으로 나눈 단어 수 ÷ 200이다. `src/utils/readingTime.ts`에는 한글 글자 수 ÷ 2를 더하는 다른 공식이 있고 `import-content-posts`만 이것을 쓴다. 두 공식이 공존한다.
- 상태 흐름: 키 입력마다 `onChange → setContent` → `FullScreenEditor` 전체 리렌더 → `buildDraftData` 재계산 → `EditorMetaPanel`(읽기 시간, 준비도, 카드 미리보기) 리렌더 → 1.5초 뒤 `localStorage` 저장.
- 모바일 전용 처리는 CSS 미디어쿼리(768px 이하 패딩 축소, 그리드 1열)뿐이다.
- 한글 입력: 태그 입력에는 `compositionstart/end` 처리가 있다. 에디터 본문은 CodeMirror 기본 IME 처리를 쓴다.

## 6. Astro와 React의 역할 분담

### 6.1 지금의 분담

| 층 | Astro | React |
|---|---|---|
| 라우팅, 페이지, 레이아웃 | 전부 | 없음 |
| 서버 데이터 조회 (Firestore, 컬렉션) | 전부 (`.astro` frontmatter, API 라우트) | 없음 |
| 공개 페이지 정적 부분 | 레이아웃, 헤더, 푸터, 시리즈 상세, 프로젝트 글, `Reveal`, 글 상세 본문(React 컴포넌트를 서버에서만 렌더) | |
| 공개 페이지 인터랙션 | 테마 스크립트, 읽음 체크 스크립트 | 테마 토글, 히어로, 카드(틸트·글로우), 블로그 목록 전체, 스킬·연락처 섹션, 커서, 진행 바 |
| 관리자 | 페이지 껍데기만 | 대시보드, 목록, 에디터, 시리즈 편집 전부 |

### 6.2 React 컴포넌트 26개 중 쓰이는 것 / 안 쓰이는 것

`islands/` 26개 중 사용 중(17): `ThemeToggle, InteractiveHero, TypeWriter, MagneticButton, RippleButton, CursorFollower, ScrollProgress, ExpCard, ProjectCard, SkillsSection, SkillCard, SeriesPreview, SeriesCard, BlogCard, ContactSection, TextReveal, TiltCard, GlowCard`. `CountUp`은 미사용 컴포넌트 `StatsSection`만 쓴다.

어디서도 import하지 않음(15 파일): `islands/FadeInSection, MiniSeriesCard, PostNavigation, PostSearch, RelatedPosts, SeriesWidget, StatsSection, TableOfContents`, `common/OptimizedImage`, `components/ExperienceCard.astro, FormattedDate.astro, Hero.astro`, `hooks/useAutoSave.ts`, `utils/relatedPosts.ts`, `content.config.ts`의 `blog` 컬렉션(정의만 됨). `components/BaseHead.astro, Header.astro, Footer.astro, HeaderLink.astro`는 서로만 참조하고 페이지에서는 쓰지 않는다.

### 6.3 서버 코드의 Firebase SDK 사용

| 파일 | SDK | 쓰는 곳 |
|---|---|---|
| `lib/server/firestore-posts.ts` | firebase-admin | 글 조회·저장·삭제 (공개 페이지, API) |
| `lib/server/admin-series.ts` | firebase-admin | 관리자 시리즈 API |
| `lib/series.ts` | **클라이언트 SDK** (`lib/firebase.ts`, 서버에서 import) | 공개 시리즈 조회 (`/series`, 홈, 사이트맵) |
| `lib/firebase.ts` | 클라이언트 SDK, 모듈 로드 시 `initializeFirebase()` 실행 | 서버와 브라우저 양쪽 |
| `lib/firebase-app-client.ts`, `firebase-auth-client.ts` | 클라이언트 SDK | 브라우저 인증 |

서버에서 시리즈를 읽을 때는 클라이언트 SDK를 쓰므로 Firestore 보안 규칙(`isPublic == true` 쿼리)이 적용된다. 글을 읽을 때는 Admin SDK라 규칙을 거치지 않는다.

### 6.4 메모리 캐시

`lib/server/memo-cache.ts`: 키별 Promise를 60초 보관한다. 글 저장·삭제 시 `posts:`, 시리즈 저장·삭제 시 `series:` 접두사를 비운다. 서버리스 함수 인스턴스마다 따로 산다.

## 7. 이전 세션(2026-11-05)이 바꾼 것

커밋 `156f586` 한 개, 27개 파일. `docs/2026-11-05-perf-and-ui-polish.md`에 측정값이 있다. 바뀐 내용:

1. 공개 SSR 페이지와 `/api/series-preview`에 CDN 캐시 헤더(60초 + SWR 1일).
2. 서버 메모리 캐시(`memo-cache.ts`) 도입. 글 slug 조회 중복 제거.
3. 시리즈 읽기 시간 계산을 N+1 조회에서 2회 조회로. 홈 시리즈를 서버 렌더로.
4. 히어로·배경·타이핑·커서 애니메이션을 GPU 합성 속성으로. `FadeInSection`(React) → `Reveal.astro`(CSS + IntersectionObserver, `content-visibility: auto`).
5. 프로필 틸트와 `TiltCard`의 `perspective` 위치 수정.
6. 블로그 카드 썸네일을 `PostCover`(코드 생성)로 교체.

운영 사이트에서 1번(CDN HIT)은 확인했다. `Reveal`은 IntersectionObserver가 동작해야 내용이 보인다. 백그라운드 탭에서 4초 동안 6개 중 0개가 드러난 것을 확인했다(사용자가 보고 있는 탭에서는 정상).

## 8. 이력에서 보이는 사실

- 첫 커밋 2025-09-22, 306개 커밋.
- 2025-12: Astro 블로그 템플릿에서 시작해 Firestore CMS, 시리즈, WYSIWYG 에디터 구축 (docs 2025-12-02, 2024-12-13 등).
- 2026-03: CodeMirror 에디터로 교체, `content/posts` + GitHub API 출간 경로 (`PUBLISHING.md` 2026-03-26).
- 2026-04: "Firestore direct publish" + `data/post-archive` 백업으로 전환. `public/uploads` 정리. 글 3편 출간(2026-04-08, 04-22 ×2), 1편 삭제(05-04).
- 2026-10-13/14: 사이트 기본 항목 수리, PWA 제거, career 폴더 분리, README 재작성.
- 2026-11-05: 성능·UI 수정.
- 2026-05-05 이후 새 글 출간 없음(6개월).
