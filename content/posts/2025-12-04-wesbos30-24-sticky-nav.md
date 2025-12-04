---
title: "[wesbos30] 24. Sticky Nav"
description: "스크롤을 내려도 페이지 밖으로 사라지지않고 상단에 고정되어 있는 네비게이션 바를 구현해보자!"
pubDate: "2025-12-04T12:02:08.154Z"
updatedDate: "2025-12-04T12:02:08.154Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764849713725.webp?alt=media&token=39ae4ed8-090e-4b09-9f98-d52564a7aa73"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-24-sticky-nav"
readingTime: 2
isPublic: true
---

> 💡 이번 챕터는 반응형 웹에서 자주 쓰이는 형태로서
> 스크롤을 내려도 네비게이션 바가 페이지 밖으로 사라지지않고 상단에 고정되어 있는 기능이다!

## 로직

1. Nav 바와 Nav 바의 `offsetTop`을 상수로 선언
2. window에 scroll 이벤트가 발생하면 전달할 함수 생성
   \
   ⇒ 아래로 스크롤을 하다가 Nav 바가 페이지 최상단에 닿으면 class를 추가하여 Nav 바 고정
3. Nav 바가 fixed될때 툭툭 끊기지않도록 `paddingTop` 적용

***

## 코딩 과정

### **1. 상수 선언**

```javascript
const nav = document.querySelector('#main')
const topOfNav = nav.offsetTop
```

Nav와 부모요소(body)의 상단 사이의 픽셀값을 구하기 위해 offsetTop을 사용한다.

### **2. 함수로 Nav 바 상단 고정**

```javascript
const topOfNav = nav.offsetTop

function fixNav() {
  if (window.scrollY >= topOfNav) {
    document.body.classList.add('fixed-nav')
  } else {
    document.body.classList.remove('fixed-nav')
  }
}

window.addEventListener('scroll', fixNav)
```

아래로 스크롤을 하다가 Nav 바가 페이지 최상단에 닿으면,

즉 window\.scrollY 값이 topOfNav 값과 같거나 커지면

class를 추가하여 position을 fixed로 바꿔 상단에 고정시킨다.

이외의 조건에서는 class를 제거하여 고정 효과가 없도록한다.

이 때 추가적인 CSS 디자인으로

class가 없을 땐 사이트 로고(여기선 LOST.)의 max-width 값을 0으로 주어 로고없이 Nav 바만 보이도록 하고

스크롤을 내려 class가 생기고 Nav 바가 상단에 고정되면 로고에 max-width을 주어 Nav 바 옆에 로고가 보이도록 한다!

### **3. 툭툭 끊기는 현상 수정**

```javascript
function fixNav() {
  if (window.scrollY >= topOfNav) {
    document.body.style.paddingTop = `${nav.offsetHeight}px`
    document.body.classList.add('fixed-nav')
  } else {
    document.body.style.paddingTop = 0
    document.body.classList.remove('fixed-nav')
  }
}
```

> 💡 Nav 바의 position이 fixed로 바뀐 순간 텍스트가 담겨있는 "site-wrap" div가 Nav 바와의 여백이 사라져 확 올라오는 것을 확인할 수 있다..

이는 position이 fixed로 바뀌면 공간을 더이상 차지하지 않게되어
텍스트 div가 Nav 바를 고려하지않고 바로 페이지 상단에서부터 margin을 적용하기 때문에 일어나는 현상이다.

따라서 Nav 바가 고정되면 Nav 바가 차지하던 크기만큼(`offsetHeight`) body에paddingTop을 주어 빈 공간을 채워주면 끊김없이 부드럽게 스크롤이 가능해진다!

물론 Nav 바의 고정되지 않을 땐 paddingTop을 0으로 되돌리는 것을 잊지말자.

***

## 최종 완성 코드

```javascript
const nav = document.querySelector('#main')
const topOfNav = nav.offsetTop

function fixNav() {
  if (window.scrollY >= topOfNav) {
    document.body.style.paddingTop = `${nav.offsetHeight}px`
    document.body.classList.add('fixed-nav')
  } else {
    document.body.style.paddingTop = 0
    document.body.classList.remove('fixed-nav')
  }
}

window.addEventListener('scroll', fixNav)
```
