# Publish Runbook (재건 브랜치)

이 문서는 `rebuild` 브랜치의 출간 흐름이다. 운영(main)은 아직 옛 흐름(Firestore `posts` + GitHub `data/post-archive`)을 쓴다.

- 설계: [재건 2단계 Plan](./docs/blog-rebuilding/2026-11-07-stage2-data-model-and-server-plan.md) D4~D8, 6절(API 명세)
- 글 원본: Firestore `entries`. 공개 페이지는 `status == 'published'` 글의 발행본만 읽는다.

## 지금 상태 (2단계 끝)

1. 관리자 API만 있다. 새 에디터 화면은 3단계가 만든다(D10).
2. `rebuild`의 옛 관리자 화면은 로그인까지만 동작한다. 저장·출간 버튼을 누르지 않는다.
3. main 병합 전에 공개 글을 써야 하면 운영 관리자 화면(`https://www.cruzlab.dev/admin`)으로 쓴다. 병합 직전에 마이그레이션을 다시 실행해 `entries`로 옮긴다(Plan 15절).

## API로 출간하는 순서

모든 요청은 세션 쿠키(`cruz_admin`)가 필요하다. 쓰기 요청은 같은 Origin에서만 받는다.

1. `/admin/login`에서 Google로 로그인한다. 세션 쿠키(14일)를 받는다.
2. `POST /api/admin/posts`로 빈 초안을 만든다.
3. `PUT /api/admin/posts/{id}/draft`로 초안을 저장한다. `baseVersion`이 서버 버전과 다르면 409다.
4. 이미지는 `POST /api/admin/assets/upload-url` → Storage에 PUT → `POST /api/admin/assets/{id}/finalize` 순서로 올린다. 본문에는 `asset.url`(가장 큰 webp 변형)을 넣는다.
5. `POST /api/admin/posts/{id}/publish`로 발행한다. 검사에 실패하면 422와 항목별 이유가 온다.
6. 응답의 `publicUrl`을 연다. `purge`는 CDN 캐시 퍼지 결과다. `backup`은 백업 저장소 알림 결과다.

숨김은 `POST /api/admin/posts/{id}/visibility`, 삭제는 `DELETE /api/admin/posts/{id}`(요청 `{ confirm: "<id>" }`)다.

## 백업

출간은 GitHub를 부르지 않는다. 백업은 비공개 저장소 `crucial-sub/cruz-lab-content`의 GitHub Action이 한다.

- 매일 03:00 KST, 그리고 발행·삭제 직후 알림(`repository_dispatch`)으로 돈다.
- 알림이 실패해도 발행은 성공이다. 다음 예약 실행이 백업한다.

## 점검

```bash
pnpm smoke:api --base http://localhost:4321
```

```bash
pnpm smoke:public --base http://localhost:4321
```

- `smoke:api`는 시험 글과 시험 이미지를 만들고 끝에 모두 지운다. 운영 Firestore·Storage에 쓰므로 실행 전에 확인한다. `--read-only`를 붙이면 세션·인증 검사만 한다.
- `smoke:public`은 공개 페이지를 읽기만 한다.
