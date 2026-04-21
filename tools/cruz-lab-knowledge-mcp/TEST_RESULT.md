# Cruz Lab Knowledge MCP 테스트 결과

## 1. 테스트 날짜와 환경

- 테스트 일시: 2026-04-13 21:51:13 KST
- 작업 위치: `/Users/parkjungsub/projects/cruz-lab`
- 실행 환경:
  - Codex CLI: `codex-cli 0.120.0`
  - Node.js: `v22.20.0`
  - MCP 서버 실행 명령: `node /Users/parkjungsub/projects/cruz-lab/tools/cruz-lab-knowledge-mcp/server.mjs`
- 테스트 방식:
  - 새 Codex 세션에서 `cruz-lab-knowledge` MCP 서버가 tools/resources로 노출되는지 확인했다.
  - prompt 호출은 Codex의 현재 도구 표면에는 별도 prompt 호출 도구가 없어, `@modelcontextprotocol/sdk` 클라이언트를 stdio로 직접 연결해 `listPrompts`/`getPrompt`를 확인했다.
  - 2026-04-14 재검증에서 MCP Inspector를 실행했고, Inspector proxy 및 브라우저 GUI로 tools 호출을 확인했다.

## 2. MCP 서버 연결 결과

### `codex mcp list`

성공. `cruz-lab-knowledge` 서버가 등록되어 있었다.

- name: `cruz-lab-knowledge`
- command: `node`
- args: `/Users/parkjungsub/projects/cruz-lab/tools/cruz-lab-knowledge-mcp/server.mjs`
- status: `enabled`
- transport: stdio
- auth: `Unsupported`

실행 중 `WARNING: proceeding, even though we could not update PATH: Operation not permitted (os error 1)` 경고가 같이 출력됐지만, MCP 등록 조회 자체는 성공했다.

### `codex mcp get cruz-lab-knowledge`

성공. 등록 내용은 다음과 같았다.

- enabled: `true`
- transport: `stdio`
- command: `node`
- args: `/Users/parkjungsub/projects/cruz-lab/tools/cruz-lab-knowledge-mcp/server.mjs`
- cwd/env: 없음

### 현재 Codex 세션 노출 상태

성공. 현재 세션에서 다음 MCP tool wrapper가 직접 보였다.

- `list_projects`
- `search_docs`
- `read_doc`
- `get_resume`
- `get_project_context`

resources도 세션에서 조회됐다.

- `cruzlab://projects`
- `cruzlab://resume`
- `cruzlab://project/stock-lab`
- `cruzlab://project/cruz-lab`
- `cruzlab://project/jungle-tetris`
- `cruzlab://project/llm-yatcha`

resource template도 조회됐다.

- `cruzlab://project/{slug}`

prompts는 Codex 세션의 직접 호출 도구로는 노출되지 않았지만, 같은 서버에 MCP SDK 클라이언트로 stdio 연결했을 때 다음 prompt가 확인됐다.

- `interview_questions`
- `blog_post_context`

## 3. Tool 테스트 결과

### `list_projects`

- 입력: 없음
- 결과: 성공
- 핵심 내용:
  - `stock-lab`, `cruz-lab`, `jungle-tetris`, `llm-yatcha`가 모두 보였다.
  - 각 항목에 `slug`, `title`, `description`, `tech`, `tags`, `path`, `relatedPostCount`가 포함됐다.
  - 관련 포스트 수는 `stock-lab: 2`, `cruz-lab: 3`, `jungle-tetris: 2`, `llm-yatcha: 1`로 반환됐다.

### `search_docs`

- 입력: `{ query: "MCP", limit: 10 }`
- 결과: 성공
- 핵심 내용: `data/final-posts/tech/why-everyone-talks-about-mcp.md` 1건이 반환됐다.

- 입력: `{ query: "Cruz Lab", limit: 10 }`
- 결과: 성공
- 핵심 내용: `data/final-posts/README.md`, `data/final-posts/original_resume.md`, `data/final-posts/projects/cruz-lab-v2-offline-accessibility.md`, `data/resume/jungsub_resume.md`, `src/content/projects/cruz-lab/cruz-lab-operating-cms.md`, `src/content/projects/cruz-lab/project.md` 등이 반환됐다.

- 입력: `{ query: "SSE", limit: 10 }`
- 결과: 성공
- 핵심 내용: `original_resume.md`, `llm-yatcha` 관련 final post, `stock-lab` 관련 final/project posts, `jungsub_resume.md`, `src/content/projects/stock-lab/stock-lab-realtime-streaming.md`, `src/content/projects/cruz-lab/project.md` 등이 반환됐다.

- 입력: `{ query: "Web Worker", limit: 10 }`
- 결과: 성공
- 핵심 내용: `original_resume.md`, `data/final-posts/projects/stock-lab-part2-realtime-cost.md`, `data/resume/jungsub_resume.md`, `src/content/projects/stock-lab/stock-lab-realtime-cost.md`가 반환됐다.

- 입력: `{ query: "이력서", limit: 10 }`
- 결과: 성공
- 핵심 내용: `data/resume/jungsub_resume.md` 1건이 반환됐다.

### `read_doc`

- 입력: `{ pathOrSlug: "src/content/projects/cruz-lab/project.md" }`
- 결과: 성공
- 핵심 내용: `Cruz Lab` 프로젝트 문서를 읽었다. frontmatter의 `title`, `description`, `tags`, `tech`, `github`, `featured`, `order`와 본문이 포함됐다.

- 입력: `{ pathOrSlug: "src/content/projects/cruz-lab/cruz-lab-operating-cms.md" }`
- 결과: 성공
- 핵심 내용: `내 블로그를 운영 가능한 제품으로 바꾼 과정` 문서를 읽었다. `project: "cruz-lab"`, `order: 1`, `status: "published"`가 포함됐다.

- 입력: `{ pathOrSlug: "data/final-posts/tech/why-everyone-talks-about-mcp.md" }`
- 결과: 성공
- 핵심 내용: `[AI] MCP는 왜 갑자기 다들 얘기하나` 초안을 읽었다. `status: "draft"`이고, MCP와 function calling, tools/resources/prompts, 보안 경계, 클라이언트 경험 차이를 다루는 글이었다.

### `get_resume`

- 입력: 없음
- 결과: 성공
- 핵심 내용: `data/resume/jungsub_resume.md`가 반환됐다. LLM Yatcha, Stock Lab, Cruz Lab, Jungle Tetris 프로젝트 요약과 기술 스택, 교육/스킬 섹션이 포함됐다.

### `get_project_context`

- 입력: `{ slug: "cruz-lab" }`
- 결과: 성공
- 핵심 내용:
  - `src/content/projects/cruz-lab/project.md` 프로젝트 메타 문서가 포함됐다.
  - 관련 project post로 `cruz-lab-operating-cms`, `cruz-lab-v2-offline-accessibility`, `cruz-lab-knowledge-mcp` 3건이 함께 묶였다.

- 입력: `{ slug: "stock-lab" }`
- 결과: 성공
- 핵심 내용:
  - `src/content/projects/stock-lab/project.md` 프로젝트 메타 문서가 포함됐다.
  - 관련 project post로 `stock-lab-realtime-streaming`, `stock-lab-realtime-cost` 2건이 함께 묶였다.

## 4. Resource 테스트 결과

### `cruzlab://projects`

- 결과: 성공
- 핵심 내용: 프로젝트 목록 4건이 JSON으로 반환됐다. `stock-lab`, `cruz-lab`, `jungle-tetris`, `llm-yatcha`가 포함됐다.

### `cruzlab://resume`

- 결과: 성공
- 핵심 내용: `data/resume/jungsub_resume.md` 내용이 `text/markdown`으로 반환됐다.

### `cruzlab://project/cruz-lab`

- 결과: 성공
- 핵심 내용: `get_project_context`의 `cruz-lab` 결과와 같은 구조로, 프로젝트 메타 문서와 관련 project post 3건이 JSON으로 반환됐다.

## 5. Prompt 테스트 결과

prompt는 Codex의 현재 MCP 도구 표면에서는 직접 호출할 방법이 보이지 않아, MCP SDK 클라이언트를 stdio로 직접 붙여 확인했다.

실행 방식:

```bash
node --input-type=module -e '... @modelcontextprotocol/sdk client로 server.mjs에 stdio 연결 ...'
```

### `interview_questions`

- 입력: `{ slug: "cruz-lab" }`
- 결과: 성공
- 반환 요약:
  - `cruz-lab` 프로젝트 컨텍스트를 바탕으로 면접 질문을 만들라는 사용자 메시지가 반환됐다.
  - 구현 결정, 트레이드오프, 디버깅, 의도적으로 제외한 범위에 집중하라는 지시가 포함됐다.
  - 작은 로컬 MCP 실험을 대표 프로젝트처럼 과장하지 말라는 제약이 포함됐다.
- 판단: 면접 준비용 출발점으로 쓸 수 있다. 다만 실제 질문 생성은 이 prompt를 받은 에이전트가 `get_project_context`를 호출한 뒤 수행해야 한다.

### `blog_post_context`

- 입력: `{ slug: "cruz-lab" }`
- 결과: 성공
- 반환 요약:
  - `cruz-lab` 후속 글을 위한 간결한 writing brief를 준비하라는 사용자 메시지가 반환됐다.
  - 프로젝트 메타 문서와 관련 project post를 source context로 쓰라는 지시가 포함됐다.
  - `cruz-lab-knowledge-mcp`는 tool/resource/prompt 경계를 확인하기 위한 작은 로컬 MCP 서버로 다루라는 제약이 포함됐다.
- 판단: 다음 세션에서 `src/content/projects/cruz-lab/cruz-lab-knowledge-mcp.md` 글감을 잡는 데 쓸 만하다. 과장 방지 문구가 들어 있어 현재 목적과 맞는다.

## 6. 실패 케이스 테스트 결과

### path traversal 차단

- 입력: `read_doc` with `{ pathOrSlug: "../package.json" }`
- 결과: 성공적으로 차단됨
- 반환 메시지: `Document path is outside the allowed read roots: ../package.json`
- 판단: 허용 디렉터리 밖 repo-relative traversal 시도를 차단한다.

### 존재하지 않는 slug

- 입력: `read_doc` with `{ pathOrSlug: "does-not-exist" }`
- 결과: 명확히 실패
- 반환 메시지: `No document found for slug "does-not-exist".`

- 입력: `get_project_context` with `{ slug: "does-not-exist" }`
- 결과: 명확히 실패
- 반환 메시지: `No project found for slug "does-not-exist".`

### 검색 결과 없는 query

- 입력: `search_docs` with `{ query: "__NO_SUCH_QUERY_CRUZ_LAB_MCP_TEST_20260413__", limit: 10 }`
- 결과: 성공
- 반환 내용: `[]`
- 판단: 검색 결과가 없을 때 빈 배열을 자연스럽게 반환한다.

## 7. MCP Inspector 테스트 결과

2026-04-14 20:43 KST에 MCP Inspector를 다시 확인했다.

초기 확인:

```bash
npm exec --offline -- @modelcontextprotocol/inspector --help
which mcp-inspector
npm view @modelcontextprotocol/inspector version
```

결과:

- `which mcp-inspector`: 설치된 실행 파일 없음
- `npm exec --offline -- @modelcontextprotocol/inspector --help`: `ENOTCACHED`
- sandbox 내 `npm view @modelcontextprotocol/inspector version`: `ENOTFOUND registry.npmjs.org`

이후 네트워크 권한을 승인받아 아래 명령을 실행했다.

```bash
npx @modelcontextprotocol/inspector node tools/cruz-lab-knowledge-mcp/server.mjs
```

실행 결과:

- `@modelcontextprotocol/inspector@0.21.1` 설치 후 Inspector 실행 성공
- proxy server: `localhost:6277`
- Inspector web UI: `http://localhost:6274`
- 세션 토큰이 발급됐고, 브라우저를 여는 단계까지 진행됨
- sandbox 안의 `curl`에서는 localhost 포트 접근이 막혔지만, 권한 승인 후 `http://localhost:6274`는 200으로 응답했다.
- `http://localhost:6277/`는 루트 경로라 404를 반환했지만, proxy server 자체는 살아 있었다.

먼저 Inspector가 띄운 proxy의 stdio endpoint를 MCP SDK 클라이언트로 통과시켜 서버 연결과 호출 결과를 확인했다.

검증 방식:

```bash
node --input-type=module -e '... SSEClientTransport로 http://localhost:6277/stdio?command=node&args=tools/cruz-lab-knowledge-mcp/server.mjs&env={}&transportType=stdio 에 연결 ...'
```

확인 결과:

- 서버 연결: 성공. Inspector proxy를 통해 stdio MCP 서버에 연결됐다.
- tools 목록: `list_projects`, `search_docs`, `read_doc`, `get_resume`, `get_project_context`가 모두 보였다.
- `list_projects` 호출: 성공. `stock-lab`, `cruz-lab`, `jungle-tetris`, `llm-yatcha` 프로젝트 목록이 반환됐다.
- `get_project_context` with `{ slug: "cruz-lab" }`: 성공. `src/content/projects/cruz-lab/project.md` 프로젝트 메타 문서와 `cruz-lab-operating-cms`, `cruz-lab-v2-offline-accessibility`, `cruz-lab-knowledge-mcp` project post 3건이 함께 반환됐다.
- resources 목록: `cruzlab://projects`, `cruzlab://resume`, `cruzlab://project/stock-lab`, `cruzlab://project/cruz-lab`, `cruzlab://project/jungle-tetris`, `cruzlab://project/llm-yatcha`가 보였다.
- resource templates: `cruzlab://project/{slug}`가 보였다.
- prompts 목록: `interview_questions`, `blog_post_context`가 보였다.

이후 브라우저 GUI에서도 직접 확인했다. 스크린샷은 `data/mcp_screenshot`에 `sc01.png`부터 `sc11.png`까지 저장했다.

GUI에서 확인한 내용:

- `sc01.png`: Inspector 초기 화면. stdio transport, command `node`, arguments `tools/cruz-lab-knowledge-mcp/server.mjs`, `Connect` 버튼이 보인다.
- `sc02.png`, `sc03.png`: 연결 후 Resources 탭 초기 화면. 연결 상태는 `Connected`이고 서버 이름 `cruz-lab-knowledge-mcp`가 보인다.
- `sc04.png`: Tools 탭에서 `list_projects`, `search_docs`, `read_doc`, `get_resume`, `get_project_context` 목록이 보인다.
- `sc05.png`: `search_docs` tool의 입력 필드 `query`, `scope`, `limit`가 보인다.
- `sc06.png`: `read_doc` tool의 입력 필드 `pathOrSlug`, `scope`가 보인다.
- `sc07.png`: `get_resume` tool이 보인다. 이력서 내용 자체는 공개 스크린샷으로 쓰지 않는 편이 낫다.
- `sc08.png`: `get_project_context` tool의 `slug` 입력 필드가 보인다.
- `sc09.png`: `list_projects` 실행 결과가 `Tool Result: Success`로 표시되고, `stock-lab`, `cruz-lab` 등이 반환된다.
- `sc10.png`: `get_project_context`에 `cruz-lab`을 입력한 상태가 보인다.
- `sc11.png`: `get_project_context` 실행 결과가 `Tool Result: Success`로 표시되고, `projectPosts` 안에 `cruz-lab-operating-cms`가 보인다.

Resources 탭은 포스팅용 스크린샷에서 제외하는 편이 낫다고 판단했다. 대화에 첨부된 Resources 탭 화면에서는 오른쪽 패널 제목은 `project-llm-yatcha`인데 JSON 본문은 `uri: "cruzlab://projects"`를 표시하는 식으로 선택명과 본문이 엇갈려 보였다. SDK와 Inspector proxy 경유 호출에서는 resources 목록과 resource template이 정상 확인됐으므로 서버 응답 문제로 단정하기보다 Inspector GUI의 상태 표시/갱신 문제로 보는 편이 맞다. 포스팅에서는 Resources 탭 문제를 굳이 언급하지 않고, tools 실행과 prompts 확인 중심으로 자연스럽게 넘어가는 편이 낫다.

포스팅에 쓰기 좋은 스크린샷:

- 일반 MCP 기술 글: `sc04.png`, `sc09.png`, `sc11.png`
- Cruz Lab 프로젝트 후속 글: `sc04.png`, `sc10.png`, `sc11.png`
- 보조 자료로만 쓸 만한 스크린샷: `sc01.png`, `sc05.png`, `sc06.png`, `sc08.png`
- 공개 글에서 제외 권장: `sc02.png`, `sc03.png`, Resources 탭이 엇갈려 표시된 첨부 화면, `sc07.png`


판단:

- 이번 재검증에서는 MCP Inspector 실행과 Inspector proxy를 통한 서버 연결이 성공했다.
- 브라우저 GUI에서도 tools 목록과 tool 실행 결과를 직접 확인했다.
- Resources는 Inspector proxy/SDK 경유로 정상 확인했지만, GUI Resources 탭 스크린샷은 상태 표시가 엇갈릴 수 있어 포스팅 자료에서는 제외한다.
- 검증 후 `npx`로 띄운 Inspector 프로세스는 종료했다.

## 8. 이후 글 작성에 쓸 수 있는 관찰

### 일반 기술 글 보강 포인트

`data/final-posts/tech/why-everyone-talks-about-mcp.md`를 보강할 때 쓸 수 있는 관찰:

- function calling과 MCP의 차이를 추상 설명으로만 두지 않고, 실제 서버에서 `tools/list`, `resources/list`, `prompts/list`에 해당하는 경계를 확인했다는 예시를 넣을 수 있다.
- 작은 stdio 서버에서도 tools는 실행 가능한 조회 기능, resources는 URI로 읽는 컨텍스트, prompts는 반복 작업 템플릿이라는 구분이 드러났다.
- 클라이언트 경험 차이도 관찰됐다. Codex 세션에서는 tools/resources가 바로 보였지만, prompts는 현재 도구 표면에서 직접 호출하기 어려워 SDK 클라이언트로 별도 확인했다.
- Inspector 실행과 tool 호출은 확인했으므로 글에서 언급할 수 있다. 다만 Resources 탭 스크린샷은 상태 표시가 엇갈린 화면이 있어 포스팅 자료에서는 빼는 편이 맞다.

### Cruz Lab 프로젝트 후속 글 포인트

`src/content/projects/cruz-lab/cruz-lab-knowledge-mcp.md`를 작성할 때 쓸 수 있는 관찰:

- 이 작업은 블로그/CMS 본체를 바꾸는 작업이 아니라, 기존 Cruz Lab 문서를 read-only MCP 서버로 감싸 에이전트가 조회할 수 있게 한 작은 실험으로 잡는 편이 맞다.
- 실제로 조회된 범위는 프로젝트 메타 문서, 프로젝트 포스트, final post 초안, 이력서 문서다.
- `get_project_context`가 프로젝트 메타 문서와 관련 project post를 함께 묶어주기 때문에 후속 글이나 면접 질문 준비용 컨텍스트를 만들기 쉽다.
- 보안/경계 관점에서는 허용 루트만 읽고, `../package.json` 같은 경로를 차단한 점을 짧게 언급할 수 있다.
- 과장해서 "MCP 기반 포트폴리오 플랫폼"처럼 쓰기보다, "작은 로컬 stdio MCP 서버로 Cruz Lab 문서를 tool/resource/prompt 경계를 통해 조회해봤다" 정도가 정확하다.

## 9. 결론

이번 실험에서 확인한 의미 있는 범위:

- `cruz-lab-knowledge` MCP 서버는 새 Codex 세션에서 등록 상태가 확인됐다.
- 현재 세션에서 MCP tools와 resources가 실제로 노출되고 호출됐다.
- `list_projects`, `search_docs`, `read_doc`, `get_resume`, `get_project_context`는 요구한 정상 케이스에서 모두 동작했다.
- resource URI `cruzlab://projects`, `cruzlab://resume`, `cruzlab://project/cruz-lab`도 읽혔다.
- prompt template `interview_questions`, `blog_post_context`는 MCP SDK 직접 연결로 목록과 호출 결과를 확인했다.
- path traversal, 없는 slug, 검색 결과 없음 케이스도 의도한 방식으로 처리됐다.

과장하면 안 되는 범위:

- 이 서버는 read-only 로컬 stdio MCP 서버다.
- 벡터 검색, 임베딩, 인증, 배포, 원격 MCP, CMS 변경, 웹 UI는 포함하지 않는다.
- MCP Inspector 실행과 GUI 기반 tools 검증은 확인했다. 다만 Resources 탭은 Inspector proxy/SDK 경유로 정상 확인하고, GUI 스크린샷은 포스팅 자료에서 제외하기로 했다.
- prompt가 템플릿으로 반환되는 것은 확인했지만, 그 prompt로 실제 글이나 면접 질문을 생성하는 작업은 이번 테스트 범위가 아니다.

다음 세션에서 포스트 작성으로 넘어가기 전에 남은 작업:

- 포스팅에 사용할 Inspector 스크린샷은 주소창의 `MCP_PROXY_AUTH_TOKEN`을 잘라내거나 가린다.
- `src/content/projects/cruz-lab/cruz-lab-knowledge-mcp.md` 파일을 어떻게 다듬을지 결정한다.
- 일반 기술 글 `data/final-posts/tech/why-everyone-talks-about-mcp.md`에 이번 로컬 MCP 실험을 어느 정도만 반영할지 범위를 정한다.
- 글 작성 시 이번 테스트 결과를 근거로 삼되, Resources 탭 스크린샷은 사용하지 않는다.
