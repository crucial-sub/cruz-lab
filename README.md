# Cruz Lab

브라우저에서 글을 쓰고, 이미지를 올리고, 바로 출간까지 확인할 수 있는 개인 기술 블로그 겸 포트폴리오 사이트입니다.

정적 블로그의 장점은 유지하되, 글을 올릴 때마다 로컬 파일 수정, 이미지 정리, 커밋, 배포 대기를 반복해야 하는 운영 병목을 줄이는 데 집중했습니다. 공개 페이지는 Astro로 가볍게 유지하고, 관리자 화면은 React 기반 CMS로 분리했습니다.

- Live: <https://cruzlab.dev>
- Project posts: <https://cruzlab.dev/projects/cruz-lab>
- GitHub: <https://github.com/crucial-sub/cruz-lab>

![Cruz Lab preview](./src/assets/img/projects/cruz-lab/cruz-lab.png)

## 한눈에 보기

| 구분        | 내용                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 문제        | 정적 블로그에서 글 작성, 이미지 업로드, 커밋, 배포 확인이 계속 끊겨 운영 부담이 컸습니다.                           |
| 해결        | 브라우저 CMS, Firebase Storage 업로드, Firestore direct publish, GitHub markdown 백업을 하나의 흐름으로 묶었습니다. |
| 공개 화면   | Astro 기반 블로그, 프로젝트, 시리즈 페이지로 콘텐츠 읽기 흐름을 구성했습니다.                                       |
| 관리자 화면 | React island로 대시보드, 포스트 목록, CodeMirror 에디터, 시리즈 편집기를 구성했습니다.                              |
| 추가 실험   | 프로젝트 문서와 이력서를 로컬 read-only MCP 서버로 감싸 에이전트가 읽을 수 있는 문서 경계를 설계했습니다.           |

## 핵심 구현

| 영역             | 구현 내용                                                                                                | 관련 코드                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 브라우저 CMS     | CodeMirror 6 기반 마크다운 에디터, localStorage 초안, 1.5초 디바운스 자동 저장, markdown import/export   | `src/components/editor/FullScreenEditor.tsx`, `src/components/editor/CodeMirrorEditor.tsx`, `src/lib/editor-drafts.ts`                  |
| 이미지 업로드    | 드래그 앤 드롭/붙여넣기 이미지 처리, Canvas 리사이즈, Firebase Storage 업로드, 진행 상태 표시            | `src/components/editor/media-upload-client.ts`, `src/components/editor/UploadProgress.tsx`                                              |
| 출간 파이프라인  | 관리자 인증, markdown 직렬화, GitHub 백업, Firestore 반영, 실패 시 백업 정리, 출간 후 검증               | `src/pages/api/admin/publish-post.ts`, `src/pages/api/admin/publish-status.ts`, `src/pages/api/admin/publish-verify.ts`                 |
| 공개 블로그      | Firestore 발행 포스트 조회, markdown 렌더링, 태그/검색/시리즈 페이지 구성                                | `src/lib/content-posts.ts`, `src/pages/blog/index.astro`, `src/pages/blog/[...slug].astro`, `src/lib/series.ts`                         |
| 접근성/읽기 경험 | skip link, `aria-current`, `aria-live`, View Transitions, `prefers-reduced-motion`, 네트워크 상태 토스트 | `src/layouts/BaseLayout.astro`, `src/layouts/components/Header.astro`, `src/components/islands/PostSearch.tsx`, `src/styles/global.css` |
| Knowledge MCP    | 허용된 markdown 문서만 읽는 로컬 stdio MCP 서버, tools/resources/prompts 분리                            | `tools/cruz-lab-knowledge-mcp/server.mjs`                                                                                               |

## 출간 흐름

관리자 화면에서 출간 버튼을 누르면 다음 순서로 처리됩니다.

| 단계 | 위치                | 처리 내용                                                                     |
| ---- | ------------------- | ----------------------------------------------------------------------------- |
| 1    | React CMS           | 글 본문, 메타데이터, 이미지 업로드 결과를 출간 payload로 정리합니다.          |
| 2    | Astro API           | Firebase ID token으로 관리자 이메일을 검증합니다.                             |
| 3    | GitHub Contents API | 포스트를 markdown으로 직렬화해 `data/post-archive`에 백업합니다.              |
| 4    | Firestore           | 공개 블로그가 읽는 `posts` 컬렉션에 발행본을 upsert합니다.                    |
| 5    | Public blog         | `/blog`와 `/blog/[...slug]` 페이지가 Firestore 기준으로 최신 글을 조회합니다. |
| 6    | Admin UI            | 공개 URL, GitHub 파일, 커밋 정보를 반환받아 출간 결과를 확인합니다.           |

Firestore 반영이 실패하면 방금 만든 GitHub 백업을 삭제해 중간 상태를 줄입니다. 공개 블로그는 Firestore를 기준으로 최신 글을 읽고, markdown은 복구와 이관을 위한 기록으로 남깁니다.

## 구조

| 영역          | 역할                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Public pages  | Astro 기반 블로그, 프로젝트, 시리즈 페이지입니다. 발행 포스트는 Firestore에서 읽습니다.                   |
| Admin UI      | React island로 구성된 관리자 대시보드, 포스트 목록, CodeMirror 에디터, 시리즈 편집기입니다.               |
| Astro API     | 관리자 인증, 포스트 출간/삭제/검증, 시리즈 저장, markdown 백업 요청을 처리합니다.                         |
| Firebase      | Auth는 관리자 확인에, Firestore는 발행 포스트와 시리즈 저장에, Storage는 이미지/영상 업로드에 사용합니다. |
| GitHub backup | 출간된 글의 markdown 원본을 `data/post-archive`에 남깁니다.                                               |
| Knowledge MCP | 허용된 프로젝트 문서, 기술 글 초안, 이력서 문서를 read-only stdio MCP 서버로 제공합니다.                  |

## 주요 설계 선택

### Firestore를 공개 데이터 기준으로 사용

기존 markdown 파일만으로 운영하면 커밋과 배포가 끝날 때까지 공개 반영을 기다려야 했습니다. Cruz Lab은 공개 블로그가 Firestore를 직접 읽게 만들고, markdown은 GitHub 백업으로 남기는 구조를 사용합니다.

### Astro와 React 역할 분리

공개 페이지는 콘텐츠를 읽는 화면이므로 Astro 페이지와 서버 라우트 중심으로 구성했습니다. 반대로 관리자 화면은 에디터, 초안, 업로드, 출간 모달, 시리즈 정렬처럼 상태 변화가 많아 React island로 분리했습니다.

### MCP 서버는 작게 제한

`cruz-lab-knowledge-mcp`는 검색 제품이 아니라 문서 경계 실험입니다. 이 저장소의 `src/content/projects`와 저장소 밖 `career` 폴더의 `writing/final-posts`, `resume`만 읽고, PDF, 이미지, Firebase admin key, 빌드 산출물, `node_modules`는 제외합니다. `career` 폴더의 위치는 환경 변수 `CRUZ_LAB_CAREER_ROOT`로 정하고, 기본값은 저장소 옆의 `../career`입니다. `read_doc`은 절대 경로와 허용 루트 밖 path traversal을 거부합니다.

## 기술 스택

| 영역                 | 사용 기술                                                      |
| -------------------- | -------------------------------------------------------------- |
| Framework            | Astro 5, React 19                                              |
| Language             | TypeScript                                                     |
| Styling              | Tailwind CSS, Framer Motion                                    |
| Editor               | CodeMirror 6                                                   |
| Content              | Markdown/MDX, Astro Content Collections, Firestore             |
| Auth / Data / Assets | Firebase Auth, Firestore, Firebase Storage, Firebase Admin SDK |
| Deploy               | Vercel adapter                                                 |
| MCP                  | `@modelcontextprotocol/sdk`, Node.js stdio server              |

## 디렉터리 구조

```text
src/
  pages/
    blog/                 # 공개 블로그 페이지
    admin/                # 관리자 화면
    api/admin/            # 출간, 삭제, 검증, 시리즈 관리 API
    projects/             # 프로젝트 상세 페이지
    series/               # 시리즈 페이지
  components/
    editor/               # CodeMirror CMS 에디터
    admin/                # 관리자 대시보드와 목록
    islands/              # React island UI
  lib/
    server/               # Firestore, GitHub, Firebase Admin 서버 유틸
    markdown-publish.ts   # markdown import/export와 출간 직렬화
  content/projects/       # 프로젝트 메타 문서와 프로젝트 포스트

tools/
  cruz-lab-knowledge-mcp/ # read-only MCP 서버

data/
  post-archive/           # CMS 출간 markdown 백업
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
pnpm mcp:knowledge
```

## 환경 변수

`.env.example`을 기준으로 `.env`를 만듭니다.

클라이언트와 관리자 로그인:

```bash
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_ADMIN_EMAIL=
PUBLIC_SITE_URL=
```

서버 출간과 백업:

```bash
GITHUB_TOKEN=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

`FIREBASE_ADMIN_PROJECT_ID`는 비워두면 `PUBLIC_FIREBASE_PROJECT_ID`를 fallback으로 씁니다. `FIREBASE_ADMIN_PRIVATE_KEY`는 줄바꿈을 `\n` 형태로 넣어도 서버에서 복원합니다.

## 범위

이 프로젝트는 범용 CMS나 다중 사용자 SaaS가 아닙니다. 개인 블로그를 실제로 운영하기 위한 크기로 잘랐습니다.

- 권한 모델은 `PUBLIC_ADMIN_EMAIL`로 지정한 단일 관리자 기준입니다.
- Firestore와 GitHub 사이에 완전한 분산 트랜잭션을 만들지는 않았습니다. 대신 실패 시 GitHub 백업을 정리하는 보상 흐름을 둡니다.
- MCP 서버는 read-only 로컬 stdio 서버입니다. 벡터 검색, 임베딩, 원격 배포, 인증은 넣지 않았습니다.
- PWA와 오프라인 캐시는 두지 않았습니다. 서비스워커의 페이지 이동 규칙이 SSR 구조와 맞지 않아 걷어냈습니다.
