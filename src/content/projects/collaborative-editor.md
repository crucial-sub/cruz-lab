---
title: "Collaborative Editor"
description: "CRDT 기반 실시간 협업 문서 편집기. 다중 사용자가 동시에 문서를 편집할 수 있는 Google Docs 스타일 애플리케이션."
longDescription: "Yjs CRDT 라이브러리를 활용하여 구현한 실시간 협업 문서 편집기입니다. 여러 사용자가 동시에 같은 문서를 편집해도 충돌 없이 동기화되며, 오프라인에서도 편집이 가능합니다."
image: "../../assets/img/projects/placeholder.svg"
tags:
  - "Frontend"
  - "Collaboration"
  - "CRDT"
tech:
  - "React"
  - "TypeScript"
  - "Yjs"
  - "TipTap"
  - "WebRTC"
  - "IndexedDB"
github: "https://github.com/cruz/collab-editor"
demo: "https://editor.cruz.dev"
featured: false
order: 4
startDate: 2024-10-01
endDate: 2024-11-15
---

## 프로젝트 개요

Google Docs와 같은 실시간 협업 편집 기능을 구현한 프로젝트입니다. CRDT(Conflict-free Replicated Data Types)를 활용하여 여러 사용자의 동시 편집을 충돌 없이 처리합니다.

## 주요 기능

### 1. 실시간 협업
- 다중 사용자 커서 표시
- 실시간 타이핑 동기화
- 사용자 프레즌스 표시

### 2. 리치 텍스트 편집
- TipTap 기반 WYSIWYG 에디터
- 마크다운 문법 지원
- 이미지/링크 삽입

### 3. 오프라인 지원
- IndexedDB를 활용한 로컬 저장
- 온라인 복귀 시 자동 동기화
- 충돌 자동 해결

## 기술 스택 선정 이유

### Yjs 선택
- 성숙한 CRDT 라이브러리
- 다양한 에디터와의 호환성
- WebRTC, WebSocket 등 다양한 전송 방식 지원

### TipTap 선택
- ProseMirror 기반의 확장성
- 풍부한 플러그인 생태계
- Yjs와의 공식 통합 지원

## 기술적 도전

### Awareness 프로토콜
사용자 커서 위치를 실시간으로 동기화하면서 네트워크 대역폭을 최소화하는 것이 도전이었습니다. Debouncing과 delta updates를 활용하여 해결했습니다.

### 히스토리 관리
협업 환경에서의 Undo/Redo 구현은 단일 사용자 환경과 달리 복잡합니다. Yjs의 UndoManager를 활용하여 사용자별 독립적인 히스토리를 관리했습니다.

## 배운 점

- 분산 시스템에서의 데이터 일관성 유지 방법
- CRDT의 원리와 실제 적용 방법
- 복잡한 에디터 상태 관리 기법
