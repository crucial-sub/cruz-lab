---
entryType: "post"
title: "실시간이라는 말 뒤에 숨어 있던 비용"
description: "Fetch 기반 SSE, 지수 백오프, Delta 프로토콜, Web Worker로 실시간 UX를 다시 다듬은 이야기"
project: "stock-lab"
order: 2
chapterLabel: "Part 2"
status: "published"
---

> 기능이 일단 돌아가고 나니, 그다음부터는 실시간이라는 말이 꽤 비싸게 느껴졌다.  
> 인증이 필요한 스트리밍을 어떻게 받을지, 연결이 끊겼을 때 어떻게 다시 붙일지, 바뀐 값만 보내도록 줄일 수 있을지 같은 문제들이 남았다.

## EventSource가 쉬워 보여도 정답은 아니었다

처음엔 SSE라면 당연히 `EventSource`라고 생각했다.

브라우저 기본 API고, 사용법도 간단하다.  
문제는 **인증 헤더**였다.

실제 구현은 결국 `Fetch API + ReadableStream`으로 갔다.

```ts
/**
 * Fetch API + ReadableStream을 사용하여 SSE 기반 채팅 스트리밍을 처리합니다.
 * - EventSource 대신 Fetch API 사용으로 인증 헤더 지원
 * - AbortController를 통한 요청 중단 기능
 * - 지수 백오프 + Jitter 기반 자동 재연결
 */
```

이렇게 간 이유는 단순했다.

첫째, 인증을 정석적으로 처리할 수 있었다.  
질문 내용을 URL에 억지로 실어 보내지 않아도 됐다.

둘째, 사용자가 "그만"을 눌렀을 때 정말로 끊을 수 있었다.

```ts
const abortController = new AbortController();
abortControllerRef.current = abortController;
```

LLM 응답은 기다리는 시간이 길다.  
그렇다면 "시작"만큼이나 "중단"도 중요하다.

사소해 보여도 이런 제어감은 꽤 중요했다.  
실시간 화면일수록, 사용자가 직접 끊을 수 있어야 덜 답답했다.

## 끊어졌을 때 얌전히 죽지 않게 만들기

실시간 연결은 언젠가 끊긴다.  
이건 전제다.

문제는 끊긴 뒤다.  
무작정 즉시 재시도만 반복하면 사용자도 답답하고 서버도 괴롭다.

그래서 재연결에는 **지수 백오프 + Jitter**를 넣었다.

```ts
function calculateBackoffWithJitter(
  attempt: number,
  baseInterval: number,
  maxInterval: number
): number {
  const exponentialDelay = baseInterval * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxInterval);
  const jitter = Math.random() * 1000;
  return cappedDelay + jitter;
}
```

핵심은 단순하다.

- 첫 실패 때는 빨리 다시 붙고
- 여러 번 실패하면 점점 천천히 시도하고
- 여러 클라이언트가 동시에 몰리는 것도 조금 분산한다

실시간 시스템은 잘 될 때보다 **안 될 때 어떻게 무너지느냐**가 더 중요하다.  
적어도 이 부분은, 무작정 다시 붙는 쪽보다 실패를 다루는 기준을 먼저 두는 편이 낫다고 봤다.

## WebSocket도 전체 데이터를 계속 보내면 금방 비싸진다

백테스트 쪽에서 가장 아쉬웠던 부분은 데이터 전송 방식이었다.

실시간이라고 해서 매번 전체 상태를 보내면, 결국 클라이언트가 같은 일을 계속 반복하게 된다.

그래서 `useBacktestWebSocket`에는 **Delta 프로토콜**을 붙였다.

```ts
export interface DeltaMessage {
  type: "delta";
  date: string;
  changes: Partial<{
    portfolio_value: number;
    cash: number;
    position_value: number;
    daily_return: number;
    cumulative_return: number;
    progress_percent: number;
    current_mdd: number;
    buy_count: number;
    sell_count: number;
  }>;
}
```

여기서 중요한 건 `changes: Partial<...>`다.

즉, 매번 전체를 새로 덮어쓰는 게 아니라 **바뀐 필드만 보낸다**는 뜻이다.

클라이언트 쪽에서도 이 변경분만 기존 데이터에 병합한다.

```ts
const updated = applyDeltaToDataPoint(existing, message);
newData[existingIndex] = updated;
```

이 구조가 더 맞다고 본 이유도 분명했다.

- 네트워크 전송량이 줄어든다
- 클라이언트가 매번 전체 배열을 다시 해석하지 않아도 된다
- 실시간 갱신이 더 자연스럽게 느껴진다

결국 실시간성은 빠르게 보내는 것만이 아니라, **불필요한 걸 덜 보내는 것**과도 연결돼 있었다.

## 메인 스레드가 바쁘면 실시간도 금방 버벅인다

실시간 데이터가 많은 화면에서는 렌더링도 병목이 된다.

그래서 이 프로젝트에는 `Web Worker`도 들어갔다.

```ts
const pendingUpdates = new Map<string, AggregatedStockUpdate>();
let batchInterval = 100;
```

Worker는 들어오는 tick을 바로바로 메인 스레드에 뿌리지 않는다.  
대신 잠깐 모아뒀다가 100ms 단위로 배치 전송한다.

```ts
self.postMessage({
  type: "BATCH_UPDATE",
  updates,
  timestamp: Date.now(),
});
```

이 패턴을 다시 보게 된 이유는,  
실시간성을 완전히 포기하지 않으면서도 **브라우저가 숨 쉴 틈**을 만들 수 있었기 때문이다.

모든 업데이트를 즉시 반영하는 게 항상 좋은 건 아니다.  
사람이 체감하기 어려운 단위라면, 적당히 묶어서 보내는 편이 더 낫다.

## 기다림을 줄이는 건 네트워크만의 문제가 아니었다

UI 쪽에서는 `React Query` 기반의 낙관적 업데이트도 썼다.

실제로 `onMutate`, `cancelQueries`, `setQueryData`, `onError` 롤백 패턴이 여러 훅에 들어가 있다.

이건 서버 응답 속도를 빠르게 만드는 방법은 아니다.  
대신 **사용자가 느끼는 대기 시간**을 줄인다.

삭제 버튼을 눌렀는데 한참 뒤에 화면이 바뀌는 경험은 생각보다 거슬린다.  
그럴 바엔 먼저 UI를 반응시키고, 실패했을 때 되돌리는 편이 낫다.

실시간 UX는 스트리밍만으로 완성되지 않는다.  
버튼 하나 눌렀을 때의 반응 속도까지 포함해서 봐야 한다.

## 마무리

Stock Lab을 다시 보면서 남은 건 단순했다.

**실시간 기능은 붙이는 순간 끝나는 게 아니라, 그 뒤부터 비용을 계속 관리해야 한다.**

- SSE는 인증과 중단 가능성까지 같이 보게 됐고
- 재연결은 지수 백오프로 다시 정리했고
- WebSocket은 Delta 프로토콜로 전송량을 줄이려 했고
- Worker로 메인 스레드 부담도 나눴다

실시간 시스템은 빠르게 보내는 기술보다,  
**무엇을 덜 보내고 어디서 부담을 나눌지 정하는 일**에 더 가까웠다.
