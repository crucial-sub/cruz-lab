---
title: "[wesbos30] 03. CSS Variables 조절하기"
description: "페이지 내의 여러 타입의 <input>들을 조정하면 그 값들이 실시간으로 이미지에 반영되도록 해보자!"
pubDate: "2025-12-04T11:39:28.517Z"
updatedDate: "2025-12-04T11:39:28.517Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764834928322.webp?alt=media&token=b9f452b9-f308-42d2-b60b-6b04922b14ed"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-03-css-variables-조절하기"
readingTime: 1
isPublic: true
---

> 💡 페이지 내의 여러 타입의 `<input>`들을 조정하면 그 값들이 실시간으로 이미지에 반영되도록 해보자!

## 로직

1. `<input>`의 속성값을 실시간으로 변경하는 함수 만들기
2. `<input>`에 이벤트 핸들러 할당

***

## 코딩 과정

### 1. 속성값 변경하는 함수 만들기

```javascript
function handleUpdate() {
  // CSS에서 padding이나 blur 값에는 px과 같은 단위가 필요하므로 dataset에 미리 넣어둔다.
  let suffix = this.dataset.sizing || ''
  document.documentElement.style.setProperty(
    `--${this.name}`,
    this.value + suffix,
  )
}
```

#### :root 가상 선택자 및 동적 변경

![CSS root](https://user-images.githubusercontent.com/87363422/156240180-2b5f630a-c87c-483b-a015-5393ce2eeeea.png)

:root 가상 선택자를 이용하면 문서 트리의 루트 요소 즉, HTML을 선택할 수 있기 때문에 위와 같은 방법으로 전역 CSS변수처럼 사용할 수 있다.

### 2. 이벤트 핸들러 할당

```javascript
inputs.forEach(input => input.addEventListener('change', handleUpdate))
inputs.forEach(input => input.addEventListener('mousemove', handleUpdate))
```

단순히 change 이벤트에만 핸들러를 할당하면 input 바에서 마우스를 떼야만 변경값이 적용된다.
따라서 마우스를 움직이는 실시간으로 변경값이 적용되도록 mousemove 이벤트에도 핸들러를 할당해준다.

***

## 최종 완성 코드

```javascript
const inputs = document.querySelectorAll('.controls input')
function handleUpdate() {
  const suffix = this.dataset.sizing || ''
  document.documentElement.style.setProperty(
    `--${this.name}`,
    this.value + suffix,
  )
}
inputs.forEach(input => input.addEventListener('change', handleUpdate))
inputs.forEach(input => input.addEventListener('mousemove', handleUpdate))
```
