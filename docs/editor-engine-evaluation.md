# Editor Engine Evaluation

기준일: 2026-03-26

목표: Cruz Lab의 다음 에디터 엔진을 결정하기 전에, 현재 markdown 파이프라인과 후보 기술을 같은 기준으로 비교한다.

## 현재 파이프라인에서 확인한 문제

현재 흐름은 아래처럼 두 단계로 나뉜다.

1. `FullScreenEditor`가 외부 markdown 파일을 읽는다.
2. `parseMarkdownDocument()`가 frontmatter를 단순 파싱한다.
3. 본문 markdown 문자열을 현재 에디터 상태로 넘긴다.
4. 출간 시 `generateMarkdownContent()`가 frontmatter를 다시 조립한다.

이 구조 때문에 import와 publish 사이에서 원본 markdown 표현이 그대로 유지되지 않는다.

대표 문제는 이렇다.

- block list 형태의 YAML 배열과 multiline 문자열을 안정적으로 다뤄야 한다.
- frontmatter의 줄 순서나 주석 같은 원본 표현은 여전히 완전 보존 대상이 아니다.
- 한글과 마크다운 문법이 맞닿는 케이스를 엔진 내부가 아니라 정규식과 ZWSP 보정으로 막고 있다.
- 단축키는 브라우저 충돌을 피하기 위해 `Cmd/Ctrl + Alt` 조합으로 우회하고 있다.

## 재현 자산

- round-trip 샘플: [editor-roundtrip-stress.md](/Users/parkjungsub/projects/cruz-lab/fixtures/editor-roundtrip-stress.md)
- 평가 스크립트: [evaluate-markdown-pipeline.mjs](/Users/parkjungsub/projects/cruz-lab/scripts/evaluate-markdown-pipeline.mjs)
- 실행 명령:

```bash
npm run editor:evaluate
```

## 현재 평가 결과

현재 스크립트 기준으로 확인 가능한 사실:

- block list 형식의 `tags`는 import와 publish 모두에서 유지된다.
- 현재 fixture 기준으로는 `import -> publish` 이후 frontmatter와 본문이 동일하게 나온다.
- `by-slug` API도 이제 `content/posts`의 raw markdown 파일을 직접 읽기 때문에, 공개 여부와 무관하게 편집 경로가 같은 소스를 본다.
- 즉, 현재 구조는 “markdown 원본을 다시 조립하되, 기존 포스트 작성 포맷에 최대한 맞춘다” 쪽으로 한 단계 정리됐다.

```text
findings: none
```

다만 이 결과는 현재 fixture 기준이다. frontmatter 주석, 키 순서 변경, 더 복잡한 YAML 표현까지 전부 보존한다는 뜻은 아니다.

추가로 현재 빌드 결과에서 관리자 에디터 번들은 여전히 크다.

- `CodeMirrorEditor` client chunk: 약 622 kB
- `firebase` shared chunk: 약 345 kB

즉, 에디터 엔진 선택은 markdown fidelity뿐 아니라 번들 크기와 초기 로드 비용 관점에서도 계속 같이 봐야 한다.

## CodeMirror 6 프로토타입 적용 결과

현재 admin 작성 화면은 1차 프로토타입으로 `CodeMirror 6` 기반으로 교체됐다.

포함된 범위:

- markdown 문자열 직접 편집
- `⌘/Ctrl+B`, `⌘/Ctrl+I`, `⌘/Ctrl+K`, `⌘/Ctrl+S`, heading 전환 단축키
- 이미지 붙여넣기/드롭 업로드 후 markdown 삽입
- 빠른 삽입 패널과 블록 템플릿
- 기존 local draft, import, publish 흐름 유지

이번 단계에서 의도적으로 뺀 것:

- 완전한 slash menu
- Milkdown 전용 code block / blockquote escape 플러그인의 1:1 대체
- ProseMirror 기반 rich block UI

빌드 기준 변화:

- `EditorPage` client chunk: 약 `734 kB -> 668 kB`
- `EditorPage` CSS: 약 `34 kB -> 6 kB`

그 다음 보강:

- 빈 줄에서 `/`를 누르면 빠른 삽입 패널이 열린다.
- `⌘/Ctrl+Shift+P`로도 같은 패널을 열 수 있다.
- 체크리스트, 표, 인용구, 코드블록, 구분선 같은 자주 쓰는 블록을 템플릿으로 바로 넣을 수 있다.
- 이 단계 이후 CSS는 약 `8.3 kB`, `EditorPage` chunk는 약 `673 kB` 수준이다.
- `@codemirror/language-data` 전체 import를 제거한 뒤 `EditorPage` chunk는 약 `643 kB`까지 더 내려갔다.
- 현재 trade-off는 editor 내부 코드펜스 언어 매칭을 generic markdown 수준으로 둔다는 점이다.
- `React.lazy`로 `FullScreenEditor`, `CodeMirrorEditor`, `PublishModal`을 분리한 뒤에는 admin 작성 페이지의 진입 chunk가 크게 줄었다.
  - `EditorPage`: 약 `2.1 kB`
  - `FullScreenEditor`: 약 `14.9 kB`
  - `PublishModal`: 약 `8.4 kB`
  - `CodeMirrorEditor`: 약 `622.0 kB`
- `useAdminAuth`가 `auth` 전용 초기화 경로를 쓰게 바뀌면서 `AdminGuard` chunk는 약 `507 kB -> 162 kB`로 내려갔다.
- 이후 `auth / storage / firestore` 경로를 서비스별 모듈로 분리하고, 업로드 시점에만 `firebase/storage`, `browser-image-compression`을 읽도록 바꿨다.
  - 기존 `firebase` shared chunk 약 `345 kB`는 더 이상 한 덩어리로 남지 않는다.
  - `firebase-storage-client`는 약 `45.3 kB`다.
  - `PublishModal`은 약 `8.9 kB`로 유지되고, 썸네일 업로드를 눌렀을 때만 storage/compression 의존을 읽는다.
- `SeriesEditor`와 `SeriesList`는 Firestore를 직접 읽지 않고 `/api/admin/series`를 통해 서버 API로 동작한다.
- `FullScreenEditor`의 레거시 `?id=` Firestore 편집 fallback도 제거했다.
- 그 결과, 이번 빌드 기준으로 클라이언트 쪽 큰 Firestore 런타임 chunk는 더 이상 보이지 않는다.
- `CodeMirrorEditor`가 업로드 유틸을 `Milkdown` 플러그인 파일에서 직접 가져오지 않도록 경로를 분리했다.
  - 업로드 타입과 순수 업로드 로직을 별도 파일로 뺐다.
  - `CodeMirrorEditor`는 이미지 업로드 시점에만 `media-upload-client`를 동적 import 한다.
  - 그 결과 `CodeMirrorEditor` chunk는 약 `622.48 kB -> 620.26 kB`로 소폭 줄었고, 업로드 전용 chunk `media-upload-client` 약 `2.83 kB`가 새로 생겼다.
  - 중요한 점은 크기 자체보다, `CodeMirror`가 `Milkdown` 업로드 플러그인 경로를 더 이상 정적으로 끌고 오지 않는 구조가 됐다는 점이다.
- 빠른 삽입 패널과 단축키 도움말도 `EditorOverlays` 청크로 분리했다.
  - `CodeMirrorEditor`는 이제 편집기 본체를 먼저 띄우고, 오버레이 UI는 열었을 때만 로드한다.
  - 새 `EditorOverlays` chunk는 약 `4.08 kB`다.
  - 그 결과 `CodeMirrorEditor` chunk는 약 `620.26 kB -> 616.99 kB`로 한 번 더 줄었다.
  - 의미는 크기 자체보다, 핵심 편집기와 모달성 UI의 로드 경계가 분명해졌다는 점이다.
- `parseMarkdownDocument()`와 `generateMarkdownContent()`도 다시 맞췄다.
  - import는 block list, inline array, literal/folded multiline 값을 읽는다.
  - publish는 기존 포스트 스타일에 맞춰 block list tags와 quoted scalar 중심으로 frontmatter를 다시 만든다.
  - `heroImage`가 없으면 빈 문자열을 강제로 쓰지 않고, 실제 값이 있을 때만 넣는다.
  - `by-slug` API는 Astro content collection이 아니라 raw markdown 파일을 읽어 오므로, `isPublic: false` 글도 같은 경로로 편집할 수 있다.
- 실제 작성 플로우 쪽도 한 번 더 보강했다.
  - 에디터 하단에서 현재 상태를 바로 markdown 파일로 내보낼 수 있다.
  - 로컬 초안을 폐기하고, 편집 모드에서는 발행 원본으로 되돌릴 수 있다.
  - `beforeunload` 경고는 실제 변경이 있을 때만 붙는다.
  - 관리자 목록은 focus/storage 이벤트 기준으로 로컬 초안을 다시 읽고, 발행 글에 대응되는 로컬 초안 여부를 보여준다.
  - 이 변경으로 `FullScreenEditor` chunk는 약 `13.27 kB -> 15.22 kB`, `PostList`는 약 `7.92 kB -> 8.50 kB`로 소폭 늘었다.
- 메타데이터 가시성도 올렸다.
  - 본문 화면 상단에 `Publish Readiness` 패널을 추가해 slug, 설명, 공개 상태, 예상 읽기 시간, 썸네일 준비 여부를 모달 밖에서 바로 본다.
  - 설명은 본문에서 자동 채우는 버튼으로 바로 생성할 수 있다.
  - 이 변경으로 `FullScreenEditor` chunk는 약 `15.22 kB -> 20.32 kB`로 한 번 더 늘었다.
- 메타 패널을 붙인 뒤에는 출간 모달 역할도 줄였다.
  - slug, 설명, 공개 상태를 모달 안에서 다시 수정하지 않는다.
  - 모달은 최종 확인 항목, 썸네일 업로드, 로컬 markdown 백업, 출간 액션 중심으로 정리됐다.
  - 이 변경으로 `PublishModal` chunk는 약 `8.92 kB -> 9.48 kB` 수준으로 소폭 늘었다.

즉, 지금 프로토타입은 완성형은 아니지만 아래 두 가지는 입증했다.

- admin 에디터를 `CodeMirror 6`로 바꿔도 현재 draft/import/publish 파이프라인은 유지 가능하다.
- 에디터 번들과 스타일 무게도 줄어든다.

## 후보 비교

| 기준 | Milkdown | CodeMirror 6 | Tiptap |
| --- | --- | --- | --- |
| markdown fidelity | 낮음 | 높음 | 중간 |
| 외부 md import 단순성 | 낮음 | 높음 | 중간 |
| round-trip 예측 가능성 | 낮음 | 높음 | 중간 |
| 단축키 설계 자유도 | 중간 | 높음 | 중간 |
| 리치 UI 확장성 | 중간 | 중간 | 높음 |
| 현재 CMS 목표 적합성 | 낮음 | 높음 | 중간 |

### Milkdown

장점:

- 지금 코드가 이미 가장 많이 붙어 있다.
- slash, 이미지 업로드, 코드블록 UI 같은 기능이 어느 정도 있다.

단점:

- markdown fidelity 문제가 이미 보정 코드로 누적돼 있다.
- 한글/escape/ZWSP 같은 예외 처리가 계속 늘어날 가능성이 크다.
- 외부 markdown을 “있는 그대로” 다루는 용도에는 맞지 않는다.

판단:

- 유지보수 관점에서 가장 위험하다.
- 더 보정해서 살릴 수도 있지만, 지금 필요한 방향과는 어긋난다.

### CodeMirror 6

장점:

- markdown 문자열을 중심에 두기 쉽다.
- import/export와 draft/publish를 같은 문자열 기준으로 설계할 수 있다.
- Obsidian에 가까운 작성 경험을 구현하기 좋다.
- 단축키와 키맵 제어가 상대적으로 명확하다.

단점:

- slash menu, 이미지 업로드, 링크 다이얼로그 같은 UI는 다시 붙여야 한다.
- 지금 있는 Milkdown 플러그인을 거의 그대로 재사용하긴 어렵다.

판단:

- 현재 목표와 가장 잘 맞는다.
- “브라우저 안에서 쓰되 markdown 원본은 신뢰 가능해야 한다”는 요구에 제일 자연스럽다.

### Tiptap

장점:

- 리치 에디터 UI를 만들기 쉽다.
- 확장성과 문서화가 좋다.

단점:

- markdown은 여전히 변환 계층을 거친다.
- 지금 문제의 핵심인 round-trip fidelity를 직접 해결해주지 않는다.
- 현재 목표보다 Notion 스타일 편집기에 더 가깝다.

판단:

- 제품형 리치 에디터를 만들고 싶다면 좋지만, 지금 CMS 문제의 1순위를 해결하는 선택은 아니다.

## 1차 결론

현재 기준의 추천은 `CodeMirror 6`이다.

이유는 단순하다.

- 지금 문제의 핵심은 기능 수가 아니라 markdown fidelity다.
- 외부에서 작성한 markdown을 거의 그대로 가져와서 브라우저에서 고치고 다시 publish할 수 있어야 한다.
- 이 요구에는 ProseMirror 계열 WYSIWYG보다 markdown-native 접근이 더 잘 맞는다.
- 현재 `Milkdown` 경로는 보정 코드와 번들 무게까지 같이 안고 있어서, 유지 비용 대비 이점이 줄어든 상태다.
- 다만 frontmatter parsing 자체는 이번 단계에서 개선됐으므로, 남은 핵심 문제는 `표현 보존`과 `editor UX` 쪽으로 더 좁혀졌다.

즉, 다음 단계는 `Milkdown을 더 고치는 것`보다 `CodeMirror 6 기반 작성 흐름을 1차 프로토타입으로 붙이는 것`이 맞다.

## 다음 구현 원칙

- source of truth는 항상 markdown 문자열 하나로 둔다.
- frontmatter는 지원 범위를 명확히 정한 보수적 파서와 직렬화기로 유지한다.
- import, draft, publish가 모두 같은 markdown 문서를 기준으로 움직이게 한다.
- 에디터 교체 후에도 현재 publish 경로와 로컬 draft 경험은 최대한 유지한다.
- 다음 단계에서는 실제 운영 환경에서 publish 후 GitHub 반영과 사이트 배포 반영까지 검증할지, 아니면 썸네일 업로드/카드 미리보기까지 본문 화면으로 더 끌어올릴지 판단한다.
