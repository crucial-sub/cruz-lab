---
title: "[ReactNative] React Native의 New Architecture: 더 빠르고 효율적인 앱 개발의 미래 1편"
description: "React Native의 New Architecture에 대해 깊이 있게 파헤쳐보자 1편!!"
pubDate: "2025-12-05T14:47:55.355Z"
updatedDate: "2025-12-05T14:47:55.355Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764946073231.webp?alt=media&token=217fd644-c733-49fa-b9f8-57a142149b17"
tags: ["ReactNative"]
slug: "reactnative-react-native의-new-architecture-더-빠르고-효"
readingTime: 5
isPublic: true
---

> 이번 포스트에서는 React Native의 New Architecture에 대해 깊이 있게 파헤쳐보려고 한다.
>
> React Native가 어떻게 발전하고 있는지, 그리고 이 새로운 아키텍처가 우리의 앱 개발에 어떤 영향을 미칠지 함께 알아보자!

**New Architecture에 대해 파헤치기 전에 우선 기존 Architecture부터 간단하게 알아보도록 하자.**

## 기존 Architecture

기존 아키텍처를 관통하는 핵심 요소는 바로 “**브릿지”이다.**

![react\_native\_bridge](https://github.com/user-attachments/assets/11114508-2bfe-4c4c-9172-bd41032508d7)

React Native는 세 개의 별도 스레드

* **JS 스레드**

* **Main 스레드 (UI 스레드)**

* **섀도우 스레드 (UI 계산용 feat. Yoga엔진)**

에서 작동한다.

이 때 JavaScript는 기본적으로 단일 스레드 모델을 따르기 때문에 JS 코드의 실행과 관련된 모든 작업은 JS 스레드 내에서만 이루어지게 된다.

JS 스레드(JavaScript 코드)와 네이티브 스레드(네이티브 코드) 두 영역이 실제로 서로를 인식하지 않기 때문에 중간 단계가 필요했고,

두 영역 사이의 통신을 담당하는 것이 바로 브릿지인 것이다.

이러한 브릿지 소통 방식은 개발자들이 React Native에서 JavaScript라는 하나의 코드베이스로 iOS와 Android 두 플랫폼의 앱을 동시에 개발할 수 있게 해주는 핵심 메커니즘이었고, 이는 개발 시간과 비용을 크게 절감시켜주는 이점을 가져다 줬다.

하지만 이 기존 아키텍처에는 한계가 존재했는데…

## 기존 아키텍처의 한계

물론 일반적인 React Native 앱은 충분히 빠르게 작동한다.

하지만 복잡한 애니메이션을 구현한다거나 대량의 데이터를 처리한다거나 하는 특정 상황에서는 여전히 네이티브 앱에 비해 성능이 뒤쳐지는 경우가 존재했고,

이는 주로 다음과 같은 부분에서 발생한 이슈였다.

### 브릿지 소통 방식의 한계

1. 모든 브릿지 통신은 비동기적으로 이루어진다

   * JavaScript에서 네이티브 기능을 호출할 때마다 지연이 발생
     → 특히 UI 관련 작업에서 사용자 경험 저하
2. 모든 데이터는 JSON 형식으로 직렬화되어 전송되고, 이를 다시 역직렬화하여 처리한다.

   * 직렬화/역직렬화에 따른 오버헤드 발생

   * 직렬화/역직렬화는 CPU 집약적인 작업이며, 매우 큰 데이터 구조를 처리할 때 상당한 시간을 소모할 수 있음.

   * 직렬화된 데이터는 메모리에 추가적인 복사본을 생성하므로, 메모리 사용량이 증가

### JavaScript 단일 스레드 제약

1. UI 블로킹
2. 애니메이션 성능 저하
3. 반응성 저하

> 🔍 지금까지 기존 아키텍처와 그 한계에 대해 살펴보았다.
>
> 위의 문제점들은 React Native 팀이 새로운 아키텍처를 고안하게 된 주요 동기가 되었다.
>
> 이제부턴 이러한 문제점들을 해결하고,
> 더 나은 성능과 개발 경험을 제공하는 것을 목표로 하고 있는
>
> React Native의 **New Architecture**에 대해 알아보도록 하자.

## New Architecture의 첫 번째 개선사항: JSI (JavaScript Interface)

React Native에서 기존 아키텍처의 여러 문제점을 해결하기 위해 도입한 다양한 개선사항 중,

핵심 역할을 하는 JSI(JavaScript Interface)에 대해 먼저 알아보도록 하자.

### JSI란?

[New Architecture를 소개하는 React Native 공식문서](https://reactnative.dev/docs/the-new-architecture/landing-page)에 따르면

JSI(JavaScript Interface)는 JavaScript가 C++ 객체에 대한 참조를 보관하고 직접 조작할 수 있도록 하는 **인터페이스**라고 한다.

'**인터페이스**'라는 용어가 사용된 이유는 JSI가 JavaScript와 네이티브 코드 사이의 상호작용 방식을 정의하고 제공하기 때문인데, 

이는 마치 API(**Application Programming Interface**)와 비슷한 개념으로 볼 수 있다.

우리가 개발을 하면서 사용하는 여러 API들은 시스템의 구현 세부 사항을 알 필요 없이 단순화된 방법으로 유용한 기능들을 제공한다.

JSI 또한 마찬가지다.

JSI가 네이티브 구현의 추상화 레이어 역할을 해주기 때문에, 우리는 JSI를 직접 사용하거나 C++로 작성된 내부 코드를 알 필요가 없다. 

기존의 방식대로 JavaScript 측에서 네이티브 함수를 호출하면 되는 것이다.

이러한 작동 방식이 가능한 이유는

JSI가 실제로 C++로 작성된 라이브러리이면서, 동시에 JavaScript와 네이티브 코드 간의 데이터 교환, 메서드 호출, 객체 참조 등을 가능하게 하는 환경을 제공하는 시스템으로 설계되었기 때문이다.

### 브릿지 방식과의 차이

기존의 브릿지와 새로운 JSI의 차이점은 React Native의 아키텍처 전반에 걸쳐 큰 변화를 가져온다.

1. **JS-네이티브 간 통신 방식**

   * 브릿지: 통신이 간접적이고 비동기적으로 이루어짐

   * JSI: JavaScript에서 네이티브 함수를 직접 호출할 수 있어 동기적 통신이 가능
     → 이는 호출한 함수의 결과를 즉시 반환받을 수 있음을 의미!
2. **데이터 처리**

   * 브릿지: 모든 데이터가 JSON 형식으로 변환되어야 함

   * JSI: JSON 변환 과정이 필요 없어 데이터 교환 시 발생하던 CPU 부하가 크게 감소
3. **성능**

   * 브릿지: 비동기 통신 및 데이터 변환에 따른 오버헤드로 인해 성능이 저하될 수 있으며
     특히, 복잡한 애니메이션이나 실시간 데이터 처리에서 성능 한계가 두드러짐

   * JSI: 네이티브 코드와의 직접적인 상호작용을 통해 데이터 전송 지연이 줄어들고, 애니메이션 및 실시간 데이터 처리에서 더욱 부드럽고 빠른 성능을 제공

앞서 기존 아키텍처를 설명하면서

> _“… JS 스레드(JavaScript 코드)와 네이티브 스레드(네이티브 코드) 두 영역이 실제로 서로를 인식하지 않기 때문에 중간 단계가 필요했고, …”_

라고 했었다.

JSI와 함께하는 React Native에서 이제 JS와 네이티브 두 영역은 서로를 실제로 인식한다.

즉, 불가피하게 중간 단계가 필요했던 기존 아키텍쳐의 한계를 확실하게 개선한 것이다.

JSI의 도입으로 React Native는 네이티브 성능에 한층 더 가까워지게 되었으며, 

몇몇 라이브러리들은 이미 JSI를 도입해 브릿지를 거치지 않는 API의 형태로 이전하여 성능을 개선하였다.

### 브릿지 대신 JSI를 사용한 라이브러리 예시: [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)

JSI의 장점을 실제로 경험할 수 있는 좋은 예시로 react-native-mmkv 라이브러리를 들 수 있다.

이 라이브러리는 JSI를 활용하여 기존의 AsyncStorage보다 훨씬 빠르고 사용하기 편리한 로컬 저장소 솔루션을 제공한다.

### 1. 사용 편의성

* **AsyncStorage (기존 방식):**

  ```jsx
  await AsyncStorage.setItem('user', JSON.stringify({ name: 'John', age: 30 }))

  const user = JSON.parse(await AsyncStorage.getItem('user'))

  console.log(user.name) // 'John'
  ```

* **MMKV (JSI 활용):**

  ```jsx
  import { MMKV } from 'react-native-mmkv'

  const storage = new MMKV()

  storage.set('user', { name: 'John', age: 30 })

  const user = storage.getObject('user')

  console.log(user.name) // 'John'
  ```

JSI를 사용하는 MMKV는 `async`/`await` 없이 동기적으로 데이터를 저장하고 불러올 수 있어, 코드가 더 간결하고 읽기 쉬워진다.

### 2. 성능 향상

* MMKV 깃헙 문서에 따르면 MMKV는 AsyncStorage보다 최대 30배 이상 빠른 성능을 보인다고 한다!

* 대량의 데이터를 처리할 때 특히 그 차이가 두드러진다.

### 3. 다양한 데이터 타입 지원

* AsyncStorage는 문자열만 저장 가능하여 객체 저장 시 JSON 변환이 필요

* MMKV는 문자열, 숫자, 불리언, 객체 등 다양한 데이터 타입을 직접 지원

### 4. 메모리 효율성

* JSI를 통한 직접 통신으로 불필요한 데이터 복사와 변환 과정이 줄어들어 메모리 사용이 효율적

이러한 장점들은 JSI가 React Native 생태계에서 어떻게 실질적인 개선을 가져오는지 잘 보여준다!

## 결론

단적으로 말해, JSI 방식은 기존의 브릿지 방식을 완전히 대체하게 될 것이다.

중간 단계를 거쳐서 통신해야 하며, 모든 통신이 비동기적으로 이루어지기 때문에 \
아무리 간단한 작업이라도 `await`키워드를 사용해야 하는 브릿지 방식과..

중간 단계 없이 직접 소통하며, 네이티브 함수를 마치 JavaScript 함수처럼 바로 호출할 수 있는 JSI.

무엇이 성능적으로 뛰어날 지는 자명하다.

여기까지 기존 아키텍처의 한계와 이를 개선하기 위한 New Architecture의 핵심 기술 JSI에 대해 알아보았다.

다음 편에서는 JSI가 마련해준 기반 위에서 New Architecture의 어떤 개선사항들이 추가로 적용되는지 알아보자!
