---
title: "[wesbos30] 11. Custom Video Player"
description: "💡 비디오 플레이어의 여러 기능들을 직접 구현해보자!"
pubDate: "2025-12-04T11:52:33.895Z"
updatedDate: "2025-12-04T11:52:33.894Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764849151672.webp?alt=media&token=05625f0c-adfe-4842-8db9-536be1fc2263"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-11-custom-video-player"
readingTime: 4
isPublic: true
---

> 💡 비디오 플레이어의 여러 기능들을 직접 구현해보자!

## 비디오 플레이어 기능 구현 목록

1. 영상 재생 및 멈춤 기능
2. 영상 스킵 기능
3. 영상 진행도 표시 기능
4. 영상 볼륨 및 영상 속도 조절 기능

***

## 코딩 과정

### 1. 각 요소들 상수로 선언

```javascript
// 비디오 플레이어 전체 div
const player = document.querySelector('.player')
// 비디오
const video = player.querySelector('.viewer')
// 영상 진행도 바 담을 div
const progress = player.querySelector('.progress')
// 영상 진행도 바
const progressBar = player.querySelector('.progress__filled')
// 영상 재생 버튼
const toggle = player.querySelector('.toggle')
// 지정한 시간만큼 한번에 스킵할 스킵 버튼
const skipButtons = player.querySelectorAll('[data-skip]')
// 볼륨 바와 영상속도 바
const ranges = player.querySelectorAll('.player__slider')
```

### 2. 재생 관련 기능 구현

```javascript
function togglePlay() {
  const method = video.paused ? 'play' : 'pause'
  // 문자열을 변수로 선언해주었으므로 점 표기법이 아닌 괄호 표기법을 통해 속성에 접근한다!
  video[method]()
}

function updateButton() {
  const icon = this.paused ? '►' : '❚ ❚'
  toggle.textContent = icon
}

video.addEventListener('click', togglePlay)
video.addEventListener('play', updateButton)
video.addEventListener('pause', updateButton)
toggle.addEventListener('click', togglePlay)
```

> 💡 attribute와 property
>
> attribute와 property 둘 다 속성을 의미하지만 정의되는 곳에서 차이가 발생한다.
>
> attribute는 html document/file 안에서 elements 에 추가적인 정보를 넣을 때 사용되는 요소이고,
>
> property 는 html DOM tree안에서 attribute 를 가리키는(혹은 대신하는) 표현이다.
>
> 이것이 뜻하는 것은 attribute는 정적으로 변하지 않지만,
> property는 DOM tree의 특성상 자바스크립트에 의해 동적으로 그 값이 변할 수 있다는 것이다.

`HTML <video>` 에는 여러가지 속성이 존재한다.

```markdown
** : 본 챌린지에서 사용한 속성

**attributes**
src (string): 재생할 미디어의 URL(경로 포함).
poster (string): 미디어에 표시될 대표 이미지의 URL.
controls (boolean): 재생 버튼과 같은 브라우저의 기본 제어도구 표시. (브라우저마다 기본 제어도구가 다름)
width (integer): 미디어 플레이어의 너비.
height (integer): 미디어 플레이어의 높이.
autoplay (boolean): 미디어 자동재생.
loop (boolean): 미디어 반복 재생.
preload (boolean): 페이지를 읽을 때 미디어도 같이 읽어들여 재생을 준비, `autoplay` 속성이 설정되어있으면 무시됨.

**properties**
** CurrentTime (float): 재생 중인 미디어의 현재 위치.
startTime (float): 재생 시작 시간. (미디어가 0.0에서 시작되지 않는 경우, 예를 들어 스트림)
** duration (float): 초, 미디어 총 재생 길이.
** paused (boolean): 미디어 일시 정지 여부. (ios에선 pause이며 일시정지 버튼 뿐만 아니라, "Done", "완료" 버튼을 누를때도 같은 이벤트로 적용된다.)
ended (boolean): 미디어 종료 여부.
autobuffer (boolean): 브라우저가 로딩되면 바로 버퍼링 시작할 것인지 여부.
seeking (boolean): 미디어의 특정 위치로 탐색 중일 때. 탐색 전이거나 탐색을 완료한 후에는 항상 `false`.
defaultPlaybackRate (float): 미디어 기본 재생 속도. (기본값은 1.0).
** playbackRate (float): 미디어 재생 속도 배속. (기본값은 1.0이며 이 속성을 조절하면 빨리감기나 슬로우 모션 기능 구현 가능)
** volume (float): 볼륨 크기. (0.0에서 1.0)
mute (boolean): 음소거 여부
readyState (integer): video 요소의 준비 상태를 나타내는 0부터 4까지의 정수.
networkState (integer): 네트워크의 상태를 나타내는 0부터 3까지의 정수.
error (MediaError): 미디어 오류. (객체가 오류 났을 경우).

**methods**
load(): 미디어를 읽어들임.
** play(): 미디어 재생.
** pause(): 미디어 일시 정지.

참고
https://eyecandyzero.tistory.com/207
https://taegon.kim/archives/3058
```

### 3. 스킵 기능 구현

```javascript
function skip() {
  video.currentTime += parseFloat(this.dataset.skip)
}

skipButtons.forEach(button => button.addEventListener('click', skip))
```

미리 HTML button 태그에 data-skip 값을 설정해준 뒤
이 값 만큼 비디오의 currentTime 속성을 변경시켜준다.

### 4. 영상 진행도 표시 기능 구현

```javascript
function handleProgress() {
  const percent = (video.currentTime / video.duration) * 100
  progressBar.style.flexBasis = `${percent}%`
}

function scrub(e) {
  const scrubTime = (e.offsetX / progress.offsetWidth) * video.duration
  video.currentTime = scrubTime
}

video.addEventListener('timeupdate', handleProgress)

let mousedown = false
progress.addEventListener('click', scrub)
progress.addEventListener('mousemove', e => mousedown && scrub(e))
progress.addEventListener('mousedown', () => (mousedown = true))
progress.addEventListener('mouseup', () => (mousedown = false))
```

### 5. 볼륨 조절 & 영상속도 조절 기능 구현

```javascript
function handleRangeUpdate() {
  video[this.name] = this.value
}

ranges.forEach(range => range.addEventListener('change', handleRangeUpdate))
ranges.forEach(range => range.addEventListener('mousemove', handleRangeUpdate))
```

미리 HTML input 태그에 각각 name 값으로 “volume”과 “playbackRate” 를 설정해주어 range 바를 조절할 때 마다 해당 속성값을 변경시켜준다.

***

## 최종 코드

```javascript
const player = document.querySelector('.player')
const video = player.querySelector('.viewer')
const progress = player.querySelector('.progress')
const progressBar = player.querySelector('.progress__filled')
const toggle = player.querySelector('.toggle')
const skipButtons = player.querySelectorAll('[data-skip]')
const ranges = player.querySelectorAll('.player__slider')

function togglePlay() {
  const method = video.paused ? 'play' : 'pause'
  video[method]()
}

function updateButton() {
  const icon = this.paused ? '►' : '❚ ❚'
  console.log(icon)
  toggle.textContent = icon
}

function skip() {
  video.currentTime += parseFloat(this.dataset.skip)
}

function handleRangeUpdate() {
  video[this.name] = this.value
}

function handleProgress() {
  const percent = (video.currentTime / video.duration) * 100
  progressBar.style.flexBasis = `${percent}%`
}

function scrub(e) {
  const scrubTime = (e.offsetX / progress.offsetWidth) * video.duration
  video.currentTime = scrubTime
}

video.addEventListener('click', togglePlay)
video.addEventListener('play', updateButton)
video.addEventListener('pause', updateButton)
video.addEventListener('timeupdate', handleProgress)

toggle.addEventListener('click', togglePlay)

skipButtons.forEach(button => button.addEventListener('click', skip))

ranges.forEach(range => range.addEventListener('change', handleRangeUpdate))
ranges.forEach(range => range.addEventListener('mousemove', handleRangeUpdate))

let mousedown = false
progress.addEventListener('click', scrub)
progress.addEventListener('mousemove', e => mousedown && scrub(e))
progress.addEventListener('mousedown', () => (mousedown = true))
progress.addEventListener('mouseup', () => (mousedown = false))
```
