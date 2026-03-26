# Publish Smoke Test

기준일: 2026-03-26

목적: 브라우저 관리자 세션 기준으로 실제 포스트 1건을 출간한 뒤, GitHub 반영과 공개 페이지 반영까지 끝까지 확인한다.

## 사전 조건

- `npm run publish:preflight`가 통과한 상태
- 관리자 로그인 가능한 Google 계정 준비
- 새로 출간하거나 수정할 테스트 포스트 1건 준비
- 필요하면 로컬 markdown 백업 먼저 저장

## 브라우저 확인 순서

1. `/admin/posts/new` 또는 `/admin/edit?slug=...`로 이동
2. 제목, slug, 설명, 공개 상태, 썸네일 확인
3. `출간하기` 클릭
4. Publish Modal에서 아래 확인
   - 관리자 세션 통과
   - GitHub 반영 대상 정상
   - GitHub push 가능
   - 공개 사이트 `/blog` live probe 정상
5. 실제 출간 실행
6. 관리자 목록 상단 배너에서 아래 확인
   - `GitHub 파일 보기`
   - `최신 커밋 보기`
   - `공개 페이지 보기`
7. 배너의 `반영 다시 확인` 클릭
8. 필요하면 터미널에서 같은 slug로 CLI 재검증

```bash
npm run publish:verify -- --slug <slug> --file-path content/posts/YYYY-MM-DD-slug.md
```

## 성공 기준

- GitHub 파일이 실제 저장소에 존재한다.
- GitHub 커밋이 `main` 브랜치에 반영된다.
- 공개 페이지가 `200 OK`로 응답한다.
- 공개 페이지의 제목, 설명, 썸네일, 본문 렌더링이 기대와 맞는다.
- 관리자 배너의 재검증도 모두 정상으로 나온다.

## 기록 템플릿

- 테스트 일시:
- 테스트 포스트 제목:
- slug:
- filePath:
- GitHub 파일 확인:
- GitHub 커밋 확인:
- 공개 페이지 확인:
- 배포 지연 여부:
- 관리자 배너 재검증 결과:
- CLI `publish:verify` 결과:
- 특이사항:

## 실패 시 바로 볼 것

- `PUBLISHING.md`
- 관리자 목록의 마지막 출간 배너
- `npm run publish:preflight`
- `npm run publish:verify -- --slug <slug> ...`
