---
title: "[JavaScript] 자바스크립트의 함수는 1급 객체이다."
description: "1급 객체가 무엇인지 알아보자!"
pubDate: "2025-12-05T14:22:48.213Z"
updatedDate: "2025-12-05T14:22:48.213Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764944566029.webp?alt=media&token=93f747a1-88d9-4f8f-b460-86ff75f4d955"
tags: ["javascript"]
slug: "javascript-자바스크립트의-함수는-1급-객체이다"
readingTime: 4
isPublic: true
---

## 1급 시민(First Class Citizen)

프로그래밍 영역에서 1급 시민의 개념은 1967년에 Christopher Strachey에 의해 도입되었으며 그 조건은 다음과 같다.

1. **변수(variable)**에 담을 수 있다
2. **인자(parameter)**로 전달할 수 있다
3. **반환값(return value)**으로 전달할 수 있다

대부분의 프로그래밍 언어에서 숫자 타입의 데이터는 1급 시민의 조건을 충족한다.

⇒ 자바스크립트에서는 **기본 자료형(원시 타입 + 객체)**이 모두 1급 시민의 조건을 충족한다.

```javascript
let num1 = 2 // 1. 변수에 담을 수 있다.

function double(param) {
  // 2. 인자로 전달할 수 있다.
  let num2 = param + param
  return num2 // 3. 반환 값으로 전달할 수 있다.
}

console.log(double(num1)) // ==> 4
```

## 1급 객체(First Class Object)

특정 언어의 객체(object)가 1급 객체라는 것은 해당 언어에서 객체를 1급 시민으로써 취급한다는 것이며,
이는 말 그대로 해당 언어에서 객체가 1급 시민의 조건을 모두 충족한다는 뜻이다.

## 1급 함수(First Class Function)

1급 함수란 함수를 1급 시민으로 취급하는 것이다.

이때 일부 학자들은 **1급 시민의 조건 + 다음의 추가 조건**을 충족해야 1급 함수라고 할 수 있다고 한다.

1. **런타임 생성이 가능하다.**
2. **익명으로 생성이 가능하다.**

```javascript
// 익명함수(함수 리터럴 방식으로 만들어진 이름없는 함수)를 생성하여 변수에 할당
// => 런타임(할당 단계)에 함수 리터럴이 평가되어 함수 객체가 생성되고 변수에 할당된다.
const add = function (a, b) {
  return a + b
}
```

## 자바스크립트의 함수는 1급 객체이다.

자바스크립트에서는 객체를 **1급 시민**으로 취급한다.

동시에 자바스크립트의 함수는 객체로써 관리되므로 **1급 객체**라고 볼 수 있다.

또한 자바스크립트의 함수는 **1급 함수**의 추가 조건도 만족한다.(런타임 + 익명)

즉, 자바스크립트에서 함수는 1급 객체인 동시에 1급 함수이지만
자바스크립트에서 함수는 객체이기 때문에 보통 1급 객체로 기술된다.

## 자바스크립트의 함수가 1급 객체인 것이 왜 중요할까?

### 1. 고차 함수(higher order function)를 만들 수 있다.

고차함수란 함수를 전달인자(argument)로 받을 수 있고, 결과값으로 함수를 반환할 수 있는 함수이다.

> 고차 함수 예시 3가지

* 함수를 전달인자로 받는 함수

```javascript
const square = function (base) {
  return Math.pow(base, 2)
}

const squareNum = function (func, num) {
  return func(num)
}

// squareNum은 다른 함수를 전달인자로 받는 고차 함수이며
// 전달인자로 전달된 square는 squareNum의 콜백 함수이다.
console.log(squareNum(square, 5)) // => 25
```

* 함수를 반환하는 함수

```javascript
const division = function (divisionValue) {
  return function (value) {
    return value / divisionValue
  }
}
// division(10)이 함수를 반환하므로 호출 연산자 "()"를 이어서 사용할 수 있다.
console.log(division(25)(100)) // => 4
console.log(division(25)(250)) // -> 10

// 자바스크립트에서 함수는 1급 객체이므로 division 함수가 반환하는 함수를 변수에 저장 가능
const division25 = division(25)
console.log(division25(100)) // => 4
console.log(division25(250)) // => 10
```

* 함수를 전달인자로 받고, 함수를 반환하는 함수

```javascript
const square = function (base) {
  return Math.pow(base, 2)
}

const divisionAfterSquare = function (func, num) {
  const divisionValue = func(num)
  return function (value) {
    return value / divisionValue
  }
}

// divisionAfterSquare은 다른 함수를 전달인자로 받는 고차 함수이며
// 전달인자로 전달된 square는 divisionAfterSquare의 콜백 함수이다.
console.log(divisionAfterSquare(square, 5)(100)) // => 4
console.log(divisionAfterSquare(square, 5)(250)) // => 10
```

### 내장 고차 함수

자바스크립트에는 **기본적으로 내장 되어있는** 고차 함수들이 있다.

자바스크립트의 배열은 객체이며 `forEach`, `find`, `some`, `every`, `filter`, `sort`, `map`, `reduce` 등과 같은 여러 유용한 **배열 메서드**들이 내장 고차 함수에 해당된다.

### 고차 함수를 사용하는 이유

> **💡 추상화(abstraction)**
>
> 복잡한 어떤 것을 **압축해서 핵심만 추출**한 상태로 만드는 것
>
> 이 세상은 추상화 된것들로 가득하다.
> 우리가 일상 생활에서 당연하게 하는 모든 행동들(문자 보내기, 사이트 접속하기, 카드 결제 등)은 사실 수많은 복잡한 로직을 거쳐서 동작하게 되지만 우리는 그것들을 알지 못하며, 알아야 할 필요도 없다.
>
> 왜냐하면 이 모든 행동들이 전부 추상화의 결과이기 때문이다!

추상화의 관점에서 함수는 값(value)을 전달받고 값을 반환해주는, 일련의 복잡한 로직을 감춰주는 **사고/논리(logic) 덩어리**이다.

하지만 고차함수는 값뿐만 아니라 **사고를 추상화**할 수 있게 해준다.

고차 함수를 이용하면 단순히 값을 전달받아 처리하는 수준에서 더 나아가
사고/논리(logic)의 덩어리인 **함수를 전달받고 처리**할 수 있는 수준까지 가능해지며 추상화의 수준이 높아진 만큼 생산성도 향상되어 보다 쉽고 효율적으로 문제를 처리할 수 있게 된다 .

위에서 언습한 **자바스크립트 내장 고차 함수**들이 바로 고차 함수가 가능한 것이 얼마나 편리한지 알려주는 대표적인 예이다.

map, sort 등과 같은 메서드에 전달인자로 목적에 맞는 함수를 하나 넘겨주면 동작 원리는 신경쓸 필요도 없이 아주 쉽게 처리를 해준다.

### 2. 자바스크립트의 클로저를 사용해 커링과 메모이제이션이 가능하다.

자바스크립트의 함수는 생성될 당시의 렉시컬 환경을 기억하게 되는데, 함수를 주고받게 되면 이 렉시컬 환경 또한 전달된다. 이것을 이용해 커링과 메모이제이션이 가능해진다.

### 커링

커링(currying) 패턴은 함수를 설계할 때 인자 전체를 넘겨서 호출할 수도 있지만, 일부 인자는 먼저 입력해두고 나머지만 입력받을 수 있도록 새로운 함수를 만드는 패턴이다.

커링 패턴은 하나의 공용 함수가 있는 경우 이를 세부적인 기능을 하는 함수로 나누고 싶을 때 유용하다.

### 메모이제이션

메모이제이션은 계산 결과를 함수의 프로퍼티 값으로 담아놓고 나중에 사용할 수 있다.

함수의 연산된 값을 저장해두므로 중복 연산을 피할 수 있어 불필요한 작업을 줄일 수 있다.
