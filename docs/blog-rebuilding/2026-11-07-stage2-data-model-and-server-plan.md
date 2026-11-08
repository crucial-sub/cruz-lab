# 재건 2단계 Plan: 데이터 모델과 서버

- 날짜: 2026-11-07
- 상태: **승인됨(2026-11-08).** 사용자 결정 5건의 답은 14절에 모았다. 14절 끝의 "Claude 판단" 목록도 함께 승인받았다. 구현은 새 세션에서 T1부터 한다.
- 브랜치: `rebuild`에서 작업 브랜치를 만든다(예: `rebuild/stage2-data-server`). PR 대상은 `rebuild`다. main이 아니다.
- 근거: [계획 문서](./2026-11-06-blog-architecture-audit-2-problems-and-plan.md) 5.1(A3·A5~A10), 5.4(A13), 8.1~8.4, 10.1, 11.2, 11.3. [1단계 작업 문서](./2026-11-06-stage1-immediate-repairs.md) 2.9, 4절.
- 시각 문서: [visual-plans/2026-11-07-cruz-lab-stage2-plan.html](./visual-plans/2026-11-07-cruz-lab-stage2-plan.html)

## 0. 결론 먼저

1. **새 데이터는 새 컬렉션 `entries`에 둔다(D1, 사용자 결정).** 옛 `posts` 문서는 한 글자도 바꾸지 않는다. 운영(main)은 옛 `posts`를 읽고, `rebuild`는 `entries`를 읽는다. 데이터가 브랜치 사이에서 처음으로 분리된다.
2. **분류를 정리한다.** 55편(발행 54, 초안 1)을 옮긴다. 카테고리 10개, 태그 23종 → 12종, 연재 3개(`wesbos30` 21편, `pintos` 5편, `proxy-lab` 2편)가 된다. 중복 글 1편은 옮기지 않는다(D2, D3, 부록 A).
3. **관리자 인증을 세션 쿠키로 바꾼다.** 모든 관리자 페이지를 서버 렌더링하고, 미들웨어가 쿠키를 검사한다(A10).
4. **글 API를 하나로 모은다.** `/api/admin/posts`가 초안 저장, 발행, 숨김, 삭제를 맡는다. 초안은 서버에 있고 버전 번호로 충돌을 막는다(A3, A7, A8).
5. **이미지는 서버가 처리한다.** 서명 URL로 Storage에 직접 올리고, 서버가 sharp로 webp 3종을 만든다. 글을 지우면 이미지는 "고아"로 표시되고, 7일 뒤 정리 API로 지운다(A6).
6. **백업을 출간 경로에서 뺀다.** 비공개 저장소의 GitHub Action이 매일, 그리고 발행 직후에 Firestore를 마크다운과 JSON으로 커밋한다(A9). 저장소가 공개라서 초안을 공개 저장소에 두지 않는다(D7).
7. **시리즈 컬렉션 코드 약 1,800줄을 지운다.** `/series/*`는 `entries`에서 다시 만든다. 옛 주소 2개는 301로 보낸다. `series` 컬렉션 데이터는 main 병합 뒤에 지운다.
8. **2단계는 규칙·인덱스·함수를 배포하지 않는다.** 운영 설정 변경은 백업 스케줄, Auth 승인 도메인, 백업 저장소 같은 더하기 변경뿐이다. Storage CORS는 3단계로 미룬다. 각 변경은 사용자 확인 뒤에 한다(12절).
9. **기존 관리자 화면은 고치지 않는다(D10, 사용자 결정).** 2단계는 API만 만들고 스모크 테스트로 검증한다. 화면은 3단계(에디터)와 5단계(관리자)가 새로 만든다.

## 1. 출발점: 2026-11-07에 확인한 사실

운영 상태는 소스가 아니라 운영 조회로 확인했다. 모든 조회는 읽기 전용이다.

| 항목 | 값 | 확인 방법 |
|---|---|---|
| Firestore 최상위 컬렉션 | `posts`, `series` 두 개뿐 | Admin SDK `listCollections` |
| `posts` | 56개. published·공개 55, draft·비공개 1(「크래프톤 정글 0주차 에세이」) | Admin SDK |
| `posts`의 옛 필드 | `seriesId`·`seriesOrder`가 43개 문서에 있음. 코드는 읽지 않음 | Admin SDK |
| `updatedAt` 없는 문서 | 1개(`hah2lSGUxneSHRSDhm1r`, 아래 중복 글) | Admin SDK |
| **중복 글** | slug `reactnative-react-native의-new-architecture-더-빠르고-효`인 문서가 2개(`g70nsD1FCw1F4wEkUFAT`, `hah2lSGUxneSHRSDhm1r`). 본문 차이는 끝 줄바꿈 하나뿐. slug 조회는 `g70n…`을 돌려준다. 공개 목록에는 같은 카드가 두 번 나온다(코드 기준) | 본문 diff |
| 「New Architecture 1편」 | Firestore에도, 태그 `pre-rebuild`의 옛 파일 57개에도 없다 | slug 대조 |
| 옛 파일과 Firestore | 옛 파일 57개의 slug 집합 = Firestore slug 집합(55종). 빠진 글 없음 | `git archive pre-rebuild` |
| 본문 이미지 주소 | Firebase Storage 49, `user-images.githubusercontent.com` 35, `github.com` 17, `velog.velcdn.com` 6 | 본문 정규식 |
| 본문의 원시 HTML | 24편 | 본문 정규식 |
| `series` | 2개. `wesbos`(21편), `크래프톤-정글`(22편). `postIds`는 둘 다 문서 ID 형식(A13) | Admin SDK |
| Storage 버킷 | 위치 `US-CENTRAL1`. CORS 설정 없음. `storage.googleapis.com` 사전 요청(PUT)에 허용 헤더가 없다. `firebasestorage.googleapis.com`은 `Access-Control-Allow-Origin: *` | Admin SDK `getMetadata`, `curl -X OPTIONS` |
| Storage | 130개 파일, 28.0 MB. `images/blog` 58개(22.6 MB), `images/heroes` 69개(3.8 MB), `series-covers` 3개. webp 62, png 45, jpeg 18, gif 2, webm 3 | Admin SDK `getFiles` |
| Firestore 위치 | `asia-northeast3`(서울). 삭제 보호 꺼짐. 백업 스케줄 없음 | `firebase firestore:databases:get`, `firestore:backups:schedules:list` |
| Vercel 함수 리전 | `iad1`(미국 동부) | 1편 1.1 |
| 배포된 함수 | 없음 | `firebase functions:list` |
| 배포된 규칙 | Firestore·Storage 모두 2026-11-06 갱신(1단계) | Rules API `releases` |
| 배포된 인덱스 | 4개. `firestore.indexes.json`과 같다 | `firebase firestore:indexes` |
| Auth 승인 도메인 | `localhost`, `cruz-lab.firebaseapp.com`, `cruz-lab.web.app`, `cruz-lab.vercel.app`, `cruzlab.dev`. **`rebuild` 미리보기 주소는 없다** | Identity Toolkit 설정 조회 |
| Secret Manager `GITHUB_TOKEN` | 버전 1, ENABLED. 쓰던 함수는 1단계에서 지웠다 | `firebase functions:secrets:get` |
| GitHub 저장소 | **공개**. 워크플로 없음. Actions 사용 가능 | `gh repo view`, `gh api` |
| 프로젝트 글 | 저장소 파일 8편. 본문이 저장소 이미지 10개를 상대 경로로 쓴다 | `src/content/projects` |
| 라이브러리 | astro 5.13.8, firebase-admin 13.7.0, sharp 0.34.4, zod 4.3.6. 테스트 도구 없음 | `node_modules` |

Vercel·Firebase 공식 문서로 확인한 사실(2026-11-07):

| 사실 | 출처 |
|---|---|
| 응답 헤더 `Vercel-Cache-Tag`로 태그를 붙이고 `@vercel/functions`의 `invalidateByTag()`로 CDN 캐시를 비운다. 모든 플랜. 태그 범위는 프로젝트·환경(production/preview)별 | vercel.com/docs/caching/cdn-cache/purge |
| `set-cookie`가 있는 응답은 CDN이 캐시하지 않는다 | vercel.com/docs/caching/cdn-cache |
| 함수 요청·응답 본문은 4.5 MB까지다. 넘으면 413 | vercel.com/docs/functions/limitations |
| `icn1`은 서울이다. Hobby도 리전 1개를 고를 수 있다. `vercel.json`의 `regions`로 정한다 | vercel.com/docs/functions/configuring-functions/region |
| `vercel.json`의 `git.deploymentEnabled`로 브랜치별 배포를 끈다 | vercel.com/docs/project-configuration/git-configuration |
| 세션 쿠키 만료는 5분~2주. `checkRevoked=true`면 검증마다 네트워크 요청 1회 | firebase.google.com/docs/auth/admin/manage-cookies |
| firebase-admin `getDownloadURL()`은 11.10.0부터 있다 | Admin Node 레퍼런스 |
| V4 서명 URL 만료는 최대 7일. 서명할 때와 올릴 때 `contentType`이 같아야 한다 | cloud.google.com/storage/docs/access-control/signed-urls |
| Firestore 예약 백업은 Blaze 플랜에서 쓴다. 보존은 최대 14주. 복원은 새 DB로만 한다 | firebase.google.com/docs/firestore/backups |
| XML API(`storage.googleapis.com`)는 버킷의 CORS 설정대로만 교차 출처 요청을 허용한다. PUT은 사전 요청을 거치고, 실패하면 본 요청을 보내지 않는다 | cloud.google.com/storage/docs/cross-origin |
| `GITHUB_TOKEN`으로 push해도 다른 워크플로는 돌지 않는다. `repository_dispatch`는 항상 실행을 만든다. 다른 저장소로 보내려면 fine-grained PAT의 Contents 쓰기 권한이 필요하다 | docs.github.com/en/actions/concepts/security/github_token |
| prerender 페이지는 미들웨어를 거치지 않는다 | docs.astro.build/en/guides/middleware |

## 2. 목표와 범위

### 2.1 2단계가 끝나면 참이 되는 것

| 하자 | 2단계 해결 방법 |
|---|---|
| A3 비공개 글이 관리자 목록에 없음 | `GET /api/admin/posts`가 모든 상태를 돌려준다 |
| A5 시리즈 진행률 0% | 시리즈 컴포넌트를 지운다. 진행률 기능은 두지 않는다 |
| A6 삭제 후 이미지 잔존 | 삭제 때 이미지를 고아로 표시한다. 정리 API가 지운다 |
| A7 로컬 초안이 서버 원본을 덮어씀 | 초안이 서버에 있다. 버전 번호가 맞지 않으면 409로 막는다 |
| A8 기기마다 다른 글 수 | 서버가 상태별 수를 센다 |
| A9 GitHub 장애 시 출간 불가 | 출간이 GitHub를 부르지 않는다. 백업은 Action이 한다 |
| A10 관리자 SSR에 인증 없음 | 미들웨어가 세션 쿠키를 검사한다. 관리자 페이지는 모두 SSR |
| A13 시리즈 수정 화면이 글을 지움 | 시리즈 관리 화면을 지운다. 마이그레이션은 `postIds`의 두 형식을 읽는다 |

### 2.2 하는 것

1. 새 스키마와 검증 코드(zod).
2. 마이그레이션 스크립트(시험 실행, 실제 실행, 재동기화, 되돌리기, 복원).
3. 세션 쿠키 인증과 관리자 미들웨어.
4. `/api/admin/posts` API와 `/api/admin/assets` API.
5. 공개 페이지의 데이터 경로를 `entries`로 바꾼다. 화면은 바꾸지 않는다.
6. 시리즈 컬렉션 코드 제거, `/series/*` 재구성과 리다이렉트.
7. CDN 캐시 태그와 발행 시 퍼지. 함수 리전을 `icn1`로 옮긴다.
8. 백업 저장소와 Action.
9. 단위 테스트 도구(vitest) 도입.

### 2.3 하지 않는 것

| 하지 않는 것 | 이유 또는 단계 |
|---|---|
| 에디터 교체, 오프라인 큐 | 3단계 |
| 공개 화면 재설계, 카테고리 목록 UI, 본문 HTML·목차 미리 계산 | 4단계 |
| 기존 관리자 화면을 새 API에 연결 | 하지 않는다(D10). 3단계 에디터와 5단계 관리자 화면이 새 API를 처음 쓴다 |
| 관리자 화면 재설계, 리비전 보기·되돌리기 UI, 태그 이름 바꾸기 | 5단계 |
| 예약 발행 | 쓰는 요구가 아직 없다. 스키마는 막지 않는다(D4) |
| 외부 이미지(velog, GitHub) 복사 | 2단계 범위 밖. 후속 후보로 남긴다(13절) |
| 옛 `posts`·`series` 데이터와 옛 필드 삭제 | main 병합 뒤 별도 작업(11.3 조건 3) |
| Firestore·Storage 규칙, 인덱스 배포 | 필요 없다. 새 컬렉션은 기본 거부이고 클라이언트가 읽지 않는다 |
| 기존 slug 변경 | 8.4. 모든 `/blog/<slug>`를 유지한다 |

## 3. 설계 결정

결정마다 누가 정했는지 적는다. "사용자 결정"의 답은 14절에 모았다. "Claude 판단"은 최종 승인할 때 함께 확인한다.

### D1. 데이터 공존 방식: 새 컬렉션 `entries` (사용자 결정 2026-11-08: B)

**문제.** Firebase 프로젝트 하나를 운영(main)과 `rebuild`가 함께 쓴다. 운영 CMS는 병합 전까지 옛 `posts`에 계속 쓴다. 8.1은 목표 모델을 `posts/{id}`에 두었다. 그런데 새 모델은 옛 필드와 이름이 겹친다. `title`(접두사를 뗌)과 `tags`(정규화)가 겹친다.

| | A. 같은 `posts` 문서에 새 필드 추가 | **B. 새 컬렉션 `entries` (결정)** |
|---|---|---|
| 옛 문서 변경 | 새 필드를 더한다. `title`·`tags`는 다른 이름(`displayTitle` 같은)이 필요하다 | 없다 |
| 운영 영향 | 옛 코드가 `update()`로 쓰므로 새 필드가 남는다. 동작은 한다 | 없다 |
| 새 관리자로 쓴 글 | 운영에도 보이게 옛 필드를 같이 써야 한다(이중 쓰기) | `rebuild`에만 보인다. 운영과 섞이지 않는다 |
| 운영에서 고친 글 | 같은 문서라 바로 보이지만, 새 필드가 낡는다 | 재동기화가 옮긴다(5.4) |
| 되돌리기 | 새 필드를 문서마다 지운다 | 컬렉션을 통째로 지운다 |
| 병합 뒤 정리 | 옛 필드 7개를 문서마다 지우고, 임시 이름을 다시 바꿔야 한다 | 옛 `posts` 컬렉션을 지운다 |

**선택 이유.** B는 "더하기만" 조건을 문서 단위가 아니라 컬렉션 단위로 지킨다. 임시 필드 이름이 영구 스키마에 남지 않는다. 대가는 컬렉션 이름이 `posts`가 아니라는 점이다. API 경로는 `/api/admin/posts`로 둔다. 컬렉션 이름은 코드 한 곳(`src/lib/server/entries.ts`)에만 둔다.

**문서 ID.** `entries/{id}`의 ID는 옛 `posts/{id}`와 같다. 그래서 재실행해도 같은 문서를 가리킨다(멱등).

### D2. 분류: 카테고리, 태그, 연재 (사용자 승인 2026-11-08)

10.1의 결정을 실제 글에 적용했다. 결과는 부록 A의 표다.

- `category`는 글마다 1개다. 값은 코드 상수(`src/lib/taxonomy.ts`)의 key다. 표시 이름은 상수가 갖는다. URL에 쓰기 좋게 key는 영문이다.
- `tags`는 정규화한 문자열 배열이다. 정규화 규칙은 아래와 같다.
  1. 앞뒤 공백을 지우고 유니코드 NFC로 맞춘다.
  2. 영문은 소문자로 바꾼다.
  3. 공백 묶음은 `-` 하나로 바꾼다.
  4. 별칭을 합친다(`크래프톤정글` → `크래프톤-정글`).
  5. 카테고리와 뜻이 같은 태그는 뺀다(`javascript`, `운영체제`, `reactnative`, `에세이` 등).
  6. 중복을 뺀다. 3개를 넘으면 저장을 거부한다. 기존 글 1편은 매핑 표에서 3개로 줄인다.
- 태그는 정규화한 값을 그대로 표시한다(`#크래프톤-정글`, `#csapp`). 별도 표시 이름은 두지 않는다(Claude 판단).
- `series`는 `{ key, order }` 또는 `null`이다. 연재 제목·설명은 `seriesMeta/{key}`에 둔다. 관리 화면은 없다(10.1).
- 제목에서 `[접두사] `를 뗀다.

### D3. 중복 글 (Claude 판단, 사용자 승인 2026-11-08)

`hah2lSGUxneSHRSDhm1r`은 옮기지 않는다. 이유: 본문이 `g70n…`과 같다(끝 줄바꿈만 다름). 운영의 slug 조회는 `g70n…`을 돌려준다. `updatedAt`도 없다. 옛 문서는 그대로 둔다. 병합 뒤 정리 때 함께 지운다. 마이그레이션 보고서에 "제외 1건"으로 적는다.

### D4. 상태 모델 (Claude 판단)

`status`는 `draft` | `published` | `hidden` 세 값이다.

| 상태 | 뜻 | 공개 페이지 |
|---|---|---|
| `draft` | 한 번도 발행하지 않았다. `published` 스냅샷이 없다 | 404 |
| `published` | 발행했고 보인다 | 보인다 |
| `hidden` | 발행했지만 숨겼다. `published` 스냅샷은 남는다 | 404 |

- 8.1은 숨김을 `unlisted`라고 불렀다. 흔히 `unlisted`는 "목록에는 없지만 주소로는 열린다"는 뜻이다. 여기서는 주소로도 열리지 않는다. 그래서 `hidden`으로 부른다.
- 예약 발행(`scheduled`)은 2단계에서 만들지 않는다. 나중에 만들면 "미래의 `publishedAt`"으로 표현할 수 있다. 지금 스키마는 그 길을 막지 않는다.
- "발행 후 고친 내용이 있음"은 `draft.version != published.fromDraftVersion`으로 계산한다. 별도 상태를 두지 않는다.

**`kind`별 규칙 (Claude 판단).** 10.2는 노트를 "짧고 거친 공개 기록"으로 정했다. 노트를 보여 줄 `/notes`와 홈 화면은 4단계가 만든다.

| | `post` | `note` | `project` |
|---|---|---|---|
| 2단계 공개 페이지(`/blog`, 태그, RSS, 사이트맵, `/blog/<slug>`) | 보인다 | 보이지 않는다(4단계에서 `/notes`) | 2단계는 만들지 않는다(D11) |
| 발행 때 필수 | 제목, 설명, slug, 카테고리, 본문 | 본문만. 제목·카테고리·설명은 선택. slug가 비면 `note-YYYYMMDD-HHmm`으로 만든다 | — |
| slug 공간 | 모든 kind가 하나의 slug 공간을 쓴다(유일성 검사 공통) | | |

### D5. 인증: 세션 쿠키 (Claude 판단)

| 항목 | 정한 값 | 이유 |
|---|---|---|
| 관리자 식별 | 서버 환경 변수 `ADMIN_UID` + `email_verified` | 이메일은 바뀔 수 있다. UID는 바뀌지 않는다 |
| 쿠키 발급 | `POST /api/admin/session`. ID 토큰을 `verifyIdToken(token, true)`로 검증한다. 로그인 5분 이내 토큰만 받는다 | Firebase 문서 예시와 같다 |
| 쿠키 | 이름 `cruz_admin`, `HttpOnly`, `Secure`(로컬 http 제외), `SameSite=Lax`, `Path=/`, 만료 14일 | 모바일에서 자주 다시 로그인하지 않게 한다. 14일은 최대값 |
| 검증 | 미들웨어가 `/admin/**`, `/api/admin/**`에서 `verifySessionCookie(cookie, true)` | 로그아웃·폐기를 바로 반영한다. 관리자 요청은 적어서 네트워크 1회는 문제없다 |
| CSRF | 쓰기 요청(POST·PUT·DELETE)은 `Origin`이 요청 주소의 origin과 같아야 한다. 다르면 403 | `SameSite=Lax`와 겹으로 막는다 |
| 실패 처리 | 페이지는 `/admin/login?next=…`로 302. API는 401 JSON | 저장소가 공개라 관리자 경로를 숨겨도 얻는 것이 없다 |
| 로그아웃 | `DELETE /api/admin/session`. 쿠키만 지운다. `?all=1`이면 `revokeRefreshTokens(uid)`까지 한다 | Firebase Auth 프로젝트가 하나라서 토큰을 폐기하면 운영 관리자 화면도 모든 기기에서 다시 로그인해야 한다. 병합 전에는 기본 로그아웃이 운영에 영향을 주지 않게 한다(Claude 판단) |
| 관리자 페이지 | 모두 `prerender = false`. `AdminGuard`의 클라이언트 검사는 지운다 | prerender 페이지는 미들웨어를 거치지 않는다 |
| 공개 페이지 | 미들웨어가 쿠키를 읽지도 쓰지도 않는다 | `set-cookie`가 있으면 CDN이 캐시하지 않는다 |

옛 방식(`identitytoolkit accounts:lookup` REST + 이메일 비교, `Authorization: Bearer`)은 `rebuild`에서 지운다.

### D6. 이미지: 서명 URL 업로드 + sharp 변형 (Claude 판단)

**흐름.**

1. 클라이언트가 파일의 SHA-256을 계산한다. `POST /api/admin/assets/upload-url`에 이름·형식·크기·해시를 보낸다.
2. 같은 해시의 자산이 있으면 서버는 그 자산을 돌려준다. 업로드를 건너뛴다.
3. 없으면 서버가 `assets/{id}` 문서를 `pending`으로 만든다. `assets/{id}/original.<ext>`에 대한 V4 서명 PUT URL을 15분 만료로 돌려준다.
4. 클라이언트가 Storage에 직접 PUT한다. 함수의 4.5 MB 한도를 거치지 않는다.
5. 클라이언트가 `POST /api/admin/assets/{id}/finalize`를 부른다. 서버가 원본을 읽어 검사하고 변형을 만든다.

**변형 규칙.**

| 입력 | 처리 |
|---|---|
| png, jpeg, webp | 회전 보정, 메타데이터(EXIF·GPS) 제거, webp `w480`·`w960`·`w1600`. 원본보다 큰 폭은 만들지 않는다. 최대 변형 폭은 원본 폭(최대 2400)이다. 변형을 만든 뒤 원본은 지운다 |
| gif | 움직이는 webp로 같은 규칙 |
| webm, mp4 | 변형 없음. 원본을 그대로 둔다 |
| svg 등 그 밖 | 거부한다(스크립트를 품을 수 있다) |
| 크기 한도 | 이미지 20 MB, 영상 100 MB |

- 공개 주소는 `getDownloadURL()`이 주는 Firebase 다운로드 URL이다. 지금 글의 이미지 주소와 같은 형식이다.
- 본문 마크다운은 가장 큰 변형의 주소를 넣는다. 4단계 렌더러는 주소 안의 `assets/{id}`로 `srcset`을 만들 수 있다.
- 서명 URL로 브라우저가 직접 PUT하려면 버킷 CORS 설정이 필요하다(외부 변경 E2, 3단계). 2단계의 스모크 테스트는 Node에서 올리므로 CORS를 거치지 않는다. 2026-11-07에 확인했다(1절). 지금 버킷의 CORS 설정은 비어 있다. 서명 URL이 쓰는 `storage.googleapis.com`에 사전 요청(OPTIONS)을 보내면 `Access-Control-Allow-Origin` 없이 돌아온다. 그래서 브라우저가 업로드를 막는다. 지금 업로드가 되는 이유는 클라이언트 SDK가 다른 주소(`firebasestorage.googleapis.com`)를 쓰기 때문이다. 그 주소는 모든 origin을 허용한다.

**정리.**

- 글을 저장·발행할 때 본문과 표지에서 Storage 주소를 뽑는다. `assets.usedBy`를 갱신한다.
- 글을 지우면 그 글이 쓰던 자산에서 글 ID를 뺀다. `usedBy`가 비면 `orphanedAt`을 적는다.
- `POST /api/admin/assets/purge`가 고아가 된 지 7일 지난 자산을 지운다. 기본은 시험 실행이다. 지우기 직전에 다음을 전부 다시 훑는다. 하나라도 쓰면 지우지 않는다.
  - `entries`의 초안·발행본 본문과 표지.
  - 옛 `posts`의 본문과 `heroImage`.
  - 옛 `series`의 `coverImage`.
- **main 병합 전에는 `legacy: true` 자산을 정리 대상에서 뺀다(Claude 판단).** 운영이 옛 이미지를 계속 쓰기 때문이다(11.3 조건 2·3). 병합 뒤 정리 작업(15절)에서 이 제한을 푼다. 마이그레이션은 legacy 자산에 `orphanedAt`을 적지 않는다. 보고서에 "어느 글도 쓰지 않는 파일" 목록으로만 적는다.
- 리비전이 가리키는 이미지는 보호하지 않는다. 오래된 리비전을 복원하면 이미지가 빠질 수 있다. 5단계 리비전 UI에서 다시 본다.

**기존 이미지 130개.** 마이그레이션이 `assets` 문서를 `legacy: true`로 만든다. 경로는 그대로 둔다. 변형은 만들지 않는다. 그래야 고아 판정이 옛 이미지에도 적용된다.

### D7. 백업 (백업 위치: 사용자 결정 2026-11-08, a. 새 비공개 저장소)

세 겹으로 나눈다. 역할이 서로 다르다.

| 겹 | 무엇 | 언제 | 복원 |
|---|---|---|---|
| B1 실행 전 덤프 | 마이그레이션 스크립트가 쓰기 전에 모든 컬렉션을 JSON으로 저장한다. 위치는 저장소 밖 `~/projects/cruz-lab-backups/<시각>/` | 실제 실행마다. 덤프가 실패하면 스크립트가 멈춘다 | 복원 스크립트(5.7) |
| B2 Firestore 예약 백업 | 일간, 보존 7일. 데이터베이스 삭제 보호도 켠다 | 마이그레이션 전에 켠다(E1) | 새 DB로 복원한 뒤 필요한 문서를 옮긴다 |
| B3 GitHub 백업 | 사람이 읽는 마크다운 + 손실 없는 JSON | 매일 + 발행 직후 | 파일에서 다시 넣는다 |

**B3 위치(사용자 결정: a).** cruz-lab 저장소는 공개다. 초안과 숨긴 글을 이 저장소의 브랜치에 커밋하면 공개된다.

| | **a. 새 비공개 저장소 `crucial-sub/cruz-lab-content` (결정)** | b. 공개 저장소의 `content` 브랜치 |
|---|---|---|
| 담는 것 | 모든 상태의 글, 옛 `posts`·`series`, `assets` 목록 | 발행 글만 |
| 예약 실행 | 그 저장소의 기본 브랜치에 워크플로가 있어 바로 돈다 | 예약 워크플로는 기본 브랜치(main)에만 있어야 돈다. main 병합 전에는 못 돈다 |
| Vercel | 상관없다 | `content` 브랜치 push마다 미리보기 빌드가 생긴다. 그 브랜치에 `git.deploymentEnabled: false`를 둬야 한다 |
| 비밀값 | 읽기 전용 서비스 계정 키, 발행 직후 알림용 PAT(그 저장소 Contents 쓰기만) | 같다 |

**B3 구성(a 기준).**

- 백업 저장소의 워크플로: 매일 03:00 KST, 수동 실행, `repository_dispatch`(`content-changed`).
- 내보내기 스크립트는 백업 저장소에 둔다. 출력은 다음과 같다.
  - `published/<slug>.md`: frontmatter(카테고리, 태그, 연재, 날짜) + 발행본 마크다운.
  - `drafts/<id>.md`: 발행본과 다른 초안.
  - `raw/<컬렉션>/<id>.json`: 문서 전체. 시각은 ISO 문자열.
  - `assets/index.json`: Storage 파일 목록과 `assets` 문서.
- 바뀐 것이 있을 때만 커밋한다. 커밋은 백업 저장소의 `GITHUB_TOKEN`(`contents: write`)으로 한다.
- Firestore 읽기는 새 서비스 계정 `cruz-lab-backup`(역할 `roles/datastore.viewer`, `roles/storage.objectViewer`)으로 한다. 지금의 관리자 키를 GitHub에 두지 않는다.
- 발행 API는 발행 뒤 `repository_dispatch`를 보낸다. 2초 안에 응답이 없거나 실패해도 발행은 성공으로 끝난다. 응답에 `backup: 'failed'`를 적는다.

**Secret Manager `GITHUB_TOKEN`.** 쓰는 곳이 없다. 지우기를 권장한다(E6). 그 값이 개인 토큰이면 GitHub에서도 폐기한다. Vercel 운영 환경의 `GITHUB_TOKEN`은 운영 CMS가 `data/post-archive`에 쓰므로 병합 전까지 둔다.

### D8. CDN 퍼지 (Claude 판단)

- 공개 응답에 `Vercel-Cache-Tag`를 붙인다. 목록성 페이지(홈, `/blog`, 태그, `/series/*`, RSS, 사이트맵)는 `posts`. 글 상세는 `posts,post-<id>`.
- 발행·숨김·다시 보임·삭제 뒤 `invalidateByTag(['posts', 'post-<id>'])`를 부른다. 같은 서버 인스턴스의 메모리 캐시도 비운다.
- 태그는 환경별이다. `rebuild` 미리보기에서 발행하면 미리보기 캐시만 비운다. 운영 캐시는 건드리지 않는다.
- 로컬(Vercel 밖)에서는 퍼지를 건너뛰고 응답에 `purge: 'skipped'`를 적는다.
- 퍼지가 실패해도 발행은 성공이다. 지금처럼 60초 뒤에는 새 내용이 나온다.

### D9. 함수 리전 `icn1` (Claude 판단)

`vercel.json`에 `"regions": ["icn1"]`을 둔다. Firestore가 서울에 있다. 지금은 공개 페이지가 Firestore를 읽을 때마다 미국 동부와 서울을 오간다. `vercel.json`은 배포마다 적용되므로 `rebuild` 미리보기만 바뀐다. 운영은 병합할 때 바뀐다. 검증은 응답 헤더 `x-vercel-id`로 한다.

### D10. 기존 관리자 화면 연결 범위 (사용자 결정 2026-11-07: b. API만)

공개 페이지가 `entries`를 읽게 되면, 옛 API로 쓰는 지금의 관리자 화면은 `rebuild`에서 쓸모가 없어진다.

| | a. 최소 연결 | **b. API만 만든다 (결정)** |
|---|---|---|
| 내용 | 목록·글 열기·자동 저장·발행·숨김·삭제·이미지 업로드를 새 API로 바꾼다. 메타 패널에 카테고리 선택과 연재 key·순서 입력을 더한다. CodeMirror와 화면 모양은 그대로 | 화면은 손대지 않는다. API는 스크립트로만 검증한다 |
| 얻는 것 | `rebuild`에서 처음부터 끝까지 쓸 수 있다. A3·A7·A8을 화면에서 확인한다 | 2단계가 작다. 버릴 화면 코드를 고치지 않는다 |
| 잃는 것 | 3·5단계에서 버릴 화면 코드 6개 파일(약 2,700줄)을 고친다 | 3단계까지 `rebuild`의 관리자 화면은 로그인까지만 된다 |

**결정 이유.**

1. 사용자는 재건이 끝날 때까지 새 글을 쓸 계획이 없다. "병합 전에 `rebuild`에서 글을 쓸 수 있다"는 이득이 사라진다.
2. 스모크 테스트(10.3)가 API의 상태 코드와 상태 변화를 확인한다. 충돌 안내 화면은 3단계 에디터가 새로 만든다.
3. 3단계 에디터가 이 API를 실제로 쓰는 첫 화면이다. 그때 API를 고쳐도 모두 `rebuild` 안의 일이다.
4. 고칠 파일 6개(`FullScreenEditor.tsx` 788줄, `PostList.tsx` 579줄, `PublishModal.tsx` 458줄, `AdminDashboard.tsx` 359줄, `EditorMetaPanel.tsx` 335줄, `media-upload-client.ts` 197줄)는 3·5단계에서 모두 버린다.

**이 결정으로 생기는 일.**

1. `rebuild`의 관리자 화면은 로그인과 미들웨어만 새 방식으로 동작한다. 목록, 저장, 발행, 삭제는 옛 API를 지운 뒤(T9) 실패한다. 3단계 전까지 이 화면을 쓰지 않는다.
2. 옛 화면의 이미지 업로드는 클라이언트 SDK로 Storage에 직접 올린다. 이 경로는 2단계 뒤에도 동작한다. 더하기라서 운영에 해는 없지만 쓰지 않는다.
3. 병합 전에 글을 써야 하면 운영 관리자 화면(`https://www.cruzlab.dev/admin`)으로 쓴다. 재동기화(5.4)가 그 글을 `entries`로 옮긴다.
4. 옛 화면이 가져오는 lib 4개는 2단계에서 지우지 않는다(6.5). 지우면 `pnpm build`가 깨진다.
5. 버킷 CORS(E2)는 3단계로 미룬다. 브라우저 업로드가 3단계에 처음 생긴다.

### D11. 프로젝트 글 이전 시점 (사용자 결정 2026-11-08: 4단계)

10.1의 4번은 프로젝트 글 8편을 2단계에서 `kind: 'project'`로 옮긴다고 했다. 옮기려면 저장소 이미지 10개를 Storage로 올리고, `/projects` 페이지를 Firestore에서 읽게 바꿔야 한다. 4단계가 `/projects`를 다시 만든다. 2단계에서 옮기면 `/projects`를 두 번 고친다. **결정: 스키마는 지금 `kind: 'project'`를 받게 만들고, 데이터 이전은 4단계에서 페이지와 함께 한다.** 그동안 프로젝트 글은 지금처럼 `src/content/projects/` 파일로 고치고 배포한다.

## 4. 목표 스키마

### 4.1 `entries/{id}`

```
entries/{id}                       // id = 옛 posts의 문서 ID (새 글은 자동 ID)
  kind: 'post' | 'note' | 'project'
  status: 'draft' | 'published' | 'hidden'
  createdAt: Timestamp
  updatedAt: Timestamp             // 문서가 마지막으로 바뀐 시각
  publishedAt: Timestamp | null    // 첫 발행 시각. 다시 발행해도 그대로 (= 옛 pubDate)
  lastPublishedAt: Timestamp | null// 마지막 발행 시각 (= 옛 updatedDate)
  slugHistory: string[]            // 예전 slug. 공개 페이지가 301로 보낸다
  draft: EntryContent & {
    version: number                // 저장할 때마다 1 증가. 충돌 검사에 쓴다
    updatedAt: Timestamp
    device: string | null          // 마지막으로 저장한 기기 이름
    editorJson: object | null      // 3단계 에디터용. 2단계는 그대로 저장만 한다
  }
  published: (EntryContent & {
    revision: number               // 발행할 때마다 1 증가
    fromDraftVersion: number       // 어느 초안 버전을 발행했나
    readingTime: number            // 분
    wordCount: number
  }) | null
  legacy: {                        // 마이그레이션으로 만든 문서에만 있다
    postId: string
    sourceUpdatedAt: Timestamp     // 마지막으로 옮긴 옛 문서의 updatedAt
    syncedDraftVersion: number     // 그때의 draft.version
    syncedRevision: number         // 그때의 published.revision
    syncedStatus: string           // 그때의 status. 숨김도 rebuild 쪽 변경으로 본다
    migratedAt: Timestamp
    mappingVersion: number
  } | null

EntryContent = {
  title: string                    // 접두사 없음
  description: string
  slug: string
  category: CategoryKey
  tags: string[]                   // 정규화, 최대 3
  series: { key: string, order: number } | null
  cover: { kind: 'generated' } | { kind: 'image', url: string, assetId: string | null }
  markdown: string
}
```

**규칙.**

- `status`가 `draft`면 `published`는 `null`이다. `published`·`hidden`이면 `published`가 있다.
- 공개 페이지는 `status == 'published'` 문서의 `published`만 읽는다. 목록은 `select()`로 `published.markdown`을 빼고 읽는다.
- 공개 slug 조회는 `published.slug`로 한다. 없으면 `slugHistory`(array-contains)로 찾아 301로 보낸다.
- slug는 `published` 상태와 `hidden` 상태의 모든 글에서 유일해야 한다. `slugHistory`의 값과도 겹치면 안 된다.
- 새 slug 형식은 `^[a-z0-9가-힣]+(-[a-z0-9가-힣]+)*$`다. 이미 있는 slug는 이 규칙을 따르지 않아도 된다(`reactnative-flatlist-feat-`처럼 `-`로 끝나는 것이 있다). 바꾸지 않으면 검사하지 않는다.
- 문서 크기 한도는 1 MiB다. 초안 저장은 900 KB를 넘으면 거부한다.
- 이 쿼리들은 단일 필드 자동 인덱스로 된다. 새 복합 인덱스는 필요 없다. 정렬은 메모리에서 한다(글이 수백 편이어도 충분하다).

### 4.2 그 밖의 컬렉션

```
entries/{id}/revisions/{revision}  // 발행할 때마다 published 스냅샷을 복사한다
  ...published 필드, publishedAt: Timestamp

seriesMeta/{key}                   // 연재 제목·설명. 관리 화면 없음
  title: string, description: string

assets/{id}
  storagePath: string              // 원본 경로(영상, legacy) 또는 가장 큰 변형 경로
  url: string                      // 본문에 넣는 주소
  contentType, bytes, width?, height?
  sha256: string | null            // 같은 파일 재업로드를 막는다. legacy는 null
  variants: { w480?, w960?, w1600?, max: { path, url, width, height, bytes } } | null
  status: 'pending' | 'ready'
  legacy: boolean                  // 마이그레이션이 만든 옛 이미지
  usedBy: string[]                 // entries ID
  orphanedAt: Timestamp | null
  uploadedAt: Timestamp

publishLog/{autoId}
  entryId, action: 'publish' | 'hide' | 'unhide' | 'delete', revision?, slug, at

entryTombstones/{id}               // rebuild에서 지운, 마이그레이션 출신 글. 재동기화가 되살리지 않게 한다
  legacyPostId, deletedAt, lastSlug
```

- `settings/editor`는 3단계에서 만든다.
- 클라이언트 SDK는 이 컬렉션들을 읽지도 쓰지도 않는다. 규칙에 따로 적지 않아도 기본 거부다.

### 4.3 카테고리 상수

| key | 표시 이름 | 같은 뜻의 태그(빠짐) |
|---|---|---|
| `ai` | AI | `ai` |
| `javascript` | JavaScript | `javascript` |
| `react` | React | `react` |
| `react-native` | React Native | `reactnative`, `react-native` |
| `os` | 운영체제 | `운영체제` |
| `data-structure` | 자료구조 | `자료구조` |
| `algorithm` | 알고리즘 | `알고리즘` |
| `network` | 네트워크 | `네트워크` |
| `computer-architecture` | 컴퓨터구조 | `컴퓨터구조` |
| `retrospective` | 회고 | `회고`, `에세이` |

카테고리를 더하려면 코드를 바꾼다. 5단계에서 관리 화면이 필요하면 `settings`로 옮긴다.

## 5. 마이그레이션 스크립트 설계

### 5.1 파일

| 파일 | 하는 일 |
|---|---|
| `scripts/migrate/stage2-mapping.json` | 접두사 → 카테고리, 태그 별칭, 글별 예외, 연재 배정, 제외 목록. 사람이 검토하는 유일한 입력 |
| `src/lib/migrate/legacy-to-entry.ts` | 옛 문서 1개 → `entries` 문서 1개. 순수 함수. 단위 테스트 대상 |
| `scripts/migrate/stage2-entries.mjs` | 시험 실행(기본), 실제 실행(`--apply`), 삭제 전파(`--propagate-deletes`) |
| `scripts/migrate/stage2-rollback.mjs` | 새 컬렉션과 `assets/` 경로만 지운다(5.7) |
| `scripts/migrate/stage2-restore.mjs` | B1 덤프에서 새 컬렉션을 되살린다(5.7) |

입력은 Firestore `posts`·`series`와 Storage 파일 목록이다. `content/posts`는 쓰지 않는다. 출력은 `entries`, `seriesMeta`, `assets`다. 옛 `posts`·`series`에는 쓰지 않는다. 스크립트가 옛 컬렉션에 쓰는 코드를 갖지 않게 한다(쓰기 대상 컬렉션 이름을 상수 3개로 고정).

### 5.2 변환 규칙

| 새 필드 | 값 |
|---|---|
| `kind` | `post` |
| `status` | 옛 `status == 'published' && isPublic` → `published`. 그 밖 → `draft` |
| `draft.*`, `published.*` | 같은 내용으로 채운다. `draft.version = 1`, `published.revision = 1`, `fromDraftVersion = 1`. `draft` 상태 글은 `published = null` |
| `title` | 옛 제목에서 `^\s*\[[^\]]+\]\s*`를 뗀다 |
| `category` | 매핑 표의 글별 예외 → 접두사 매핑 순서. 둘 다 없으면 **실패**(조용히 넘어가지 않는다) |
| `tags` | 글별 예외 → D2 정규화 규칙. 3개를 넘으면 **실패** |
| `series` | 매핑 표의 연재 배정. `wesbos30`은 옛 `series` 문서의 `postIds`에서 글을 찾는다. `postIds`가 문서 ID든 slug든 둘 다 찾는다(A13). 순서는 제목 앞 번호(01~30) |
| `markdown` | 옛 `content` 그대로 |
| `cover` | `heroImage`가 있으면 `{ kind: 'image', url, assetId }`. `assetId`는 Storage 경로로 찾은 legacy 자산 |
| `publishedAt`, `lastPublishedAt` | 옛 `pubDate`, `updatedDate` |
| `createdAt`, `updatedAt` | 옛 `createdAt`, `updatedAt`(없으면 `updatedDate`) |
| `readingTime` | 옛 값 그대로. `wordCount`는 새로 센다 |
| `slugHistory` | `[]` |
| `legacy` | 출처와 동기화 표지 |

`seriesMeta`: `wesbos30`은 옛 `series` 문서의 이름·설명을 쓴다. `pintos`·`proxy-lab`은 매핑 표의 제목을 쓰고 설명은 비운다.

`assets`(legacy): Storage 파일마다 1개. ID는 `legacy-` + 경로의 SHA-1 앞 20자. 그래서 재실행해도 같은 ID다. `usedBy`는 `entries`의 본문·표지에서 계산한다.

### 5.3 실행 순서 (실제 실행)

1. 매핑 표를 읽고 검증한다. 모든 글이 카테고리를 얻는지, 태그가 3개 이하인지 확인한다. 하나라도 실패하면 아무것도 쓰지 않고 멈춘다.
2. B1 덤프를 쓴다. 대상: `posts`, `series`, `entries`, `seriesMeta`, `assets`. 실패하면 멈춘다.
3. 옛 `posts` 문서마다 SHA-256을 계산해 둔다(9단계에서 비교).
4. 글마다 5.4의 판정을 한다. 쓰기는 500개 이하 묶음(batch)으로 한다.
5. `seriesMeta`를 쓴다.
6. `assets`(legacy)를 쓴다.
7. 모든 `entries`를 다시 읽어 zod 스키마로 검증한다.
8. 수를 맞춘다: 옛 글 수 − 제외 수 = `legacy.postId`가 있는 `entries` 수.
9. 옛 `posts` 문서의 SHA-256을 다시 계산한다. 3단계 값과 하나라도 다르면 경고한다(스크립트가 옛 문서를 건드리지 않았다는 증거).
10. 보고서를 덤프 폴더와 화면에 쓴다.

### 5.4 멱등과 재동기화

운영 CMS는 병합 전까지 옛 `posts`에 쓴다. 그래서 스크립트는 여러 번 실행된다. 글마다 아래 표로 판정한다.

| 옛 문서 | `entries` 문서 | 판정 |
|---|---|---|
| 있음 | 없음 | **생성** |
| 있음, `updatedAt`이 `legacy.sourceUpdatedAt`과 같음 | 있음 | **건너뜀** |
| 있음, 그 뒤에 바뀜 | 있음, 새 관리자로 고친 적 없음(`draft.version`, `published.revision`, `status`가 모두 `legacy.synced*` 값과 같음) | **갱신**(옛 문서에서 다시 만든다. 버전 번호는 1씩 올린다) |
| 있음, 그 뒤에 바뀜 | 있음, 새 관리자로도 고침(숨김 포함) | **충돌**. 쓰지 않고 보고한다. 사용자가 어느 쪽을 남길지 정한다 |
| 있음 | 없음, `entryTombstones`에 있음(rebuild에서 지움) | **건너뜀(rebuild 삭제)**. 되살리지 않고 보고한다 |
| 없음(운영에서 지움) | 있음, `legacy.postId` 있음 | **삭제 후보**. 기본은 보고만 한다. `--propagate-deletes`일 때만 지운다 |
| 제외 목록에 있음 | — | **제외** |
| — | 있음, `legacy` 없음(새 관리자로 만든 글) | 건드리지 않는다 |

같은 입력으로 두 번 실행하면 두 번째는 모든 글이 "건너뜀"이다. 이것을 검증 항목으로 둔다(10.2).

**원칙(Claude 판단).** 스크립트는 어느 쪽 변경도 자동으로 덮지 않는다. 운영에서만 바뀐 글은 옮긴다. rebuild에서 바뀐 글(내용, 숨김, 삭제)은 그대로 둔다. 양쪽에서 바뀐 글은 사람이 정한다. 그래서 병합 전에는 기존 글로 시험하지 않는다. 시험은 시험 글로만 한다(10.3, 10.5).

### 5.5 시험 실행 보고서

`--apply` 없이 실행하면 아무것도 쓰지 않고 다음을 출력한다.

- 판정별 수(생성·갱신·건너뜀·충돌·삭제 후보·제외).
- 카테고리별 수. 태그 전후 표. 태그 없는 글 목록.
- 연재별 글 목록과 순서.
- 제목 변환 전후 전체 목록.
- legacy 자산 수와 고아 자산 목록(어느 글도 쓰지 않는 Storage 파일).
- 경고(규칙 위반, 알 수 없는 접두사).

사용자는 이 보고서를 보고 실제 실행을 승인한다.

### 5.6 데이터 조건 5개(11.3)와 대응

| 조건 | 대응 |
|---|---|
| 1. 마이그레이션 전 백업 | B1 덤프(매 실행), B2 예약 백업(E1) |
| 2. 더하기만 | 새 컬렉션에만 쓴다. 옛 문서 해시를 실행 전후로 비교한다 |
| 3. 옛 데이터 삭제는 병합 뒤 | 스크립트에 옛 컬렉션 삭제 기능이 없다. 15절 정리 목록에 적는다 |
| 4. 규칙 변경 시 두 코드 확인 | 2단계는 규칙을 바꾸지 않는다 |
| 5. 멱등, 병합 직전 재실행 | 5.4 판정 표. 병합 직전 절차는 15절 |

### 5.7 되돌리기·복원 스크립트

- `stage2-rollback.mjs`: 시험 실행이 기본이다. 실제 실행 전에 B1 덤프를 쓴다. 지우는 것은 `entries`(하위 `revisions` 포함), `seriesMeta`, `assets` 문서, `publishLog`, `entryTombstones`, Storage의 `assets/` 경로다. 옛 `images/`, `series-covers/` 경로와 옛 컬렉션은 지우지 않는다.
- `stage2-restore.mjs --from <덤프 폴더>`: 덤프의 새 컬렉션 문서를 그대로 다시 쓴다. 실수로 지운 글을 되살릴 때 쓴다.

## 6. API 명세

### 6.1 공통

- 모든 `/api/admin/**`는 세션 쿠키가 필요하다(D5). 없거나 틀리면 401.
- 쓰기 요청은 `Origin` 검사를 한다. 다르면 403.
- 요청 본문은 JSON이다. zod로 검증한다. 틀리면 400.
- 오류 형식: `{ "error": { "code": "DRAFT_CONFLICT", "message": "…", "details": … } }`.
- 응답 헤더: `Cache-Control: no-store`.
- 시각은 ISO 8601 문자열로 주고받는다.

### 6.2 세션

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/api/admin/session` | `{ idToken }` | 204 + `Set-Cookie`. 관리자가 아니면 403. 로그인 5분이 지난 토큰은 401 |
| GET | `/api/admin/session` | — | `{ uid, email, expiresAt }` |
| DELETE | `/api/admin/session?all=` | — | 204. 쿠키 삭제. `all=1`이면 모든 기기의 토큰도 폐기한다(운영 관리자 로그인도 끊긴다) |

`POST /api/admin/session`만 쿠키 없이 부를 수 있다. 대신 `Origin` 검사를 한다.

### 6.3 글

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/admin/posts?status=&kind=&q=` | 목록 |
| POST | `/api/admin/posts` | 새 초안 |
| GET | `/api/admin/posts/{id}` | 한 편 전체 |
| PUT | `/api/admin/posts/{id}/draft` | 초안 저장 |
| POST | `/api/admin/posts/{id}/draft/discard` | 초안을 발행본으로 되돌림 |
| POST | `/api/admin/posts/{id}/publish` | 초안 → 발행 |
| POST | `/api/admin/posts/{id}/visibility` | 숨김 / 다시 보임 |
| DELETE | `/api/admin/posts/{id}` | 삭제 |

**GET `/api/admin/posts`.** 본문은 주지 않는다.

```json
{
  "counts": { "draft": 1, "published": 54, "hidden": 0 },
  "items": [{
    "id": "…", "kind": "post", "status": "published",
    "title": "…", "slug": "…", "category": "os", "tags": ["pintos"],
    "series": { "key": "pintos", "order": 1 },
    "updatedAt": "…", "publishedAt": "…",
    "hasUnpublishedChanges": false, "draftDevice": "macbook"
  }]
}
```

`title`·`slug`·분류는 초안 값을 준다. 정렬은 `updatedAt` 내림차순이다. `q`는 제목·slug 부분 일치다(메모리에서 거른다).

**POST `/api/admin/posts`.** 요청 `{ kind?: 'post' | 'note' }`. 응답 201 `{ id, draft: { version: 1 } }`. 빈 초안을 만든다. slug와 카테고리는 발행할 때 필요하다.

**GET `/api/admin/posts/{id}`.** 응답은 문서 전체다(`draft`, `published`, `status`, 날짜). `revisions`는 주지 않는다.

**PUT `/api/admin/posts/{id}/draft`.**

```json
{ "baseVersion": 7, "device": "iphone",
  "draft": { "title": "…", "description": "…", "slug": "…", "category": "os",
             "tags": ["pintos"], "series": null, "cover": { "kind": "generated" },
             "markdown": "…", "editorJson": null } }
```

- 트랜잭션 안에서 `draft.version == baseVersion`인지 본다. 같으면 저장하고 `version`을 1 올린다. 응답 200 `{ version: 8, updatedAt }`.
- 다르면 409 `DRAFT_CONFLICT`. `details`에 서버 초안 전체와 `version`, `device`, `updatedAt`을 준다. 화면은 사용자에게 고르게 한다.
- 초안 저장은 분류 값의 형식만 검사한다(태그 3개 이하, 카테고리 key). 필수 값은 발행 때 검사한다.
- 저장 뒤 `assets.usedBy`를 갱신한다.

**POST `/api/admin/posts/{id}/draft/discard`.** 요청 `{ baseVersion }`. 초안을 발행본 내용으로 덮는다. `version`은 1 오른다. 발행본이 없으면 409.

**POST `/api/admin/posts/{id}/publish`.** 요청 `{ draftVersion }`.

1. `draftVersion`이 현재 `draft.version`과 다르면 409. 화면에 보이는 것만 발행하게 한다.
2. 검사(422 `VALIDATION_FAILED`, 항목별 이유): 제목 1~120자, 설명 있음, slug 형식과 유일성, 카테고리 있음, 태그 3개 이하, 연재 key 형식(`^[a-z0-9-]+$`)과 순서(양의 정수), 본문 있음.
3. 트랜잭션: `published` ← 초안 + `readingTime`·`wordCount` 계산, `revision` 1 증가, `fromDraftVersion` 기록, `status = 'published'`, `publishedAt`이 없으면 지금, `lastPublishedAt` = 지금, slug가 바뀌면 이전 slug를 `slugHistory`에 더한다, `revisions/{revision}` 쓰기, `publishLog` 쓰기.
4. 트랜잭션 밖: `assets.usedBy` 갱신, CDN 퍼지, 백업 알림.
5. 응답 200:

```json
{ "revision": 3, "status": "published", "publicUrl": "https://…/blog/<slug>",
  "purge": "ok | skipped | failed", "backup": "dispatched | skipped | failed" }
```

**POST `/api/admin/posts/{id}/visibility`.** 요청 `{ visible: boolean }`. `published` ↔ `hidden`만 바꾼다. 초안은 발행하지 않는다. 발행본이 없으면 409. CDN 퍼지와 `publishLog`(`hide`/`unhide`)를 한다.

**DELETE `/api/admin/posts/{id}`.** 요청 `{ confirm: "<id>" }`. `confirm`이 경로의 ID와 다르면 400.

1. 문서와 하위 `revisions`를 지운다(`recursiveDelete`). 문서에 `legacy`가 있으면 `entryTombstones/{id}`를 쓴다(5.4).
2. 그 글이 쓰던 자산에서 글 ID를 뺀다. `usedBy`가 비면 `orphanedAt`을 적는다.
3. `publishLog`(`delete`, 마지막 slug), CDN 퍼지, 백업 알림.
4. 응답 200 `{ deleted: true, orphanedAssets: 3 }`.

상태 변화 요약:

| 지금 | 요청 | 다음 |
|---|---|---|
| draft | publish | published |
| published | publish(초안 변경분) | published, revision + 1 |
| published | visibility false | hidden |
| hidden | visibility true | published |
| hidden | publish | published(초안 내용) |
| draft | visibility | 409 |
| 모든 상태 | delete | 없음 |

### 6.4 자산

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/api/admin/assets/upload-url` | `{ fileName, contentType, bytes, sha256 }` | 같은 해시가 있으면 `{ existing: Asset }`. 없으면 `{ assetId, uploadUrl, expiresAt, requiredHeaders: { "Content-Type": … } }` |
| POST | `/api/admin/assets/{id}/finalize` | — | `{ asset }`. 원본이 없거나 형식이 다르면 422. 이미 `ready`면 그대로 돌려준다(멱등) |
| POST | `/api/admin/assets/purge` | `{ dryRun: true, minOrphanDays: 7 }` | `{ candidates: [...], deleted: [...], kept: [{ id, reason }] }`. 병합 전에는 `legacy: true` 자산을 후보에 넣지 않는다 |

- `finalize`는 sharp `metadata()`로 실제 형식을 확인한다. 확장자나 `contentType`을 믿지 않는다.
- `pending`으로 24시간이 지난 자산은 `purge`가 함께 지운다(업로드를 끝내지 않은 것).
- 함수 최대 실행 시간은 구현 때 Vercel 설정으로 확인한다. 큰 이미지의 변형 생성은 몇 초가 걸린다.

### 6.5 지우는 API

`/api/admin/publish-post`, `/api/admin/delete-post`, `/api/admin/content-posts`, `/api/posts/by-slug`, `/api/admin/publish-status`, `/api/admin/publish-verify`, `/api/admin/series`, `/api/series-preview`. 관련 lib: `admin-auth.ts`, `github-posts.ts`. 이 둘은 지운 API만 가져온다. 옛 화면 컴포넌트가 가져오는 `publish-status.ts`(`AdminDashboard`·`PublishModal`), `publish-verification.ts`(`PostList`), `publish-feedback.ts`(`PostList`·`FullScreenEditor`·`PublishModal`), `editor-drafts.ts`(`PostList`·`AdminDashboard`·`FullScreenEditor`)는 남긴다(D10). 지우면 빌드가 깨진다. 3단계와 5단계에서 화면과 함께 지운다. 스크립트 `publish-preflight.mjs`, `publish-verify.mjs`와 문서 `PUBLISHING.md`, `PUBLISH-SMOKE-TEST.md`도 지우거나 새 흐름으로 다시 쓴다.

## 7. 시리즈 제거 범위와 리다이렉트

### 7.1 지우는 코드 (`rebuild`)

| 파일 | 줄 |
|---|---|
| `src/lib/series.ts` | 217 |
| `src/lib/server/admin-series.ts` | 89 |
| `src/pages/api/admin/series.ts` | 109 |
| `src/pages/api/series-preview.ts` | 27 |
| `src/pages/admin/series/index.astro`, `new.astro`, `edit.astro` | 70 |
| `src/components/admin/series/SeriesEditor.tsx` | 727 |
| `src/components/admin/series/SeriesList.tsx` | 228 |
| `src/components/islands/SeriesCard.tsx` | 248 |
| `src/components/islands/SeriesPreview.tsx` | 105 |
| 합계 | 1,820 |

### 7.2 고치는 코드

- `src/pages/series/index.astro`, `src/pages/series/[slug].astro`: `entries`를 `published.series.key`로 모아 만든다. 제목·설명은 `seriesMeta`. 커버는 없다. 화면 재설계는 4단계다.
- `src/pages/index.astro`: Featured Series 구역을 뺀다.
- `src/pages/sitemap-posts.xml.ts`: 연재 주소를 `entries`에서 만든다.
- `src/components/admin/AdminLayout.tsx`: 시리즈 메뉴를 뺀다.
- `BlogCard.tsx`, `BlogPostList.tsx`: `seriesId` 배지를 `series.key`로 바꾼다.
- `upload-types.ts`: `series-covers` 범위를 뺀다.
- `src/lib/firebase.ts`: 서버에서 클라이언트 SDK를 쓰던 곳이 시리즈뿐이면 서버 import를 없앤다.

### 7.3 병합 뒤까지 남기는 것

운영의 옛 코드가 쓰기 때문이다.

- Firestore `series` 컬렉션과 커버 이미지 3개.
- `firestore.rules`의 `series`·`posts` 규칙, 배포된 인덱스 4개.
- `storage.rules`의 관리자 클라이언트 쓰기 허용.
- `data/post-archive/` 파일 3개(운영 CMS가 계속 쓴다).

### 7.4 리다이렉트

| 옛 주소 | 새 주소 | 방식 |
|---|---|---|
| `/series/wesbos` | `/series/wesbos30` | 301 |
| `/series/크래프톤-정글` | `/blog/tag/크래프톤-정글` | 301 |
| `/blog/tag/크래프톤 정글`, `/blog/tag/크래프톤정글`, `/blog/tag/proxy lab`, `/blog/tag/CSAPP` 등 | 정규화한 태그 주소 | 301 |
| `/blog/<옛 slug>` | `/blog/<새 slug>` | 301(`slugHistory`) |

- 리다이렉트는 미들웨어가 한다. 한글 경로는 `decodeURIComponent` 뒤 NFC로 비교한다.
- 카테고리와 같은 뜻이라 빠진 태그(`/blog/tag/javascript`, `/blog/tag/운영체제` 등)는 2단계에서 그 카테고리의 글을 보여 준다. 최종 카테고리 주소와 301은 4단계가 정한다.

## 8. 공개 페이지의 데이터 경로

화면은 바꾸지 않는다. 읽는 곳만 바꾼다.

| 파일 | 바뀌는 것 |
|---|---|
| `src/lib/content-posts.ts` | `entries`를 읽는다. `ContentPost`에 `category`, `categoryLabel`, `series`를 더한다 |
| `src/lib/server/entries.ts`(새 파일) | Admin SDK 읽기·쓰기, 메모리 캐시, 컬렉션 이름 상수 |
| `src/lib/post-cover.ts` | 커버 큰 글자를 제목 접두사 대신 카테고리 표시 이름으로 |
| `src/pages/blog/[...slug].astro` | `slugHistory` 301, 캐시 태그 |
| `src/pages/blog/tag/[tag].astro` | 태그 정규화 301, 카테고리 같은 뜻 태그 처리 |
| `src/pages/rss.xml.ts`, `sitemap-posts.xml.ts` | `entries` |
| 공개 페이지 전체 | `Vercel-Cache-Tag` 헤더 |
| `src/pages/projects/**` | 그대로(D11) |

## 9. 작업 순서

구현은 새 세션에서 한다(전역 7번 규칙). 각 작업은 검증까지 끝낸다.

| # | 작업 | 의존 | 외부 변경 |
|---|---|---|---|
| T1 | 기반: `taxonomy.ts`, zod 스키마, vitest, `legacy-to-entry` 순수 함수와 테스트 | — | — |
| T2 | 마이그레이션 스크립트, 시험 실행 보고서 → **사용자 검토** → 실제 실행 → 재실행(0건 확인) | T1 | E1(실행 전) |
| T3 | 세션 인증: 미들웨어, 세션 API, `/admin/login`, 관리자 페이지 SSR | T1 | — |
| T4 | 글 API(6.3) | T2, T3 | — |
| T5 | 자산 API(6.4), sharp | T3 | — |
| T6 | 공개 데이터 경로(8절), 시리즈 제거(7절), 리다이렉트, 캐시 태그, 리전 | T2 | — |
| T7 | (없음. D10 결정으로 뺐다. 다른 절이 T8~T10 번호를 쓰므로 번호만 비워 둔다) | — | — |
| T8 | 백업 저장소·Action·발행 알림 | T2 | E5 |
| T9 | 옛 출간 경로 삭제(6.5), 문서 정리, `tsc` 오류 다시 세기 | T4, T6 | — |
| T10 | 전체 검증(10절), 작업 문서, 진행 기록 | 모두 | E3(미리보기 확인) |

- T3·T6·T8은 T2 뒤에 서로 독립이다. 같은 파일을 건드리지 않으면 나란히 할 수 있다.
- PR은 세 개로 나눈다. PR-A: T1·T2·T6. PR-B: T3·T4·T5. PR-C: T8·T9. 모두 대상은 `rebuild`다.
- 마이그레이션 실제 실행(T2)은 PR-A 리뷰 전에 한다. 공개 페이지가 `entries`를 읽으려면 데이터가 있어야 한다. 실행은 운영 데이터를 바꾸지 않는다(더하기만).

## 10. 검증 방법

### 10.1 자동 검사

| 항목 | 기준 |
|---|---|
| `pnpm lint`, `pnpm build` | 통과 |
| `pnpm test`(vitest) | 통과. 대상: 태그 정규화, 접두사 매핑, slug 규칙, 상태 변화, 본문의 자산 주소 추출, `legacy-to-entry`(A13의 두 형식 포함) |
| `tsc --noEmit` | 새 오류 0. 1단계의 25개 중 시리즈 관련 오류가 사라진다. 남은 수를 기록한다 |

### 10.2 마이그레이션

1. 시험 실행 보고서: 생성 55(발행 54, 초안 1), 제외 1, 충돌 0, 경고 0.
2. 사용자가 보고서(카테고리, 태그, 연재, 제목 변환)를 확인한다.
3. 실제 실행 뒤 같은 명령을 다시 실행한다. 판정이 전부 "건너뜀"이어야 한다(멱등).
4. 옛 `posts` 문서 해시가 실행 전후로 같다.
5. 운영 `https://www.cruzlab.dev/blog`와 글 3편이 실행 전과 같은 내용이다.

### 10.3 API 스모크 테스트 (`scripts/smoke/stage2-api.mjs`, localhost)

- 세션: Admin SDK `createCustomToken(ADMIN_UID)` → Identity Toolkit `signInWithCustomToken` → `POST /api/admin/session`. 구글 로그인 없이 쿠키를 받는다.
- 순서: 쿠키 없이 401 → 다른 `Origin`으로 403 → 시험 글(`kind: 'post'`, 카테고리 `retrospective`, slug `stage2-smoke-<시각>`) 생성 → 초안 저장 → 낡은 `baseVersion`으로 409 → 작은 이미지 업로드·finalize·변형 3종 확인 → 발행 → 공개 `/blog/<slug>` 200 → 숨김 → 404 → 다시 보임 → 삭제 → 자산 고아 표시 → 정리 시험 실행에 나옴.
- 끝에 시험 글과 시험 자산을 지운다. 남는 데이터가 없어야 한다.
- 시험 글은 `entries`에만 생긴다. 운영 사이트에는 보이지 않는다. 시험하는 동안 `rebuild` 미리보기 목록에는 잠깐 보인다.
- note 시험 글도 하나 만들어 발행한다. `/blog/<slug>`가 404이고 `/blog` 목록에 없어야 한다.

### 10.4 공개 페이지 (localhost)

- 발행 54편의 `/blog/<slug>`가 모두 200이고 제목이 변환 결과와 같다. 초안 에세이의 slug는 404다.
- `/blog` 목록이 54편이다. 지금은 같은 글이 두 번 나와 55장이다.
- 7.4의 리다이렉트가 모두 301이고 목적지가 200이다.
- `/series/wesbos30` 21편, `/series/pintos` 5편, `/series/proxy-lab` 2편이 순서대로 나온다.
- RSS·사이트맵이 XML로 읽힌다. 사이트맵에 옛 연재 주소가 없다.
- 공개 응답에 `Set-Cookie`가 없고 `Vercel-Cache-Tag`가 있다.

### 10.5 관리자 로그인 (localhost, 사용자 로그인 필요)

D10 결정으로 화면 기능은 확인하지 않는다. 로그인만 확인한다.

1. 쿠키 없이 `/admin`을 연다. `/admin/login?next=/admin`으로 302인지 본다.
2. 사용자가 구글 로그인을 한다. `/admin`이 200인지 본다.
3. 응답의 `cruz_admin` 쿠키가 HttpOnly·Secure·SameSite=Lax인지 본다.
4. 로그아웃한다. 다시 `/admin`을 열어 302인지 본다.
5. 옛 화면의 저장·출간·이미지 업로드 버튼은 누르지 않는다.

### 10.6 `rebuild` 미리보기

- 주소: `https://cruz-lab-git-rebuild-crucialsubs-projects.vercel.app`. Vercel 로그인 보호가 있어 사용자 브라우저로 연다.
- 공개 페이지가 `entries` 내용으로 나온다.
- `x-vercel-id` 헤더에 `icn1`이 있다.
- 시험 글 발행 직후 목록이 바로 바뀐다(캐시 태그 퍼지).
- 관리자 로그인은 Auth 승인 도메인 추가(E3) 뒤에 한다.

### 10.7 운영 무영향

- 운영 페이지가 그대로다.
- 규칙·인덱스 배포 시각이 2026-11-06 값 그대로다.
- `firebase functions:list`가 비어 있다.
- 사용자가 원하면 운영 CMS로 글 1편을 고친 뒤 재동기화로 `entries`에 반영되는지 본다.

## 11. 롤백 방법

### 11.1 코드

- 2단계 PR을 `rebuild`에 병합하기 전에 태그 `rebuild-pre-stage2`를 단다.
- 되돌릴 때는 `rebuild`에서 병합 커밋을 `git revert -m 1`로 되돌린다. 기록을 지우지 않는다.
- 운영(main)은 2단계 코드를 갖지 않는다. 되돌릴 것이 없다.

### 11.2 데이터

| 상황 | 방법 |
|---|---|
| 마이그레이션 결과를 버림 | `stage2-rollback.mjs --apply`. 새 컬렉션과 `assets/` 경로만 지운다. 옛 데이터는 처음부터 그대로다 |
| 실제 실행이 중간에 멈춤 | 같은 명령을 다시 실행한다(멱등). 또는 되돌리기 스크립트 |
| 새 관리자로 쓴 글을 실수로 지움 | `stage2-restore.mjs --from <덤프>`. 덤프가 없을 만큼 최근이면 B3 백업 저장소의 JSON에서 넣는다 |
| Firestore 전체 사고 | B2 예약 백업을 새 DB로 복원한다. 필요한 문서를 기본 DB로 옮긴다 |

### 11.3 외부 설정

12절 표의 "되돌리기" 열을 따른다.

## 12. 외부 변경 목록 (각각 사용자 확인 뒤에 한다)

| # | 변경 | 시점 | 하는 사람 | 되돌리기 |
|---|---|---|---|---|
| E1 | Firestore 예약 백업(일간, 7일)과 삭제 보호 켜기 | T2 실제 실행 전 | Claude(CLI) | 스케줄 삭제, 보호 끄기 |
| E2 | Storage 버킷 CORS: `PUT`을 `http://localhost:4321`, 미리보기 주소, `https://www.cruzlab.dev`에서 허용 | 3단계 에디터 업로드 전(D10. 2단계에는 브라우저 업로드가 없다) | Claude(Admin SDK) | 이전 CORS로 되돌림(현재 값을 먼저 저장) |
| E3 | Firebase Auth 승인 도메인에 미리보기 주소 추가 | T10 | 사용자(콘솔) | 도메인 삭제 |
| E4 | Vercel Preview 환경 변수: `ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`. Firebase Admin 변수가 Preview에도 있는지 확인 | T3·T8 | 사용자(대시보드) | 변수 삭제 |
| E5 | 비공개 저장소 생성, 서비스 계정 `cruz-lab-backup`과 키, 저장소 비밀값, dispatch용 fine-grained PAT | T8 | 사용자(GitHub·GCP 콘솔). 저장소와 워크플로 파일은 Claude가 `gh`로 만들 수 있다 | 저장소 보관, 계정·키·PAT 삭제 |
| E6 | Secret Manager `GITHUB_TOKEN` 삭제(그 값이 개인 토큰이면 GitHub에서도 폐기) | 언제든 | Claude(CLI) + 사용자(폐기) | 되살릴 수 없다. 필요하면 새로 만든다 |
| E7 | 마이그레이션 실제 실행(운영 Firestore에 새 컬렉션 쓰기) | T2 | Claude | 11.2 |

2단계는 Firestore·Storage 규칙, 인덱스, 함수를 배포하지 않는다.

## 13. 위험과 대응

| 위험 | 대응 |
|---|---|
| 병합 전까지 운영 CMS로 고친 글이 `entries`와 달라진다 | 재동기화(5.4). 병합 직전 재실행(15절) |
| 같은 글을 운영과 `rebuild`에서 모두 고친다 | 충돌로 보고한다. 자동으로 덮지 않는다 |
| 새 관리자로 발행한 글이 운영에 없다 | D1의 의도다. 병합 전까지 실제 공개 글은 운영 CMS로 쓴다 |
| 이미지 정리가 쓰는 이미지를 지운다 | 7일 유예, 지우기 직전 전체 재검사(옛 `posts`의 본문·`heroImage`, 옛 `series`의 커버 포함), 시험 실행이 기본, 병합 전에는 legacy 자산 제외 |
| 사진의 GPS 정보가 공개된다 | 변형에서 메타데이터를 지우고, 변형 뒤 원본을 지운다 |
| 서명 URL 남용 | 15분 만료, 정해진 경로와 형식만. finalize가 실제 형식을 검사한다 |
| 세션 쿠키 탈취 | HttpOnly·Secure, `DELETE /api/admin/session?all=1`로 모든 기기의 토큰 폐기 |
| CDN 퍼지 실패 | 60초 TTL로 결국 바뀐다. 응답에 `purge: 'failed'`를 보인다 |
| 외부 이미지 링크가 사라진다(velog 6, GitHub 52) | 2단계 범위 밖. 후속 후보: 마이그레이션 2차로 Storage에 복사하고 주소를 바꾼다(`entries`에서만) |
| 문서 1 MiB 한도 | 초안 900 KB 상한. 지금 가장 긴 본문은 약 4만 바이트다 |

## 14. 사용자 결정 (모두 답함)

1. **D1 데이터 공존 방식.** 사용자 결정(2026-11-08): 새 컬렉션 `entries`. 고르지 않은 안: 같은 `posts` 문서에 새 필드.
2. **D7 백업 위치.** 사용자 결정(2026-11-08): 새 비공개 저장소 `crucial-sub/cruz-lab-content`. 고르지 않은 안: 공개 저장소의 `content` 브랜치(발행 글만).
3. **D10 관리자 화면.** 사용자 결정(2026-11-07): API만 만든다. 화면은 3·5단계에서 새로 만든다. 처음 권장은 최소 연결이었다. 재건이 끝날 때까지 새 글을 쓰지 않는다는 사용자 답을 듣고 권장을 바꿨다.
4. **D11 프로젝트 글.** 사용자 결정(2026-11-08): 4단계로 미룬다. 고르지 않은 안: 2단계에 포함.
5. **부록 A의 분류 매핑과 D3 중복 글 제외.** 사용자 승인(2026-11-08): 표 그대로 쓴다. 태그를 정규화한 값 그대로 보이는 방식(`#csapp`, `#llm`)도 함께 확인했다.

Claude 판단으로 정한 것(2026-11-08 Plan 승인 때 함께 승인): D4 상태 이름 `hidden`과 예약 발행 제외, `kind`별 규칙(노트는 4단계까지 공개 페이지에 없음), D5 세션 쿠키 세부값과 기본 로그아웃의 토큰 비폐기, D6 이미지 흐름과 크기 한도, 병합 전 legacy 이미지 정리 금지, 5.4의 "자동으로 덮지 않음" 원칙과 삭제 표지, D8 캐시 태그, D9 리전, 백업 B1·B2, vitest 도입, PR 3개 분할.

구현자 관점 점검(2026-11-07, 별도 에이전트)이 찾은 5건을 위 판단으로 반영했다: legacy 이미지 정리 위험, rebuild 쪽 삭제·숨김의 재동기화, `note` 정의, 토큰 폐기의 운영 영향, 발행 글 수(54).

## 15. main 병합 직전·직후 절차 (2단계 이후, 참고)

이 절은 2단계 작업이 아니다. 병합 때 빠뜨리지 않게 적는다.

**병합 직전.**

1. B1 덤프를 남기고 마이그레이션을 다시 실행한다. 충돌 0을 확인한다.
2. 운영에서 지운 글이 있으면 `--propagate-deletes`로 반영한다.
3. Vercel Production 환경 변수(`ADMIN_UID`, `BACKUP_DISPATCH_TOKEN`)를 넣는다.
4. Auth 승인 도메인에 `www.cruzlab.dev`가 실제로 통하는지 확인한다(지금은 `cruzlab.dev`만 있다).

**병합 직후 정리(별도 작업).**

1. 옛 `posts`·`series` 컬렉션 삭제(백업 뒤).
2. `firestore.rules`를 "클라이언트 접근 전부 거부"로, `storage.rules`의 클라이언트 쓰기를 거부로 바꾼다.
3. 옛 인덱스 4개 삭제.
4. Vercel `GITHUB_TOKEN`, `PUBLIC_ADMIN_EMAIL` 삭제. `data/post-archive/` 삭제.
5. Storage `series-covers/` 3개 삭제.

## 부록 A. 분류 매핑 표

D2에서 가리키는 표다. 2026-11-07 Firestore 데이터에 규칙을 적용한 결과다(읽기 전용 시험 계산). 사용자가 2026-11-08에 이 표와 D3 중복 글 제외를 그대로 승인했다.

### A.1 접두사 → 카테고리 (55편)

| 접두사 | 편 수 | 카테고리 | 연재 |
|---|---|---|---|
| `wesbos30` | 21 | `javascript` | `wesbos30`, 순서 = 제목 번호 |
| `JavaScript` | 2 | `javascript` | — |
| `React` | 2 | `react` | — |
| `ReactNative` | 4 (중복 1편 제외) | `react-native` | — |
| `AI` | 2 | `ai` | — |
| `Pintos` | 5 | `os` | `pintos` |
| `운영체제` | 3 | `os` | — |
| `Proxy-lab` | 2 | `network` | `proxy-lab` |
| `네트워크` | 1 | `network` | — |
| `알고리즘` | 5 | `algorithm` | — |
| `자료구조` | 5 | `data-structure` | — |
| `컴퓨터구조` | 2 | `computer-architecture` | — |
| (없음) 「크래프톤 정글 0주차 에세이」(초안) | 1 | `retrospective`(글별 예외) | — |

카테고리별 합계: javascript 23, os 8, algorithm 5, data-structure 5, react-native 4, network 3, ai 2, react 2, computer-architecture 2, retrospective 1.

### A.2 연재

| key | 제목(`seriesMeta`) | 순서 |
|---|---|---|
| `wesbos30` | WesBos Vanilla JS 30 Challenge | 01 Drum kit … 30 두더지 뚝배기(21편, 번호 사이 빈칸 있음) |
| `pintos` | Pintos | 1 Threads - 핀토스 시작하기 → 2 Alarm Clock → 3 Priority Scheduling과 Donation → 4 UserProgram - Argument Passing → 5 시스템 콜 동작 흐름 |
| `proxy-lab` | Proxy Lab | 1 소켓과 Tiny 웹 서버 분석 → 2 프록시 서버 구현 |

- `크래프톤 정글`은 연재가 아니라 태그다(10.1).
- 「최소 신장 트리(1) Prim」·「(2) Kruskal」은 연재로 묶지 않는다(Claude 판단). 두 글은 서로를 전제하지 않는다. 태그 `최소-신장-트리`가 둘을 묶는다.
- 「New Architecture 2편」은 1편이 없어 연재로 묶지 않는다.

### A.3 태그 (23종 → 12종)

| 태그 | 편 수 | 옛 이름 |
|---|---|---|
| `크래프톤-정글` | 24 | `크래프톤 정글` 23 + `크래프톤정글` 1 |
| `wesbos30` | 21 | 같음 |
| `pintos` | 5 | 같음 |
| `proxy-lab` | 2 | `proxy lab` |
| `csapp` | 2 | `CSAPP` |
| `최소-신장-트리` | 2 | `최소 신장 트리` |
| `llm` | 2 | `LLM` |
| `c` | 2 | `C` 3(아래 예외로 1 빠짐) |
| `분할-정복` | 1 | `분할 정복` |
| `agent` | 1 | `Agent` |
| `rag` | 1 | `RAG` |
| `malloc-lab` | 1 | `malloc lab` |

- 빠지는 태그(카테고리와 같은 뜻): `javascript` 23, `운영체제` 8, `알고리즘` 5, `자료구조` 5, `ReactNative` 5, `네트워크` 3, `컴퓨터구조` 2, `AI` 2, `React` 2, `에세이` 1.
- 글별 예외: 「CSAPP 9.9장 Malloc-lab」의 태그가 정규화 뒤 4개다. `malloc-lab`, `csapp`, `크래프톤-정글`만 남기고 `c`를 뺀다.
- 태그가 없는 글: JavaScript 2편, React 2편, React Native 4편(카테고리만 있다).
