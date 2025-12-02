---
title: "Real-time Dashboard"
description: "WebSocket 기반 실시간 데이터 시각화 대시보드. React와 D3.js를 활용한 인터랙티브 차트 구현."
longDescription: "실시간 데이터 스트리밍과 시각화를 위한 모던 대시보드 애플리케이션입니다. WebSocket을 통해 실시간 데이터를 수신하고, D3.js와 Framer Motion을 활용하여 부드러운 애니메이션과 함께 데이터를 시각화합니다."
image: "../../assets/img/projects/placeholder.svg"
tags:
  - "Frontend"
  - "React"
  - "Data Viz"
tech:
  - "React"
  - "TypeScript"
  - "D3.js"
  - "WebSocket"
  - "TailwindCSS"
  - "Framer Motion"
github: "https://github.com/cruz/dashboard"
demo: "https://dashboard.cruz.dev"
featured: true
order: 3
startDate: 2024-08-01
endDate: 2024-09-15
---

## 프로젝트 개요

복잡한 데이터를 직관적으로 이해할 수 있도록 실시간 시각화 대시보드를 개발했습니다. 사용자 경험을 최우선으로 고려하여 부드러운 애니메이션과 반응형 디자인을 적용했습니다.

## 주요 기능

### 1. 실시간 데이터 처리
- WebSocket을 통한 양방향 통신
- 효율적인 상태 관리 (Zustand)
- 데이터 버퍼링 및 throttling

### 2. 인터랙티브 차트
- 줌/팬 기능이 있는 라인 차트
- 툴팁과 하이라이트 인터랙션
- 반응형 SVG 차트

### 3. 사용자 경험
- 다크/라이트 테마 지원
- 드래그 앤 드롭 위젯 배치
- 키보드 단축키 지원

## 기술적 도전

### 성능 최적화
대량의 실시간 데이터를 처리하면서 60fps를 유지하는 것이 가장 큰 도전이었습니다.

- `useMemo`와 `useCallback`을 활용한 불필요한 리렌더링 방지
- Canvas 기반 렌더링으로 DOM 업데이트 최소화
- Web Worker를 활용한 데이터 처리 오프로드

### 접근성
- ARIA 레이블 및 역할 적용
- 키보드 네비게이션 지원
- 색맹 사용자를 위한 패턴 기반 구분

## 배운 점

- 복잡한 상태 관리와 성능 최적화 기법
- D3.js와 React의 효과적인 통합 방법
- 사용자 중심 설계의 중요성
