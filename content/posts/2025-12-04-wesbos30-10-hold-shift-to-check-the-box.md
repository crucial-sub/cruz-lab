---
title: "[wesbos30] 10. Hold Shift to check the box"
description: "SHIFT 키와 같이 클릭하여 한번에 여러 개의 체크박스를 모두 체크하는 기능을 구현해보자!"
pubDate: "2025-12-04T11:49:15.944Z"
updatedDate: "2025-12-04T11:49:15.944Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764848953198.webp?alt=media&token=dba9218a-ddeb-4f23-8ce7-07b30d99ca9e"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-10-hold-shift-to-check-the-box"
readingTime: 3
isPublic: true
---

> 💡 SHIFT 키와 같이 클릭하여 한번에 여러 개의 체크박스를 모두 체크하는 기능을 구현해보자!

## 로직

1. 임의의 체크박스를 클릭하여 체크한 후 그 박스를 기억한다.
2. SHIFT 키와 같이 클릭한 것 인식하게 하기
3. 체크박스를 SHIFT 키와 같이 클릭할 경우 그 체크박스와 기억해둔 가장 최근의 체크박스 사이의 모든 체크박스 체크하기

***

## 코딩 과정

### 1. 최근 체크 박스 기억하기

```javascript
const checkboxes = document.querySelectorAll('.inbox input[type="checkbox"]')

let lastChecked

function handleCheck(e) {
  lastChecked = this
}

checkboxes.forEach(checkbox => checkbox.addEventListener('click', handleCheck))
```

핸들러를 생성하기에 앞서 미리 `lastChecked` 변수를 선언해주고
체크박스를 클릭할 때마다 `lastChecked` 값을 해당 체크박스로 업데이트 시켜준다.

### 2. SHIFT 키 인식하기

```javascript
const checkboxes = document.querySelectorAll('.inbox input[type="checkbox"]')

let lastChecked

function handleCheck(e) {
  if (e.shiftKey && this.checked) {
    console.log('쉬프트 키 눌림!')
  }
  lastChecked = this
}

checkboxes.forEach(checkbox => checkbox.addEventListener('click', handleCheck))
```

#### event.shiftKey

마우스이벤트, 키보드이벤트 발생 시 SHIFT 키가 눌렸는지 여부를 `Boolean` 값으로 반환해준다.
SHIFT 키와 마찬가지로 `event.altKey`, `event.ctrlKey` 또한 존재한다.

### 3. 두 체크박스 사이의 체크박스들 동시 체크

```javascript
const checkboxes = document.querySelectorAll('.inbox input[type="checkbox"]')

let lastChecked

function handleCheck(e) {
  let inBetween = false

  if (e.shiftKey && this.checked) {
    checkboxes.forEach(checkbox => {
      if (checkbox === this || checkbox === lastChecked) {
        inBetween = !inBetween
      }
      if (inBetween) {
        checkbox.checked = true
      }
    })
  }
  lastChecked = this
}

checkboxes.forEach(checkbox => checkbox.addEventListener('click', handleCheck))
```

먼저 각 체크박스들이 사이에 있는 체크박스인지에 대한 여부를 Boolean 값으로 판단하기 위해 `inBetween` 변수를 선언해 준다.

그 후 만약 SHIFT 키와 같이 클릭이 되면 `forEach` 메서드로 모든 체크박스에 대하여 다음 두 가지를 검사한다.

1. 만약 체크박스가 `this`(이벤트가 발생한 체크박스)거나 `lastChecked`(최근에 누른 체크박스)이면 `inBetween` 값을 반대로 설정
2. 만약 `inBetween` 값이 `true`면 체크박스를 체크 후 다음 체크박스 검사

위 코드에 의해 다음과 같은 과정으로 이벤트가 발생한다.

1. 임의의 체크박스 클릭 ⇒ `lastChecked` 업데이트 & `inBetween` 값으로 `false` 할당
2. 또 다른 체크박스를 SHIFT 키와 함께 클릭
   \
   ⇒ `forEach` 메서드로 모든 체크박스 검사 시작
   \
   ⇒ `this`거나 `lastChecked`인 체크박스가 나오기 전까진 `inBetween` 값이 `false`이므로 아무 변경 사항 없이 다음 차례로 넘어감
   \
   ⇒ `this`거나 `lastChecked`인 체크박스가 나오면 `inBetween` 값이 `true`로 바뀜
   \
   ⇒ 다음 차례부턴 `inBetween` 값이 `true`이므로 체크박스를 체크 후 다음 차례로 넘어감
   \
   ⇒ `this`나 `lastChecked`중 나머지 체크박스가 나오면 `inBetween` 값이 다시 `false`로 바뀌면서 이후 차례의 체크박스들은 다시 아무 변경 사항 X

***

## 최종 완성 코드

```javascript
const checkboxes = document.querySelectorAll('.inbox input[type="checkbox"]')

let lastChecked

function handleCheck(e) {
  let inBetween = false

  if (e.shiftKey && this.checked) {
    checkboxes.forEach(checkbox => {
      if (checkbox === this || checkbox === lastChecked) inBetween = !inBetween
      if (inBetween) checkbox.checked = true
    })
  }
  lastChecked = this
}

checkboxes.forEach(checkbox => checkbox.addEventListener('click', handleCheck))
```
