# 재건 3단계 작업 문서: 에디터

- 날짜: 2026-11-09 (작성 중. PR마다 갱신한다)
- Plan: [2026-11-08-stage3-editor-plan.md](./2026-11-08-stage3-editor-plan.md) (승인 2026-11-08, PR #8 병합)
- 진행 기록: [계획 문서 11.7](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md#117-3단계-구현-진행-기록-2026-11-09)
- 브랜치: `stage3/a-markdown`(PR-A), `stage3/b-editor`(PR-B), `stage3/c-commands`(PR-C). 대상은 모두 `rebuild`다.

## 1. 현재 상황

| 항목 | 상태 |
|---|---|
| PR-A (T1 변환기·파이프라인, T2 왕복 검사) | 구현·검증·리뷰 끝. 커밋 `44a41d6`(코드)·`ee31798`(문서), [PR #9](https://github.com/crucial-sub/cruz-lab/pull/9)(대상 `rebuild`). 사용자가 커밋·PR을 승인했다(2026-11-09). 되돌리기 기준 태그 `rebuild-pre-stage3`(`4bc465b`). 병합은 사용자 확인 뒤 |
| PR-B (T3 에디터 페이지, T4 이미지, T6 보기 모드, T8 퍼지) | 시작 전 |
| PR-C (T5 명령·모바일, T7 최소 목록·삭제) | 시작 전 |
| T9 (E2 버킷 CORS, 브라우저 확인, 미리보기 확인) | 시작 전 |
| 외부 변경 | 없음 |
| 운영 데이터 | 읽기만 했다(왕복 검사). 쓰지 않았다 |

## 2. 한 일

### 2.1 T1: 의존성, 스키마, 공유 파이프라인, 변환기 (PR-A)

| 파일 | 내용 |
|---|---|
| `package.json` | `@tiptap/*` 12개를 3.33.0으로 고정(core, pm, react, starter-kit, extension-list, extension-table, extension-image, extension-code, extension-code-block-lowlight, extension-mathematics, suggestion, extensions). lowlight, katex, remark-math, rehype-katex, unified, remark-parse, remark-stringify, remark-rehype, rehype-stringify, unist-util-visit, mdast-util-to-string. dev: @types/mdast, @types/hast, fake-indexeddb. 스크립트 `smoke:roundtrip` |
| `src/lib/content/embed-url.ts` | 임베드 주소 판정(순수 함수). YouTube(`youtu.be`, `watch?v=`, `shorts`), CodeSandbox(`/s/`, `/embed/`, `/p/`). 결과는 `youtube-nocookie.com/embed/<id>`, `codesandbox.io/embed/<id>` 둘뿐 |
| `src/lib/content/remark-callout.ts` | `detectCallout`(변환기와 공유) + remark 플러그인. `> [!note]` 첫 줄 → `div.callout.callout-note[data-callout]`. note·tip·warning만 |
| `src/lib/content/remark-embed.ts` | `embedOfParagraph`(변환기와 공유) + remark 플러그인. 지원 주소 하나만 있는 단락 → `div.embed > iframe`(lazy, sandbox, referrerpolicy) |
| `src/lib/content/markdown.ts` | `parseMarkdown`(remark-parse + gfm + math), `stringifyMarkdown`(Plan 4.2 표기 옵션), `markdownToHtml`(콜아웃·임베드·KaTeX·highlight.js + react-markdown 규칙 이식: 영상 확장자 → video, 외부 링크 새 창, 인라인 코드 클래스), `normalizeForCompare`(D1 규칙 1~5 + 규칙 6) |
| `src/editor/extensions/index.ts` | `createEditorExtensions()` = 스키마. StarterKit(h1~h6, underline 끔) + Code(excludes 'code') + BulletList·OrderedList(`spread` 속성) + CodeBlockLowlight(`meta` 속성) + TaskList·TaskItem(nested) + Table·TableRow·TableCell·TableHeader(셀 내용 `paragraph`) + Image(inline) + Callout + Embed + Mathematics |
| `src/editor/extensions/callout.ts`, `embed.ts`, `lowlight.ts` | 콜아웃 노드(`setCallout`·`unsetCallout`), 임베드 노드(atom, `setEmbed`, renderHTML은 iframe), lowlight `common` + 드롭다운 언어 목록 20종 |
| `src/editor/markdown/to-doc.ts` | mdast → ProseMirror JSON(Plan 4.2 표). ZWSP 제거, soft break → 공백, `<br>`만 HTML로 받음(줄 안 → hardBreak, 블록 → 버림), 그 밖 HTML·노드 → 텍스트 + 경고 |
| `src/editor/markdown/from-doc.ts` | ProseMirror JSON → mdast. 마크는 가장 긴 구간부터 감싼다. 단락 끝 hardBreak는 `<br>`. 빈 단락은 쓰지 않는다. 모르는 노드는 오류 |
| `src/editor/markdown/index.ts` | `markdownToDoc(md) → { doc, warnings }`, `docToMarkdown(doc) → string` |
| `tests/fixtures/markdown/*.md` (10) | 문법 항목별 fixture: 제목·단락, 인라인 마크, 링크·이미지, 목록, 코드, 표, 인용·콜아웃, 브레이크·HTML, 수식·임베드, 한글 혼합(ZWSP·`*`·`***`·`> 💡`) |
| `tests/unit/content-embed-url.test.ts`, `content-markdown.test.ts`, `editor-markdown.test.ts` | 60개. fixture마다 (a) 다시 쓴 마크다운의 렌더가 원문과 같다 (b) 두 번 왕복해도 같다 (c) 스키마 검사(`getSchema` + `nodeFromJSON().check()`) |

변환기와 파이프라인은 DOM이 없는 Node에서 돈다. `@/` 별칭을 쓰지 않고 상대 경로에 `.ts`를 붙여 Node 스크립트가 바로 가져온다(2단계 `entry-schema.ts`와 같은 규칙).

### 2.2 T2: 왕복 검사 (PR-A)

`scripts/smoke/stage3-roundtrip.mjs` (`pnpm smoke:roundtrip`). `entries`를 Admin SDK로 읽기만 한다. 글마다 `markdownToDoc` → 스키마 검사 → `docToMarkdown` → `normalizeForCompare` 비교 → 두 번째 왕복 안정성. `--dump <posts.json>`으로 B1 덤프를 대신 읽을 수 있다(오프라인 반복). `--report <경로>`로 마크다운 보고서를 쓴다.

결과(2026-11-09, `entries` 55편): **55/55 통과, 경고 0건.** 보고서 요약은 4.2.

## 3. 외부 변경

없음. E2(버킷 CORS)는 T9에서 사용자 확인 뒤에 한다.

## 4. 검증 결과

### 4.1 자동 검사 (PR-A, 2026-11-09)

| 항목 | 기준선(2026-11-08) | PR-A |
|---|---|---|
| `pnpm lint` | 통과 | 통과 |
| `pnpm test` | 112 | 185 (+73. 변환기·파이프라인 60 + 리뷰 지적 수정 13) |
| `tsc --noEmit` 오류 | 9 | 9 (새 오류 0. PostList 3, editor-drafts 4, markdown-publish 1, TextReveal 1 그대로) |
| `pnpm build` | 통과 | 통과. 새 모듈은 아직 어느 페이지도 가져오지 않아 청크가 없다. 에디터 청크 크기는 PR-B에서 적는다 |
| 왕복 검사 | — | 55/55 |

### 4.2 왕복 검사 보고서 요약 (T2)

| 항목 | 값 |
|---|---|
| 입력 | Firestore `entries` 55편 `draft.markdown` (B1 덤프 55편도 같은 결과) |
| 통과 | 55/55. 두 번째 왕복도 전부 같다 |
| 경고(지원하지 않는 HTML 등) | 0건 |
| 글머리 `*` → `-` | 506개 |
| 구분선 `***` → `---` | 108개 |
| ZWSP 삭제 | 981개 |
| 본문 크기 | 417,565 → 414,439바이트 |
| `$…$`가 수식으로 읽힌 곳 | 5개, 3편(`$O(1)$`, `$O(logE)$`, `$V$`, `$E$`). 저자가 수식 표기로 쓴 것이다. 에디터·미리보기는 KaTeX로 그리고, 공개 페이지는 4단계까지 글자 그대로 보인다. 왕복 결과 마크다운은 같다 |
| 판단용 집계(리뷰 뒤 추가) | ZWSP만 있는 단락 0, ZWSP 옆 줄바꿈 0, 겹친 마크 순서 패턴(`**[`, `**_`, `~~**` 등) 2(둘 다 통과), `<br`가 있는 표 행 0. 리뷰 6.1의 지적 3·7이 기존 글에는 해당하지 않는다는 근거다 |

처음 실행은 53/55였다. 실패 2편은 모두 `***굵은 기울임***`이었다. CommonMark는 이것을 `<em><strong>`으로 읽는데 변환기가 `<strong><em>`으로 썼다. 마크 감싸기 동률 순서를 "기울임이 굵게보다 바깥"으로 바꿔 55/55가 됐다(5절 7).

### 4.3 API 스모크 (8.3)

PR-A는 API를 바꾸지 않는다. PR-B 뒤에 돌린다.

## 5. Plan과 다르게 하거나 Plan이 정하지 않은 것

PR-A에서 판단한 것:

1. **표 열 정렬은 셀 속성이다.** Plan D10은 표 노드에 `align[]`을 두라고 했다. Tiptap 3.33의 `TableCell`·`TableHeader`에 이미 `align` 속성(`text-align` 스타일)이 있어 그것을 쓴다. 열의 모든 셀이 같은 값을 갖고, 다시 쓸 때는 첫 행 셀의 값을 읽는다. Tiptap의 셀 메뉴와 렌더를 그대로 얻는다.
2. **lowlight 등록 언어는 `common` 묶음이다.** Plan D10은 "기존 12종 + 8종"을 등록하라고 했다. 공개 페이지의 rehype-highlight 기본값이 `common`이라 같은 묶음을 써야 결과가 같다. `common`에 그 20종 중 19종이 있다. `nasm`은 highlight.js common에 없어 공개 페이지도 지금 그리지 않는다. 드롭다운 목록(`CODE_LANGUAGES`)은 20종 그대로다.
3. **Code 마크가 다른 마크와 겹친다.** Tiptap 기본값은 인라인 코드가 모든 마크를 밀어낸다(`excludes: '_'`). 기존 글의 `**`코드`**`(굵게 안의 코드)가 스키마 검사에서 떨어진다. `excludes: 'code'`(자기만)로 바꿨다. 이를 위해 `@tiptap/extension-code`를 직접 의존성으로 더했다(3.33.0).
4. **밑줄 마크를 끈다.** StarterKit 3의 Underline은 마크다운에 대응이 없다. 켜 두면 저장할 때 사라지는 마크가 된다.
5. **정규화 규칙 6: `<br>` 바로 앞뒤의 공백을 지운다.** 줄 안 원시 `<br />` 9개(1.1)를 변환기는 `\`+줄바꿈으로 다시 쓴다. hast에서 `<br>다음`과 `<br>\n다음`이 된다. 브라우저는 줄 끝과 줄 처음의 공백을 그리지 않으므로 렌더는 같다. 규칙 1~5만으로는 이 9개가 모두 실패한다. Plan 부록 A에 적었다.
6. **단락 끝 하드 브레이크는 `<br>`로 쓴다.** `\`가 단락 마지막 줄 끝에 오면 CommonMark는 글자 `\`로 읽는다. 원시 HTML `<br>`은 공개 페이지(rehype-raw)와 미리보기가 같은 `<br>`로 그린다.
7. **마크 감싸기 순서.** 고정 순서(링크 > 굵게 > 기울임 > 취소선)로 감싸면 `_기울임 **안의 굵게**_`가 `<em>…</em><strong><em>…</em></strong>`으로 갈라진다. 각 위치에서 가장 길게 이어지는 마크를 먼저 감싼다. 길이가 같으면 링크 > 기울임 > 굵게 > 취소선이다. CommonMark가 `***x***`를 `<em><strong>x</strong></em>`으로 읽기 때문이다(기존 글 2편).
8. **왕복 스크립트 `--dump` 옵션.** B1 덤프로 Firestore 없이 반복할 수 있다. 기본은 `entries` 읽기 전용이다.
9. **빈 단락은 마크다운에 쓰지 않는다.** 에디터의 빈 단락(Enter 두 번)은 마크다운에 대응이 없다. 저장하면 사라지고, 다시 열면 없다.
10. **지원하지 않는 HTML 경고는 노드마다 하나다.** `<span>…</span>`은 여는 태그와 닫는 태그가 각각 경고다. 기존 글에는 0건이다.

리뷰(6.1) 뒤에 판단한 것:

11. **기울임은 `*`로 쓴다(Plan 4.2는 `_`).** 사용자가 이 상태로 PR-A 진행을 승인했다(2026-11-09). `_`는 단어 안에서 강조를 열고 닫지 못한다. 그래서 mdast-util-to-markdown은 `*기울임*도`처럼 한글 조사가 바로 붙는 자리에서 이웃 글자를 문자 참조로 바꾼다(`_기울&#xC784;_&#xB3C4;`). 렌더는 같지만 백업 저장소와 GitHub에서 읽을 수 없는 마크다운이 된다. 한글 글에서는 매우 흔한 모양이라 `*`로 바꿨다. 되돌리려면 `MARKDOWN_STRINGIFY_OPTIONS.emphasis` 한 줄이다.
12. **하드 브레이크·줄 안 `<br>`·인라인 수식이 바깥 마크를 물려받는다.** 물려받지 않으면 `**가<br>나**`의 굵게가 둘로 갈라진다(`<strong>가</strong><br><strong>나</strong>`). ProseMirror는 인라인 노드에 마크를 허용한다. 스키마 검사를 통과한다.
13. **제목 안과 표 셀 안의 하드 브레이크는 `<br>`로 쓴다.** ATX 제목과 표 셀은 한 줄이라 mdast-util-to-markdown이 `break`를 공백으로 바꾼다. 줄바꿈이 사라진다. 단락 끝(6번)과 같은 방식으로 `<br>`을 쓴다. 셀 안의 단락 여러 개도 `<br>`로 잇는다.
14. **임베드 주소가 날 주소로 다시 읽히지 않으면 `<주소>`로 쓴다.** GFM 자동 링크는 끝의 `_ * ~ . , : ; ! ?`를 링크에서 뺀다. YouTube 공유 주소의 `si=` 값은 `_`로 끝날 수 있다. 날 주소로 쓰면 다시 열 때 임베드가 조용히 사라진다. 쓰기 전에 주소 한 줄을 다시 읽어 같은 임베드가 되는지 확인한다.
15. **공유 파이프라인이 `javascript:`·`data:` 주소를 비운다.** react-markdown의 `defaultUrlTransform`과 같은 규칙(`http`·`https`·`mailto`·`tel`·상대 경로만)을 `a[href]`·`img[src]`에 적용한다. 4단계 공개 페이지가 이 함수를 쓰므로 PR-A에서 넣었다.
16. **ZWSP 바로 옆의 줄바꿈은 없앤다(공백이 아니다).** CSS Text 3의 segment break 변환 규칙으로 브라우저는 U+200B 옆의 줄바꿈을 지운다. 변환기와 정규화가 같은 함수(`removeZwspAndSoftBreaks`)를 쓴다. 기존 글에는 0건이다(4.2 집계).
17. **머리 행보다 많은 표 셀은 자른다.** 공개 페이지(mdast-util-to-hast)가 그렇게 그린다. 자르지 않으면 숨어 있던 셀이 보인다.
18. **모르는 마크는 오류다.** 모르는 노드와 같은 규칙이다. 스키마에 없는 마크(밑줄 등)가 들어오면 저장이 조용히 내용을 잃지 않고 멈춘다.
19. **항목 안에 단락이 연이어 둘이면 느슨한 목록으로 쓴다.** 마크다운은 단락 둘을 빈 줄로만 나눈다. 빈 줄이 있으면 remark는 느슨한 목록으로 읽는다. 처음부터 느슨하게 써야 다시 열었을 때 JSON(`spread`)이 같다. 단락 + 중첩 목록은 빽빽한 채로 둔다.
20. **마크 안의 앞뒤 공백은 마크 밖으로 민다.** ` 굵게 `에 굵게를 걸면 마크다운 `** 굵게 **`는 강조가 아니다. mdast-util-to-markdown은 `**&#x20;굵게&#x20;**`로 피한다. 공백을 밖으로 밀어 `**굵게**`로 쓴다(prosemirror-markdown 방식). 링크는 안에 공백이 있어도 되므로 그대로 둔다.
21. **`nasm`을 lowlight에 등록한다(`x86asm` 별칭).** Tiptap code-block-lowlight는 등록되지 않은 언어를 자동 추측으로 색칠해 공개 페이지(민무늬)와 달라진다. `highlight.js`를 직접 의존성으로 더했다(lowlight가 이미 쓰는 버전). 4단계 공개 파이프라인도 같은 등록을 쓴다.
22. **임베드 노드의 renderHTML은 판정 실패 주소를 링크가 아니라 글자로 그린다.** JSON이 바뀐 경우에만 닿는 자리지만 `javascript:`가 올 수 있다.
23. **왕복 스크립트에 판단용 집계와 `--out`을 더했다.** ZWSP만 있는 단락, ZWSP 옆 줄바꿈, 겹친 마크 순서 패턴, `<br`가 있는 표 행 수. `--out <폴더>`는 실패 글의 원문과 다시 쓴 마크다운을 파일로 쓴다.

알려진 한계(고치지 않음):

- **겹친 마크의 바깥·안 순서.** ProseMirror 마크는 순서가 없다. `**[링크](u)**`와 `[**링크**](u)`, `**_x_**`와 `_**x**_`는 같은 문서가 된다. 변환기는 동률일 때 링크 > 기울임 > 굵게 > 취소선으로 쓴다. 기존 55편은 이 순서로 모두 통과했다(4.2 집계 2건 포함). 새로 쓰는 글에서는 저자가 순서를 고를 수 없고, 렌더 차이는 CSS(`prose a`·`strong` 굵기)에 달렸다.
- **섞인 체크 목록.** `- [ ] a
- b`는 모두 체크 항목이 된다. 기존 글에는 체크 항목이 0건이다.
- **콜아웃 표시의 대소문자.** `[!Note]`는 `[!note]`로 다시 쓰인다. 비교 파서에는 콜아웃 플러그인이 없어 왕복 검사에서는 다르게 보인다(가짜 실패). 기존 글에는 없다.
- **지원하지 않는 HTML 블록이 다음 줄을 삼킨 경우.** CommonMark HTML 블록(7형)은 빈 줄까지 이어진다. `<br />` 바로 다음 줄에 글이 붙어 있으면 그 글까지 경고 대상이 된다. 기존 글 59개 `<br>`는 모두 홀로 있다(왕복 경고 0건이 근거).

## 6. 리뷰 결과

### 6.1 PR-A

새 리뷰어(별도 에이전트, 읽기 전용)가 커밋 전 작업 트리를 검토했다. 의심 입력 60여 건을 직접 돌려 봤다. 치명 0, 중요 7, 경미 11건이었다. 효과 기준으로 다시 나눠 고쳤다. 각 수정은 실패하는 테스트를 먼저 썼다(13개).

| 지적 | 처리 |
|---|---|
| 중요 1: 하드 브레이크·`<br>`·인라인 수식이 바깥 마크를 버려 `**가<br>나**`의 굵게가 갈라진다 | 고침(5절 12) |
| 중요 2: 표 셀·제목 안 하드 브레이크가 공백이 된다 | 고침(5절 13) |
| 중요 3: 겹친 마크의 바깥·안 순서를 복원하지 못한다 | 변환기로 못 고친다(ProseMirror 모델). 실데이터 집계 2건 모두 통과. 알려진 한계로 기록 |
| 중요 4: 끝이 `_`인 임베드 주소가 다시 열 때 사라진다 | 고침(5절 14) |
| 중요 5: `emphasis: '_'`가 한글 조사 앞에서 문자 참조를 만든다 | `*`로 바꿈. 사용자가 이 상태로 진행을 승인(5절 11) |
| 중요 6: 공유 파이프라인에 URL 프로토콜 필터가 없다 | 고침(5절 15) |
| 중요 7a: ZWSP만 있는 단락이 사라진다 | 실데이터 0건. 조치 없음(집계 추가) |
| 중요 7b: ZWSP 옆 줄바꿈을 공백으로 바꾼다(브라우저는 지운다) | 고침(5절 16). 실데이터 0건 |
| 경미 8: 머리 행보다 많은 셀이 보인다 | 고침(5절 17) |
| 경미 9: 섞인 체크 목록 | 알려진 한계 |
| 경미 10: 콜아웃 대소문자 가짜 실패 | 알려진 한계 |
| 경미 11: 지원하지 않는 HTML 블록의 2회 왕복 불안정 | 경고로 이미 실패하므로 두었다. 알려진 한계 |
| 경미 12: 모르는 마크를 조용히 버린다 | 고침(5절 18) |
| 경미 13: 빽빽한 목록 + 단락 둘 → 다시 열면 `spread` 달라짐 | 고침(5절 19) |
| 경미 14: `nasm` 미등록 → 에디터가 자동 추측 색칠 | 고침(5절 21) |
| 경미 15: 임베드 판정 실패 주소를 `<a href>`로 그림 | 고침(5절 22) |
| 경미 16: Plan D3 목록 밖 경로(`youtube.com/embed/`, `/live/`, `codesandbox.io/p/<x>`)를 받음 | 같은 호스트라 위험 없음. 그대로 두고 기록 |
| 경미 17: 스크립트 집계·`--out`·kind/status 열 | 고침(5절 23) |
| 경미 18: 테스트 빈틈 | 위 수정의 테스트 13개와 detectEmbed 적대 입력 테스트를 더했다 |

리뷰어가 확인한 것: detectEmbed는 userinfo·`#@`·하위 도메인 위장·유니코드 호스트·`..` 경로에 모두 null이고 iframe src는 허용 호스트 2개를 벗어날 수 없다. 스크립트는 Firestore를 읽기만 한다. 결정 1·2·4·5·6·8은 타당하고 3은 기존 글 때문에 필요하다.

## 7. 다음 작업

1. [PR #9](https://github.com/crucial-sub/cruz-lab/pull/9) 병합(사용자 확인 뒤). 태그 `rebuild-pre-stage3`(`4bc465b`)는 PR을 열 때 달고 푸시했다.
2. PR-B: T3 에디터 페이지(`/admin/edit/[id]`, EditorApp, 메타 패널, 열기 D5, 자동저장·충돌·오프라인 D6, 발행·숨김·초안 버리기·삭제), T4 이미지 업로드·크기 선택·`GET /api/admin/assets/{id}`·표지, T6 보기 모드 3종, T8 퍼지 방식(D7). 브랜치 `stage3/b-editor`.
3. PR-C: T5 명령 레지스트리·키맵·슬래시·팔레트·툴바·모바일·개요, T7 최소 목록·옛 화면 삭제·`tsc` 재집계. T9 E2·브라우저 확인·미리보기 확인. 브랜치 `stage3/c-commands`.
4. 문서 PR: 이 문서 마무리, 진행 기록 11.7, Plan 14절 드래그 핸들 상기.

## 8. 열린 질문

1. PR-B는 PR-A가 `rebuild`에 병합된 뒤 `rebuild`에서 가지를 치는가, 아니면 `stage3/a-markdown` 위에 쌓는가. 2단계는 PR마다 병합을 기다렸다. 사용자 확인.
2. ~~기울임 표기를 Plan 4.2의 `_`가 아니라 `*`로 쓰는 것(5절 11).~~ 사용자가 이 상태로 진행을 승인했다(2026-11-09).
