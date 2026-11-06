# 성능·UI 수정: 라우팅, Featured Series, 첫 진입 프레임, 프로필 틸트, 블로그 썸네일

- 날짜: 2026-11-05
- 브랜치: `fix/perf-and-ui-polish`
- 시각 보고서: [visual-plans/2026-11-05-cruz-lab-perf-ui-fix.html](./visual-plans/2026-11-05-cruz-lab-perf-ui-fix.html)

## 1. 현재 상황

다섯 문제를 수정했다. 로컬 프로덕션 빌드에서 수정 전·후를 측정해 효과를 확인했다. 아직 커밋과 배포는 하지 않았다. CDN 캐시 효과는 배포 후에 다시 측정해야 한다.

## 2. 원인과 수정

### 2.1 GNB 라우팅 (Home, Blog, Series만 느림)

- 원인: `/projects/`는 `prerender = true`라 CDN 정적 HTML이다. Home, Blog, Series는 SSR이다. 캐시 헤더가 없어 요청마다 서버리스 함수(iad1)가 Firestore 전체 글 목록을 읽었다. ClientRouter는 HTML을 끝까지 받은 뒤 화면을 바꾼다.
- 수정:
  1. `src/lib/server/cache-headers.ts`: 공개 SSR 페이지와 `/api/series-preview`에 `public, max-age=0, s-maxage=60, stale-while-revalidate=86400`을 붙인다. 404와 관리자 경로에는 붙이지 않는다.
  2. `src/lib/server/memo-cache.ts`: TTL 60초 메모리 캐시. 동시 요청은 같은 Promise를 공유한다. 글·시리즈 저장/삭제 후 `invalidateMemo()`로 비운다.
  3. `getPublishedFirestorePostBySlug()`가 같은 slug를 두 번 조회하던 것을 한 번으로 줄였다.

### 2.2 Featured Series 로딩

- 원인: 홈 `SeriesPreview`가 `client:visible`이라 화면에 닿은 뒤에야 API를 불렀다. API는 시리즈마다 시리즈 문서 1번과 전체 글 목록(본문 포함) 1번을 읽었다(1 + 2N번).
- 수정: `getPublishedSeriesWithReadingTime()`가 시리즈 목록과 글 목록을 병렬로 한 번씩 읽는다. 홈은 서버에서 이 값을 HTML에 넣는다.

### 2.3 첫 진입 프레임 드랍

- 원인: 애니메이션이 메인 스레드에서 돌았다.
  - 배경 `background-position` 애니메이션: 매 프레임 Paint
  - 히어로 진입: framer-motion, 하이드레이션 뒤 시작
  - 타이핑: 매 프레임 `setState`
  - 커서: `mouseover`마다 `getComputedStyle`, 화면 전체 `mix-blend-difference`
  - 섹션 페이드인: React 아일랜드 6개
- 수정: opacity/transform CSS 애니메이션으로 바꿨다(`global.css`의 `hero-*`, `gradient-crossfade`). TypeWriter는 `textContent`를 직접 바꾼다. CursorFollower를 가볍게 하고 `client:idle`로 바꿨다. 페이지의 `FadeInSection`을 React 없는 `Reveal.astro`로 바꿨다(`content-visibility: auto` 포함). 블로그 목록 카드 지연 상한을 두었다.

### 2.4 프로필 틸트 (아래쪽 동작이 반대로 보임)

- 원인: 부모에 `perspective`가 없었다. 원근 없는 투영에서는 왼쪽 아래 호버와 오른쪽 위 호버가 같은 모양이다(좌표로 확인). 또 기운 요소 자신의 사각형으로 마우스 위치를 재서 값이 흔들렸다.
- 수정: 기울지 않는 바깥 래퍼에 `perspective: 900px`과 포인터 이벤트를 둔다. 스프링, 광택, 그림자, 앞뒤 층 깊이를 더했다. `TiltCard`도 같은 방식으로 고쳤다.

### 2.5 블로그 썸네일

- 수정: 카드 커버를 코드로 그린다(`src/lib/post-cover.ts`, `src/components/blog/PostCover.tsx`). 메시 그라디언트, 노이즈, 격자, 큰 카테고리 글자를 쓴다. 카테고리는 제목 앞 `[...]` 또는 첫 태그다. 업로드한 대표 이미지는 글 상세와 OG 이미지에서 계속 쓴다.

## 3. 측정 결과 (로컬, CPU 4배 감속, 중앙값)

| 항목 | 전 | 후 |
|---|---|---|
| Home → Blog 이동 | 1,007 ms | 122 ms |
| Home → Series 이동 | 1,075 ms | 114 ms |
| Home → Projects 이동 (기준) | 113 ms | 110 ms |
| 시리즈 API (콜드 서버) | 1,153 ms | 568 ms |
| 첫 2.5초 버린 프레임 | 21 | 0 |
| 첫 2.5초 일부만 갱신된 프레임 | 108 | 10 |
| 히어로 제목 표시 시각 | 1,365 ms | 875 ms |
| Blog LCP | 2,704 ms | 528 ms |

프로덕션 기준값(수정 전): Blog 이동 2,408 ms, Series 이동 2,408 ms, Projects 이동 116 ms.

## 4. 설계 결정 근거

- CDN 캐시 60초: 글 수정 후 최대 60초(+1요청) 동안 이전 내용이 보일 수 있다. 개인 블로그에서는 허용 가능하다고 판단했다. 같은 인스턴스는 저장 직후 바로 반영된다.
- 커버를 코드로 그림: 이미지 요청이 없어 목록이 빨라지고, 글마다 디자인이 일관된다.

## 5. 향후 권장 작업

1. 배포 후 `x-vercel-cache: HIT`와 GNB 이동 시간을 다시 측정한다.
2. Vercel 함수 지역(iad1)과 Firestore 지역을 맞춘다.
3. `src/lib/series.ts`의 서버 측 클라이언트 SDK 사용을 Admin SDK로 바꾼다.
4. `admin-series.ts`의 `seriesSnap.exists()`를 `seriesSnap.exists`로 고친다(기존 버그).
5. 남은 하이드레이션 긴 작업(약 140 ms)을 줄이려면 framer-motion 사용 범위를 더 줄인다.
