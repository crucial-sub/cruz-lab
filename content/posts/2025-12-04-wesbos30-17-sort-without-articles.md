---
title: "[wesbos30] 17. Sort Without Articles"
description: "💡 주어진 배열을 관사(A, An, The)를 제외한 알파벳 순으로 정렬해보자!"
pubDate: "2025-12-04T11:58:15.337Z"
updatedDate: "2025-12-04T11:58:15.337Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764849493229.webp?alt=media&token=a561f098-08e8-4b7a-bb1e-e041ffa80a14"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-17-sort-without-articles"
readingTime: 2
isPublic: true
---

> 💡 주어진 배열을 관사(A, An, The)를 제외한 알파벳 순으로 정렬해보자!

## 로직

1. 관사를 제거한채로 반환해주는 함수 생성
2. 관사를 제거한 요소들을 `sort()`로 알파벳 순으로 정렬
3. 정렬된 요소들을 화면에 나타내기

***

## 코딩 과정

### **1. 관사 제거 함수 생성**

```javascript
function strip(bandName) {
  return bandName.replace(/^(a |the |an )/i, '').trim()
}
```

replace() 메서드로 관사를 공백으로 바꾼 뒤 trim()메서드로 좌우 공백을 제거한다.

### **2. sort()로 정렬**

```javascript
const bands = [
  'The Plot in You',
  'The Devil Wears Prada',
  'Pierce the Veil',
  'Norma Jean',
  'The Bled',
  'Say Anything',
  'The Midway State',
  'We Came as Romans',
  'Counterparts',
  'Oh, Sleeper',
  'A Skylit Drive',
  'Anywhere But Here',
  'An Old Dog',
]

const sortedBands = bands.sort((a, b) => (strip(a) > strip(b) ? 1 : -1))
```

strip()으로 관사를 제거한 채로 반환된 요소들을 sort() 메서드로 알파벳 순으로 정렬한다.

### **3. 화면에 나타내기**

```javascript
document.querySelector('#bands').innerHTML = sortedBands
  .map(band => `<li>${band}</li>`)
  .join('')
```

정렬된 요소들을 각각 `<li>`로 매핑하여 화면에 나타낸다

## 최종 완성 코드

```javascript
const bands = [
  'The Plot in You',
  'The Devil Wears Prada',
  'Pierce the Veil',
  'Norma Jean',
  'The Bled',
  'Say Anything',
  'The Midway State',
  'We Came as Romans',
  'Counterparts',
  'Oh, Sleeper',
  'A Skylit Drive',
  'Anywhere But Here',
  'An Old Dog',
]

function strip(bandName) {
  return bandName.replace(/^(a |the |an )/i, '').trim()
}

const sortedBands = bands.sort((a, b) => (strip(a) > strip(b) ? 1 : -1))

document.querySelector('#bands').innerHTML = sortedBands
  .map(band => `<li>${band}</li>`)
  .join('')
```
