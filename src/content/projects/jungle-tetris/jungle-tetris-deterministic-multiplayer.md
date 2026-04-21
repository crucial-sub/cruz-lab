---
entryType: "post"
title: '해커톤 MVP 이후 멀티플레이 구조를 다시 손본 이야기'
description: '고정 타임스텝, 리플레이 재현성, 입력 보정, WebRTC 폴백까지 다시 보며 멀티플레이 구조를 손본 이야기'
project: 'jungle-tetris'
order: 2
chapterLabel: 'Part 2'
status: 'published'
---

> 해커톤 버전은 일단 돌아갔다.  
> 다만 다시 코드를 보면 시간 처리, 상태 동기화, 리플레이 기준이 꽤 느슨했다.  
> 다시 보니 "그다음에 뭘 더 손봐야 하는가"가 더 또렷해졌다.

## `requestAnimationFrame`만으로는 충분하지 않았다

예전에는 `requestAnimationFrame` 기반 루프만으로도 얼추 괜찮아 보였다.

그런데 탭 전환이나 프레임 드롭이 생기면 문제가 드러났다.  
렌더링 프레임과 게임 로직 업데이트가 너무 강하게 묶여 있으면, 순간적인 프레임 저하가 곧 게임 속도 흔들림으로 이어진다.

그래서 루프를 **고정 타임스텝 + 보간** 구조로 다시 잡았다.

```js
let accumulator = 0;

function gameLoop(currentTime) {
  accumulator += deltaTime;

  while (accumulator >= FIXED_DELTA && updates < MAX_FRAME_SKIP) {
    update();
    accumulator -= FIXED_DELTA;
  }

  const alpha = accumulator / FIXED_DELTA;
  render(alpha);
  requestAnimationFrame(gameLoop);
}
```

이렇게 바꾸면 적어도 기준은 더 분명해진다.

- 게임 로직은 일정한 단위로 계산하고
- 렌더링은 현재 프레임 상황에 맞춰 보간하고
- 프레임이 흔들려도 규칙 계산은 덜 흔들리게 만드는 식이다

테트리스처럼 입력 타이밍이 중요한 장르에서는, 이런 분리가 결국 필요하다는 쪽에 더 가까웠다.

## 리플레이를 만들려면 먼저 "같은 입력이면 같은 결과"가 나와야 했다

리플레이 기능을 붙이려면 단순히 화면을 녹화하는 식으로는 부족했다.

원했던 건 게임을 처음부터 **같은 방식으로 다시 재생**하는 것이었다.

그래서 블록 생성부터 결정론적으로 다시 보게 됐다.  
핵심은 `Mulberry32` 기반 Seeded PRNG였다.

이유는 단순하다.

- `Math.random()`에 맡기면 재현이 어렵다
- seed를 고정하면 블록 시퀀스를 같은 방식으로 다시 만들 수 있다
- 그러면 저장해야 할 데이터 양도 훨씬 줄어든다

즉, 게임 상태 전체를 프레임마다 저장하는 대신  
**입력 기록과 seed**를 중심으로 재생 가능성을 확보하는 쪽으로 정리했다.

리플레이를 붙이는 문제처럼 보여도, 실제로는 게임 전체를 어떤 기준으로 다룰지 다시 정하는 작업에 가까웠다.

## 서버 검증을 넣어도 조작감은 살리고 싶었다

멀티플레이에서 서버 검증은 필요하다.  
문제는 검증만 믿고 모든 입력 결과를 서버에서만 기다리면 조작감이 너무 둔해진다는 점이다.

그래서 구조는 **클라이언트 예측 → 서버 검증 → 필요 시 조정** 쪽으로 다시 정리했다.

```js
function sendInput(action) {
  inputSequence++;
  const input = { seq: inputSequence, action, timestamp: Date.now() };
  pendingInputs.push(input);

  if (serverEngineReady) {
    socket.emit('game:input', { room_id: room_id, input });
  }
}
```

서버에서 입력이 거절되거나 상태가 어긋났다고 판단되면 전체 상태를 다시 받아 조정한다.

```js
socket.on('game:full_state', function (data) {
  game.grid = data.grid;
  score = data.score;
  game.over = data.game_over;

  pendingInputs.forEach((input) => {
    executeInputLocally(input.action);
  });
});
```

여기서 다시 느낀 건, 멀티플레이가 "무조건 서버 권위" 아니면 "무조건 로컬 우선"으로 깔끔하게 갈리는 문제가 아니라는 점이었다.

손맛을 살리려면 로컬 예측이 필요하고,  
상태 붕괴를 막으려면 서버 검증이 필요하다.

결국 손맛과 정합성 사이의 균형을 어디에 둘지 정하는 문제였다.

## 가능하면 P2P, 안 되면 Socket.IO

지연시간도 계속 고민거리였다.

멀티플레이에서 모든 메시지를 서버 경유로만 처리하면 구조는 단순하다.  
대신 거리가 길어진다.

그래서 이 프로젝트에는 `RTCPeerConnection` 기반 WebRTC DataChannel도 붙여 봤다.

```js
this.peerConnection = new RTCPeerConnection(this.iceServers);
```

연결이 되면 직접 주고받고, 실패하면 Socket.IO로 돌아가는 구조로 잡았다.

```js
if (
  this.peerConnection.connectionState === 'failed' ||
  this.peerConnection.connectionState === 'disconnected'
) {
  this.connected = false;
  console.log('P2P connection lost, falling back to Socket.IO');
}
```

여기서는 폴백이 빠지면 구조가 금방 이상해졌다.

P2P만 믿으면 환경에 따라 바로 불안정해진다.  
반대로 서버 중계만 고집하면 지연시간에서 손해를 본다.

그래서 둘 중 하나를 고집하기보다,

- 되면 더 짧은 경로로 보내고
- 안 되면 익숙한 경로로 돌아오는

식으로 두는 편이 더 현실적이었다.

## 마무리

해커톤 때 목표는 "일단 멀티가 된다"에 가까웠다.  
그 뒤 다시 손보면서는, 어떤 기능을 더 붙일지보다 시간, 상태, 입력을 어디까지 엄격하게 다뤄야 하는지가 더 먼저 보였다.

완전히 끝낸 회고라고 보긴 어렵다.
해커톤 버전 위에서 무엇을 다시 손봤고, 어떤 기준이 아직 남아 있는지에 더 가깝다.
