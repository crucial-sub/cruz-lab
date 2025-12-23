---
title: "[Pintos] Threads - 핀토스 시작하기 & 과제 소개"
description: "pintos 프로젝트 intro"
pubDate: "2025-12-23T11:41:55.189Z"
updatedDate: "2025-12-23T11:41:55.189Z"
heroImage: ""
tags: ["운영체제", "pintos", "크래프톤 정글"]
slug: "pintos-threads-01"
readingTime: 2
isPublic: true
---

> ### Pintos 프로젝트 시작
>
> 교육용 OS를 직접 구현하는 **Pintos​** 프로젝트가 시작되었다.
>
> 앞으로 몇 주간 이 Pintos 위에서 운영체제의 핵심 기능들을 직접 구현해야 한다.

## Project 1: Threads 목표 분석

이번 주차의 목표는 **​Thread(스레드)​** 시스템을 개선하는 것이다.

현재 Pintos의 스레드는 기초적인 기능만 구현되어 있어, 다음 사항들을 구현해야 한다.

1. **​Alarm Clock​**: Busy Waiting 방식을 Sleep/Wake up 방식으로 변경
2. **​Priority Scheduling​**: 우선순위 기반 스케줄링 및 Priority Donation 구현

## 핵심 구조체: `struct thread`

`threads/thread.h`에 정의된 스레드 관리 구조체는 다음과 같다.

```c
struct thread {
    /* Owned by thread.c. */
    tid_t tid;                          /* Thread identifier. */
    enum thread_status status;          /* Thread state. */
    char name[16];                      /* Name (for debugging purposes). */
    int priority;                       /* Priority. */

    /* Shared between thread.c and synch.c. */
    struct list_elem elem;              /* List element. */

    /* Owned by thread.c. */
    struct intr_frame tf;               /* Information for switching */
    unsigned magic;                     /* Detects stack overflow. */
};
```

> **​⚠️ 스택 오버플로우 주의​**
>
> 스택이 커져서 `struct thread` 영역을 침범하면 `magic` 값이 덮어씌워져 커널 패닉이 발생한다.
>
> 따라서 `struct thread`의 크기를 너무 크게 잡거나, 과도한 재귀 호출을 피해야 한다.

## 구현 계획

`threads/thread.c`와 `threads/synch.c`가 주요 수정 대상이다.

현재 `timer_sleep()` 함수는 `while`문을 돌며 대기하는 **​Busy Waiting** 방식으로 구현되어 있어 CPU 자원을 낭비하고 있다. 

이를 개선하는 것이 첫 번째 목표다.

```c
/* 현재 구현된 timer_sleep */
void timer_sleep (int64_t ticks) {
  int64_t start = timer_ticks ();

  ASSERT (intr_get_level () == INTR_ON);
  while (timer_elapsed (start) < ticks) 
    thread_yield (); 
}
```

다음 포스트에서는 **Alarm Clock** 구현 과정을 상세히 다루겠다.
