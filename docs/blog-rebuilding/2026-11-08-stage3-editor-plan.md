# 재건 3단계 Plan: 에디터

- 날짜: 2026-11-08
- 상태: **승인됨(2026-11-08).** 사용자 결정 3건의 답은 13절, 미룬 기능은 14절 상기 목록에 있다. 12절 끝의 "Claude 판단" 목록도 함께 승인받았다. 구현은 새 세션에서 T1부터 한다.
- 브랜치: `rebuild`에서 작업 브랜치를 만든다(`stage3/a-markdown`, `stage3/b-editor`, `stage3/c-commands`). PR 대상은 `rebuild`다. main이 아니다.
- 근거: [계획 문서](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md) 2.1~2.4(에디터 요구), 5.4(M7~M10), 8.3 "3. 에디터", 8.4, 10.3. [2단계 Plan](./2026-11-07-stage2-data-model-and-server-plan.md) D4·D5·D6·D8·D10, 12절 E2. [2단계 작업 문서](./2026-11-08-stage2-data-model-and-server.md) 2.4~2.6, 5절, 6.2, 7절, 8절 4.
- 시각 문서: [visual-plans/2026-11-08-cruz-lab-stage3-plan.html](./visual-plans/2026-11-08-cruz-lab-stage3-plan.html)

## 0. 결론 먼저

1. **에디터는 Tiptap이다(계획 문서 2.3, 결정 끝).** 쓰는 동안 문서가 렌더되어 보인다. 소스 모드 CodeMirror와 옛 에디터 화면은 지운다.
2. **마크다운 변환기는 remark 위에 직접 만든다(D4).** 공개 페이지가 쓰는 파서(remark-parse, remark-gfm)와 같은 파서로 읽고, remark-stringify로 쓴다. 에디터가 보는 문서와 독자가 보는 문서가 같은 규칙으로 만들어진다.
3. **왕복 검사 기준은 "렌더 결과가 같다"다(D1, 사용자 결정 2026-11-08: b).** 계획 문서 9절은 "diff 0"이라고 썼다. 기존 55편은 `*` 글머리 502개, `***` 구분선 108개, 보이지 않는 문자(ZWSP) 977개를 담고 있다. WYSIWYG 에디터는 이런 표기를 기억하지 않는다. 대신 두 가지를 보장한다. (a) 다시 쓴 마크다운을 공개 페이지 파서로 렌더하면 원문과 같다. (b) 열기만 하고 고치지 않으면 저장하지 않는다.
4. **초안은 2초마다 서버에 저장한다.** 다른 기기가 먼저 저장했으면(409) 사용자가 고른다. 오프라인이면 IndexedDB에 글당 1칸으로 보관했다가 온라인에 전송한다(D6).
5. **이미지는 2단계 자산 API로 올린다.** 떨어뜨리거나 붙여넣으면 SHA-256 → 서명 URL PUT → finalize 순서로 올라가고, 가장 큰 webp 변형 주소가 본문에 들어간다. 브라우저가 Storage에 직접 올리므로 버킷 CORS(E2)가 필요하다. 3단계의 유일한 운영 설정 변경이다.
6. **명령은 하나의 목록에서 나온다.** 단축키, 슬래시 메뉴, 명령 팔레트(`Mod+K`), 툴바, 모바일 툴바가 같은 레지스트리를 읽는다. 사용자 키맵 저장과 설정 화면은 5단계다(D9).
7. **옛 관리자 화면을 지우고 최소 목록을 둔다(D2, 사용자 결정 2026-11-08: a).** `/admin`은 서버 렌더 목록(제목·상태·수정일, 새 글·새 노트)이 된다. 5단계가 React 앱으로 다시 만든다. 이렇게 하면 `rebuild` 미리보기에서 글을 처음부터 끝까지 쓸 수 있고, `tsc` 오류 9개 중 7개가 사라진다.
8. **계획 문서 2.4의 요구 중 임베드(YouTube·CodeSandbox), 수식, 이미지 크기 선택은 넣는다. 찾기·바꾸기, 키맵 저장·설정 UI, 드래그 핸들, 링크 카드, 임의 px 폭·정렬은 뒤로 미룬다(D3, 사용자 결정 2026-11-08).** 미룬 것은 14절 상기 목록에 적었다.
9. **퍼지 방식을 나눈다(D7).** 글 상세 태그는 `dangerouslyDeleteByTag`, 목록 태그는 `invalidateByTag`. 발행 직후 작성자가 여는 글 주소가 첫 요청부터 새 내용이다. 2단계 작업 문서 8절 4를 닫는다.

## 1. 출발점: 2026-11-08에 확인한 사실

모든 조회는 읽기 전용이다. 기존 글의 본문은 2단계 B1 덤프(`~/projects/cruz-lab-backups/20261108-152505-stage2-migrate/posts.json`)에서 읽었다. 중복 글 1편(D3, 2단계)은 뺐다.

### 1.1 기존 55편의 마크다운 (부록 A에 전체 표)

| 항목 | 값 | 뜻 |
|---|---|---|
| 본문 크기 | 합계 417,565바이트, 최대 25,052바이트 | 문서 한도(초안 900 KB)에 여유가 크다 |
| 원시 HTML | 59개, 전부 `<br />`(54) 또는 `</br>`(5). 20편. 블록 위치 50, 줄 안 9 | 범용 HTML 블록이 필요 없다. `<br>`만 다루면 된다 |
| 제목 단계 | h1 7(6편), h2 221, h3 254, h4 35(13편), h5 2(2편) | 스키마는 h1~h6을 받아야 한다. UI는 h2~h4만 내놓아도 된다 |
| 목록 | 비순서 241, 순서 95, 항목 902. 글머리 `*` 502, `-` 77 | 다시 쓰면 글머리가 `-`로 통일된다 |
| 구분선 | 108(38편), 전부 `***` | 다시 쓰면 `---`가 된다 |
| 코드 블록 | 251(48편). 언어: javascript 138, c 33, python 27, jsx 16, objectivec 4, css 3, typescript 3, html 2, markdown 1, nasm 1, java 1. 언어 없음 7(들여쓰기 코드 포함) | 하이라이트 언어 등록 목록의 근거 |
| 표 | 10(7편). 셀 150 | 셀 안은 단락 1개다 |
| 이미지 | 104(29편). `"제목"`이 있는 것 39(9편) | 이미지 title을 보존해야 한다 |
| 하드 브레이크 | 132(15편). `\` 73, 두 칸 공백 60 | `<br>`로 그려진다 |
| 줄 안 줄바꿈(soft break) | 225(38편) | 공개 페이지는 공백으로 그린다 |
| 인용 | 144(51편). 그중 `> 💡`로 시작 45(30편) | 사용자의 콜아웃 관례 |
| 보이지 않는 문자 | ZWSP(U+200B) 977(15편), `**`와 백틱 경계에 집중. NBSP(U+00A0) 125(16편). 줄 끝 공백 83(14편) | ZWSP는 옛 에디터가 넣은 보정 문자다. 지워도 렌더가 같다 |
| 쓰이지 않은 것 | 체크 목록, 콜아웃 `[!note]`, 각주, 수식, iframe, `<img>`·`<video>`·`<details>` 태그, 참조 링크 | 3단계 범위 축소(D3)의 근거 |

### 1.2 코드와 라이브러리

| 항목 | 값 | 확인 방법 |
|---|---|---|
| 공개 페이지 본문 렌더 | `src/components/blog/MarkdownPostView.tsx` 114~115행: react-markdown + `remarkGfm` + `rehypeHighlight` + `rehypeRaw`. `img`는 확장자가 영상이면 `<video>`, `a`는 외부면 새 창 | 코드 |
| `remark-breaks` | `src`에서 import하는 곳이 없다 | grep |
| 2단계 글 API | Plan 6.3의 8개 경로가 그대로 있다. 초안 저장 409 `DRAFT_CONFLICT`의 `details`는 `{ version, device, updatedAt, draft }`. 발행 422 `VALIDATION_FAILED`의 `details`는 `[{ field, message }]`. `device`는 60자까지 | `src/pages/api/admin/posts/**`, `src/lib/server/admin-entries.ts` 81~88행, `src/lib/entry-rules.ts` |
| 초안 크기 검사 | `normalizeDraftInput`이 `editorJson`을 포함한 JSON 크기로 900 KB를 검사한다 | `src/lib/entry-rules.ts` |
| 2단계 자산 API | `upload-url` 응답은 `{ existing }` 또는 `{ assetId, uploadUrl, expiresAt, requiredHeaders: { "Content-Type" } }`. `finalize` 응답은 `{ asset }`. 받는 형식은 png·jpeg·webp·gif·webm·mp4 | `src/lib/server/admin-assets.ts`, `src/lib/asset-rules.ts` |
| 퍼지 함수 | `@vercel/functions` 3.10.2가 `invalidateByTag`와 `dangerouslyDeleteByTag(tag, options?)`를 내보낸다 | `node_modules/@vercel/functions/purge/index.d.ts` |
| 테마 | 토큰은 `global.css`의 `:root`(다크 기준). `html.light` 클래스로 라이트 전환(`BaseHead.astro` 42~47행). 옛 에디터 페이지는 `<body class="bg-white">` 고정(`edit.astro` 18행) | 코드 |
| 읽기 시간 | 서버 발행이 `src/utils/readingTime.ts`의 `calculateReadingTime`을 쓴다(한글 보정 공식). 옛 에디터는 다른 공식을 쓴다 | `entry-rules.ts`, `FullScreenEditor.tsx` |
| 옛 관리자·에디터 코드 | 20개 파일, 약 4,800줄(`FullScreenEditor` 788, `PostList` 579, `CodeMirrorEditor` 577 + CSS 547, `PublishModal` 458, `AdminDashboard` 359, …) | `wc -l` |
| 기준선 | `pnpm lint` 통과. `pnpm test` 112개 통과. `tsc --noEmit` 오류 9개: `PostList` 3, `editor-drafts` 4, `markdown-publish` 1, `TextReveal` 1 | 실행 |
| Tiptap | `@tiptap/*` 3.33.0(2026-11-05 배포), MIT. 모든 `@tiptap/*` 패키지가 같은 버전이어야 한다(peer) | npm |
| `@tiptap/markdown` | 공식. 3.7.0(2025-10-14)에 처음 나왔다. 파서는 marked. 문서가 "early release"라고 밝힌다. `editor.getMarkdown()`, `contentType: 'markdown'`, 확장 훅 `parseMarkdown`·`renderMarkdown`. 표는 셀당 자식 노드 1개 | 문서, 패키지 타입 정의 |
| `tiptap-markdown` | 커뮤니티. 0.9.0(2025-09-08). markdown-it + prosemirror-markdown | npm |
| 버킷 CORS | 비어 있다(2026-11-07 확인값, 2단계 Plan 1절). `storage.googleapis.com` 사전 요청에 허용 헤더가 없다 | 2단계 Plan |
| Auth 승인 도메인 | `rebuild` 미리보기 주소가 있다(E3 완료) | 2단계 작업 문서 3절 |
| B1 덤프 | `posts` 56, `series` 2. 기존 본문의 원본 사본이다 | `manifest.json` |

## 2. 목표와 범위

### 2.1 3단계가 끝나면 참이 되는 것

| 요구 | 출처 | 3단계 해결 방법 |
|---|---|---|
| 쓰는 동안 문서가 렌더되어 보인다 | 2.1, 2.2 #1, M8 | Tiptap 편집 모드 |
| 입력 규칙으로 구조를 만든다(`## `, `> `, ```` ``` ````, `- [ ] `) | 2.3 | Tiptap 입력 규칙 |
| 명령·단축키·슬래시·팔레트가 하나의 레지스트리에서 나온다 | 2.2 #3, 2.4 | 명령 레지스트리(D9) |
| `Mod+Alt` 조합을 쓰지 않는다 | 2.2 #2 | 기본 키맵(부록 B) |
| 블록: 제목, 단락, 목록 3종, 인용, 콜아웃, 코드(언어 선택), 표, 이미지(캡션·대체 텍스트), 구분선 | 2.4 | 확장 세트(D10) |
| 임베드(YouTube·CodeSandbox), 수식 | 2.4, D3 답 | 임베드·수식 노드 + 공유 파이프라인 플러그인(D10) |
| 이미지 크기 선택 | D3 답 | 변형 3종 중 고르기(D11 9) |
| 이미지 여러 장 드롭, 자리표시, 재시도, 붙여넣기 | 2.4 | 업로드 클라이언트(D11) |
| 모바일: 키보드 위 툴바, 자동저장 | 2.2 #6, 2.4, 5.2 | 모바일 툴바(D12) |
| 보기 모드 3종: 편집 · 소스 · 미리보기(공개 페이지와 같은 CSS) | 2.4 | 모드 전환(D8) |
| 개요 패널, 글자 수, 읽기 시간(공식 하나) | 2.4, 1.2 #9 | 오른쪽 패널. 읽기 시간은 서버와 같은 함수 |
| 서버 초안 자동저장 + 오프라인 보관 + 충돌 선택 | 2.4, A7 | 자동저장 상태 기계(D6) |
| 리렌더가 키 입력마다 전체로 번지지 않는다 | 2.2 #5 | 에디터 상태는 Tiptap 안. 패널은 디바운스된 요약만 받는다 |
| M7 열자마자 본문 | 5.4 | 레이아웃(D13) |
| M9 하단에는 저장 상태·발행만 | 5.4 | 레이아웃(D13) |
| M10 테마 하나 | 5.4 | 사이트 토큰과 `html.light`를 그대로 쓴다 |
| 마크다운 왕복: 기존 글 전부 통과 | 8.3, 9절 | 왕복 검사(D1) |
| `docs/cms-rebuild-tracker.md`, `docs/editor-engine-evaluation.md` 삭제 | 10.3 | T7 |

### 2.2 하는 것

1. `src/editor/` 패키지: Tiptap 확장 세트, 마크다운 변환기, 명령 레지스트리, 자동저장, 업로드 클라이언트, 화면.
2. `src/lib/content/markdown.ts`: 마크다운 → HTML 공유 파이프라인. 미리보기 모드와 왕복 검사가 쓴다. 4단계 공개 페이지가 이어받는다.
3. 에디터 페이지 `/admin/edit/[id]`. 새 글은 `/admin/posts/new`가 빈 초안을 만들고 그 주소로 보낸다.
4. 최소 관리자 목록 `/admin`(D2 권장안).
5. 왕복 검사 스크립트와 단위 테스트.
6. 옛 관리자·에디터 화면, lib, 의존성, 옛 문서 삭제.
7. 퍼지 방식 변경(D7).
8. 버킷 CORS(E2, 사용자 확인 뒤).
9. 임베드·수식 노드와 파이프라인 플러그인, 이미지 크기 선택, `GET /api/admin/assets/{id}`(D3 답).

### 2.3 하지 않는 것

| 하지 않는 것 | 이유 또는 단계 |
|---|---|
| 공개 페이지 렌더 교체(react-markdown → 공유 파이프라인), Shiki, 코드 복사 버튼, 목차 | 4단계. 3단계는 공유 파이프라인만 만들고 공개 페이지는 건드리지 않는다 |
| 관리자 목록 재설계(표, 필터, 검색), 태그·카테고리 관리, 이미지 라이브러리, 리비전 UI, 출간 기록, 헤더 "쓰기" 진입점 | 5단계 |
| 키맵 저장(`settings/editor`)과 설정 화면 | 5단계(D9). 2단계 Plan 4.2는 "3단계에서 만든다"고 했다. 3단계에 쓰는 화면이 없어 5단계로 옮긴다 |
| 링크 카드, 찾기·바꾸기, 이미지 임의 px 폭·정렬, 드래그 핸들 | D3(사용자 결정). 14절 상기 목록 |
| 노트 공개 페이지(`/notes`), 홈 노트 스트림 | 4단계. 노트 쓰기와 발행은 된다 |
| 예약 발행 | 요구 없음(2단계 D4) |
| 옛 `posts`·`series` 데이터와 옛 필드 삭제 | main 병합 뒤 |
| Firestore·Storage 규칙, 인덱스, 함수 배포 | 필요 없다 |
| 기존 글의 본문 일괄 변환(ZWSP 제거, 글머리 통일) | 하지 않는다. 그 글을 실제로 고칠 때만 다시 쓴다(D1) |
| 옛 `/admin/edit?slug=` 주소 유지 | 301로 `/admin`에 보낸다. 외부에 공개된 주소가 아니다 |

## 3. 설계 결정

결정마다 누가 정하는지 적는다. "사용자 결정" 3건은 13절에 모았다. "Claude 판단"은 승인할 때 함께 확인한다.

### D1. 왕복 검사 기준 (사용자 결정 2026-11-08: b. 렌더 결과 동일)

**문제.** 계획 문서 9절은 "기존 56편을 새 에디터로 열고 수정 없이 저장했을 때 diff 0"을 검증 기준으로 썼다. 1.1의 조사로 보면 이 기준은 어떤 WYSIWYG 에디터도 통과하지 못한다. ProseMirror 문서는 글머리가 `*`였는지 `-`였는지, 구분선이 `***`였는지, 줄 끝에 공백이 있었는지 기억하지 않는다. 기억하게 만들면 "원문 보존용 속성"이 스키마 전체에 번진다.

| | a. 바이트 동일(diff 0) | **b. 렌더 결과 동일 + 고치지 않으면 쓰지 않음 (결정)** |
|---|---|---|
| 검사 | 원문 === 다시 쓴 마크다운 | 원문과 다시 쓴 마크다운을 같은 파서(remark-parse + remark-gfm → hast)로 바꿔 정규화한 뒤 비교 |
| 통과 가능성 | 55편 중 0편. `*` 글머리 502, `***` 108, ZWSP 977, 끝 공백 83이 모두 바뀐다 | 변환기가 맞으면 55편 전부 |
| 독자가 보는 것 | 같다 | 같다 |
| 기존 글의 마크다운 | 그대로 | 열기만 하면 그대로. 실제로 고친 글만 새 표기로 다시 쓴다 |
| 보장하지 못하는 것 | — | 원문의 표기 습관(글머리 기호, 구분선 기호, 줄 나눔 위치) |

**b의 정규화 규칙.** 비교 전에 양쪽 hast에 같은 처리를 한다. 규칙은 모두 1.1의 데이터에서 나왔다. 구현 중 규칙을 더하면 Plan 부록 A와 작업 문서에 적고 이유를 쓴다.

1. 텍스트의 ZWSP(U+200B)를 지운다. 옛 에디터의 보정 문자다.
2. 블록 위치의 `<br>`(단락 사이에 홀로 있는 것)을 지운다. 세로 여백만 만든다. 50개가 모두 이 경우다.
3. 공백 묶음(공백, 탭, 줄바꿈)을 공백 하나로 합친다. 줄 안 줄바꿈이 공백이 되는 것과 같다.
4. 코드 블록 안은 정규화하지 않는다. 글자 그대로 같아야 한다.
5. `position` 정보를 지운다.
6. (구현 중 추가, 2026-11-09) `<br>` 바로 앞뒤의 공백을 지운다. 줄 안 원시 `<br />`를 변환기가 `\`+줄바꿈으로 다시 쓰면 hast에서 `<br>다음`과 `<br>\n다음`이 된다. 브라우저는 줄 끝과 줄 처음의 공백을 그리지 않는다. 근거는 [작업 문서 5절](./2026-11-09-stage3-editor.md) 5.

**변환기가 지켜야 하는 것(정규화로 덮지 않는다).** 목록의 느슨함(`spread`), 순서 목록 시작 번호, 표 정렬, 이미지 title, 코드 언어와 meta, 링크 title, 하드 브레이크 위치, 제목 단계(h1~h6), NBSP(U+00A0).

**"고치지 않으면 쓰지 않음".** 에디터는 열 때의 ProseMirror 문서 JSON을 기억한다. 저장 직전에 지금 문서와 비교한다. 같으면 저장하지 않는다. 그래서 기존 글을 열어 보기만 하면 `draft.version`이 오르지 않고 마크다운도 그대로다. 이 동작은 브라우저 확인(9.4)에서 API로 검증한다.

### D2. 3단계 관리자 화면 범위 (사용자 결정 2026-11-08: a. 옛 화면 삭제 + 최소 목록)

**문제.** 2단계 D10으로 옛 관리자 화면은 로그인만 된다. 목록·대시보드는 지운 API를 불러 실패한다. 3단계 에디터를 열려면 글 ID가 필요하다. 어디서 고르는가.

| | **a. 옛 화면 전부 삭제 + 최소 서버 렌더 목록 (결정)** | b. 에디터 경로만 추가, 옛 화면은 그대로 |
|---|---|---|
| `/admin` | Astro 서버 렌더 목록 1장. 상태 탭 수(초안·발행·숨김), 제목, kind, 수정일, 링크. "새 글"·"새 노트" 버튼. 로그아웃. React 없음. 약 100줄 | 옛 대시보드 그대로(깨진 채) |
| 글 열기 | 목록에서 누른다 | 주소창에 `/admin/edit/<id>`를 직접 친다. ID는 Firestore 콘솔이나 API로 찾는다 |
| 지우는 것 | 옛 화면 20개 파일 약 4,800줄, 의존성 8개, `tsc` 오류 7개 | 옛 에디터 파일만(같은 주소를 새 에디터가 차지한다) |
| 5단계와 겹침 | 목록 100줄을 5단계가 버린다 | 없음 |
| `rebuild` 미리보기 | 로그인 → 목록 → 쓰기 → 발행이 끝까지 된다 | 주소를 알아야 쓴다 |

**권장 이유.** 3단계는 새 API를 실제로 쓰는 첫 화면이다. 사용자가 폰과 데스크톱에서 흐름 전체(계획 문서 9절 "쓰기 마찰" 측정)를 써 봐야 한다. 그 흐름의 입구가 없으면 검증이 반쪽이다. 100줄은 버려도 아깝지 않다.

**a를 고르면.** `/admin/posts`와 `/admin/edit?slug=`는 301로 `/admin`에 보낸다. `/admin/posts/new`는 `POST /api/admin/posts`를 서버에서 부르고 새 글 주소로 302한다. 로그인 페이지(`/admin/login`, `AdminLogin.tsx`)는 그대로 둔다.

### D3. 2.4 요구 중 넣는 것과 미루는 것 (사용자 결정 2026-11-08)

처음 제안은 6개를 모두 미루는 것이었다. 사용자 답으로 3개를 넣고, 나머지는 14절 상기 목록으로 옮겼다.

| 항목 | 답 | 3단계에서 하는 것 |
|---|---|---|
| 임베드 | **넣는다**(YouTube, CodeSandbox). 링크 카드는 미룬다 | 아래 "임베드" |
| 수식 | **넣는다** | 아래 "수식" |
| 이미지 폭 | **크기 선택은 넣는다**(변형 3종 중 고르기, 금방 된다). 임의 px 폭과 정렬은 미룬다(HTML 속성이 필요하다) | 아래 "이미지 크기", D11 9 |
| 찾기·바꾸기 | 미룬다 | 브라우저 `Mod+F`. 바꾸기는 소스 모드 |
| 키맵 저장·설정 UI | 5단계 | 레지스트리의 덮어쓰기 함수와 충돌 검사만(D9) |
| 드래그 핸들 | 미룬다. UX 가치를 나중에 다시 판단한다(14절) | 잘라내기·붙여넣기 |

**"공개 페이지 렌더러가 함께 바뀐다"의 뜻.** 공개 페이지 렌더러는 `/blog/<slug>`에서 Firestore의 마크다운을 HTML로 바꿔 그리는 코드다(`MarkdownPostView.tsx`, 1.2). 에디터는 마크다운을 쓰기만 한다. 독자는 렌더러가 만든 결과를 본다. 그래서 새 문법(임베드, 수식)은 두 곳이 모두 알아야 한다. 에디터만 알면 독자에게는 주소 한 줄, `$$` 글자로 보인다. 비용이 큰 일은 아니다. 3단계가 만드는 공유 파이프라인(4.3)에 플러그인을 넣으면 미리보기 모드가 바로 그리고, 4단계가 공개 페이지를 그 파이프라인으로 바꿀 때 그대로 받는다. 그 사이 `rebuild` 미리보기의 공개 페이지는 임베드를 링크로, 수식을 글자로 보인다. 운영에는 영향이 없다(병합 전에는 새 글을 발행하지 않는다).

**임베드.**

- 문법: 지원 주소 하나만 있는 단락. 예: 빈 줄에 `https://youtu.be/abc` 한 줄. 표준 마크다운이라 GitHub·백업 저장소에서는 링크로 보인다.
- 지원 제공자: YouTube(`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`), CodeSandbox(`codesandbox.io/s/`, `/p/`, `/embed/`). 그 밖 주소는 그냥 링크다.
- 에디터: 자체 노드 `embed { provider, url }`(atom). 빈 단락에 지원 주소를 붙여넣거나 입력하면 바뀐다. 노드 뷰는 iframe을 그린다. 지우면 노드만 사라진다. 소스 모드에는 주소만 보인다.
- 공유 파이프라인: `remark-embed`(자체, 약 80줄)가 그 단락을 `<iframe>`으로 바꾼다. `youtube-nocookie.com/embed/<id>`, `codesandbox.io/embed/<id>`. 허용 호스트 2개 밖은 만들지 않는다. `loading="lazy"`, `sandbox`, `referrerpolicy="strict-origin"`, 16:9 상자.
- 링크 카드(아무 주소나 제목·설명·이미지 카드로): 카드에 쓸 정보는 상대 사이트에서 가져와야 한다. 서버가 그 사이트를 읽는 API와 저장·갱신 규칙이 필요하다. 4단계 공개 렌더러 설계 때 다시 본다(14절).

**수식.**

- 문법: `$인라인$`, `$$블록$$`(remark-math 표준).
- 에디터: `@tiptap/extension-mathematics` + KaTeX. 공개 npm 범위(`@tiptap/`)의 3.33.0이다. 구독 표시가 없다. T1에서 라이선스를 다시 확인한다.
- 공유 파이프라인: `remark-math` + `rehype-katex`. KaTeX CSS는 에디터 페이지에만 넣는다. 공개 페이지는 4단계에서 수식이 있는 글에만 넣는다.
- 변환기: mdast `math`·`inlineMath` ↔ PM `blockMath`·`inlineMath`(4.2).

**이미지 크기.** 마크다운 이미지 문법 `![alt](url "title")`에는 폭 칸이 없다. 폭을 px로 적으려면 (a) 원시 HTML `<img width="600">`을 본문에 두거나 (b) 비표준 문법(`{width=600}`)을 만들어야 한다. (a)는 변환기와 공개 렌더러가 HTML 이미지를 계속 다뤄야 하고, (b)는 다른 도구에서 글자가 그대로 보인다. 둘 다 하루 이상의 일이고 구조를 흔든다. 대신 **금방 되는 방법**이 있다. 서버가 이미 이미지마다 변형 3종(w480, w960, 최대)을 만든다(2단계 D6). 주소가 곧 크기다. 이미지 노드 메뉴에서 작게·보통·크게를 고르면 `src`를 그 변형 주소로 바꾼다. 마크다운은 표준 그대로다. 공개 페이지는 지금 코드로도 그 크기로 보인다. 필요한 서버 변경은 자산 문서 읽기 API 하나(5절)다. 임의 px와 가운데·좌우 정렬은 4단계 렌더러 설계 때 다시 본다(14절).

**드래그 핸들.** 노션에는 있다(블록 왼쪽 ⋮⋮ 손잡이). 옵시디언 기본에는 없다(커뮤니티 플러그인으로만). Tiptap 3에는 공개 확장 `@tiptap/extension-drag-handle-react`가 있어 넣는 비용은 반나절 안이다. UX 가치 판단을 뒤로 미룬다(14절).

### D4. 마크다운 변환기: remark 위에 직접 만든다 (Claude 판단)

계획 문서 2.3은 "`tiptap-markdown` 또는 자체 serializer"라고 열어 두었다.

| | `@tiptap/markdown`(공식) | `tiptap-markdown`(커뮤니티) | **자체: mdast ↔ ProseMirror JSON (선택)** |
|---|---|---|---|
| 파서 | marked | markdown-it | remark-parse + remark-gfm. **공개 페이지와 같은 파서** |
| 성숙도 | 2025-10 첫 출시. 문서가 "early release, subject to change" | 2025-09 마지막 배포. Tiptap 3 peer는 받는다 | 우리가 유지한다 |
| 표 | 셀당 자식 1개 | 지원 | mdast `table`이 그대로다. 셀은 단락 1개 |
| 원시 HTML | Tiptap의 HTML 파서로 읽는다. 세부 동작은 문서에 없다 | 옵션 `html` | `<br>`만 받는다. 그 밖은 경고 뒤 텍스트로 둔다(1.1: 다른 HTML이 없다) |
| 직렬화 표기 제어 | 제한적 | `bulletListMarker`, `tightLists` 등 | remark-stringify 옵션 전부 |
| 테스트 | DOM이 필요하다(HTML 파싱 경로) | DOM이 필요하다 | JSON ↔ mdast라서 Node만으로 돈다 |
| 구현량 | 설정 + 커스텀 노드 훅 | 설정 + 커스텀 노드 규칙 | 노드 약 20종을 두 방향으로 변환. 어림 600~800줄 + 테스트 |
| 파서 불일치 위험 | marked와 remark가 다르게 읽는 경우, 에디터와 공개 페이지가 다른 문서를 보인다 | 같다(markdown-it) | 없다 |

**선택 이유.** 1절의 왕복 검사는 어차피 remark로 비교한다. 에디터도 remark로 읽으면 "에디터가 읽은 것 = 검사가 읽은 것 = 독자가 보는 것"이 된다. 변환 코드는 길지만 단순하다(노드 종류별 분기). DOM 없이 테스트할 수 있다. 공식 패키지는 아직 바뀔 수 있다고 스스로 밝힌다.

**뒤집는 조건.** T2에서 55편 중 통과하지 못하는 글이 생기고, 그 원인이 변환기 버그가 아니라 remark와 Tiptap 스키마의 구조 차이라면, 사용자에게 보고하고 `@tiptap/markdown`과 비교한다.

**변환 규칙(요약).** 상세는 4.2.

### D5. 저장 형식과 열기 순서 (Claude 판단)

계획 문서 2.3의 결정("마크다운이 원본, 에디터 JSON도 저장, 다음 편집은 JSON을 먼저 연다")을 이렇게 구현한다.

- `draft.markdown`: 변환기가 만든 마크다운. 공개 페이지와 백업이 읽는 원본이다.
- `draft.editorJson`: `{ v: 1, markdownSha256: "<hex>", doc: <ProseMirror JSON> }`. 2단계 스키마의 `editorJson: object | null`에 맞는다.
- 열 때: `editorJson`이 있고 `markdownSha256`이 지금 `draft.markdown`의 해시와 같으면 `doc`을 연다. 다르거나 없으면(기존 55편은 `null`) 마크다운을 파싱한다. 외부(운영 CMS 재동기화, 백업 복원)에서 마크다운을 고치면 JSON은 자동으로 버려진다.
- 저장할 때: `doc`에서 마크다운을 만들고, 그 해시를 적는다.
- 크기: 가장 긴 글(25 KB)의 JSON은 어림 3배다. 900 KB 한도에 닿지 않는다. 한도에 닿으면 서버가 413을 돌려준다. 화면은 "글이 너무 깁니다"로 보인다.
- 읽기 시간과 단어 수는 서버가 발행 때 `readingTime.ts`로 계산한다. 에디터는 같은 함수를 import해 패널에 보인다. 공식이 하나가 된다(1.2 #9).

### D6. 자동저장, 충돌, 오프라인 (Claude 판단)

| 항목 | 정한 값 | 이유 |
|---|---|---|
| 저장 시점 | 마지막 입력 2초 뒤. 저장 중이면 끝난 뒤 한 번 더. 페이지를 떠날 때 저장되지 않은 변경이 있으면 `beforeunload` 경고 | 2.4 |
| 저장 조건 | 문서 JSON 또는 메타가 열 때(또는 마지막 저장)와 다를 때만 | D1 (b) |
| 요청 | `PUT /api/admin/posts/{id}/draft` `{ baseVersion, device, draft }` | 2단계 6.3 |
| 성공 | `version`을 갱신. 상태 "저장됨 · 방금" | |
| 409 | 충돌 화면. 서버 초안의 `device`·`updatedAt`·`version`을 보이고 두 가지를 고르게 한다. **서버 것 열기**(내 변경은 소스 모드 텍스트로 클립보드에 복사할 수 있게 둔다) / **내 것으로 덮기**(`baseVersion`을 서버 `version`으로 바꿔 다시 보낸다) | A7. 자동으로 덮지 않는다 |
| 401 | `/admin/login?next=<지금 주소>`로 보낸다 | 세션 만료 |
| 413·400 | 저장 실패를 빨간 상태로 보이고 재시도 버튼 | |
| 오프라인 | `fetch` 실패 또는 `navigator.onLine === false`면 IndexedDB `drafts` 저장소에 글당 1칸(`{ id, baseVersion, draft, savedAt }`)으로 보관. 상태 "오프라인 · 기기에 보관됨". `online` 이벤트나 다음 저장 때 전송. 성공하면 칸을 지운다 | 2.4의 "큐"를 글당 1칸으로 줄였다. 중간 상태는 의미가 없고 마지막 상태만 있으면 된다 |
| 열 때 보관함 | 그 글의 칸이 있으면 먼저 묻는다. **보관한 것 이어 쓰기**(서버 `version`이 `baseVersion`과 같으면 그대로, 다르면 충돌 화면) / **버리기** | |
| 기기 이름 | `localStorage`의 `cruz-lab:device`. 처음에는 플랫폼에서 추정(`macbook`, `iphone`, `android`, `windows`). 메뉴에서 바꾼다. 60자 제한 | API `device` |

상태 전이는 순수 함수(리듀서)로 쓰고 단위 테스트한다. IndexedDB는 `fake-indexeddb`로 테스트한다.

### D7. 퍼지 방식: 글 상세는 삭제, 목록은 무효화 (Claude 판단)

2단계 작업 문서 8절 4: `invalidateByTag`는 캐시를 "오래됨"으로만 표시한다. 퍼지 뒤 첫 요청은 옛 응답(`STALE`)을 받는다. 에디터가 발행 직후 "공개 페이지 보기"를 열면 작성자가 옛 글을 본다.

| 태그 | 방식 | 이유 |
|---|---|---|
| `post-<id>`(글 상세) | `dangerouslyDeleteByTag` | 작성자가 바로 여는 주소. 첫 요청부터 새 내용이어야 한다. 비용은 그 요청 1회가 Firestore를 읽는 수백 ms다 |
| `posts`(홈, 목록, 태그, 연재, RSS, 사이트맵) | `invalidateByTag` 그대로 | 독자가 많이 여는 주소. 옛 응답을 주면서 뒤에서 새로 만드는 쪽이 빠르다. 다음 요청부터 새 내용이다 |

`src/lib/server/cdn-purge.ts` 한 곳만 바뀐다. 로컬에서는 지금처럼 `skipped`다. 미리보기에서 확인한다(9.5): 발행 직후 글 주소 첫 요청이 `MISS`이고 새 내용이다.

### D8. 보기 모드 3종 (Claude 판단)

| 모드 | 구현 | 비고 |
|---|---|---|
| 편집 | Tiptap | 기본. 마지막 모드는 `localStorage`에 기억한다 |
| 소스 | `<textarea>`, 모노스페이스, 자동 높이. 편집 모드로 돌아갈 때 다시 파싱한다 | CodeMirror를 쓰지 않는다. 소스 모드는 보조 경로다(원문 확인, 큰 덩어리 붙여넣기). 하이라이트가 필요해지면 그때 더한다 |
| 미리보기 | `markdownToHtml()`(공유 파이프라인) → `.prose` 안에 넣는다. 공개 페이지와 같은 토큰·클래스 | react-markdown과 같은 플러그인(remark-gfm, rehype-raw, rehype-highlight)을 쓴다. 영상 확장자 → `<video>`, 외부 링크 → 새 창도 같은 규칙으로 옮긴다 |

소스 모드에서 지원하지 않는 HTML을 넣으면 편집 모드로 돌아갈 때 경고 목록을 보인다("`<iframe>` 1개는 텍스트로 남습니다"). 파싱이 실패하는 일은 없다. 마크다운은 항상 파싱된다.

### D9. 명령 레지스트리와 키맵 (Claude 판단)

```ts
interface EditorCommand {
  id: string;                 // 'heading-2', 'bold', 'insert-image', …
  title: string;              // 한국어 표시 이름
  group: 'block' | 'mark' | 'insert' | 'view' | 'doc';
  keys: { mac: string; other: string } | null;   // 'Mod-Shift-2' 형식(Tiptap 표기)
  run: (editor: Editor) => boolean;
  isActive?: (editor: Editor) => boolean;
  inSlash: boolean;           // 슬래시 메뉴에 나오나
  inPalette: boolean;         // 명령 팔레트에 나오나
  icon: LucideIcon;
}
```

- 단축키: 레지스트리에서 Tiptap `addKeyboardShortcuts()`를 만든다. 코드 어디에도 키 문자열을 따로 쓰지 않는다.
- 슬래시 메뉴: `@tiptap/suggestion`. `/` 뒤 글자로 `title`과 `id`를 거른다. 방향키·Enter·Esc. 최근 사용 순은 `localStorage`.
- 명령 팔레트: `Mod+K`. 슬래시 메뉴와 같은 목록 컴포넌트, 다른 트리거.
- 툴바(데스크톱): 상단 한 줄. 레지스트리의 `group`별로 그린다.
- 사용자 키맵: `applyKeymapOverrides(commands, overrides)`와 `findKeyConflicts(commands)`를 순수 함수로 만들고 테스트한다. 맥/윈도 표기(`⌘⇧2` / `Ctrl+Shift+2`)도 순수 함수다. **저장과 설정 화면은 5단계다.** 3단계에서 `overrides`는 늘 빈 객체다.
- 기본 키(부록 B): `Mod+Alt`를 쓰지 않는다(2.2 #2). 노션·옵시디언 관례를 따른다. 제목은 `Mod+Shift+2/3/4`, 목록은 `Mod+Shift+7/8/9`, 인라인 코드 `Mod+E`, 코드 블록 `Mod+Shift+C`, 인용 `Mod+Shift+.`, 링크 `Mod+K`는 팔레트와 겹치므로 링크는 `Mod+Shift+K`. 구조 만들기는 입력 규칙이 주된 길이다.

### D10. 블록 세트와 문법 (Claude 판단)

| 블록 | 확장 | 마크다운 | 비고 |
|---|---|---|---|
| 제목 | StarterKit Heading, `levels: [1..6]` | `#`~`######` | 스키마는 1~6(기존 글 h1 7, h4 35, h5 2). UI(툴바·슬래시·단축키)는 2·3·4만 내놓는다. h1은 글 제목이 맡는다 |
| 단락, 굵게, 기울임, 취소선, 인라인 코드, 링크, 하드 브레이크, 구분선 | StarterKit | 표준 | 링크는 `title` 보존. 하드 브레이크는 `\` 줄 끝으로 쓴다 |
| 목록(순서·비순서), 체크 목록 | StarterKit 목록 + `@tiptap/extension-list`의 TaskList·TaskItem | `-`, `1.`, `- [ ]` | 목록 노드에 `spread`(느슨함) 속성을 둔다. 새 목록은 빽빽하다. 순서 목록 `start` 보존 |
| 인용 | StarterKit Blockquote | `>` | 기존 `> 💡` 인용은 그대로 둔다. 변환하지 않는다 |
| 콜아웃 | 자체 노드 `callout` `{ type: 'note' \| 'tip' \| 'warning' }` | `> [!note]` 첫 줄 + 인용 본문(GitHub 알림 문법) | 공유 파이프라인에 콜아웃 플러그인을 넣어 미리보기에서 그린다. 4단계 공개 렌더러가 같은 플러그인을 쓴다 |
| 코드 블록 | `@tiptap/extension-code-block-lowlight` + lowlight | ```` ```lang meta ```` | 언어 선택 드롭다운. 등록 언어: 1.1의 12종 + bash, json, yaml, sql, go, rust, swift, kotlin. 공개 페이지의 rehype-highlight와 같은 엔진(highlight.js)이라 결과가 같다 |
| 표 | `@tiptap/extension-table`(TableKit) | GFM 표 | 셀 안은 단락 1개(마크다운 제약). 열 정렬은 표 노드 속성 `align[]`. 행·열 추가·삭제 메뉴 |
| 이미지 | `@tiptap/extension-image`, `inline: true` | `![alt](url "title")` | 단락 안 노드로 둔다. 그래야 `<p><img></p>`가 원문과 같다. `alt`와 `title`(캡션) 편집. 크기는 변형 3종 중 선택(D11 9). 임의 px 폭 없음(D3) |
| 영상 | 이미지 노드에 영상 주소 | `![alt](….webm)` | 공개 페이지가 확장자로 `<video>`를 그린다. 에디터도 같은 규칙으로 미리 그린다 |
| 임베드 | 자체 노드 `embed { provider, url }`(atom) | 지원 주소 하나만 있는 단락 | YouTube·CodeSandbox. `<iframe>`은 허용 호스트 2개만. `sandbox`, `loading="lazy"`. 그 밖 주소는 링크 그대로(D3) |
| 수식 | `@tiptap/extension-mathematics` + KaTeX | `$인라인$`, `$$블록$$` | 공유 파이프라인은 remark-math + rehype-katex. KaTeX CSS는 에디터 페이지에만. 공개 페이지는 4단계(D3) |
| 원시 HTML | 없음 | `<br>`만 하드 브레이크로 읽는다 | 1.1: 다른 HTML이 없다. 지원하지 않는 HTML은 열 때 경고 목록에 보이고 텍스트로 남는다 |

줄 안 줄바꿈(soft break)은 공백 하나로 읽는다. 공개 페이지가 그렇게 그린다. 다시 쓸 때 줄이 합쳐진다(렌더는 같다).

### D11. 이미지 업로드 흐름 (Claude 판단)

1. 트리거: 드롭, 클립보드 붙여넣기(파일), 파일 선택(슬래시 `/이미지`, 툴바), 표지 선택(메타 패널). 여러 장 동시.
2. 검사: 형식(png·jpeg·webp·gif·webm·mp4)과 크기(이미지 20 MB, 영상 100 MB)를 클라이언트가 먼저 본다. 틀리면 서버에 묻지 않고 알린다.
3. 자리표시: 문서에 이미지 노드를 `src=blob:`으로 넣고 `uploading` 속성과 진행률을 보인다. 저장은 업로드가 끝날 때까지 그 노드를 건너뛰지 않는다. 대신 자동저장을 멈춘다(업로드 중인 노드는 마크다운에 쓸 수 없다).
4. `POST /api/admin/assets/upload-url` `{ fileName, contentType, bytes, sha256 }`. SHA-256은 Web Crypto. `existing`이면 그 주소를 바로 쓴다.
5. `PUT uploadUrl`(헤더 `Content-Type`만). `XMLHttpRequest`로 진행률을 받는다. **버킷 CORS(E2)가 없으면 여기서 실패한다.**
6. `POST /api/admin/assets/{id}/finalize` → `asset.url`(가장 큰 변형). 노드의 `src`를 바꾸고 `blob:`을 해제한다. 자동저장을 다시 켠다.
7. 실패: 노드에 "다시 시도" 버튼. 같은 파일 객체로 4부터 다시 한다. 포기하면 노드를 지운다.
8. 붙여넣은 HTML의 원격 `<img src="https://…">`는 주소를 그대로 둔다(복사하지 않는다). 기존 글의 GitHub·velog 이미지 52개와 같은 상태다.
9. 크기 선택(D3 답): 이미지 노드 메뉴에서 작게(w480)·보통(w960)·크게(최대 변형, 기본)를 고른다. `src`를 그 변형 주소로 바꾼다. 마크다운은 표준 이미지 문법 그대로다. 글을 다시 열면 주소에서 Storage 경로와 자산 ID를 읽고(`asset-refs.ts`, 2단계) `GET /api/admin/assets/{id}`로 있는 변형을 확인한다(원본이 작으면 w1600이 없다). legacy 이미지와 외부 주소 이미지는 메뉴가 비활성이다. 4단계 `srcset` 규칙: 최대 변형 주소만 `srcset`을 만들고, 작성자가 고른 w480·w960 주소는 그대로 둔다.

### D12. 모바일 (Claude 판단)

- 기준 폭 390px. 본문이 화면 전부다. 메타 패널은 아래에서 올라오는 시트다.
- 키보드 위 고정 툴바: 굵게, 제목(2·3 순환), 목록, 인용, 이미지, 되돌리기, 메타 열기. 위치는 `window.visualViewport`의 `height`·`offsetTop`으로 맞춘다. iOS Safari에서 흔들리면 하단 고정으로 떨어뜨린다.
- 자동저장만 한다. 발행 버튼은 메타 시트 안에 있다(5.2 "발행 토글").
- 단축키·슬래시 메뉴는 그대로 있다(외장 키보드). 긴 누르기 메뉴는 없다.
- 확인은 iOS 시뮬레이터(사용 가능) 또는 사용자 iPhone으로 한다.

### D13. 레이아웃, 테마, 행동 위계 (M7, M9, M10) (Claude 판단)

- 에디터 페이지는 사이트 헤더·푸터 없이 전체 화면이다. `global.css`를 가져와 토큰과 `html.light` 전환을 그대로 쓴다. 자체 `<html>`에 `bg-white`를 두지 않는다(M10).
- 열면 제목 입력과 본문이 첫 화면이다(M7). 데스크톱은 오른쪽 320px 패널: 상태(초안·발행·숨김, 발행 뒤 변경 있음), 설명, slug(제목에서 제안 버튼), 카테고리, 태그(최대 3), 연재 key·순서, 표지(생성 / 이미지), 개요(제목 트리, 누르면 이동), 글자 수·읽기 시간. 패널은 접힌다.
- 상단 바: 왼쪽 "← 목록", 가운데 저장 상태("저장됨 · 방금 · macbook", "저장 중", "오프라인 · 기기에 보관됨", "저장 실패"), 오른쪽 **발행** 버튼과 ⋯ 메뉴(M9). 메뉴: 소스 모드, 미리보기, 공개 페이지 보기, 숨기기/다시 보이기, 초안 버리기, 삭제, 기기 이름, 로그아웃.
- 발행: `POST publish` `{ draftVersion }`. 422면 항목별 이유를 패널의 해당 칸에 붙인다. 성공하면 "발행됨 · 공개 페이지 보기(새 창)" 토스트. `purge: 'failed'`나 `backup: 'failed'`면 토스트에 함께 적는다.
- 삭제: 확인 대화상자에 글 제목을 보이고 "삭제" 버튼을 두 번(두 번째는 빨간색). API `confirm`에 글 ID를 넣는다. 끝나면 목록으로 간다.
- 초안 버리기: 발행본이 없으면(draft) 메뉴에 나오지 않는다.
- 노트(`kind: 'note'`): 같은 에디터. 패널에 "제목·설명·카테고리는 선택"이라고 보인다. 발행하면 공개 주소가 없다고 알린다(4단계).
- 리렌더: Tiptap 상태는 에디터 안에만 있다. 패널은 `onUpdate`를 300ms 디바운스한 요약(제목 목록, 글자 수)만 받는다(2.2 #5).

## 4. 에디터 구조

### 4.1 파일

```
src/editor/
  index.ts                    # 공개 API: createEditorExtensions(), EditorApp
  extensions/                 # Tiptap 확장 묶음 = 스키마
    index.ts                  # StarterKit 설정, Image(inline), TableKit, CodeBlockLowlight, TaskList, Callout, Embed, Mathematics, 목록 spread 속성
    callout.ts                # 콜아웃 노드
    embed.ts                  # 임베드 노드(YouTube · CodeSandbox), 주소 판정
    lowlight.ts               # 등록 언어
  markdown/
    to-doc.ts                 # mdast → ProseMirror JSON
    from-doc.ts               # ProseMirror JSON → mdast
    index.ts                  # markdownToDoc(md), docToMarkdown(doc), 경고 목록
  commands/
    registry.ts               # EditorCommand 타입, 기본 명령 목록
    keymap.ts                 # 덮어쓰기·충돌 검사·표기 (순수 함수)
    shortcuts.ts              # 레지스트리 → Tiptap 확장
    SlashMenu.tsx, CommandPalette.tsx, CommandList.tsx
  state/
    autosave.ts               # 상태 기계 (순수 리듀서)
    offline-store.ts          # IndexedDB 글당 1칸
    api.ts                    # /api/admin/* fetch 래퍼, 오류 형식
    device.ts                 # 기기 이름
  upload/
    upload-client.ts          # sha256 → upload-url → PUT → finalize
    paste-drop.ts             # 드롭·붙여넣기 → 업로드 → 노드 교체
  ui/
    EditorApp.tsx             # 페이지 루트. 글 불러오기, 모드, 저장, 발행
    TopBar.tsx, MetaPanel.tsx, MobileBar.tsx, Outline.tsx, SourceMode.tsx, PreviewMode.tsx,
    ConflictDialog.tsx, OfflineRestoreDialog.tsx, ImageNodeView.tsx, Toolbar.tsx
  editor.css                  # 편집 영역 타이포(공개 .prose와 같은 변수)
src/lib/content/
  markdown.ts                 # 공유 파이프라인: parseMarkdown, markdownToHtml, normalizeForCompare
  remark-callout.ts           # > [!note] 플러그인
  remark-embed.ts             # 지원 주소 단락 → iframe (허용 호스트 2개)
src/pages/admin/
  index.astro                 # 최소 목록 (D2 a)
  edit/[id].astro             # 에디터 페이지 (client:only)
  posts/new.astro             # 빈 초안 생성 → 302
  login.astro                 # 그대로
src/pages/api/admin/assets/[id]/index.ts   # GET 자산 문서 (3단계 추가, 읽기만)
scripts/smoke/stage3-roundtrip.mjs   # 55편 왕복 검사 (entries 읽기 전용)
tests/unit/editor-*.test.ts
tests/fixtures/markdown/*.md         # 문법 항목별 짧은 fixture
```

### 4.2 마크다운 변환 규칙

| mdast | ProseMirror | 보존 속성 |
|---|---|---|
| `root` | `doc` | |
| `paragraph` | `paragraph` | |
| `heading` | `heading` | `level` |
| `text` | `text` | ZWSP 제거. `\n`(soft break)은 공백 |
| `strong` `emphasis` `delete` `inlineCode` | 마크 `bold` `italic` `strike` `code` | |
| `link` | 마크 `link` | `href`, `title` |
| `image` | `image`(inline) | `src`, `alt`, `title` |
| `blockquote` | `blockquote` 또는 `callout`(첫 단락이 `[!type]`로 시작할 때) | `type` |
| `list` | `bulletList` / `orderedList` / `taskList`(항목에 `checked`가 있을 때) | `spread`, `start` |
| `listItem` | `listItem` / `taskItem` | `checked` |
| `code` | `codeBlock` | `language`(=`lang`), `meta` |
| `thematicBreak` | `horizontalRule` | |
| `break` | `hardBreak` | |
| `html` `<br>`·`<br />`·`</br>` (줄 안) | `hardBreak` | |
| `html` `<br …>` (블록) | 없음(버린다) | D1 정규화 2 |
| `html` 그 밖 | `text`(그대로) + 경고 | 1.1: 기존 글에 없다 |
| `table` `tableRow` `tableCell` | `table` `tableRow` `tableCell`/`tableHeader`(첫 행) | `align[]` |
| `math` / `inlineMath`(remark-math) | `blockMath` / `inlineMath` | `latex` |
| 지원 임베드 주소 링크 하나만 담은 `paragraph` | `embed` | `provider`, `url` |
| `footnoteDefinition` 등 지원하지 않는 노드 | `text` + 경고 | 0건 |

역방향은 같은 표를 거꾸로 간다. remark-stringify 옵션: `bullet: '-'`, `rule: '-'`, `emphasis: '_'`, `strong: '*'`, `fences: true`, `listItemIndent: 'one'`, `incrementListMarker: true`. 콜아웃은 `> [!type]` 첫 줄을 더한 blockquote로 쓴다.

### 4.3 공유 파이프라인 `src/lib/content/markdown.ts`

```ts
parseMarkdown(md): Root                 // remark-parse + remark-gfm + remark-math
markdownToHtml(md): string              // + remark-callout + remark-embed + remark-rehype(allowDangerousHtml) + rehype-raw
                                        //   + rehype-katex + rehype-highlight + 영상 확장자 → <video> + 외부 링크 target + rehype-stringify
normalizeForCompare(md): string         // D1 정규화 1~5 뒤 hast → 문자열
```

브라우저(미리보기)와 Node(테스트, 스크립트, 4단계 서버)에서 같이 돈다. 4단계는 `rehype-highlight`를 Shiki로 바꾼다.

### 4.4 데이터 흐름

```
GET /api/admin/posts/{id} ──▶ editorJson 해시 일치? ──예──▶ doc
                                     └─아니오──▶ markdownToDoc(draft.markdown) → doc + 경고 목록
편집 ──2초──▶ 변경 있음? ──▶ docToMarkdown(doc) + editorJson ──▶ PUT draft { baseVersion }
                                                                  ├─ 200: version 갱신
                                                                  ├─ 409: 충돌 화면
                                                                  └─ 실패·오프라인: IndexedDB 1칸
발행 ──▶ POST publish { draftVersion } ──▶ 422: 항목 표시 / 200: 공개 페이지 보기
이미지 ──▶ sha256 ──▶ upload-url ──▶ PUT Storage(CORS) ──▶ finalize ──▶ src 교체
```

## 5. 2단계 API 대응표

화면 동작마다 부르는 API와 코드 확인 결과다. 모두 2026-11-08 코드로 확인했다.

| 화면 동작 | API | 확인한 것 |
|---|---|---|
| 목록(D2 a) | 서버에서 `listEntriesForAdmin()` 직접 호출 | `counts`와 `items`(제목·slug·분류는 초안 값, `hasUnpublishedChanges`, `draftDevice`) |
| 새 글·새 노트 | `POST /api/admin/posts { kind }` → 201 `{ id, draft: { version: 1 } }` | `CREATABLE_KINDS = ['post', 'note']` |
| 열기 | `GET /api/admin/posts/{id}` | `draft`(editorJson 포함), `published`, `status`, 날짜, `hasUnpublishedChanges`. 404면 목록으로 |
| 자동저장 | `PUT …/draft { baseVersion, device, draft }` | 200 `{ version, updatedAt }`. 409 `details.draft`는 서버 초안 전체 + `version`·`device`·`updatedAt`. 400 태그 4개 이상. 413 900 KB 초과(editorJson 포함) |
| 초안 버리기 | `POST …/draft/discard { baseVersion }` | 발행본 없으면 409 `NOT_PUBLISHED`. 응답의 새 `version`으로 문서를 다시 연다 |
| 발행 | `POST …/publish { draftVersion }` | 409(버전 다름), 422 `details[{field,message}]`, 200 `{ revision, publicUrl \| null, purge, backup, assetUsage }` |
| 숨김·다시 보임 | `POST …/visibility { visible }` | 200 `{ status, changed, purge }`. 초안 상태면 409 |
| 삭제 | `DELETE …/{id} { confirm: id }` | 200 `{ deleted, orphanedAssets, purge, backup }` |
| 이미지 | `POST /api/admin/assets/upload-url` → PUT → `POST …/{id}/finalize` | 6.4대로. `requiredHeaders`만 PUT 헤더에 넣는다 |
| 이미지 크기 선택 | `GET /api/admin/assets/{id}` → `{ asset }` | **3단계에 더하는 유일한 API.** 2단계에는 없다. `serializeAsset`을 그대로 쓴다. 읽기만 한다. `withAdminApi`로 감싼다 |
| 로그아웃 | `DELETE /api/admin/session` | 쿠키만 지운다. `?all=1`은 쓰지 않는다 |

## 6. 지우는 것

### 6.1 파일 (D2 a 기준)

| 파일 | 줄 | 이유 |
|---|---|---|
| `src/components/editor/` 전부: `FullScreenEditor.tsx` 788, `CodeMirrorEditor.tsx` 577, `CodeMirrorEditor.css` 547, `PublishModal.tsx` 458, `EditorMetaPanel.tsx` 335, `UploadProgress.tsx` 205, `media-upload-client.ts` 197, `EditorOverlays.tsx` 157, `EditorPage.tsx` 32, `upload-types.ts` 27 | 3,323 | 새 에디터가 대체 |
| `src/components/admin/PostList.tsx` 579, `AdminDashboard.tsx` 359, `AdminLayout.tsx` 125, `AdminGuard.tsx` 13 | 1,076 | 최소 목록이 대체. `AdminLogin.tsx`는 남긴다 |
| `src/hooks/useAdminAuth.ts` | | 옛 화면만 쓴다. 로그인 화면은 `firebase-auth-client.ts`를 직접 쓴다 |
| `src/lib/markdown-publish.ts` 273, `editor-drafts.ts` 89, `publish-status.ts` 21, `publish-verification.ts` 15, `publish-feedback.ts` 32 | 430 | 2단계 Plan 6.5가 "3·5단계에서 지운다"고 한 lib 4개 + 옛 frontmatter 조립 |
| `src/pages/admin/edit.astro`, `posts/index.astro` | | 새 페이지로 대체. `posts/new.astro`는 내용을 바꾼다 |
| `docs/cms-rebuild-tracker.md`, `docs/editor-engine-evaluation.md` | | 계획 문서 10.3 |
| `scripts/evaluate-markdown-pipeline.mjs`, `fixtures/editor-roundtrip-stress.md`, `package.json`의 `editor:evaluate` | | 옛 파이프라인 평가 도구. 새 fixture는 `tests/fixtures/markdown/` |

지우기 전에 파일마다 import·호출이 없는지 다시 grep한다(1단계 규칙).

### 6.2 의존성

| 지운다 | 이유 |
|---|---|
| `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/state`, `@codemirror/view`, `@lezer/highlight`, `@uiw/react-codemirror` | 소스 모드는 textarea(D8) |
| `browser-image-compression` | 변형은 서버가 만든다(2단계 D6) |
| `remark-breaks` | 어디서도 쓰지 않는다 |

| 더한다 | 용도 |
|---|---|
| `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-list`, `@tiptap/extension-table`, `@tiptap/extension-image`, `@tiptap/extension-code-block-lowlight`, `@tiptap/suggestion`, `@tiptap/extensions`(Placeholder, CharacterCount) | 에디터. 모두 같은 버전으로 고정한다 |
| `lowlight` | 코드 하이라이트(highlight.js) |
| `@tiptap/extension-mathematics`, `katex`, `remark-math`, `rehype-katex` | 수식(D3 답) |
| `unified`, `remark-parse`, `remark-stringify`, `remark-rehype`, `rehype-stringify`, `@types/mdast`, `@types/hast` | 변환기와 공유 파이프라인. `remark-gfm`, `rehype-raw`, `rehype-highlight`는 이미 있다 |
| `fake-indexeddb`(dev) | 오프라인 보관함 테스트 |

`react-markdown`은 공개 페이지가 쓰므로 4단계까지 남긴다.

## 7. 작업 순서

구현은 새 세션에서 한다(전역 7번 규칙). 각 작업은 검증까지 끝낸다.

| # | 작업 | 의존 | 외부 변경 |
|---|---|---|---|
| T1 | 기반: 의존성, `src/editor/extensions`(스키마. 콜아웃·임베드·수식 노드 포함), 공유 파이프라인(4.3. 콜아웃·임베드·수식 플러그인 포함), 변환기(4.2), 문법 항목별 fixture와 단위 테스트, 정규화·비교 함수 | — | — |
| T2 | 왕복 검사 스크립트 `stage3-roundtrip.mjs`(entries 읽기 전용, 55편 판정, 보고서) → **55/55 통과까지 변환기 수정** → 보고서를 작업 문서에 적는다 | T1 | — |
| T3 | 에디터 페이지: `/admin/edit/[id]`, `EditorApp`, 레이아웃(D13), 메타 패널, 열기(D5), 자동저장·충돌·오프라인(D6), 발행·숨김·초안 버리기·삭제, 상태 표시 | T1 | — |
| T4 | 이미지 업로드(D11), 크기 선택(D11 9), `GET /api/admin/assets/{id}`, 표지 | T3 | E2(검증 때) |
| T5 | 명령 레지스트리·키맵·단축키·슬래시·팔레트·툴바(D9), 입력 규칙, 임베드 붙여넣기 규칙과 노드 뷰, 수식 입력, 모바일 툴바(D12), 개요·글자 수·읽기 시간 | T3 | — |
| T6 | 보기 모드 3종(D8) | T3 | — |
| T7 | 최소 목록 `/admin`, `posts/new` 흐름, 옛 주소 301(D2 a). 옛 화면·lib·훅·의존성·옛 문서·평가 스크립트 삭제(6절). `tsc` 재집계 | T3 | — |
| T8 | 퍼지 방식(D7) | — | — |
| T9 | E2 버킷 CORS(사용자 확인) → 브라우저 확인(9.4) → 미리보기 확인(9.5) | T4~T8 | E2, 시험 데이터 |
| T10 | 작업 문서, 진행 기록 11.6, 이 Plan에 "구현과 다른 것" 추가 | 모두 | — |

- PR은 세 개다. **PR-A**: T1·T2(화면 없음, 공개 페이지 변화 없음). **PR-B**: T3·T4·T6·T8(에디터 페이지와 옛 에디터 파일 삭제). **PR-C**: T5·T7(명령·모바일, 최소 목록, 나머지 옛 화면 삭제, 문서 정리). T9는 PR-C 브랜치에서, T10은 2단계처럼 문서 PR로 한다. 모두 대상은 `rebuild`다.
- PR-A를 병합하기 전에 태그 `rebuild-pre-stage3`(`4f9baef`)를 단다.
- T3과 T5는 같은 파일(`EditorApp.tsx`)을 건드린다. 나란히 하지 않는다. T8은 독립이라 아무 때나 한다.

## 8. 검증 방법

### 8.1 자동 검사

| 항목 | 기준 |
|---|---|
| `pnpm lint`, `pnpm build` | 통과 |
| `pnpm test` | 112개 + 새 테스트 통과. 대상: 변환기(문법 항목별 fixture, 양방향, 수식·임베드 포함), 정규화·비교, 명령 레지스트리·키맵(충돌, 표기, 덮어쓰기), 자동저장 리듀서, 오프라인 보관함(fake-indexeddb), 업로드 클라이언트 상태(fetch 가짜), 콜아웃·임베드 플러그인(허용 호스트 밖은 링크 그대로) |
| `tsc --noEmit` | 새 오류 0. 9 → 1(`TextReveal`, 4단계에서 지운다). 남은 수를 기록한다 |
| 번들 | `pnpm build` 출력에서 `/admin/edit` 청크 크기를 기록한다(목표 없음, 기록만). 공개 페이지 청크는 바뀌지 않는다 |

### 8.2 왕복 검사 (`scripts/smoke/stage3-roundtrip.mjs`)

- `entries` 55편을 Admin SDK로 읽는다(읽기만). 글마다 `markdownToDoc` → `docToMarkdown` → `normalizeForCompare(원문) === normalizeForCompare(결과)`.
- 통과 기준: 55/55. 실패 글은 첫 차이 위치와 양쪽 조각을 보고서에 적는다.
- 경고(지원하지 않는 HTML 등)가 0건이어야 한다. 1.1에 따르면 0건이다.
- 두 번 왕복(결과를 다시 넣기)해도 같은 마크다운이 나온다(안정성).
- 보고서 요약(통과 수, 글머리·구분선·ZWSP 변화 수)을 작업 문서에 적는다.

### 8.3 API 스모크 (`scripts/smoke/stage2-api.mjs` 재실행)

- 2단계 스모크를 그대로 돌려 API가 바뀌지 않았음을 확인한다(104건). D7은 로컬에서 `skipped`라 영향이 없다.

### 8.4 브라우저 확인 (localhost, 사용자 로그인)

시험 글만 쓴다. 기존 글은 "열기"와 "변경 없이 닫기"만 한다. 저장·발행하지 않는다.

| # | 시나리오 | 확인 |
|---|---|---|
| 1 | 기존 글(표·이미지·코드가 있는 글) 열기 | 첫 화면이 본문이다(M7). 메타는 오른쪽(또는 접힘). 경고 0건 |
| 2 | 1의 글을 바꾸지 않고 닫기 | `GET /api/admin/posts/{id}`의 `draft.version`과 `updatedAt`이 그대로다(D1 b) |
| 3 | 새 글 → 제목·본문 입력 → 2초 | 상태 "저장됨". API `version` 2 이상. `hasUnpublishedChanges` true가 목록에 보인다 |
| 4 | 같은 글을 탭 2개에서 열고 양쪽에서 고치기 | 늦은 쪽이 충돌 화면. "서버 것 열기"와 "내 것으로 덮기" 둘 다 동작 |
| 5 | DevTools 오프라인 → 고치기 → 온라인 | "오프라인 · 기기에 보관됨" → 복귀 뒤 "저장됨". 새로고침해도 내용이 있다 |
| 6 | 이미지 드롭 2장(E2 뒤) | 진행률 → `assets/{id}/w….webp` 주소. 같은 파일을 다시 드롭하면 업로드 없이 바로 들어간다(`existing`) |
| 7 | 입력 규칙 `## `, `> `, ```` ``` ````, `- [ ] `. 슬래시 `/표`, `/콜아웃`. `Mod+K` 팔레트. `Mod+Shift+2` | 모두 레지스트리의 같은 명령이 돈다 |
| 8 | 소스 모드에서 `<iframe>` 붙여넣기 → 편집 모드 | 경고 1건, 텍스트로 남음. 마크다운 고친 것은 반영됨 |
| 9 | 미리보기 | 공개 페이지(`/blog/<slug>`)와 같은 모양(콜아웃 포함) |
| 10 | 빈 글 발행 | 422. 제목·설명·slug·카테고리·본문 칸에 이유가 붙는다 |
| 11 | 채우고 발행 | 토스트에 공개 주소. 열면 새 글. `purge: skipped`(로컬) |
| 12 | 숨기기 → 공개 404 → 다시 보이기 → 200. 초안 버리기 → 본문이 발행본으로 돌아감 | |
| 13 | 삭제 | 확인 2회. 목록으로 이동. 목록에 없다 |
| 14 | 390px(ego-browser 기기 모드 또는 iOS 시뮬레이터) | 본문만 보임. 포커스하면 키보드 위 툴바. 자동저장 동작. 메타 시트 열림 |
| 15 | 라이트 테마 전환 | 에디터 전체가 라이트 토큰(M10). 흰 바탕 고정 없음 |
| 16 | 노트 새로 만들기 → 본문만 쓰고 발행 | 성공. 공개 주소 없음 안내 |
| 17 | 빈 줄에 YouTube 주소 붙여넣기. 다른 사이트 주소도 붙여넣기 | 앞은 임베드 블록(미리보기에서 `youtube-nocookie` iframe). 뒤는 링크 그대로. 소스 모드에는 주소만 |
| 18 | `$$` 입력 → 수식 쓰기 | 편집·미리보기 모두 KaTeX로 그려진다. 소스 모드에 `$$…$$`. 저장 뒤 다시 열어도 같다 |
| 19 | 업로드한 이미지에서 크기 "작게" | `src`가 w480 주소로 바뀐다. 미리보기와 공개 페이지에서 작게 보인다. 기존 글의 legacy 이미지는 메뉴 비활성 |

### 8.5 `rebuild` 미리보기 (E2 뒤)

1. 관리자 로그인 → 목록 → 새 글 → 이미지 1장 업로드(미리보기 origin의 CORS 확인) → 발행.
2. 글 주소 첫 요청이 `x-vercel-cache: MISS`이고 새 내용이다(D7). `/blog`는 첫 요청 `STALE`, 다음 `HIT`에 새 글.
3. 다시 발행(본문 수정) → 글 주소 첫 요청이 새 내용이다.
4. 삭제 → 남은 데이터 0(`entries`, `publishLog`는 Admin SDK로 지운다, 2단계와 같다). 백업 커밋은 다음 예약 실행이 정리한다.

### 8.6 운영 무영향

운영 페이지 그대로. 규칙·인덱스 배포 시각 그대로. 버킷 CORS는 PUT 사전 요청에만 영향을 준다. 공개 읽기(GET)는 지금도 `*`다.

## 9. 롤백 방법

### 9.1 코드

- PR-A 병합 전에 태그 `rebuild-pre-stage3`(`4f9baef`)를 단다.
- 되돌릴 때는 `rebuild`에서 병합 커밋을 `git revert -m 1`로 되돌린다.
- 운영(main)은 3단계 코드를 갖지 않는다.

### 9.2 데이터

| 상황 | 방법 |
|---|---|
| 에디터가 기존 글의 초안을 잘못 썼다 | 더하기만 했다. `draft`만 바뀌고 `published`는 그대로다. 초안 버리기(API)로 발행본으로 되돌린다. 발행본이 없는 글(에세이 1편)은 B1 덤프나 백업 저장소 `drafts/`에서 넣는다 |
| 시험 글 | 끝에 지운다. 남은 데이터 0을 확인한다 |
| `editorJson` | 지워도 된다. 없으면 마크다운에서 다시 만든다(D5) |

### 9.3 외부 설정

E2는 설정 전 값을 저장한다(지금은 빈 배열). 되돌릴 때 `bucket.setCorsConfiguration([])`.

## 10. 외부 변경 목록 (각각 사용자 확인 뒤에 한다)

| # | 변경 | 시점 | 하는 사람 | 되돌리기 |
|---|---|---|---|---|
| E2 | Storage 버킷 CORS. origin `http://localhost:4321`, `https://cruz-lab-git-rebuild-crucialsubs-projects.vercel.app`, `https://www.cruzlab.dev`. method `PUT`. responseHeader `Content-Type`. maxAge 3600 | T9 | Claude(Admin SDK `setCorsConfiguration`) | 이전 값(빈 배열)으로 |
| 시험 데이터 | 8.4·8.5의 시험 글·자산 생성·삭제 | T9 | Claude | 끝에 모두 지운다 |

3단계는 규칙·인덱스·함수·환경 변수를 바꾸지 않는다. 새 비밀값이 없다.

2단계에서 남은 것(3단계 작업이 아님): 원격의 병합 끝난 브랜치 삭제(사용자 확인), E6 Secret Manager `GITHUB_TOKEN` 삭제.

## 11. 위험과 대응

| 위험 | 대응 |
|---|---|
| 왕복 검사가 55편 전부를 통과하지 못한다 | 원인이 변환기면 고친다. 구조 차이면 D4의 뒤집는 조건대로 보고한다. 정규화 규칙은 데이터로 설명되는 것만 더한다 |
| 한글 IME 조합 중 입력 규칙이 잘못 발화한다 | 입력 규칙 트리거는 ASCII와 공백뿐이다. 조합 중(`composing`)에는 자동저장과 입력 규칙을 건드리지 않는다. 8.4 #7에 한글 문장 입력을 포함한다 |
| iOS Safari에서 키보드 위 툴바가 흔들린다 | `visualViewport` 기준. 안 되면 하단 고정(D12) |
| 에디터 번들이 크다 | lowlight는 등록 언어만. Tiptap은 쓰는 확장만. 에디터 코드는 `/admin/edit`에서만 내려받는다(`client:only`). 크기를 기록한다 |
| 기존 글을 처음 고칠 때 마크다운 표기가 크게 바뀐다(`*` → `-`, ZWSP 삭제) | 의도한 결과다. 렌더는 같다(D1). 백업 저장소 diff가 커 보일 수 있다고 작업 문서에 적는다 |
| 지원하지 않는 HTML이 있는 글을 저장하면 그 HTML이 텍스트가 된다 | 열 때 경고 목록을 보인다. 기존 글에는 없다. 소스 모드로 확인할 수 있다 |
| `@tiptap/*` 버전 불일치 | 모두 같은 버전을 정확히 고정한다. renovate 없음 |
| 업로드 중 자동저장이 `blob:` 주소를 쓴다 | 업로드 중에는 자동저장을 멈춘다(D11 3). 페이지를 떠나면 경고 |
| 두 기기에서 동시에 쓴다 | 409 충돌 화면(D6). 자동으로 덮지 않는다 |
| 세션 만료 중 저장 | 401이면 보관함에 두고 로그인으로 보낸다. 돌아오면 보관함 복원 대화상자 |
| `dangerouslyDeleteByTag`가 미리보기에서 다르게 동작한다 | 8.5에서 헤더로 확인한다. 안 되면 `invalidateByTag`로 되돌린다(한 줄) |
| 임베드 iframe이 외부 스크립트를 들인다 | 허용 호스트는 `youtube-nocookie.com`, `codesandbox.io` 둘뿐이다. `sandbox="allow-scripts allow-same-origin allow-presentation"`, `referrerpolicy="strict-origin"`. 그 밖 주소는 링크다. 주소 판정은 순수 함수로 테스트한다 |
| KaTeX가 번들을 키운다 | 에디터 페이지에서만 불러온다. 공개 페이지는 4단계에서 수식이 있는 글에만 CSS·폰트를 넣는다 |

## 12. 사용자가 답할 결정 (요약)

1. **D1 왕복 검사 기준.** 사용자 결정(2026-11-08): **(b) 렌더 결과 동일 + 고치지 않으면 쓰지 않음.** 고르지 않은 안: (a) 바이트 동일(diff 0).
2. **D2 3단계 관리자 화면 범위.** 사용자 결정(2026-11-08): **(a) 옛 화면 전부 삭제 + 최소 서버 렌더 목록.** 고르지 않은 안: (b) 에디터 경로만 추가.
3. **D3 2.4 요구 6개.** 사용자 결정(2026-11-08): **임베드(YouTube·CodeSandbox)·수식·이미지 크기 선택은 넣는다. 찾기·바꾸기·드래그 핸들·링크 카드·임의 px 폭은 미룬다. 키맵 저장·설정 UI는 5단계.** 처음 제안(6개 모두 미룸)과 다르다.

Claude 판단으로 정한 것(승인 때 함께 확인): D4 remark 기반 자체 변환기, D5 `editorJson` 형식과 해시 검사, D6 자동저장·충돌·오프라인 1칸, D7 퍼지 분리, D8 소스 모드 textarea, D9 명령 레지스트리와 기본 키(부록 B), D10 블록 세트(스키마 h1~h6, UI h2~h4, 콜아웃 `[!note]`, 이미지 inline), D11 업로드 흐름, D12 모바일, D13 레이아웃, PR 3개 분할, 공유 파이프라인을 3단계에서 만들고 공개 페이지 적용은 4단계.

## 13. 사용자 결정 (답을 받으면 여기에 적는다)

| 결정 | 답 | 날짜 |
|---|---|---|
| D1 | b. 렌더 결과 동일 + 고치지 않으면 쓰지 않음 | 2026-11-08 |
| D2 | a. 옛 화면 전부 삭제 + 최소 서버 렌더 목록 | 2026-11-08 |
| D3 | 넣음: 임베드(YouTube·CodeSandbox), 수식, 이미지 크기 선택. 미룸: 찾기·바꾸기, 드래그 핸들, 링크 카드, 임의 px 폭·정렬. 5단계: 키맵 저장·설정 UI | 2026-11-08 |

## 14. 뒤로 미룬 것 (상기 목록)

사용자가 "나중에 상기해 달라"고 한 항목이다. 적힌 시점에 Claude가 다시 묻는다.

| 항목 | 미룬 이유 | 다시 물을 시점 | 넣을 때 비용(어림) |
|---|---|---|---|
| 드래그 핸들(블록을 잡아 끌어 순서 바꾸기) | UX 가치를 지금 판단하기 어렵다. 노션에는 있고 옵시디언 기본에는 없다 | 3단계 에디터를 실제로 써 본 뒤(3단계 작업 문서 쓸 때), 늦어도 5단계 Plan | 반나절. `@tiptap/extension-drag-handle-react` |
| 이미지 임의 px 폭과 정렬(가운데·좌우) | 마크다운 표준 문법이 없다. HTML 속성이나 비표준 문법이 필요하다. 사용자: "굉장히 좋은 기능, 나중에 반드시" | 4단계 공개 렌더러 설계 때(원시 HTML 허용 여부를 그때 정한다) | 1~2일. 변환기·렌더러·에디터 메뉴 |
| 링크 카드(아무 주소나 제목·설명·이미지 카드) | 상대 사이트에서 정보를 가져오는 서버 API와 저장·갱신 규칙이 필요하다 | 4단계 공개 렌더러 설계 때 | 1~2일 |
| 찾기·바꾸기 | 브라우저 찾기와 소스 모드로 대신한다 | 5단계 Plan | 반나절~1일 |
| 키맵 저장(`settings/editor`)과 설정 화면 | 설정 화면은 5단계 관리자 앱 몫 | 5단계 Plan(확정) | 1일 |

## 부록 A. 기존 55편의 마크다운 문법 조사표

2026-11-08. 입력은 B1 덤프의 `posts` 56편에서 중복 글 1편을 뺀 55편. 파서는 공개 페이지와 같은 remark-parse + remark-gfm. "글"은 그 문법이 한 번이라도 나온 글 수, "수"는 전체 출현 수다.

| 노드 | 글 | 수 | 비고 |
|---|---|---|---|
| paragraph | 55 | 2,441 | |
| text | 55 | 5,188 | ZWSP 977(15편), NBSP 125(16편) 포함 |
| heading 1 / 2 / 3 / 4 / 5 | 6 / 53 / 52 / 13 / 2 | 7 / 221 / 254 / 35 / 2 | h6 없음 |
| strong | 47 | 1,030 | `__` 형식 4 |
| emphasis | 4 | 15 | |
| delete | 2 | 2 | |
| inlineCode | 47 | 1,095 | |
| link | 12 | 17 | 자동 링크 `<http…>` 7 |
| image | 29 | 104 | title 있음 39(9편) |
| blockquote | 51 | 144 | `> 💡` 시작 45(30편) |
| list 비순서 / 순서 | 37 / 44 | 241 / 95 | 글머리 `*` 502, `-` 77. 중첩 목록 13편 |
| listItem | 53 | 902 | 체크 항목 0 |
| code | 48 | 251 | 언어 없음 7. 들여쓰기 코드 포함 |
| table / row / cell | 7 | 10 / 53 / 150 | |
| thematicBreak | 38 | 108 | 전부 `***` |
| break | 15 | 132 | `\` 73, 두 칸 60 |
| html 블록 / 줄 안 | 20 / 8 | 50 / 9 | 전부 `<br />` 54, `</br>` 5 |
| 줄 안 줄바꿈 | 38 | 225 | 정규식 추정 |
| 각주, 수식, iframe, `<img>`, `<video>`, `<details>`, 참조 링크, setext 제목 | 0 | 0 | |

코드 블록 언어: javascript 138, c 33, python 27, jsx 16, objectivec 4, css 3, typescript 3, html 2, markdown 1, nasm 1, java 1.

**구현 중 확인한 것(2026-11-09, T2 왕복 검사).** 55편 중 `$…$`가 5곳(3편)에 있다: `$O(1)$`, `$O(logE)$`, `$V$`, `$E$`(모두 수식 표기). remark-math가 수식으로 읽는 것이 맞다. 정규화 규칙 6을 더했다(D1). 처음 53/55였던 실패 2편은 `***굵은 기울임***`(CommonMark: `<em><strong>`)이었고 변환기의 마크 순서를 고쳐 55/55가 됐다. 표기 변화: 글머리 `*` 506 → `-`, 구분선 `***` 108 → `---`, ZWSP 981 삭제, 본문 417,565 → 414,439바이트.

## 부록 B. 기본 명령과 키 (D9)

`Mod`는 맥 `⌘`, 그 밖 `Ctrl`. `Mod+Alt`는 쓰지 않는다.

| 명령 | 키 | 입력 규칙 | 슬래시 |
|---|---|---|---|
| 제목 2 / 3 / 4 | `Mod+Shift+2` / `3` / `4` | `## `, `### `, `#### ` | `/제목2` … |
| 단락으로 | `Mod+Shift+0` | | `/단락` |
| 굵게 / 기울임 / 취소선 / 인라인 코드 | `Mod+B` / `Mod+I` / `Mod+Shift+X` / `Mod+E` | `**`, `_`, `~~`, `` ` `` | |
| 링크 | `Mod+Shift+K` | 주소 붙여넣기 → 선택 텍스트에 링크 | `/링크` |
| 비순서 / 순서 / 체크 목록 | `Mod+Shift+8` / `7` / `9` | `- `, `1. `, `- [ ] ` | `/목록`, `/번호`, `/체크` |
| 인용 | `Mod+Shift+.` | `> ` | `/인용` |
| 콜아웃 | | `> [!note] ` | `/콜아웃` |
| 코드 블록 | `Mod+Shift+C` | ```` ``` ```` + 언어 | `/코드` |
| 표 | | | `/표`(3×3) |
| 이미지 | `Mod+Shift+I` | 드롭·붙여넣기 | `/이미지` |
| 구분선 | | `---` | `/구분선` |
| 되돌리기 / 다시 실행 | `Mod+Z` / `Mod+Shift+Z` | | |
| 명령 팔레트 | `Mod+K` | | |
| 소스 모드 / 미리보기 / 편집 | `Mod+Shift+M` 순환 | | `/소스`, `/미리보기` |
| 저장 지금 | `Mod+S` | | |
| 발행 | `Mod+Shift+Enter` | | |
| 메타 패널 토글 | `Mod+Shift+,` | | |

## 15. 구현과 다른 것 (구현 중 추가)

구현 세션이 Plan과 다르게 하거나 Plan이 정하지 않은 것을 판단한 목록은 [작업 문서 5절](./2026-11-09-stage3-editor.md)에 있다. PR-A(2026-11-09): 표 정렬은 셀 속성, lowlight `common`, Code 마크 겹침 허용, underline 끔, 정규화 규칙 6, 단락 끝 하드 브레이크 `<br>`, 마크 감싸기 순서, 왕복 스크립트 `--dump`, 빈 단락 생략, HTML 경고 단위. 리뷰 뒤: **기울임 표기 `*`(4.2의 `_` 대신, 사용자 확인 필요)**, 인라인 노드의 마크 상속, 제목·표 셀 안 `<br>`, 임베드 `<주소>` 폴백, URL 프로토콜 필터, ZWSP 옆 줄바꿈 삭제, 표 초과 셀 자르기, 모르는 마크 오류, 느슨한 목록 판정, 마크 앞뒤 공백, `nasm` 등록.

PR-B(2026-11-09): `posts/new.astro` 새 흐름을 PR-B에서(T7 일부), 브라우저용 주소 파서 `asset-url.ts`, 업로드 상태 속성 3개(`rendered: false`), 변경 판정 기준(열기 직후 `docToMarkdown`), 소스 모드 저장은 editorJson null, 테마 전환 메뉴, Placeholder. 리뷰 뒤: 저장 컨트롤러 클래스(`state/save-controller.ts`, 4.1에 없음), 공유 파이프라인의 원시 HTML 안전 처리(`rehype-strip-unsafe.ts`), editorJson이 Firestore 깊이 한도를 넘으면 null(D5 형식은 그대로), blob 주소 3겹 차단, 업로드 결과 재적용, 발행 전 저장 결과 확인, 저장 전 서버 규칙 검사, 영상 판정 `isVideoUrl`. 외부 변경 E2에 `http://localhost:4322`를 더했다(사용자 결정). 상세는 작업 문서 5절 24~54.

PR-C(2026-11-09): D9 인터페이스에 `scope`·`isAvailable`·`inToolbar` 추가, 키는 두 길(에디터 범위 Tiptap 키맵 + 페이지 범위 창 keydown), Tiptap 기본 명령 키 제거(`stripCommandKeys`), 4.1에 없는 파일(`commands/filter.ts`·`slash.ts`, `extensions/input-rules.ts`, `state/summary.ts`, `ui/CodeBlockView`·`EmbedNodeView`·`class-names`, `layouts/AdminPage.astro`, `pages/admin/edit/index.astro`), 콜아웃·체크 항목 입력 규칙은 두 단계(`> ` 뒤 `[!note] `, `- ` 뒤 `[ ] `는 그 항목만), 수식 입력은 대화상자(`$$`+공백), 임베드 붙여넣기·Enter, 모바일 두 폭(768·640px), 코드 블록 언어 select. **사용자 결정 2건: `/admin/posts/new`는 POST 폼(D2 a의 GET과 다름), 맥의 제목 2·3·4·단락 키는 `⌃⇧2/3/4/0`(부록 B의 `Mod+Shift`와 다름. `⌘⇧3/4`는 macOS 스크린샷 키).** 리뷰 뒤: 발행 재진입 방지, 넣기 명령의 `isAvailable`(코드 블록·표 셀), 링크 `safeUrl`, 수식 `pos` 검증, `HardBreak` `Mod-Enter` 제거. 8.5 결과: 재발행 뒤 첫 요청은 `MISS`가 아니라 `REVALIDATED`(내용은 새 것). 상세는 작업 문서 5절 55~73, 4.6·4.7, 6.3.
