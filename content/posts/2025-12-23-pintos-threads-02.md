---
title: "[Pintos] Threads - Alarm Clock 구현"
description: "CPU 자원을 낭비하는 Busy Waiting 방식의 timer_sleep을 개선해보자!"
pubDate: "2025-12-23T11:54:27.193Z"
updatedDate: "2025-12-23T11:54:27.192Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1766490838771.webp?alt=media&token=105ad343-3df9-4cb9-8321-623f75264634"
tags: ["운영체제", "pintos", "크래프톤 정글"]
slug: "pintos-threads-02"
readingTime: 3
isPublic: true
---

> ##### Alarm Clock 구현
>
> Pintos의 초기 `timer_sleep()` 함수는 **Busy Waiting​** 방식으로 구현되어 있다.
>
> 스레드가 지정된 시간 동안 대기할 때, 루프를 돌며 계속해서 시간을 확인하는 방식이다. 
>
> 이는 CPU 자원을 불필요하게 소모하여 다른 스레드의 실행을 방해한다.
>
> 이를 **​Sleep/Wake up​** 방식으로 개선하여 시스템 효율을 높이는 것이 이번 과제의 목표다.

## 구현 개요

개선된 방식의 로직은 다음과 같다.

1. 스레드가 `timer_sleep(ticks)`를 호출하면,
2. 해당 스레드를 `READY` 상태가 아닌 **​`BLOCKED`​** 상태로 변경하고,
3. **"깨어나야 할 시간(`wake_tick`)"**을 기록한 뒤 `sleep_list`에 삽입한다.
4. 매 틱(Tick)마다 발생하는 타이머 인터럽트(`timer_interrupt`)에서
5. `sleep_list`를 확인하여 깨어날 시간이 된 스레드들을 `READY` 상태로 변경한다.

***

## 자료구조 추가

`threads/thread.h`의 `struct thread`에 스레드가 깨어나야 할 시간을 저장할 필드를 추가했다.

```c
struct thread {
    /* ... */
    int64_t wake_tick; /* 깨어나야 할 tick 시간 */
    /* ... */
};
```

`devices/timer.c`에는 잠든 스레드들을 관리할 리스트를 선언한다.

```c
/* devices/timer.c */
static struct list sleep_list; /* 잠든 스레드 대기열 */
```

***

## `timer_sleep` 함수 수정

`timer_sleep` 함수는 스레드를 재우는 역할을 한다.

```c
void timer_sleep (int64_t ticks) {
  int64_t start = timer_ticks ();
  ASSERT (intr_get_level () == INTR_ON);

  if (ticks <= 0) return;

  enum intr_level old_level = intr_disable (); // 인터럽트 비활성화
  
  struct thread *curr = thread_current ();
  curr->wake_tick = start + ticks; // 일어날 시간 기록

  /* sleep_list에 wake_tick 순으로 정렬하여 삽입 */
  list_insert_ordered (&sleep_list, &curr->elem, thread_compare_wake_tick, NULL);

  thread_block (); // 스레드 상태를 BLOCKED로 변경하고 스케줄링

  intr_set_level (old_level); // 인터럽트 복구
}
```

> **`list_insert_ordered`** **사용 이유**
>
> 타이머 인터럽트는 매 틱마다 발생하므로, 핸들러의 오버헤드를 최소화해야 한다.
>
> 삽입 시점에 `wake_tick` 순으로 정렬해두면, 인터럽트 핸들러에서는 리스트의 앞부분만 확인하면 되므로(`O(1)`) 효율적이다.

<br />

***

## `timer_interrupt` 수정

매 틱마다 호출되는 타이머 인터럽트 핸들러에서 깨워야 할 스레드를 확인한다.

```c
static void timer_interrupt (struct intr_frame *args UNUSED) {
  ticks++;
  thread_tick ();

  /* 추가된 함수 */
  thread_wake_up (ticks);
}

void thread_wake_up (int64_t ticks) {
  /* sleep_list 순회 */
  while (!list_empty (&sleep_list)) {
    struct list_elem *e = list_begin (&sleep_list);
    struct thread *t = list_entry (e, struct thread, elem);

    /* 아직 일어날 시간이 안 된 경우 중단 (정렬되어 있으므로) */
    if (t->wake_tick > ticks) 
      break;

    /* 스레드 깨우기 */
    list_remove (e);
    thread_unblock (t);
  }
}
```

<br />

***

## 결과 확인

수정 후 `make check`를 통해 `alarm-*` 관련 테스트를 통과함을 확인했다.

또한 `idle ticks` 수치가 증가했는데, 이는 CPU가 Busy Waiting으로 낭비되는 대신 Idle 상태로 효율적으로 관리되고 있음을 의미한다.

> **⚠️ 주의사항​**
>
> `sleep_list`와 같은 전역 공유 자원을 접근할 때는 **​Race Condition​** 방지를 위해 반드시 인터럽트를 비활성화(`intr_disable`)해야 한다.
