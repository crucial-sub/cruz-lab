# Publish Runbook

현재 Cruz Lab의 포스트 출간 경로는 `content/posts` markdown 파일과 GitHub API를 기준으로 동작한다.

## 사전 점검

브라우저를 열기 전에 아래 명령으로 운영 기준 preflight를 한 번 돌린다.

```bash
npm run publish:preflight
```

이 명령은 아래를 확인한다.

- `.env`에 `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_ADMIN_EMAIL`, `GITHUB_TOKEN`이 있는지
- `astro.config.mjs`의 공개 사이트 기준 URL
- `content/posts` 경로가 실제로 존재하는지
- 가능하면 GitHub API로 대상 저장소의 `main` 브랜치와 `content/posts` 경로에 접근 가능하고 push 권한이 있는지
- 가능하면 공개 사이트 `/blog` 응답이 오는지

## 실제 출간 순서

1. `/admin/posts/new` 또는 `/admin/edit?slug=...`로 들어간다.
2. 본문 화면에서 제목, slug, 설명, 공개 상태, 썸네일을 먼저 확인한다.
3. `출간하기`를 눌러 Publish Modal을 연다.
4. 모달 안에서 아래를 본다.
   - 실시간 진단 상태
   - 대상 저장소 / 브랜치 / 포스트 경로
   - GitHub push 가능 여부
   - 공개 사이트 `/blog` live probe 결과
   - 공개 사이트 기준 URL
   - 현재 접속 origin이 공개 사이트와 다른지
5. 출간을 실행한다.

## 출간 후 확인 순서

관리자 목록 상단 배너 기준으로 아래 순서로 본다.

1. `GitHub 파일 보기`
   - markdown 파일 경로와 내용이 맞는지 확인
2. `최신 커밋 보기`
   - `main` 브랜치에 반영됐는지 확인
3. `공개 페이지 보기`
   - 실제 렌더링과 메타데이터가 맞는지 확인
4. 반영이 늦으면 잠시 뒤 새로고침
   - 배포 지연인지, 실제 반영 실패인지 분리

## 현재 한계

- 브라우저 관리자 인증 자체는 Firebase 로그인 세션이 필요하다.
- GitHub API와 공개 사이트 확인은 네트워크 상태에 영향을 받는다.
- preflight가 통과해도, 실제 배포 지연 시간은 운영 환경에서 한 번 더 봐야 한다.

## 2026-03-26 확인 결과

- 로컬 `.env` 기준으로 `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_ADMIN_EMAIL`, `GITHUB_TOKEN`이 모두 설정돼 있었다.
- 네트워크 허용 preflight에서 `crucial-sub/cruz-lab / main / content/posts` GitHub 대상 저장소 probe가 통과했다.
- 같은 preflight에서 현재 `GITHUB_TOKEN`으로 저장소 push 권한도 확인됐다.
- 같은 기준으로 `https://cruzlab.dev/blog` 공개 사이트 응답도 `200 OK`로 확인됐다.
- 아직 브라우저 관리자 세션을 통한 실제 `publish -> GitHub 커밋 -> 공개 페이지 반영` 1건 실출간 검증은 남아 있다.
