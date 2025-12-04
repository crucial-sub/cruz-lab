---
title: "[wesbos30] 29. CountDown Timer"
description: "💡 시간을 정해주면 카운트 다운을 해주는 타이머를 만들어보자!"
pubDate: "2025-12-04T12:12:32.841Z"
updatedDate: "2025-12-04T12:12:32.840Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764850349606.webp?alt=media&token=475f8c2a-cd74-44b1-b0f6-8c4b41850dc2"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-29-countdown-timer"
readingTime: 4
isPublic: true
---

> 💡 시간을 정해주면 카운트 다운을 해주는 타이머를 만들어보자!

## 로직

1. 1초마다 카운트다운해주는 timer 함수 만들기
2. 남은시간 표시 함수와 끝나는 시간 표시 함수 만들기
3. timer 함수에 시간 표시 함수 2개 추가
4. 버튼과 입력 폼으로 timer함수 작동시키기

***

## 코딩 과정

### **1. 타이머 함수 만들기**

```javascript
let countdown

function timer(seconds) {
  //현재 시간을 ms 단위로 나타냄
  const now = Date.now()
  //현재 시간에서 입력한 시간 후를 ms 단위로 나타냄
  const then = now + seconds * 1000

  countdown = setInterval(() => {
    const secondsLeft = Math.round((then - Date.now()) / 1000)
    //남은 시간이 0 보다 작아지면 인터벌 끝내고 함수 종료
    if (secondsLeft < 0) {
      clearInterval(countdown)
      return
    }
  }, 1000)
}
```

먼저 setInterval로 1초마다 남은 시간을 카운트다운하는 함수를 만든다.

### **2. 화면에 표시해주는 함수 만들기**

#### 남은 시간 표시 (분:초)

```javascript
const timerDisplay = document.querySelector('.display__time-left')

function displayTimeLeft(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  const display = `${minutes}:${
    remainderSeconds < 10 ? '0' : ''
  }${remainderSeconds}`
  document.title = display
  timerDisplay.textContent = display
}
```

분 단위는 입력받은 시간(초)을 60으로 나누고 소숫점을 없앤 값

초 단위는 입력받은 시간(초)을 60으로 나누고 남은 나머지이다.

이 때 초 단위가 10 아래로 내려갈 경우에는 앞에 0을 붙히도록 설정한다.

#### 타이머가 끝나는 시간 표시 (시:분)

```javascript
const endTime = document.querySelector('.display__end-time')

function displayEndtime(timestamp) {
  const end = new Date(timestamp)
  const hour = end.getHours()
  const minutes = end.getMinutes()
  const adjustedHour = hour > 12 ? hour - 12 : hour
  endTime.textContent = `Be Back At ${adjustedHour}:${
    minutes < 10 ? '0' : ''
  }${minutes}`
}
```

시, 분 각각의 단위는 현재 시간에서 입력받은 시간이 지났을 때의 시간 값(then)에서 시, 분 값을 받아온다.

이때 시 값이 12를 넘을 경우 12를 빼주어 표현한다.

마찬가지로 분 단위가 10 아래로 내려갈 경우에는 앞에 0을 붙히도록 설정한다.

### **3. 타이머 함수에 화면표시 함수 추가**

```javascript
function timer(seconds) {
  clearInterval(countdown)

  const now = Date.now()
  const then = now + seconds * 1000
  //타이머가 바로 작동하도록 함수를 한번 실행시켜준다.
  displayTimeLeft(seconds)
  //화면에 끝나는 시간을 표시!
  displayEndtime(then)

  countdown = setInterval(() => {
    const secondsLeft = Math.round((then - Date.now()) / 1000)
    // check if we should stop it!
    if (secondsLeft < 0) {
      clearInterval(countdown)
      return
    }
    //화면에 남은시간을 표시!
    displayTimeLeft(secondsLeft)
  }, 1000)
}
```

<br />

### **4. 버튼과 입력 폼으로 타이머 동작시키기**

```javascript
const buttons = document.querySelectorAll('[data-time]')

function startTimer() {
  const seconds = parseInt(this.dataset.time)
  timer(seconds)
}

buttons.forEach(button => button.addEventListener('click', startTimer))
//HTML 태그 속성중에 name이 포함되어 있을 경우 바로 document.name값 으로 불러올 수 있다.
document.customForm.addEventListener('submit', function (e) {
  e.preventDefault()
  const mins = this.minutes.value
  //입력 폼에는 분 단위로 입력하고 함수에는 입력값에 60을 곱해 초단위로 입력하도록 한다.
  timer(mins * 60)
  this.reset()
})
```

먼저 버튼을 누르면 각 버튼의 data-time 값이 timer함수에 입력되도록 한다.

입력 폼은 분 단위의 값을 입력하면 이를 초 단위로 바꾸어 timer함수에 입력되도록 한다.

***

## 최종 완성 코드

```javascript
let countdown
const timerDisplay = document.querySelector('.display__time-left')
const endTime = document.querySelector('.display__end-time')
const buttons = document.querySelectorAll('[data-time]')

function timer(seconds) {
  clearInterval(countdown)

  const now = Date.now()
  const then = now + seconds * 1000
  displayTimeLeft(seconds)
  displayEndtime(then)

  countdown = setInterval(() => {
    const secondsLeft = Math.round((then - Date.now()) / 1000)
    if (secondsLeft < 0) {
      clearInterval(countdown)
      return
    }
    displayTimeLeft(secondsLeft)
  }, 1000)
}

function displayTimeLeft(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  const display = `${minutes}:${
    remainderSeconds < 10 ? '0' : ''
  }${remainderSeconds}`
  document.title = display
  timerDisplay.textContent = display
}

function displayEndtime(timestamp) {
  const end = new Date(timestamp)
  const hour = end.getHours()
  const minutes = end.getMinutes()
  const adjustedHour = hour > 12 ? hour - 12 : hour
  endTime.textContent = `Be Back At ${adjustedHour}:${
    minutes < 10 ? '0' : ''
  }${minutes}`
}

function startTimer() {
  const seconds = parseInt(this.dataset.time)
  timer(seconds)
}

buttons.forEach(button => button.addEventListener('click', startTimer))
document.customForm.addEventListener('submit', function (e) {
  e.preventDefault()
  const mins = this.minutes.value
  timer(mins * 60)
  this.reset()
})
```
