# Cruz Lab

브라우저에서 글을 쓰고, 이미지를 올리고, 바로 출간까지 확인하는 개인 기술 블로그입니다.

공개 페이지는 Astro 서버 렌더로 가볍게 만들었습니다. 공개 페이지에는 React가 없습니다. 글쓰기와 관리는 `/admin`의 React 관리자 앱 하나에서 합니다. 글 원본은 Firestore에 있고, 비공개 저장소가 매일 마크다운으로 백업합니다.

- Live: <https://www.cruzlab.dev>
- Project posts: <https://www.cruzlab.dev/projects/cruz-lab>
- GitHub: <https://github.com/crucial-sub/cruz-lab>

![Cruz Lab preview](./.github/readme/cruz-lab-preview.png)

## 한눈에 보기

| 구분        | 내용                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 문제        | 정적 블로그는 글 하나를 올릴 때마다 파일 수정, 이미지 정리, 커밋, 배포 대기가 필요했습니다.                                            |
| 해결        | 서버 초안 자동저장, 서명 URL 이미지 업로드, 트랜잭션 발행, CDN 캐시 태그 퍼지, 비공개 저장소 백업을 한 흐름으로 묶었습니다.            |
| 공개 화면   | 글 · 노트 · 프로젝트 · 연재 · 카테고리 · 태그 페이지입니다. 서버 렌더 HTML이고 React island가 없습니다.                                |
| 관리자 화면 | `/admin` React 앱 하나입니다. 글 목록과 이어 쓰기, 이미지 라이브러리, 분류, 연재 · 프로젝트, 독자 흐름, 출간 기록, 키 설정이 있습니다. |
| 에디터      | Tiptap 3.33.0입니다. 마크다운 왕복, 슬래시 메뉴, 명령 팔레트, 이미지 폭 · 정렬, 블록 이동, 찾기 · 바꾸기, 이전 발행본이 있습니다.      |
| 독자 흐름   | 쿠키와 개인정보 없이 날짜별 방문, 들어온 곳, 다음에 읽은 글을 셉니다. 운영 주소에서만 저장합니다.                                      |

## 핵심 구현

| 영역                | 구현 내용                                                                                                                                                                                     | 관련 코드                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 관리자 앱           | Astro 페이지 하나가 React 앱을 띄웁니다(`client:only`). History API 라우터, 저장하지 않은 변경 가드, 문제가 있을 때만 뜨는 알림 띠. 에디터 코드는 열 때 받습니다(`import()`).                 | `src/pages/admin/[...path].astro`, `src/admin/AdminApp.tsx`, `src/admin/router.ts`, `src/admin/layout/AlertBar.tsx`                   |
| 입구와 인증         | 푸터 "관리" 링크, 로그인 사전 안내와 거부 화면. Firebase Google 로그인 뒤 서버가 세션 쿠키(14일)를 만듭니다. 관리자는 `ADMIN_UID`로 가립니다. 관리자가 아닌 계정의 인증 기록은 바로 지웁니다. | `src/components/admin/AdminLogin.tsx`, `src/lib/server/admin-session.ts`, `src/lib/admin-guard.ts`, `src/middleware.ts`               |
| 에디터              | 마크다운 ↔ ProseMirror 변환기, 명령 레지스트리(단축키 · 슬래시 메뉴 · 팔레트 · 툴바 · 모바일 바가 한 목록), 보기 모드 3종, 키 설정, 블록 이동, 찾기 · 바꾸기                                 | `src/editor/ui/EditorApp.tsx`, `src/editor/markdown/`, `src/editor/commands/registry.ts`, `src/editor/ui/find.ts`                     |
| 저장과 출간         | 서버 초안 자동저장(버전 충돌 409, 일시 오류 자동 재시도, 오프라인 보관함). 발행은 발행본 · 리비전 · 출간 기록을 한 트랜잭션으로 씁니다. 그 뒤 CDN 퍼지와 백업 알림을 보냅니다.                | `src/editor/state/save-controller.ts`, `src/lib/server/admin-entries.ts`, `src/lib/server/cdn-purge.ts`, `src/pages/api/admin/posts/` |
| 이미지              | SHA-256 중복 검사, 서명 URL로 Storage 직접 업로드, sharp webp 변형(480 · 960 · 1600 · 2400px), 이미지 폭 · 정렬, 쓰지 않는 자산 정리                                                          | `src/editor/upload/upload-client.ts`, `src/lib/server/admin-assets.ts`, `src/editor/ui/ImageNodeView.tsx`                             |
| 마크다운 파이프라인 | remark · rehype 하나를 에디터 미리보기와 공개 페이지가 함께 씁니다. GFM, KaTeX 수식, 콜아웃, YouTube · CodeSandbox 임베드, Shiki 코드 하이라이트, 원시 HTML 안전 처리                         | `src/lib/content/markdown.ts`, `src/lib/content/rehype-shiki.ts`, `src/lib/content/rehype-strip-unsafe.ts`                            |
| 공개 페이지         | Firestore `entries`의 발행본만 읽습니다. 목록 필터, 목차, 연재 · 프로젝트 Part 이동, OG 이미지(satori + resvg), RSS, 사이트맵. 글 상세와 OG 응답에 `Server-Timing`이 있습니다.                | `src/lib/server/entries.ts`, `src/lib/server/render-entry.ts`, `src/lib/server/og-image.ts`, `src/pages/blog/`                        |
| 독자 흐름           | 공개 페이지의 작은 수집 스크립트(관리자 표시와 합해 2 KB 안)가 `POST /api/track`에 보냅니다. 서버는 원본 줄과 날짜 요약을 쓰고 90일 뒤 원본을 지웁니다.                                       | `src/lib/tracker/client.ts`, `src/lib/tracker/events.ts`, `src/pages/api/track.ts`, `src/lib/server/reader-store.ts`                  |
| 분류와 연재         | 카테고리 목록 · 동의어 · 옛 주소 301을 브라우저에서 고칩니다(`settings/taxonomy`). 연재와 프로젝트 정보는 `seriesMeta`에 있습니다.                                                            | `src/lib/server/taxonomy-store.ts`, `src/lib/server/admin-series.ts`, `src/admin/taxonomy/`, `src/admin/series/`                      |

## 출간 흐름

자세한 순서는 [PUBLISHING.md](./PUBLISHING.md)에 있습니다.

| 단계 | 위치        | 처리 내용                                                                                  |
| ---- | ----------- | ------------------------------------------------------------------------------------------ |
| 1    | 미들웨어    | 관리자 경로에서 세션 쿠키를 검사합니다. 쓰기 요청은 같은 Origin만 받습니다.                |
| 2    | 초안 API    | 초안을 Firestore `entries`에 저장합니다. 버전 번호가 다르면 409로 덮어쓰기를 막습니다.     |
| 3    | 자산 API    | 서명 URL로 Storage에 직접 올립니다. 서버가 sharp로 webp 변형을 만듭니다.                   |
| 4    | 발행 API    | 발행 조건을 검사합니다. 발행본 · 리비전 · 출간 기록을 한 트랜잭션으로 씁니다.              |
| 5    | CDN         | 캐시 태그로 그 글과 목록 페이지의 캐시를 비웁니다.                                         |
| 6    | 백업 저장소 | 비공개 저장소의 GitHub Action이 발행 직후와 매일 Firestore를 마크다운 · JSON으로 남깁니다. |

출간은 GitHub를 부르지 않습니다. 퍼지나 백업 알림이 실패해도 발행은 성공합니다. 실패는 관리자 앱의 알림 띠에 뜨고, 띠에서 다시 시도합니다.

## 구조

| 영역          | 역할                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public pages  | Astro 서버 렌더 페이지입니다. 발행 글은 Firestore에서 읽고 CDN에 캐시합니다. 클라이언트 JS는 테마 버튼, 목차, 수집 스크립트 같은 작은 스크립트뿐입니다. |
| Admin app     | `/admin/**`를 Astro 페이지 하나가 받고, React 앱이 화면을 바꿉니다. 에디터 `/admin/edit/<id>`는 같은 앱 안에서 늦게 받습니다.                           |
| Astro API     | 세션, 초안 저장, 발행 · 숨김 · 삭제, 리비전, 자산, 분류, 연재, 설정, 출간 기록, 독자 흐름을 처리합니다.                                                 |
| Firebase      | Auth는 관리자 로그인에, Firestore는 글(`entries`) · 자산 · 분류 · 독자 요약 저장에, Storage는 이미지 · 영상 저장에 씁니다.                              |
| GitHub backup | 비공개 저장소의 GitHub Action이 글과 설정을 마크다운과 JSON으로 남깁니다.                                                                               |

## 주요 설계 선택

### Firestore를 공개 데이터 기준으로 사용

마크다운 파일로 운영하면 커밋과 배포가 끝나야 공개됩니다. Cruz Lab은 공개 페이지가 Firestore의 발행본을 직접 읽습니다. 발행 직후 캐시 태그로 CDN을 비웁니다. 마크다운은 백업 저장소에 남깁니다.

### Astro와 React 역할 분리

공개 페이지는 읽는 화면입니다. 그래서 Astro 서버 렌더만 쓰고 React를 보내지 않습니다. 관리자 화면은 상태가 많습니다(자동저장, 업로드 진행, 목록 거르기). 그래서 React 앱 하나로 만들었습니다. 관리자 앱 첫 화면은 에디터 코드를 받지 않습니다.

### 독자 흐름은 개인정보 없이

방문 ID는 탭 세션에만 있습니다(30분 쉬면 새 방문). 쿠키, IP, User-Agent를 저장하지 않습니다. 저장은 운영 주소(`www.cruzlab.dev`)의 요청만 합니다. 관리자 본인의 방문은 세지 않습니다.

## 기술 스택

| 영역                 | 사용 기술                                                       |
| -------------------- | --------------------------------------------------------------- |
| Framework            | Astro 5(서버 렌더), React 19(관리자 앱)                         |
| Language             | TypeScript                                                      |
| Styling              | Tailwind CSS                                                    |
| Editor               | Tiptap 3.33.0(ProseMirror), lowlight, KaTeX, prosemirror-search |
| Content              | Markdown(unified remark · rehype), Shiki, Firestore             |
| Images / OG          | sharp, satori, resvg                                            |
| Auth / Data / Assets | Firebase Auth, Firestore, Firebase Storage, Firebase Admin SDK  |
| Validation / Test    | zod, Vitest                                                     |
| Deploy               | Vercel adapter(함수 지역 `icn1`)                                |

## 디렉터리 구조

```text
src/
  pages/
    blog/                 # 글 목록 · 상세 · 카테고리 · 태그
    notes/                # 노트 목록 · 상세 · RSS
    projects/             # 프로젝트 목록 · Part 글
    series/               # 연재 페이지
    og/                   # OG 이미지
    admin/                # 관리자 앱 진입([...path]), 로그인
    api/admin/            # 세션, 글 · 리비전 · 자산 · 분류 · 연재 · 설정 · 출간 기록 · 독자 API
    api/track.ts          # 독자 흐름 수집(공개)
  admin/                  # 관리자 앱: 라우터, 틀, 글 목록, 이미지, 분류, 연재, 독자, 출간 기록, 설정
  editor/                 # Tiptap 에디터
    commands/             # 명령 레지스트리, 키맵, 슬래시 메뉴, 팔레트, 블록 이동
    extensions/           # 스키마(콜아웃 · 임베드 · 수식 · 이미지 폭), 입력 규칙
    markdown/             # ProseMirror JSON ↔ markdown 변환기
    state/                # 저장 컨트롤러, 자동저장, 오프라인 보관함
    ui/                   # EditorApp, 툴바, 모바일 바, 노드 뷰, 찾기 막대, 대화상자
    upload/               # 이미지 업로드 클라이언트, 드롭 · 붙여넣기
  components/             # 공개 페이지 Astro 컴포넌트, 관리자 로그인
  layouts/                # BaseLayout(공개), AdminPage(관리자)
  lib/
    content/              # 공유 마크다운 파이프라인
    server/               # Firestore, 세션, CDN 퍼지, 백업 알림, 렌더, OG, 독자 저장
    tracker/              # 독자 흐름 이벤트 검사 · 요약 · 수집 스크립트
    migrate/              # 옛 posts · 프로젝트 파일 → entries 변환 함수

scripts/
  smoke/                  # API, 관리자 앱, 독자 흐름, 공개 페이지, 마크다운 왕복 검사
  migrate/                # 2단계 마이그레이션, 프로젝트 글 이전, 되돌리기
  ops/                    # 버킷 CORS, OG 글꼴 서브셋

data/
  post-archive/           # 옛 CMS 출간 markdown 사본(옛 데이터 정리 때 지웁니다)
```

## 로컬 실행

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
pnpm preview
pnpm lint
pnpm test
```

점검 스크립트는 [PUBLISHING.md](./PUBLISHING.md)의 "점검"에 있습니다.

## 환경 변수

`.env.example`을 기준으로 `.env`를 만듭니다.

클라이언트(Firebase 웹 앱 설정, 공개 값):

```bash
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
```

서버(비공개):

```bash
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
ADMIN_UID=
BACKUP_DISPATCH_TOKEN=
```

- `FIREBASE_ADMIN_PROJECT_ID`가 비면 `PUBLIC_FIREBASE_PROJECT_ID`를 씁니다. `FIREBASE_ADMIN_PRIVATE_KEY`는 줄바꿈을 `\n`으로 넣어도 됩니다.
- `ADMIN_UID`는 관리자 Firebase 계정의 UID입니다. 없으면 관리자 API가 503을 돌려줍니다.
- `BACKUP_DISPATCH_TOKEN`은 백업 저장소에 `repository_dispatch`를 보내는 토큰입니다. 없으면 알림만 건너뜁니다(로컬 기본).

## 범위

이 프로젝트는 범용 CMS나 다중 사용자 SaaS가 아닙니다. 개인 블로그를 운영하는 크기로 잘랐습니다.

- 관리자는 한 명입니다. `ADMIN_UID`와 확인된 이메일로 가립니다.
- 출간은 GitHub를 부르지 않습니다. 백업은 비공개 저장소가 따로 합니다. 그래서 출간과 백업 사이에 보상 흐름이 필요 없습니다.
- 독자 흐름은 날짜별 요약입니다. 다른 날의 방문을 같은 독자로 잇지 않습니다.
- PWA와 오프라인 캐시는 두지 않았습니다. 서비스워커의 페이지 이동 규칙이 SSR 구조와 맞지 않았습니다. 에디터만 저장하지 못한 초안을 기기에 보관합니다.
