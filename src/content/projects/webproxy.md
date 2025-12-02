---
title: "Concurrent Web Proxy"
description: "멀티스레드 기반의 고성능 웹 프록시 서버. HTTP 요청 파싱, 캐싱, 동시성 처리를 구현했습니다."
longDescription: "네트워크 프로그래밍과 동시성 처리를 학습하기 위해 구현한 웹 프록시 서버입니다. 클라이언트의 HTTP 요청을 파싱하여 원격 서버로 전달하고, 응답을 캐싱하여 성능을 최적화했습니다."
image: "../../assets/img/projects/placeholder.svg"
tags:
  - "Network"
  - "Concurrency"
  - "Backend"
tech:
  - "C"
  - "POSIX Threads"
  - "Socket API"
  - "HTTP/1.1"
github: "https://github.com/cruz/webproxy"
featured: true
order: 2
startDate: 2024-05-15
endDate: 2024-05-28
---

## 프로젝트 개요

HTTP/1.1 프로토콜을 준수하는 웹 프록시 서버를 C 언어로 구현했습니다. 브라우저와 웹 서버 사이에서 중개자 역할을 하며, 캐싱을 통해 성능을 향상시킵니다.

## 주요 기능

### 1. HTTP 요청 처리
- HTTP Request Line 파싱
- Header 분석 및 수정
- Keep-Alive 연결 지원

### 2. 동시성 처리
- Producer-Consumer 패턴 적용
- Thread Pool을 이용한 효율적인 스레드 관리
- Semaphore를 이용한 동기화

### 3. 캐싱 시스템
- LRU (Least Recently Used) 캐시 정책
- Reader-Writer Lock을 이용한 동시 접근 제어
- 메모리 기반 캐시 구현

## 성능 최적화

- Pre-forked Worker 모델로 스레드 생성 오버헤드 감소
- 캐시 적중률 향상을 위한 URL 정규화
- Blocking I/O 최소화를 위한 비동기 처리

## 배운 점

- 네트워크 프로토콜(HTTP)의 상세한 동작 원리
- 멀티스레드 프로그래밍에서의 동기화 기법
- 캐시 설계 및 성능 최적화 전략
