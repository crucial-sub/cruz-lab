# CMS Rebuild Tracker

기준일: 2026-03-26

목적: Cruz Lab 포스팅 시스템과 자체 CMS 재구축 작업을 한 문서에서 추적한다.

상태 표기:
- `done`: 끝난 작업
- `in_progress`: 진행 중인 작업
- `next`: 바로 이어서 해야 하는 작업
- `optional`: 나중에 붙여도 되는 작업
- `blocked`: 외부 확인이나 추가 판단이 필요한 작업

## 이미 끝난 것

- `done` 공개 블로그를 `content/posts` 기반으로 전환했다.
- `done` CMS 출간/삭제 경로를 GitHub markdown 파일 기준으로 전환했다.
- `done` 관리자 포스트 목록과 대시보드를 markdown 포스트 기준으로 재정리했다.
- `done` 레거시 `Firestore -> GitHub 자동 미러링` 의존을 제거했다.
- `done` 시리즈 기능을 markdown 포스트 slug 기준으로 다시 연결했다.
- `done` frontmatter 포함 markdown 불러오기를 추가했다.
- `done` 로컬 draft 목록, 자동저장, 저장 상태 표시를 붙였다.
- `done` 출간 메타데이터를 에디터 상태와 draft에 동기화했다.
- `done` draft key 정리와 새 글 고유 draft key 관리를 추가했다.
- `done` 글을 보기만 했을 때 draft가 생기지 않도록 자동저장 조건을 조정했다.
- `done` 운영 경로와 무관한 레거시 에디터 흔적 일부를 정리했다.
- `done` markdown 파이프라인 평가 스크립트와 에디터 후보 비교 문서를 추가했다.
- `done` admin 작성 화면에 CodeMirror 6 기반 1차 프로토타입을 연결했다.
- `done` frontmatter import 파서를 강화해 block list tags 손실을 해결했다.
- `done` 빠른 삽입 패널과 체크리스트/표 템플릿을 추가했다.
- `done` CodeMirror 전체 언어 팩 import를 제거해 editor bundle을 줄였다.
- `done` admin 진입 경로에서 에디터 본체와 출간 모달을 lazy loading으로 분리했다.
- `done` 관리자 인증 훅을 auth 전용 Firebase 경로로 분리해 `AdminGuard` chunk를 줄였다.
- `done` Firebase 클라이언트 경로를 auth, storage, firestore 서비스별로 분리했다.
- `done` 업로드 경로에서 `firebase/storage`와 `browser-image-compression`을 실제 사용 시점에만 읽도록 바꿨다.
- `done` 시리즈 관리 화면을 클라이언트 Firestore 직접 접근에서 서버 API 기반으로 전환했다.
- `done` 포스트 편집 화면의 레거시 Firestore `?id=` fallback을 제거했다.
- `done` CodeMirror 업로드 경로를 순수 클라이언트 유틸로 분리해 Milkdown 플러그인 정적 의존을 끊었다.
- `done` 빠른 삽입 패널과 단축키 도움말을 `EditorOverlays` lazy chunk로 분리했다.
- `done` 포스트 편집용 `by-slug` API를 raw markdown 파일 기준으로 바꿔 비공개 글도 같은 경로로 열 수 있게 했다.
- `done` frontmatter import/publish 파서를 다시 맞춰 block list tags와 기본 multiline 값을 round-trip 기준으로 맞췄다.
- `done` 에디터에서 마크다운 내보내기, 초안 폐기, beforeunload 경고를 추가해 실사용 포스팅 플로우를 보강했다.
- `done` 관리자 포스트 목록이 focus/storage 기준으로 로컬 초안을 다시 읽고, 발행 글에 연결된 로컬 초안 여부도 보여주게 했다.
- `done` 에디터 본문 화면에 메타데이터 패널을 추가해 slug, 설명, 공개 상태, 출간 준비 상태를 모달 밖에서 바로 확인하고 수정할 수 있게 했다.
- `done` 썸네일 업로드와 카드 미리보기를 본문 화면 메타 패널로 옮겨 메타데이터 편집과 시각 확인을 한 화면에서 처리하게 했다.
- `done` 출간 모달을 최종 확인 중심으로 정리해 메타데이터 입력 역할 중복을 줄였다.
- `done` 출간 성공 후 GitHub 파일, 커밋, 공개 URL을 관리자 목록에서 바로 확인할 수 있게 피드백 배너를 추가했다.
- `done` 출간 전 서버 준비 상태와 대상 저장소 정보를 확인하는 진단 API와 관리자 UI를 추가했다.
- `done` 출간 진단이 GitHub 저장소/브랜치/포스트 경로를 실시간으로 확인하고, 공개 사이트 기준 URL과 현재 접속 origin을 함께 보여주도록 보강했다.
- `done` 관리자 목록의 마지막 출간 배너에서 GitHub 파일 존재 여부와 공개 페이지 응답을 다시 확인하는 `반영 다시 확인` 흐름을 추가했다.
- `done` 브라우저 밖에서도 `publish:verify` CLI로 특정 slug의 GitHub 파일과 공개 페이지 응답을 다시 확인할 수 있게 했다.
- `done` 현재 운영 경로에 없는 Milkdown 레거시 에디터 소스와 전용 플러그인 파일을 정리했다.
- `done` 브라우저 로그인 전에도 돌릴 수 있는 `publish:preflight` 스크립트와 현재 markdown 출간 경로 기준 runbook을 추가했다.
- `done` `.env.example`를 현재 출간 경로에 맞게 갱신해 `PUBLIC_SITE_URL`, `GITHUB_TOKEN` 요구사항을 명시했다.
- `done` 사용하지 않는 `Milkdown`, `Tiptap`, `Prism` 계열 패키지를 제거하고 `globals`를 추가해 lint 환경을 복구했다.
- `done` `astro.config.mjs`의 오래된 Milkdown optimizeDeps 경로를 제거해 dependency cleanup 이후 build 경고를 줄였다.
- `done` 관리자 인증 토큰 조회를 공통 helper로 묶어 dashboard, 출간 모달, 시리즈 관리, 삭제/검증 API 호출에서 같은 인증 경로를 쓰게 정리했다.
- `done` 에디터 레이아웃, 썸네일 업로드, 출간 모달 렌더링을 실사용 기준으로 손봐 로컬 관리자 화면에서 바로 테스트할 수 있게 보강했다.
- `done` 관리자 대시보드 상태 카드, 출간 완료 배너, 수동 저장 피드백, CodeMirror 문법 가독성을 실사용 기준으로 다시 다듬었다.
- `done` 출간 시스템 상태 카드를 세로 읽기 구조로 다시 정리했고, Storage bucket 후보 재시도로 로컬 썸네일 업로드 실패 가능성을 더 줄였다.
- `done` Firebase Storage 제한을 확인한 뒤, CMS 자산 업로드를 로컬 자산 저장 + 출간 시 GitHub 반영 구조로 옮기기 시작했다.

## 반드시 더 해야 하는 것

- `blocked` 실제 브라우저 관리자 세션 기준 출간 smoke test 1건 실행
  - 참고 문서: `PUBLISH-SMOKE-TEST.md`
  - 확인 범위: Publish Modal 진단, GitHub 파일, GitHub 커밋, 공개 페이지, 관리자 배너 재검증, CLI `publish:verify`
  - 현재 막힘: 이 단계는 실제 관리자 로그인과 버튼 클릭이 필요하다.
- `blocked` 실제 운영 환경에서 배포 반영 시간 체감 기록
  - 새 글 1건 기준으로 GitHub 반영 시각과 공개 페이지 반영 시각을 직접 적어야 한다.
  - 현재 상태: 도구와 확인 경로는 준비됐지만, 실측 기록은 아직 없다.
- `in_progress` 썸네일, 본문 이미지, 시리즈 커버 업로드를 Firebase Storage 대신 로컬 저장 + 출간 시 GitHub 동기화 구조로 완전히 전환하고 브라우저에서 다시 검증한다.
  - 현재 상태: 업로드 API와 로컬 미리보기 경로는 추가했고, 자산은 편집 중에 로컬 `public/uploads`로만 저장한다.
  - 남은 확인: 새 글 출간 시 markdown와 함께 필요한 자산만 GitHub에 올라가고, localhost `/blog`에도 즉시 반영되는지 확인해야 한다.

## 선택사항

- `optional` frontmatter 주석/키 순서까지 보존하는 고급 round-trip
- `optional` CodeMirror 번들 추가 최적화
- `optional` Obsidian 스타일 단축키 확장
- `optional` slash command 고도화
- `optional` 표 편집과 체크리스트 UX 개선
- `optional` 이미지 업로드 UX 재정리
- `optional` 미사용 이미지와 고아 자산을 찾고 정리하는 운영 도구 추가
  - 현재 구조는 업로드 중 자산을 로컬 `public/uploads`에 저장하고, 출간 시 실제로 참조된 자산만 GitHub로 동기화한다.
  - 이 방식은 무료로 운영하기엔 실용적이지만, 포스트 삭제/수정 후 더 이상 쓰지 않는 자산을 자동으로 정리하지는 못한다.
  - 블로그 운영이 안정된 뒤에는 `미사용 자산 탐지 -> 수동 검토 -> 정리` 흐름부터 먼저 붙이는 쪽이 안전하다.
- `optional` local draft와 published post diff 표시
- `optional` import 시 markdown lint 또는 정규화 보조

## 현재 조사 메모

### 2026-03-26 기준 확인된 사실

- 공개 블로그와 CMS 출간 경로는 이미 markdown 중심으로 정리됐다. 현재 남은 핵심 문제는 퍼블리싱 파이프라인보다 에디터 자체다.
- 현재 작성 에디터의 운영 경로는 `CodeMirrorEditor` 기반이다.
- 현재 에디터에는 아래 같은 작성 보조가 이미 들어가 있다.
  - 기본 서식 단축키
  - 빠른 삽입 패널
  - 이미지 붙여넣기/드롭 업로드
  - 로컬 draft 자동저장과 출간 메타데이터 동기화
  - 마크다운 내보내기
  - 초안 폐기와 발행본 복원
  - 본문 화면 메타데이터 패널
- `src/pages/admin/edit.astro`와 `src/pages/admin/posts/new.astro`의 설명도 CodeMirror 기준으로 정리됐다.
- 현재 의존성에는 아직 `Milkdown`, `CodeMirror`, `Tiptap`이 모두 함께 들어 있다. 다만 런타임 소스 기준으로는 `CodeMirror` 경로가 중심이고, `Milkdown`은 주로 의존성/락파일 정리 이슈로 남아 있다.
- 실제 화면은 `EditorPage -> FullScreenEditor -> CodeMirrorEditor`로 연결된다.
- 외부 markdown import는 `FullScreenEditor`에서 `parseMarkdownDocument()`로 frontmatter를 먼저 읽고, 본문 markdown 문자열을 현재 에디터 상태에 채우는 구조다.
- publish는 `generateMarkdownContent()`가 frontmatter를 다시 생성하는 방식이지만, 현재 기본 포스트 포맷에서는 block list tags와 quoted scalar 형식을 맞추도록 보정됐다.
- 현재 운영 경로에서 Firebase 접근은 `auth / storage / firestore` 서비스별 모듈로 분리됐다.
- 시리즈 관리 CRUD는 이제 서버 API 경유로 처리한다.
- 포스트 편집 화면의 레거시 Firestore post 로딩 fallback은 제거됐다.
- 포스트 편집용 `by-slug` API는 이제 content collection이 아니라 `content/posts` raw markdown 파일을 직접 읽는다.
- 업로드 로직은 Milkdown 플러그인 경로와 분리되어, CodeMirror 쪽에서 동적 import 가능한 순수 클라이언트 유틸로 정리됐다.
- 모달성 UI인 빠른 삽입 패널과 단축키 도움말도 편집기 본체에서 분리할 수 있다.
- 관리자 포스트 목록은 이제 focus/storage 이벤트 기준으로 로컬 초안 목록을 다시 읽고, 발행 글 옆에 `로컬 초안 있음` 배지를 붙인다.
- 출간 메타데이터는 이제 모달 안에만 있지 않고, 본문 화면 상단 패널에서도 바로 확인하고 수정할 수 있다.
- 출간 모달은 이제 slug, 설명, 공개 상태를 다시 수정하는 곳이 아니라 최종 확인과 썸네일 업로드, 출간 액션에 집중한다.

### 코드 기준으로 확인된 구체적 한계

- `parseMarkdownDocument()`는 block list, inline array, literal/folded multiline string까지는 읽도록 확장됐다.
- `generateMarkdownContent()`는 출간 시 frontmatter를 다시 만들지만, 현재 포스트에서 실제로 쓰는 block list tags와 quoted scalar 형식은 유지한다.
- 다만 원본 frontmatter의 주석, 임의 키 순서, 더 복잡한 nested object까지 보존하는 수준은 아니다.
- 이전 `Milkdown` 경로에서 쓰던 보정 로직은 이제 운영 경로 밖으로 밀려났지만, 관련 의존성과 일부 레거시 파일은 저장소에 남아 있다.

### 지금 보이는 구조적 문제

- Markdown fidelity 문제는 fixture 기준으로 한 단계 완화됐지만, frontmatter 주석/순서 보존까지 해결된 것은 아니다.
- 단축키는 브라우저 충돌을 피하려고 `Cmd/Ctrl + Alt` 조합으로 우회했지만, 이것만으로는 Obsidian처럼 자연스러운 작성 경험을 주기 어렵다.
- import 경로가 하나로 정리되긴 했지만, 에디터 내부 parser가 외부 markdown을 얼마나 정확하게 보존하는지는 아직 검증이 부족하다.
- 실제 publish 후 GitHub 반영과 사이트 최종 배포 반영까지는 아직 브라우저 관리자 세션 기준으로 한 번 더 확인해야 한다.
- 실제 운영 검증을 돕는 피드백 배너는 추가됐지만, 배포 지연 시간과 예외 케이스는 실사용 기준으로 한 번 더 축적해야 한다.
- 출간 전 서버 준비 상태는 이제 GitHub 대상 저장소/브랜치/포스트 경로까지 실시간으로 확인하지만, 실제 운영 환경에서 어떤 오류가 자주 나는지는 로그와 실사용 경험을 더 모아야 한다.
- 썸네일 업로드와 카드 미리보기는 메타 패널로 올라왔지만, 최종 출간 전 점검 흐름과 본문 작성 흐름이 충분히 자연스러운지는 실제 사용 기준으로 한 번 더 봐야 한다.
- 사용하지 않는 실험 흔적은 소스와 패키지 기준으로 대부분 걷어냈다. 남은 판단은 추가 최적화가 필요한지 여부에 가깝다.
- 운영 확인 절차는 이제 UI와 CLI 양쪽에 있고, 관리자 목록과 `publish:verify` 둘 다 마지막 출간 건의 GitHub 파일/공개 페이지 재검증이 가능하다. 다만 “실제 새 글 1건 출간” 기준의 로그/시간 기록은 아직 없다.
- 2026-03-26 기준 네트워크 허용 preflight에서 `GITHUB_TOKEN`, GitHub push 권한, 대상 저장소 probe, 공개 사이트 `/blog` 응답까지 모두 통과했다.
- 2026-03-26 기준 남은 운영 검증 핵심은 브라우저 관리자 세션에서 실제 `publish -> GitHub -> 공개 페이지`를 한 번 끝까지 확인하는 일이다.
- 2026-03-26 기준 lint는 다시 통과한다. 설정/패키지 문제와 당시 남아 있던 앱 코드 이슈 25개도 함께 정리했다.
- 2026-03-26 기준 현재 범위의 기술 선택은 사실상 끝났다. 운영 경로는 `CodeMirror 6`이고, 남은 일은 엔진 교체보다 실제 운영 smoke test에 가깝다.

### 현재 가설

- 지금 가장 중요한 선택 기준은 "기능이 많으냐"가 아니라 "외부 markdown을 거의 손실 없이 다루느냐"다.
- 이 기준이면 `Milkdown`을 계속 보정하는 방향보다 `CodeMirror 6` 중심의 markdown-native 편집 흐름이 더 유리할 가능성이 크다.
- 다만 `Tiptap`은 구조화된 확장성과 UI 제작 자유도가 높아서, slash/toolbar/image UX를 강하게 밀고 싶으면 비교 대상에서 바로 제외하면 안 된다.

## 재현 샘플과 확인 포인트

- 재현용 샘플 파일: [editor-roundtrip-stress.md](/Users/parkjungsub/projects/cruz-lab/fixtures/editor-roundtrip-stress.md)
- 이 샘플로 확인할 항목
  - block list 형태의 `tags`가 import 시 제대로 들어오는지
  - 한글 조사와 `**bold**`, 링크, 인라인 코드가 맞닿을 때 보이지 않는 문자가 끼는지
  - import 후 수정 없이 publish했을 때 frontmatter 표현이 얼마나 바뀌는지
  - 표, 체크리스트, 코드블록, raw HTML이 round-trip에서 보존되는지

## 에픽 1 산출물 목표

- 현재 에디터 문제를 `엔진 한계 / 현재 구현 버그 / 브라우저 제약 / 레거시 흔적` 네 범주로 정리한다.
- `Milkdown`, `CodeMirror 6`, `Tiptap` 비교표를 같은 문서에 추가한다.
- 다음 에픽에서 바로 기술 선택을 할 수 있을 정도로 판단 근거를 모은다.

## 후보 비교 초안

| 기준 | Milkdown | CodeMirror 6 | Tiptap | 현재 메모 |
| --- | --- | --- | --- | --- |
| markdown fidelity | 낮음 | 높음 | 중간 | Milkdown은 보정 코드가 이미 많고, Tiptap은 markdown 변환 계층이 추가로 필요하다. |
| 외부 md import 단순성 | 낮음 | 높음 | 중간 | CodeMirror는 markdown 문자열을 직접 다루기 쉽다. |
| publish round-trip 예측 가능성 | 낮음 | 높음 | 중간 | 지금 구조 문제를 가장 덜 꼬이게 가져갈 후보는 CodeMirror다. |
| 플러그인/리치 UI 확장성 | 중간 | 중간 | 높음 | slash, toolbar, node UI 쪽은 Tiptap이 유리하다. |
| Obsidian 유사 작성 경험 | 낮음 | 높음 | 중간 | 마크다운을 직접 보면서 쓰는 흐름은 CodeMirror 쪽이 자연스럽다. |
| 현재 코드 재사용성 | 높음 | 중간 | 낮음 | Milkdown은 유지 비용이 크고, Tiptap은 사실상 다시 짜야 할 가능성이 높다. |
| 현재 시점 가설 | 보류 | 유력 | 보류 | 최종 결정 전 실제 샘플 round-trip 확인 필요 |

## 다음 에픽에서 꼭 확인할 것

- 샘플 markdown 문서를 정해서 `import -> edit without change -> publish` 후 diff 비교
- 한글과 마크다운 문법이 맞닿는 케이스 재현
- 긴 문서에서 입력 지연과 커서 이동 체감 확인
- `Cmd/Ctrl + B`, `Cmd/Ctrl + K`, 저장, heading 전환 같은 핵심 단축키의 실제 충돌 여부 확인
- 에디터 후보별로 "브라우저 안에서 쓰기 편한 CMS" 목표에 얼마나 맞는지 점수화
- 남아 있는 패키지 의존성(`Milkdown`, `Tiptap`)을 실제 사용 경로 기준으로 더 줄일지 판단

## 진행 기록

- 2026-03-26: 트래커 문서를 만들고, 현재 CMS 정리 완료 항목과 에디터 전수조사 출발점을 고정했다.
- 2026-03-26: import/publish 경로를 코드 기준으로 다시 확인했고, round-trip 재현용 markdown 샘플을 추가했다.
- 2026-03-26: 실제 운영 경로와 무관한 `CodeMirror` 페이지 스타일과 미사용 `Tiptap` 툴바 컴포넌트를 제거했다.
- 2026-03-26: 레거시 흔적 정리 후 `npm run build` 통과를 확인했다.
- 2026-03-26: markdown 파이프라인 평가 스크립트를 추가하고, 후보 비교 문서에서 `CodeMirror 6`을 1차 권장안으로 정리했다.
- 2026-03-26: 평가 스크립트 실행 결과 block list tags 손실을 재현했고, 빌드에서 큰 관리자 에디터 chunk도 다시 확인했다.
- 2026-03-26: admin 에디터를 CodeMirror 6 1차 프로토타입으로 교체했고, `npm run build`와 `npm run editor:evaluate`를 다시 통과했다.
- 2026-03-26: frontmatter 파서를 강화한 뒤 `npm run editor:evaluate`에서 block list tags가 정상 유지되는 것을 확인했다.
- 2026-03-26: 빠른 삽입 패널과 블록 템플릿을 추가했고, `npm run build`와 `npm run editor:evaluate`를 다시 통과했다.
- 2026-03-26: `@codemirror/language-data` 전체 import를 제거한 뒤 `EditorPage` chunk가 약 `643 kB`로 줄어든 것을 확인했다.
- 2026-03-26: `EditorPage`, `FullScreenEditor`, `PublishModal`을 lazy loading으로 분리했고, `AdminGuard`는 auth 전용 Firebase 경로로 분리해 admin 초기 진입 chunk를 더 줄였다.
- 2026-03-26: Firebase 접근을 auth, storage, firestore 서비스별로 분리했고, 업로드 경로는 `firebase/storage`와 `browser-image-compression`을 실제 사용 시점에만 읽도록 바꿨다.
- 2026-03-26: 시리즈 관리 화면을 `/api/admin/series` 서버 API 기반으로 전환했고, 포스트 편집의 레거시 Firestore `?id=` fallback도 제거했다.
- 2026-03-26: CodeMirror 업로드 유틸을 Milkdown 플러그인 파일에서 분리했고, 이미지 업로드 시점에만 `media-upload-client`를 읽도록 바꿨다.
- 2026-03-26: 빠른 삽입 패널과 단축키 도움말을 `EditorOverlays` lazy chunk로 분리해 CodeMirror 본체에서 떼어냈다.
- 2026-03-26: `by-slug` API를 raw markdown 파일 기준으로 바꿔 비공개 글 편집 경로를 복구했고, frontmatter import/publish 파서를 다시 맞춰 fixture round-trip 평가를 `findings: none`까지 끌어올렸다.
- 2026-03-26: 에디터 하단에 마크다운 내보내기와 초안 폐기를 추가했고, 나가기/새로고침 경고를 실제 변경이 있을 때만 뜨도록 정리했다. 관리자 포스트 목록은 로컬 초안 동기화와 `로컬 초안 있음` 표시를 지원한다.
- 2026-03-26: 에디터 본문 화면 상단에 `Publish Readiness` 메타 패널을 추가해 slug, 설명, 공개 상태, 읽기 시간, 준비 항목을 모달 밖에서 바로 확인하고 수정할 수 있게 했다.
- 2026-03-26: 출간 모달에서 중복 메타데이터 편집 UI를 걷어내고, 최종 확인 항목과 로컬 백업, 출간 액션 중심으로 역할을 줄였다.
- 2026-03-26: 썸네일 업로드와 카드 미리보기를 본문 화면 메타 패널로 옮겼고, 출간 모달은 더 분명하게 최종 확인 단계로 축소했다.
- 2026-03-26: 출간 API가 GitHub 파일 경로, 커밋, 공개 URL을 함께 반환하게 했고, 관리자 목록은 마지막 출간 결과와 운영 확인 순서를 배너로 보여주게 했다.
- 2026-03-26: `/api/admin/publish-status` 진단 경로를 추가했고, 출간 모달과 관리자 대시보드는 서버 준비 상태와 대상 저장소 정보를 직접 보여주게 했다.
- 2026-03-26: 출간 진단이 GitHub 대상 브랜치와 `content/posts` 경로를 실시간으로 확인하게 했고, 공개 링크는 공개 사이트 기준 URL로 계산하도록 정리했다.
- 2026-03-26: 현재 운영 경로에 물리지 않는 Milkdown 레거시 에디터 소스와 전용 플러그인 파일을 저장소에서 제거했다.
- 2026-03-26: `npm run publish:preflight` 스크립트와 `PUBLISHING.md` runbook을 추가해, 브라우저 로그인 전에도 운영 기준 점검과 출간 확인 순서를 볼 수 있게 했다.
- 2026-03-26: `.env.example`에 `PUBLIC_SITE_URL`, `GITHUB_TOKEN`을 추가했고, 네트워크 허용 preflight에서 현재 로컬 환경 기준 GitHub 대상 저장소 probe와 공개 사이트 `/blog` 응답이 모두 통과함을 확인했다.
- 2026-03-26: 운영 진단을 더 보강해 `publish-status`와 `publish:preflight`가 대상 저장소의 push 권한과 공개 사이트 `/blog` live probe까지 함께 확인하도록 맞췄다.
- 2026-03-26: 관리자 목록의 마지막 출간 배너에서 `반영 다시 확인`을 누르면 GitHub 파일 존재 여부와 공개 페이지 응답을 다시 검증하도록 보강했다.
- 2026-03-26: `publish:verify` CLI를 추가해 브라우저 밖에서도 slug 기준으로 GitHub 파일과 공개 페이지 응답을 다시 확인할 수 있게 했다.
- 2026-03-26: `Milkdown`, `Tiptap`, `Prism` 계열 패키지를 `package.json`과 `pnpm-lock.yaml`에서 제거했고, `globals`를 추가한 뒤 `.vercel`을 lint ignore에 포함해 lint를 다시 통과할 수 있게 정리했다.
- 2026-03-26: `astro.config.mjs`의 오래된 Milkdown optimizeDeps include를 제거했고, Hero, 시리즈 에디터, editor overlay, 블로그/시리즈 islands, 태그 페이지, Tailwind 설정까지 손봐서 lint를 다시 통과시켰다.
- 2026-03-26: 남은 작업을 다시 분류해, 현재 범위에서 구현이 더 필요한 항목은 닫고 실제 브라우저 출간 smoke test와 배포 반영 시간 기록만 `blocked`로 남겼다.
- 2026-03-26: 관리자 인증 토큰을 기다려서 가져오는 공통 helper를 추가했고, dashboard/출간 모달/시리즈 관리/포스트 목록이 더 이상 `currentUser` race에 바로 걸리지 않게 정리했다.
- 2026-03-26: 썸네일 업로드는 Storage bucket 설정과 로그인 상태를 더 분명한 메시지로 안내하게 바꿨고, 편집 화면은 메타 패널이 editor 높이를 눌러버리지 않도록 레이아웃을 다시 잡았다.
- 2026-03-26: 출간 모달은 backdrop 닫기, ESC 닫기, 내부 스크롤, 반응형 사이드 패널 구조를 추가해 버튼이 보이지 않거나 스크롤이 막히는 문제를 줄였다.
- 2026-03-26: 대시보드의 출간 시스템 상태 UI를 긴 텍스트가 겹치지 않도록 카드 구조로 다시 짰고, 출간 완료 배너도 링크/검증/다음 행동이 더 분명히 보이게 정리했다.
- 2026-03-26: CodeMirror 문법 하이라이트와 대비를 손봐 markdown 기호 가독성을 올렸고, 수동 임시저장에도 즉시 피드백 배지를 추가했다.
- 2026-03-26: Storage bucket 후보를 `firebasestorage.app`와 `appspot.com` 둘 다 시도하도록 보강해, 로컬 설정 차이로 인한 썸네일 업로드 실패 가능성을 줄였다.
- 2026-03-26: 출간 시스템 상태 카드가 여전히 좁은 칸에서 세로로 찢어지던 문제를 보고, 상태 체크를 작은 다중 카드가 아니라 한 줄씩 읽는 리스트형 카드로 다시 바꿨다.
- 2026-03-26: 출간 완료 배너의 닫기 버튼은 `whitespace-nowrap`와 `shrink-0`를 적용해 글자가 세로로 쪼개지지 않게 고쳤다.
- 2026-03-26: Firebase Storage 콘솔 제한을 직접 확인한 뒤, 관리자 자산 업로드를 로컬 `public/uploads` 저장 중심으로 바꾸고, 실제 GitHub 반영은 출간 시점에 필요한 자산만 동기화하는 방향으로 재정리했다.
- 2026-03-26: 출간 시스템 상태 UI는 상태 체크 리스트와 출간 대상 패널이 확실히 분리되도록 다시 단순화했고, 업로드 토스트 문구도 Firebase 대신 자산 업로드 기준으로 정리했다.
- 2026-03-26: `publish-post`와 `delete-post` API도 로컬 `content/posts`를 함께 갱신하도록 바꿔, localhost `/blog`에서 새 글/삭제 결과를 바로 확인할 수 있게 맞추는 중이다.
- 2026-03-27: 자산 업로드는 무료 운영을 위해 `로컬 저장 -> 출간 시 GitHub 동기화` 구조로 유지하고, 미사용 이미지/고아 자산 정리는 블로그 운영이 안정된 뒤의 후속 작업으로 따로 미뤘다.
