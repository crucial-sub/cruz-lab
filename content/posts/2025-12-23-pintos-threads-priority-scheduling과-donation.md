---
title: "[Pintos] Threads - Priority Scheduling과 Donation"
description: "우선순위 스케쥴링과 donation 구현"
pubDate: "2025-12-23T12:00:16.463Z"
updatedDate: "2025-12-23T12:03:12.913Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1766491190587.webp?alt=media&token=c6668c72-1ef6-49be-89f3-7db4dfc3ff2d"
tags: ["운영체제", "pintos", "크래프톤 정글"]
slug: "pintos-threads-priority-scheduling과-donation"
readingTime: 3
isPublic: true
---

> ##### Priority Scheduling 구현
>
> Alarm Clock 구현에 이어, 이번에는 스레드 스케줄링 정책을 개선한다.
>
> 기존 Round Robin 방식 대신, **우선순위(Priority)​**​가 높은 스레드가 CPU를 먼저 점유하도록 만드는 것이 목표다.
>
> 또한, 이 과정에서 필연적으로 발생하는 **우선순위 역전** 문제를 해결하기 위해 **​Priority Donation**을 구현해야 한다.

## Priority Scheduling 기본 구현

기본적인 원칙은 `ready_list`를 항상 우선순위 순으로 정렬된 상태로 유지하는 것이다.

* `thread_unblock`, `thread_yield` 등에서 `list_push_back` 대신 `list_insert_ordered`를 사용하여 우선순위 순으로 삽입한다.

* 현재 실행 중인 스레드보다 높은 우선순위의 스레드가 `READY` 상태가 되면 즉시 **Preemption(선점)**​이 발생해야 한다.

```c
/* thread_create, thread_unblock 등에서 */
list_insert_ordered (&ready_list, &t->elem, thread_compare_priority, NULL);

/* 현재 스레드보다 우선순위가 높은 스레드가 있다면 양보 */
if (thread_get_priority () < t->priority)
    thread_yield ();
```

***

## Priority Inversion 문제

단순히 정렬만으로는 해결되지 않는 문제가 있다. 바로 **Priority Inversion(우선순위 역전)​** 현상이다.

> **​상황 예시:​**
>
> 1. **​Low​** 우선순위 스레드가 `Lock A`를 점유 중이다.
> 2. **​High​** 우선순위 스레드가 깨어나 `Lock A`를 요청하지만, **​Low​**가 점유 중이므로 대기한다.
> 3. 이때 **​Medium​** 우선순위 스레드가 실행된다.
> 4. **​Medium​**은 **​Low​**보다 우선순위가 높으므로 CPU를 선점하여 실행된다.
> 5. 결과적으로 가장 높은 우선순위를 가진 **​High​**가 **​Medium​**이 끝날 때까지 기다리게 된다.

이를 해결하기 위해 **​Priority Donation(우선순위 기부)​** 기법을 도입한다.


**​High​** 스레드가 자신이 기다리는 락을 점유한 **​Low​** 스레드에게 일시적으로 자신의 높은 우선순위를 빌려주어, **​Low**가 빨리 작업을 마치고 락을 해제하도록 돕는 것이다.

***

## Priority Donation 구현

`struct thread`에 Donation 관련 필드를 추가한다.

```c
struct thread {
    /* ... */
    int original_priority;          /* 기부받기 전 원래 우선순위 */
    struct lock *waiting_for_lock;  /* 현재 대기 중인 락 */
    struct list acquired_locks;     /* 보유 중인 락 목록 */
    /* ... */
};
```

### 핵심 로직: `lock_acquire`

락을 획득하려 할 때 이미 점유자가 있고, 점유자의 우선순위가 나보다 낮다면 Donation을 수행한다.

```c
void lock_acquire (struct lock *lock) {
    /* ... */
    struct thread *holder = lock->holder;
    
    if (holder != NULL && holder->priority < thread_get_priority ()) {
        donate_priority (); /* 우선순위 기부 */
    }
    /* ... */
}
```

***

### Nested Donation (연쇄 기부)

Donation은 연쇄적으로 일어날 수 있다.

**A(High) -> B(Medium, Lock1) -> C(Low, Lock2)​**와 같은 상황에서는 A의 우선순위가 C까지 전달되어야 한다.

이를 위해 재귀적 혹은 반복적으로 락의 소유자를 추적하며 우선순위를 업데이트한다.
(Pintos 과제에서는 깊이 제한을 8로 둔다.)

```c
void donate_priority (void) {
    struct thread *curr = thread_current ();
    struct lock *lock = curr->waiting_for_lock;
    int depth = 0;

    while (lock != NULL && depth < 8) {
        struct thread *holder = lock->holder;
        if (holder->priority < curr->priority) {
            holder->priority = curr->priority;
            lock = holder->waiting_for_lock;
            depth++;
        } else {
            break; 
        }
    }
}
```

***

## Donation 해제 (`lock_release`)

락을 해제할 때는 기부받은 우선순위를 반환해야 한다.
단, 단순히 `original_priority`로 복구하는 것이 아니라, **아직 보유 중인 다른 락**​에 의해 받고 있는 Donation이 있는지 확인해야 한다.

따라서 `lock_release` 시점의 우선순위 결정 로직은 다음과 같다.

1. 해제하는 락을 목록에서 제거한다.
2. 남은 락들을 대기하고 있는 스레드들 중 가장 높은 우선순위(`max_priority`)를 찾는다.
3. `original_priority`와 `max_priority` 중 더 큰 값으로 현재 우선순위를 설정한다.

***

## Semaphore와 Condition Variable

세마포어(`sema_down`, `sema_up`)와 컨디션 변수(`cond_wait`, `cond_signal`)도 우선순위를 고려하도록 수정해야 한다.

특히 `sema_up` 시, 대기자 리스트(`waiters`)에서 가장 우선순위가 높은 스레드를 깨워야 한다.
이때 리스트가 정렬되어 있더라도, 대기 도중 Donation에 의해 우선순위가 변경되었을 수 있으므로 `list_max` 등을 통해 다시 한번 확인하는 과정이 필요하다.

## 마무리

Priority Scheduling 구현을 통해 `priority-*` 관련 테스트들을 모두 통과했다.

이 과정에서 스레드 간의 동기화 문제와 자원 경쟁 상황을 깊이 있게 이해할 수 있었다.
