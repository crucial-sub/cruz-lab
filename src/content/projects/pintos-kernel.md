---
title: "Pintos Kernel"
description: "x86 기반 교육용 운영체제 커널 구현 프로젝트. 스레드 스케줄링, 가상 메모리, 파일 시스템을 직접 구현했습니다."
longDescription: "Stanford 대학의 Pintos 운영체제 프로젝트를 기반으로 한 교육용 커널 구현입니다. 크래프톤 정글에서 5주간의 집중 학습을 통해 운영체제의 핵심 개념들을 직접 구현하며 컴퓨터 시스템에 대한 깊은 이해를 얻었습니다."
image: "../../assets/img/projects/placeholder.svg"
tags:
  - "OS"
  - "Low-Level"
  - "Systems"
tech:
  - "C"
  - "x86 Assembly"
  - "GDB"
  - "Make"
  - "QEMU"
github: "https://github.com/cruz/pintos"
featured: true
order: 1
startDate: 2024-06-01
endDate: 2024-07-05
---

## 프로젝트 개요

Pintos는 Stanford 대학에서 개발한 교육용 운영체제입니다. 이 프로젝트를 통해 운영체제의 핵심 개념을 직접 구현하며 시스템 프로그래밍 역량을 강화했습니다.

## 주요 구현 내용

### 1. 스레드 및 스케줄링
- Priority Scheduling 구현
- Priority Donation을 통한 Priority Inversion 해결
- Multi-Level Feedback Queue Scheduler (MLFQS) 구현

### 2. 유저 프로그램
- Argument Passing (스택에 인자 전달)
- System Call 핸들러 구현
- Process Hierarchy (fork, exec, wait)

### 3. 가상 메모리
- Page Table 관리
- Demand Paging 구현
- Stack Growth 처리
- Memory Mapped Files

### 4. 파일 시스템
- Indexed & Extensible Files
- Subdirectories
- Buffer Cache

## 기술적 도전과 해결

가장 어려웠던 부분은 동기화 문제 해결이었습니다. 특히 Priority Donation 구현 시 중첩된 donation 상황을 처리하기 위해 재귀적 알고리즘을 설계했습니다.

## 배운 점

- 저수준 시스템 프로그래밍의 복잡성과 디버깅 기법
- 운영체제의 동작 원리에 대한 깊은 이해
- 팀 프로젝트에서의 코드 리뷰와 협업 경험
