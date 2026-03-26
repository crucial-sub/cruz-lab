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

## 반드시 더 해야 하는 것

- `in_progress` 에픽 1. 현재 에디터 문제 전수조사
  - Markdown import/export fidelity 문제를 재현 가능한 사례로 정리
  - 한글 입력, escape 보정, ZWSP 삽입 같은 보정 코드의 필요성과 한계를 분리
  - 단축키 충돌을 브라우저 제약과 현재 구현 문제로 나눠서 정리
  - 지금 에디터가 실제로 어떤 Markdown 원본을 보존하지 못하는지 샘플 기준으로 기록
- `next` 에픽 2. 에디터 후보 비교와 기술 선택 확정
  - 비교 대상: `Milkdown`, `CodeMirror 6`, `Tiptap`
  - 비교 기준: markdown fidelity, 대용량 문서 성능, 단축키 제어, import/export 단순성, 플러그인 확장성
  - 최종안 1개와 탈락 이유를 문서로 남기기
- `next` 에픽 2의 현재 권장안: `CodeMirror 6`
  - 근거 문서: `docs/editor-engine-evaluation.md`
  - 남은 일: 실제 1차 프로토타입을 붙여도 import/draft/publish 경로가 단순해지는지 확인
- `next` 에픽 3. 선택한 에디터 방향으로 설계 확정
  - 작성 데이터 모델
  - draft 호환 전략
  - publish 연계 방식
  - 이미지 업로드와 메타데이터 입력 흐름
- `next` 에픽 4. 에디터 개선 또는 교체 1차 구현
  - 최소 작성 플로우 완성
  - 외부 markdown import 후 round-trip 품질 확보
  - 기존 publish/draft 흐름과 자연스럽게 연결
- `next` 에픽 5. 실제 포스팅 플로우 검증
  - 외부 md 불러오기
  - 브라우저 편집
  - 로컬 draft 저장/복원
  - publish 후 사이트 반영 확인

## 선택사항

- `optional` Obsidian 스타일 단축키 확장
- `optional` slash command 고도화
- `optional` 표 편집과 체크리스트 UX 개선
- `optional` 이미지 업로드 UX 재정리
- `optional` local draft와 published post diff 표시
- `optional` import 시 markdown lint 또는 정규화 보조

## 현재 조사 메모

### 2026-03-26 기준 확인된 사실

- 공개 블로그와 CMS 출간 경로는 이미 markdown 중심으로 정리됐다. 현재 남은 핵심 문제는 퍼블리싱 파이프라인보다 에디터 자체다.
- 현재 작성 에디터는 여전히 `MilkdownEditor` 기반이다.
- 에디터 내부에는 아래 같은 보정 코드가 이미 들어가 있다.
  - 저장 시 `\\**`, `\\*`, `\\_`를 다시 복원하는 정규식 처리
  - import 시 한국어와 `**bold**`가 붙는 경우를 막기 위한 `ZWSP` 삽입
  - 코드블록 탈출, 인용구 탈출, 링크 다이얼로그, slash, 업로드, 단축키 같은 커스텀 플러그인 누적
- `src/pages/admin/edit.astro`와 `src/pages/admin/posts/new.astro`에는 아직 CodeMirror 전제의 주석과 스타일이 남아 있다. 실제 엔진은 Milkdown인데 설명과 코드 흔적이 섞여 있다.
- 현재 의존성에는 `Milkdown`, `CodeMirror`, `Tiptap`이 모두 함께 들어 있다. 즉 기술 선택이 이미 끝난 상태가 아니라, 실험 흔적이 저장소에 같이 남아 있는 상태다.
- 실제 화면은 `FullScreenEditor -> MilkdownEditor`로 연결되는데, 저장소 안에는 `@tiptap/react`를 참조하는 `EditorToolbar.tsx`도 남아 있다. 현재 사용 여부와 정리 대상 여부를 분리해서 판단해야 한다.
- 외부 markdown import는 `FullScreenEditor`에서 `parseMarkdownDocument()`로 frontmatter를 먼저 읽고, 본문만 `MilkdownEditor`에 넣는 구조다.
- publish는 `generateMarkdownContent()`가 frontmatter를 새로 생성하는 방식이라, import된 원본 frontmatter 표현을 그대로 보존하지 않는다.

### 코드 기준으로 확인된 구체적 한계

- `parseMarkdownDocument()`는 사실상 단순 frontmatter 파서다.
  - 한 줄짜리 `key: value`만 기준으로 읽는다.
  - 배열은 `tags: ["a", "b"]` 같은 inline 형식에 유리하고, 일반 YAML block list는 처리하지 못한다.
  - multiline string, folded style, nested object 같은 일반 YAML 패턴은 지원하지 않는다.
- `generateMarkdownContent()`는 출간 시 frontmatter를 고정된 형식으로 다시 만든다.
  - 날짜는 항상 ISO 문자열로 정규화된다.
  - tags는 항상 inline 배열 형식으로 다시 출력된다.
  - 원본 frontmatter의 줄바꿈, 순서, 주석, block list 표현은 유지되지 않는다.
- `MilkdownEditor`는 markdown fidelity 문제를 엔진 내부가 아니라 후처리와 전처리로 메우고 있다.
  - 저장 시 `\\**`, `\\*`, `\\_` 복원 정규식 사용
  - import 시 한글과 `**bold**`가 붙는 케이스에 ZWSP 삽입
- 내부 `Milkdown` import 버튼 경로는 컴포넌트 안에 남아 있지만, 실제 화면에서는 `showImportButton={false}`로 숨겨 둔 상태다.

### 지금 보이는 구조적 문제

- Markdown fidelity 문제를 엔진 내부에서 해결하지 못하고 후처리 정규식과 ZWSP 보정에 기대고 있다.
- 단축키는 브라우저 충돌을 피하려고 `Cmd/Ctrl + Alt` 조합으로 우회했지만, 이것만으로는 Obsidian처럼 자연스러운 작성 경험을 주기 어렵다.
- import 경로가 두 군데였다가 하나로 정리되긴 했지만, 에디터 내부 parser가 외부 markdown을 얼마나 정확하게 보존하는지는 아직 검증이 부족하다.
- 관리 페이지 설명과 실제 엔진이 어긋나 있어서 유지보수 관점에서도 혼란이 남아 있다.
- 사용하지 않는 실험 흔적까지 함께 남아 있어서, "현재 운영 경로"와 "버려진 경로"를 먼저 구분하지 않으면 다음 교체 작업에서 더 헷갈릴 가능성이 높다.

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
- 현재 미사용 또는 레거시 에디터 관련 컴포넌트와 스타일을 목록화

## 진행 기록

- 2026-03-26: 트래커 문서를 만들고, 현재 CMS 정리 완료 항목과 에디터 전수조사 출발점을 고정했다.
- 2026-03-26: import/publish 경로를 코드 기준으로 다시 확인했고, round-trip 재현용 markdown 샘플을 추가했다.
- 2026-03-26: 실제 운영 경로와 무관한 `CodeMirror` 페이지 스타일과 미사용 `Tiptap` 툴바 컴포넌트를 제거했다.
- 2026-03-26: 레거시 흔적 정리 후 `npm run build` 통과를 확인했다.
- 2026-03-26: markdown 파이프라인 평가 스크립트를 추가하고, 후보 비교 문서에서 `CodeMirror 6`을 1차 권장안으로 정리했다.
- 2026-03-26: 평가 스크립트 실행 결과 block list tags 손실을 재현했고, 빌드에서 큰 관리자 에디터 chunk도 다시 확인했다.
