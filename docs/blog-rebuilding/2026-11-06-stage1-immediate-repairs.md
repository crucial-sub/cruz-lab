# 재건 1단계: 즉시 수리

- 날짜: 2026-11-06
- 브랜치: `fix/rebuild-stage1-repairs` (`origin/main` `bb97e81`에서 만듦)
- 계획: [2026-11-06-blog-architecture-audit-2-problems-and-plan.md](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md) 11.1절 1~9번
- 규모: 112개 파일, 추가 87줄, 삭제 16,647줄. 삭제의 대부분은 `content/posts` 11,448줄, `functions/` 2,936줄, `src`·`scripts` 2,226줄이다.

## 1. 현재 상황

1단계 작업 1~9번을 마쳤다. Firestore·Storage 규칙은 사용자 승인 뒤 운영에 배포했다. 린트와 빌드가 통과한다. 개발 서버에서 기준 경로가 모두 정상으로 응답한다.

계획 밖 작업이 두 가지 있다. 둘 다 사용자 승인 뒤 했다.

1. `scripts/publish-verify.mjs`의 같은 옛 경로를 고쳤다(2.8).
2. 운영에 남아 있던 Firebase 함수 `syncPostToGitHub`를 삭제했다(2.9).

## 2. 한 일

### 2.1 Firestore 규칙 (A1)

- `posts`, `series`, `comments`의 클라이언트 쓰기를 전부 막았다. 모든 쓰기는 Admin SDK가 하고, Admin SDK는 규칙을 적용받지 않는다.
- `posts` 읽기는 `isPublic == true && status == 'published'` 문서만 허용한다. 조건 없는 `list: if true`를 지웠다.
- `series` 읽기는 `isPublic == true` 문서만 허용한다. `src/lib/series.ts`의 세 읽기(공개 목록 쿼리, slug 쿼리, 공개 시리즈의 `getDoc`)가 모두 이 조건을 만족한다.
- `comments`는 읽기·쓰기를 모두 막았다.

### 2.2 Storage 규칙 (A1)

- 읽기는 공개로 둔다.
- `create`·`update`는 다음을 모두 만족할 때만 허용한다.
  - `request.auth.token.email == 'jssub940@gmail.com'` (`PUBLIC_ADMIN_EMAIL`과 같은 값)
  - `request.auth.token.email_verified == true`
  - `contentType`이 `image/*` 또는 `video/*`
  - 크기 50 MB 이하
- `delete`는 막았다. 클라이언트 SDK가 Storage 파일을 지우는 코드는 없다.
- 이메일을 규칙 파일에 적은 이유: Storage 규칙은 환경 변수를 읽지 못한다. 이 이메일은 이미 공개 저장소(`ContactSection.tsx`)와 클라이언트 번들(`AdminGuard`)에 있다. 새로 드러나는 정보가 아니다.

### 2.3 규칙 배포

1. `firebase deploy --only firestore:rules,storage --dry-run`으로 두 규칙을 컴파일했다. 둘 다 통과했다.
2. 사용자 승인 뒤 `firebase deploy --only firestore:rules,storage`를 실행했다. 두 규칙 모두 `released`로 끝났다.

### 2.4 `/api/posts/by-slug` 인증 (A2)

- API: `Authorization: Bearer <ID 토큰>`을 `verifyAdminIdToken`으로 확인한다. 실패하면 401을 돌려준다. 응답에 `Cache-Control: no-store`를 붙였다. 비공개 글 본문이 CDN에 남지 않게 하려는 것이다.
- 클라이언트: `FullScreenEditor.tsx`의 `loadMarkdownPost`가 `getClientAdminIdToken()`으로 토큰을 받아 헤더에 넣는다. 401이면 "관리자 인증에 실패했습니다."를 보여 준다.

### 2.5 `exists()` 버그 (A4)

- `src/lib/server/admin-series.ts`: `seriesSnap.exists()` → `seriesSnap.exists`. Admin SDK에서 `exists`는 속성이다. 시리즈는 2단계에서 들어내므로 이 줄만 고쳤다.

### 2.6 중첩 `<a>` (A12)

- `src/layouts/components/Header.astro`의 로고를 `<a href="/" class="font-bold">Cruz</a>` 하나로 줄였다.
- 안쪽 링크를 남긴 이유: 브라우저는 중첩 `<a>`를 만나면 바깥 `<a>`를 닫는다. 그래서 지금 운영 화면에 보이는 것은 안쪽 링크다. 운영(`www.cruzlab.dev`)과 수정본의 계산된 스타일이 같다(16px, 굵기 700, 대문자 변환 없음).

### 2.7 죽은 경로 삭제

각 파일은 삭제 전에 import·호출을 다시 grep했다. 참조는 없었다.

| 묶음 | 삭제한 것 | 함께 고친 것 |
|---|---|---|
| 옛 글 원본 | `content/posts/` 58개 파일(글 57편 + `.gitkeep`), `src/lib/server/content-post-files.ts`, `src/pages/api/admin/import-content-posts.ts` | `src/content.config.ts`의 `blog` 컬렉션 제거. `AdminDashboard.tsx`의 "기존 markdown 글 이관" 버튼·핸들러·상태 제거 |
| Firebase Functions | `functions/` 전체(`src/index.ts`는 주석뿐) | `firebase.json`의 `functions` 항목, `.gitignore`의 `functions/lib/`·`functions/node_modules/`, `eslint.config.mjs`의 `functions/lib` 무시 항목 |
| 저장소 업로드 경로 | `src/pages/api/admin/upload-asset.ts`, `src/pages/api/admin/asset-preview.ts`, `src/lib/admin-asset-preview.ts` | `EditorMetaPanel.tsx`, `PublishModal.tsx`, `SeriesEditor.tsx`가 URL을 그대로 쓴다. `github-posts.ts`의 `getGitHubRawFileUrl`, `upsertRepositoryAssetFile` 삭제 |
| 미사용 아일랜드 | `islands/` FadeInSection, MiniSeriesCard, PostNavigation, PostSearch, RelatedPosts, SeriesWidget, StatsSection, CountUp, TableOfContents | — |
| 미사용 컴포넌트 | `common/OptimizedImage.tsx` + `lib/image-utils.ts`, `components/` Hero, ExperienceCard, FormattedDate, BaseHead, Header, Footer, HeaderLink(`.astro`) | 실제 레이아웃은 `src/layouts/components/`의 BaseHead·Header·Footer를 쓴다 |
| 그 밖 | `hooks/useAutoSave.ts`, `utils/relatedPosts.ts`, `src/assets/blog-placeholder-*.jpg` 6개, `scripts/generate-pwa-icons.js` | — |

옛 글 원본은 git 기록에 남아 있다. 현재 글은 Firestore가 원본이고, `data/post-archive`가 CMS 사본이다.

### 2.8 출간 점검 스크립트 (A11)

- `scripts/publish-preflight.mjs`: 대상 경로를 `data/post-archive`로 바꿨다. `content/posts` 파일 수 확인과 필수 항목 목록의 `content/posts`를 지웠다.
- `scripts/publish-verify.mjs` (계획 밖, 사용자 승인): 같은 옛 경로를 `data/post-archive`로 바꿨다. 사용 예시도 실제 파일(`2026-04-22-ai-agent-context.md`)로 바꿨다.

### 2.9 배포된 Firebase 함수 삭제 (계획 밖, 사용자 승인)

- 발견: 운영에 `syncPostToGitHub`(2nd Gen, us-central1, Node.js 20)가 배포돼 있었다. 트리거는 Firestore `posts/{postId}` 문서 쓰기다. 저장소의 `functions/src/index.ts`는 2026-03-26에 비웠지만, 배포된 함수는 지우지 않았다.
- 영향: 글을 발행·수정·삭제할 때마다 이 함수가 `main`의 `content/posts`에 커밋했다. 증거는 `main`의 `content/posts` 커밋 이력이다. 마지막은 2026-05-05 `39fd9dd`이고, 메시지 형식(`📝 포스트 수정: …`)이 옛 함수 소스와 같다. CMS 서버 코드에는 이 메시지가 없다. 전수조사 1편 6.2절은 "functions는 미사용"으로 봤지만, 이것은 소스만 본 판단이었다.
- 왜 지웠나: 이 PR은 `content/posts`를 지운다. 함수를 두면 다음 발행 때 `content/posts`가 `main`에 다시 생긴다. 발행 백업은 CMS가 `data/post-archive`에 따로 남긴다.
- 조치: `firebase functions:delete syncPostToGitHub --region us-central1 --force`. 이후 `firebase functions:list`가 빈 목록이다.
- 남긴 것: Secret Manager의 `GITHUB_TOKEN` 비밀값은 건드리지 않았다.

## 3. 검증 결과

| 항목 | 결과 |
|---|---|
| `pnpm lint` | 통과(경고·오류 0) |
| `pnpm build` | 통과 |
| `tsc --noEmit` | 새 오류 0. 수정 전 27개 → 수정 후 25개(원래 있던 오류 2개가 삭제 파일과 함께 사라짐). 남은 25개는 원래 있던 것이고 빌드는 타입 검사를 하지 않는다 |
| 규칙 컴파일 | `--dry-run` 통과, 배포 통과 |
| 개발 서버(규칙 배포 뒤 재시작, 메모리 캐시 없음) | `/`, `/blog/`, `/blog/ai-agent-context`, `/series/`, `/series/wesbos`, `/projects/`, `/admin`, `/sitemap-posts.xml` 모두 200. 서버 오류 로그 0 |
| `/series/` 내용 | WesBos, 크래프톤 정글 두 시리즈가 보인다. `/series/wesbos`에 글 링크 22개 |
| `/admin` | 관리자 로그인 화면이 보인다 |
| `/api/posts/by-slug?slug=ai-agent-context` | 토큰 없음 401, 잘못된 토큰 401, `Cache-Control: no-store` |
| 헤더 로고 | 링크 1개. 운영 화면과 계산된 스타일이 같다 |
| 새 규칙 읽기 확인(Firestore REST, 인증 없음) | `posts`·`series`·`comments` 조건 없는 목록 403. `series`의 `isPublic == true` 쿼리는 통과 |

확인하지 못한 것:

- 관리자 계정으로 이미지 업로드 1회. Google 로그인이 필요하다. 사용자가 직접 확인해야 한다.
- 관리자 에디터에서 기존 글 열기(by-slug에 토큰을 보내는 흐름). 이것도 로그인이 필요하다.
- 운영 사이트 응답은 200이었지만 Vercel 캐시 HIT였다. 새 규칙의 증거는 개발 서버 재시작 결과와 REST 확인이다. 개발 서버도 운영과 같은 Firebase 프로젝트를 쓴다.

## 4. 남은 것

1. 사용자 확인: 관리자 로그인 → 글 편집 화면에서 기존 글 열기 → 썸네일 이미지 업로드 1회.
2. 2단계(데이터 모델과 서버). 시작 전에 Plan 문서와 visual-plan HTML(`docs/blog-rebuilding/visual-plans/`)을 쓴다. 범위는 계획 문서 8.3의 2단계 행과 10.1의 결정이다.
3. `tsc` 오류 25개. 대부분 `src/lib/series.ts`와 `admin-series.ts`의 Firestore 데이터 타입이다. 시리즈 코드는 2단계에서 들어내므로 그때 함께 사라진다. 남는 것은 2단계 끝에 다시 센다.
4. Secret Manager의 `GITHUB_TOKEN`(옛 함수용)이 아직 필요한지 판단한다. CMS 서버는 Vercel 환경 변수의 `GITHUB_TOKEN`을 쓴다. 2단계의 백업 Action 설계 때 함께 정한다.
5. 2단계 설계 때 주의: 운영 상태(배포된 함수, 규칙, 환경 변수)는 저장소 소스만으로 판단하지 않는다. `firebase functions:list` 같은 운영 조회로 확인한다.
