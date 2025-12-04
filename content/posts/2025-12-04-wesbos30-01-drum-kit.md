---
title: "[wesbos30] 01. Drum kit"
description: "키보드로 오디오를 재생하는 드럼 키트를 만들어보자!"
pubDate: "2025-12-04T09:23:26.768Z"
updatedDate: "2025-12-04T09:23:26.768Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764792218184.webp?alt=media&token=cc726920-0956-47c8-aab1-0a78b67fd53f"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-01-drum-kit"
readingTime: 4
isPublic: true
---

> 💡 키보드 중의 어떤 키를 눌렀을 때 해당 키와 데이터 값이 같은 audio를 찾아 재생시키는 drum kit다.

## 로직

1. `window`에 키보드 이벤트로 함수 호출하도록 설정 (`addEventListener`, `keydown`)
2. 키를 눌러 해당 키와 데이터 값이 같은 audio 재생 (`keyCode`, `data-attribute`, `play()`) 
3. 연타 가능하도록 설정 (`currentTime`) 
4. 키를 누른것을 화면에 표시 (`classList.add`) 
5. transition이 끝나면 다시 원래대로 돌아가도록 설정 (`forEach`, `transitionend`, `classList.remove`) 

***

## 코딩 과정

### 1. window에 키보드 이벤트로 함수 호출하도록 설정

```javascript
//EventTarget.addEventListener("이벤트", 함수);
window.addEventListener('keydown', playAudio)
window.addEventListener('keydown', keydownAnimation)
```

#### addEventListener()

addEventListener() 메서드는 지정한 이벤트가 대상에 전달될 때마다 호출할 함수를 설정한다.

일반적인 대상은 Element, Document, Window이며
자주 쓰이는 이벤트 목록은 다음과 같다.

![](https://user-images.githubusercontent.com/87363422/155992024-b431ab70-100a-4ec8-93f4-f2d2dda8ce00.png)

### 2. 키를 눌러 해당 키와 데이터 값이 같은 audio 재생

```jsx
function playAudio(event) {
  const audio = document.querySelector(`audio[data-key="${event.keyCode}"]`)
  if (!audio) return
  audio.play()
}
```

#### keyCode

JavaScript에서 keydown, keypress, keyup 등의 키보드 이벤트를 받았을 때 키 값을 구별할 수 있는 코드

<http://keycode.info/>에서 확인가능하다

#### data-attribute

화면에 안 보이게 글이나 추가 정보를 element에 담아 놓을 수 있는 속성

`data-값` 의 형태로 어느 element에나 설정 가능

JavaScript에선 `dataset`객체를 활용하여 앞의 `data-`를 빼고 `dataset.값`으로 불러올 수 있다.

```javascript
<audio data-key="71" src="sounds/boom.wav"></audio>;
```

속성 선택자를 사용하여 원하는 data-key 값을 가진 audio를 선택해 상수로 선언해보자

속성 선택자 : \[속성이름="속성값"]

```javascript
const audio = document.querySelector(`audio[data-key="${event.keyCode}"]`)
```

> ❓ 템플릿 문자열(Template literals) : </br>
> 따옴표("") 대신 백틱(\`\`)을 사용해 문자열 내에서 변수나 함수를 표현할 수 있는 기능으로
> 표현식을 $와 중괄호{ }에 포함시켜 표현한다.

여기서는 정적인 data-key 값을 가진 audio를 찾는게 아니라 키를 누를때마다 유동적으로 해당 키와 데이터값이 같은 audio를 찾아내야하기 때문에 템플릿 문자열을 사용하였다.

눌린 키의 키코드(event.keycode)를 변수로써 ${ }에 넣어
keydown event가 일어날 때마다 html내의 audio중에서 변수값(event.keycode)과 data-key 속성값이 같은 특정한 audio를 찾아 상수로 선언한다.

### 3. 연타 가능하도록 설정

```javascript
function playAudio() {
  const audio = document.querySelector(`audio[data-key="${event.keyCode}"]`)
  if (!audio) return
  audio.play()
  audio.currentTime = 0
}
```

키를 연속으로 눌러보면 해당 audio의 이전 재생이 완전히 끝난 후에야 다음 재생이 이뤄짐을 알 수 있다.

따라서 키를 누를 때마다 audio 재생을 초기화할 필요가 있다.

#### currentTime

audio 및 video의 속성으로 재생의 현재 위치를 반환한다. 이 속성이 설정되어있는 경우, 플레이어는 지정된 위치로 이동한다.

currentTime을 0으로 설정할 경우 키를 누를 때마다 audio가 0초부터 시작되기에 연타가 가능해진다.

### 4. 키를 누른것을 화면에 표시

```javascript
function keydownAnimation(event) {
  const key = document.querySelector(`.key[data-key="${event.keyCode}"]`)
  key.classList.add('playing')
}
```

키를 누른것을 표시하기 위해 audio와 동일하게 해당 키를 나타내는 div를 찾은 후 CSS 효과를 적용시킨다.

#### classList.add("클래스 이름")

```javascript
//미리 CSS에 배경효과를 작성해둔 playing 클래스를 추가
key.classList.add('playing')
```

element에 클래스를 추가하는 메서드이다.

반대로 클래스를 제거할땐 classList.remove를 사용하면 된다.

### 5. transition이 끝나면 다시 원래대로 돌아가도록 설정

```javascript
//querySelectorAll는 CSS선택자를 사용하여 배열과 비슷한 객체인 NodeList를 반환한다.
const keys = document.querySelectorAll('.key')
function removeTransition(event) {
  //불필요한 함수 실행 방지
  if (event.propertyName !== 'transform') return
  //다시 class를 제거하여 원상복귀하도록!
  this.classList.remove('playing')
}
keys.forEach(key => key.addEventListener('transitionend', removeTransition))
```

위의 4번까지 코드를 짠 후 키를 눌러보면 CSS가 적용되고 페이지를 새로고침하기 전까진 그 효과가 계속 남아있기에...

키를 누를 때마다 눌렀다는 것을 인식하기 위해 키를 떼면 다시 CSS효과가 제거될 필요가 있다.

#### forEach()

배열의 요소 각각에 주어진 함수를 실행하는 메서드이다.

보통 function 키워드 대신 화살표(=>)를 사용하여 보다 간략한 방법으로 함수를 선언할 수 있는 화살표 함수(Arrow function)를 사용한다.

forEach() 메서드를 사용해 NodeList인 keys의 요소 각각에 키를 떼면 removeTransition 함수가 전달되도록 한다.

#### Transitionend

transition(전이)가 완료된 후 발생하는 이벤트이다.

> 이때 removeTransition 함수 내에 console.log(event) 코드를 넣어보면...

![로그 기록](https://user-images.githubusercontent.com/87363422/155992041-73533b87-7a28-45f2-959a-e1c44987003b.png)

CSS에 작성된 순서대로 transition 동작들이 완료될 때마다 각각 함수가 실행되어 console에 찍히는 것을 확인할 수 있다 (어떤 동작인지는 propertyName 항목으로 확인할 수 있다.)

따라서 불필요한 함수 실행을 줄이기 위해 event객체의 propertyName이 transform인 transition 동작이 완료될 때만 함수가 실행되도록 한다!

```javascript
if (event.propertyName !== 'transform') return
```

***

## 최종 완성 코드

```javascript
function playAudio() {
  const audio = document.querySelector(`audio[data-key="${event.keyCode}"]`)
  if (!audio) return
  audio.play()
  audio.currentTime = 0
}

function keydownAnimation(event) {
  const key = document.querySelector(`.key[data-key="${event.keyCode}"]`)
  key.classList.add('playing')
}

const keys = document.querySelectorAll('.key')
function removeTransition(event) {
  if (event.propertyName !== 'transform') return
  this.classList.remove('playing')
}
keys.forEach(key => key.addEventListener('transitionend', removeTransition))

window.addEventListener('keydown', playAudio)
window.addEventListener('keydown', keydownAnimation)
```
