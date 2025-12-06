---
title: "[wesbos30] 22. Following Highlight"
description: "Following Highlight"
pubDate: "2025-12-04T12:00:47.364Z"
updatedDate: "2025-12-06T05:24:42.776Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764998680284.webm?alt=media&token=af55bb9c-0be6-463d-8b38-efc3989bd6b1"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-22-following-highlight"
readingTime: 3
isPublic: true
---

> 💡 메뉴바에서 내가 선택한 메뉴를 표시할 때,\
> `hover`나 `classList.add` & `classList.remove`를 통해 해당 요소 자체에 CSS 값을 적용하는 방식이 아닌,\
> `getBoundingClientRect()`메서드를 통해 해당 요소의 위치와 크기를 구한 후, 따로 만들어놓은 배경이 이를 따라다니도록 하는 방식이다.

## 로직

1. 미리 HTML 내에 배경 역할의 `<span>`태그 생성 (`createElement`, `append`)
2. 모든 `<a>`태그에 마우스 이벤트로 함수 호출하도록 설정 (`mouseenter`)
3. 이벤트가 발생한 `<a>`태그의 뷰포트 기준 위치를 구함 (`getBoundingClientRect()`)
4. 스크롤로 인한 위치 변화값을 자동 계산하도록 수정 (`window.scrollX`, `window.scrollY`)
5. 해당 위치값을 그대로 `<span>`태그에 적용하여 해당 `<a>`태그의 배경 역할을 하도록 함

***

## 코딩 과정

### **1. 배경 역할을 하는** **`<span>`태그 생성**

```javascript
const highlight = document.createElement('span')
//배경 역할을 할 수 있도록 CSS가 적용돼있는 class를 추가
highlight.classList.add('highlight')
//이벤트가 발생하기전에 우선 body안에 넣어둠
document.body.append(highlight)
```

#### createElement()

```javascript
const highlight = document.createElement('span')
```

HTML 문서에서 document.createElement() 메서드는 지정한 tagName의 HTML 요소를 생성한다.

> 💡 이는 단순히 요소를 생성했을 뿐, HTML document 내의 무엇인가에 append 하기전에는 구현되지 않는다.

#### append()

```javascript
document.body.append(highlight)
```

Element.append() 메서드는 부모 요소에 자식 요소를 추가한다.

이때 문자열 또한 추가 가능하며 여러 개의 자식 요소를 한번에 추가할 수도 있다.

> 💡 기본 width값과 height값을 설정 안해줬으므로 마우스 이벤트가 일어나기전에는 화면에 표시 ❌

### **2. 모든** **`<a>`태그에 이벤트리스너 설정**

```javascript
const triggers = document.querySelectorAll('a')
triggers.forEach(a => a.addEventListener('mouseenter', highlightLink))
```

#### mouseenter와 mouseover 비교

둘 다 공통적으로 해당 요소에 마우스가 올라가는 것을 감지한다.

둘의 차이점은

* **mouseenter** : 자식 요소의 영역에 들어가면 감지 x

⇒ 해당 요소에서 자식 요소의 영역으로 마우스가 움직여도 따로 이벤트 발생하지 않음

* **mouseover** : 자식 요소의 영역까지 감지 o

⇒ 마우스가 해당 요소와 자식 요소의 영역 경계를 넘나들때마다 이벤트 발생함

### **3. 이벤트가 발생한** **`<a>`태그의 뷰포트 기준 위치 구하기**

```javascript
function highlightLink() {
  const linkCoords = this.getBoundingClientRect()

  //구한 뷰포트 기준 위치값을 'highlight' span에 적용
  highlight.style.width = `${linkCoords.width}px`
  highlight.style.height = `${linkCoords.height}px`
  highlight.style.transform = `translate(${linkCoords.left}px, ${linkCoords.top}px)`
}
```

#### getBoundingClientRect()

```javascript
const linkCoords = this.getBoundingClientRect()
```

DOMRect를 뷰포트 기준으로 반환해주는 메서드이다.

![뷰포트](https://user-images.githubusercontent.com/87363422/156433934-09a1f878-ff34-4157-886c-7f2e70957ce5.png)

![콘솔](https://user-images.githubusercontent.com/87363422/156433974-daf4a612-baaa-498f-9c04-221fcb40ef66.png)

> ❓ DOMRect 란?
>
> 요소의 각종 좌표값이 들어있는 객체이며,
>
> 요소를 감싸는 사각형 형태로 사이즈와 위치 정보를 나타낸다.
>
> 이 사각형은 요소의 contexts, padding, border를 포함한다.

### **4. 스크롤로 인한 위치 변화 계산**

![스크롤](https://user-images.githubusercontent.com/87363422/156433946-307efefb-4ed0-4a43-8c35-af0c642f69e0.png)

getBoundingClientRect()를 통해 구한 값은 뷰포트를 기준으로 하는 요소의 상대좌표

⇒ 화면을 스크롤 할 경우 요소의 위치값이 달라진다.

'highlight' span의 경우 뷰포트 기준으로 이동하는게 아니라 스크롤을 포함한 맨 위, 맨 왼쪽 부분을 기준으로 이동

⇒ 스크롤 한 상태에서 이동할 경우 스크롤 한 만큼 요소와 위치가 어긋나게 된다.

따라서!

뷰포트 기준 위치값에 window\.scrollX, window\.scrollY로 스크롤한 X, Y 값을 가져와서 더해주어야 정확한 요소의 위치로 'highlight' span이 이동한다.

```javascript
function highlightLink() {
  const linkCoords = this.getBoundingClientRect()
  const coords = {
    width: linkCoords.width,
    height: linkCoords.height,
    //뷰포트 값에 스크롤된 길이를 더해준다.
    top: linkCoords.top + window.scrollY,
    left: linkCoords.left + window.scrollX,
  }

  highlight.style.width = `${coords.width}px`
  highlight.style.height = `${coords.height}px`
  highlight.style.transform = `translate(${coords.left}px, ${coords.top}px)`
}
```

***

## 최종 완성 코드

```javascript
const triggers = document.querySelectorAll('a')
const highlight = document.createElement('span')
highlight.classList.add('highlight')
document.body.append(highlight)

function highlightLink() {
  const linkCoords = this.getBoundingClientRect()
  const coords = {
    width: linkCoords.width,
    height: linkCoords.height,
    top: linkCoords.top + window.scrollY,
    left: linkCoords.left + window.scrollX,
  }
  highlight.style.width = `${coords.width}px`
  highlight.style.height = `${coords.height}px`
  highlight.style.transform = `translate(${coords.left}px, ${coords.top}px)`
}

triggers.forEach(a => a.addEventListener('mouseenter', highlightLink))
```
