---
title: "[wesbos30] 03. CSS Variables 조절하기"
description: "페이지 내의 여러 타입의 <input>들을 조정하면 그 값들이 실시간으로 이미지에 반영되도록 해보자!"
pubDate: "2025-12-04T11:37:00.582Z"
updatedDate: "2025-12-04T11:37:00.582Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764834928322.webp?alt=media&token=b9f452b9-f308-42d2-b60b-6b04922b14ed"
tags: ["javascript", "wesbos30"]
slug: "wesbos30-03-css-variables-조절하기"
readingTime: 3
isPublic: true
---

> 💡 Array 메서드를 배워보자 1탄

## 배워야 할 메서드 목록

1. array.filter()
2. array.map()
3. array.sort()
4. array.reduce()

***

## 주어진 배열

```javascript
const inventors = [
  { first: 'Albert', last: 'Einstein', year: 1879, passed: 1955 },
  { first: 'Isaac', last: 'Newton', year: 1643, passed: 1727 },
  { first: 'Galileo', last: 'Galilei', year: 1564, passed: 1642 },
  { first: 'Marie', last: 'Curie', year: 1867, passed: 1934 },
  { first: 'Johannes', last: 'Kepler', year: 1571, passed: 1630 },
  { first: 'Nicolaus', last: 'Copernicus', year: 1473, passed: 1543 },
  { first: 'Max', last: 'Planck', year: 1858, passed: 1947 },
  { first: 'Katherine', last: 'Blodgett', year: 1898, passed: 1979 },
  { first: 'Ada', last: 'Lovelace', year: 1815, passed: 1852 },
  { first: 'Sarah E.', last: 'Goode', year: 1855, passed: 1905 },
  { first: 'Lise', last: 'Meitner', year: 1878, passed: 1968 },
  { first: 'Hanna', last: 'Hammarström', year: 1829, passed: 1909 },
]

const people = [
  'Bernhard, Sandra',
  'Bethea, Erin',
  'Becker, Carl',
  'Bentsen, Lloyd',
  'Beckett, Samuel',
  'Blake, William',
  'Berger, Ric',
  'Beddoes, Mick',
  'Beethoven, Ludwig',
  'Belloc, Hilaire',
  'Begin, Menachem',
  'Bellow, Saul',
  'Benchley, Robert',
  'Blair, Robert',
  'Benenson, Peter',
  'Benjamin, Walter',
  'Berlin, Irving',
  'Benn, Tony',
  'Benson, Leana',
  'Bent, Silas',
  'Berle, Milton',
  'Berry, Halle',
  'Biko, Steve',
  'Beck, Glenn',
  'Bergman, Ingmar',
  'Black, Elk',
  'Berio, Luciano',
  'Berne, Eric',
  'Berra, Yogi',
  'Berry, Wendell',
  'Bevan, Aneurin',
  'Ben-Gurion, David',
  'Bevel, Ken',
  'Biden, Joseph',
  'Bennington, Chester',
  'Bierce, Ambrose',
  'Billings, Josh',
  'Birrell, Augustine',
  'Blair, Tony',
  'Beecher, Henry',
  'Biondo, Frank',
]
```

### 1. filter()

```javascript
const fifteen = inventors.filter(
  inventor => inventor.year >= 1500 && inventor.year < 1600,
)
// filter 안의 inventor는 그냥 의미에 맞춰서 쓴거고 아무 글자로 대체가능

console.table(fifteen)
```

주어진 조건으로 요소 하나하나에 테스트를 진행하여 그 테스트를 통과하는 요소들만 모아서 새로운 배열로 반환한다.

### 2. map()

```javascript
const fullNames = inventors.map(
  inventor => `${inventor.first} ${inventor.last}`,
)
// inventor => `${inventor.first} ${inventor.last}`
// 이것과
// inventor => inventor.first + '' + inventor.last는 같다
console.log(fullNames)

const bornDead = inventors.map(life => `${life.year}~${life.passed}`)

console.log(bornDead)
```

배열 내의 모든 요소 각각에 대해 주어진 조건을 한번씩 순서대로 실행한 결과를 모아 새로운 배열을 반환한다.

### 3. sort()

```javascript
const ordered = inventors.sort((a, b) => (a.year > b.year ? 1 : -1))

console.table(ordered)
```

배열의 요소를 정렬하여 반환하는 메서드이다.
함수로 정렬 순서를 판단하며, 함수가 주어지지 않으면 기본 정렬 순서를 따른다. 요소를 문자열로 변환 후, 유니코드 값 순서대로 정렬된다. 주의할 점은 숫자도 문자열로 변환되기 때문에 9보다 80이 앞에 온다.

### 4. reduce()

```javascript
const totalYears = inventors.reduce((total, inventor) => {
  return total + (inventor.passed - inventor.year)
}, 0)

console.log(totalYears)
```

reduce()로 map(), filter() 등을 구현할 수 있어 가장 활용도가 높은 메서드이다.
`initialValue`를 통해 반환 값을 자유롭게 지정할 수 있어 유연한 사용이 가능하다.

배열의 각 요소에 대해 callback을 실행해 하나의 결과값 (누적 계산 결과값)을 반환하여 reduce라고 이름 붙었다.

배열 요소들의 전체 합, 최대값, 개수 세기 등을 할 수 있다.
