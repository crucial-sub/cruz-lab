---
title: "[wesbos30] 05. Flex Panel"
description: "flex를 사용하여 사이즈가 유연하게 바뀌는 panel을 만들어보자!"
pubDate: "2025-12-04T11:42:29.905Z"
updatedDate: "2025-12-04T11:42:29.905Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764848547425.webp?alt=media&token=94c5ad64-dda0-4550-9fd8-55b9eeda1f43"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-05-flex-panel"
readingTime: 2
isPublic: true
---

> 💡 flex를 사용하여 사이즈가 유연하게 바뀌는 panel을 만들어보자

## 로직

1. 클래스마다 flex를 어떻게 적용할 지 설정
2. 패널을 클릭할 때마다 사이즈 키우기
3. 클릭한 패널의 CSS transition이 끝날 때 마다 위 아래 글자가 나타나고 사라지게 하기

***

## 코딩 과정

### 1. CSS flex

아래 사이트에 매우 잘 정리되어있으니 참고하자!

<https://studiomeal.com/archives/197>

### 2. click 이벤트

```javascript
const panels = document.querySelectorAll('.panel')

function toggleOpen() {
  this.classList.toggle('open')
}
panels.forEach(panel => panel.addEventListener('click', toggleOpen))
```

#### classList.toggle(string, \[force])

* **하나의 인수만 있을 때**: 클래스 값을 토글링한다. 즉, 클래스가 존재한다면 제거하고 `false`를 반환하며, 존재하지 않으면 클래스를 추가하고 `true`를 반환한다.

* **두번째 인수가 있을 때**: 두번째 인수가 `true`로 평가되면 지정한 클래스 값을 추가하고 `false`로 평가되면 제거한다.

### 3. transitionend 이벤트

```javascript
function toggleActive(e) {
  this.classList.toggle('open-active')
}

panels.forEach(panel => panel.addEventListener('transitionend', toggleActive))
```

***

## 최종 완성 코드

### HTML

```html
<div class="panels">
  <div class="panel panel1">
    <p>Hey</p>
    <p>Let's</p>
    <p>Dance</p>
  </div>
  <div class="panel panel2">
    <p>Give</p>
    <p>Take</p>
    <p>Receive</p>
  </div>
  <div class="panel panel3">
    <p>Experience</p>
    <p>It</p>
    <p>Today</p>
  </div>
  <div class="panel panel4">
    <p>Give</p>
    <p>All</p>
    <p>You can</p>
  </div>
  <div class="panel panel5">
    <p>Life</p>
    <p>In</p>
    <p>Motion</p>
  </div>
</div>
```

### CSS

```css
.panels {
  display: flex;
  min-height: 100vh;
  overflow: hidden;
}

.panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1 1 0;
  background: #6b0f9c;
  box-shadow: inset 0 0 0 5px rgba(255, 255, 255, 0.1);
  color: white;
  text-align: center;
  align-items: center;
  /* Safari transitionend event.propertyName === flex */
  /* Chrome + FF transitionend event.propertyName === flex-grow */
  transition: font-size 0.7s cubic-bezier(0.61, -0.19, 0.7, -0.11), flex 0.7s
      cubic-bezier(0.61, -0.19, 0.7, -0.11), background 0.2s;
  font-size: 20px;
  background-size: cover;
  background-position: center;
}

.panel > * {
  margin: 0;
  width: 100%;
  transition: transform 0.5s;
  flex: 1 0 auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.panel > *:first-child {
  transform: translateY(-100%);
}

.panel.open-active > *:first-child {
  transform: translateY(0);
}

.panel > *:last-child {
  transform: translateY(100%);
}

.panel.open-active > *:last-child {
  transform: translateY(0);
}

.panel p {
  text-transform: uppercase;
  font-family: 'Amatic SC', cursive;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.72), 0 0 14px rgba(0, 0, 0, 0.45);
  font-size: 2em;
}

.panel p:nth-child(2) {
  font-size: 4em;
}

.panel.open {
  font-size: 40px;
  flex: 5;
}
```

### JS

```javascript
const panels = document.querySelectorAll('.panel')

function toggleOpen() {
  this.classList.toggle('open')
}
function toggleActive(e) {
  this.classList.toggle('open-active')
}

panels.forEach(panel => panel.addEventListener('click', toggleOpen))
panels.forEach(panel => panel.addEventListener('transitionend', toggleActive))
```
