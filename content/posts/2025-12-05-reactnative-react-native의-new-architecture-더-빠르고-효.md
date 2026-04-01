---
title: "[ReactNative] React Native의 New Architecture: 더 빠르고 효율적인 앱 개발의 미래 2편"
description: "React Native의 New Architecture에 대해 깊이 있게 파헤쳐보자 2편!!"
pubDate: "2025-12-05T14:51:19.676Z"
updatedDate: "2025-12-05T14:51:19.676Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764946267156.webp?alt=media&token=1f787b9e-1c51-422b-a91a-9898c042b90b"
tags: ["ReactNative"]
slug: "reactnative-react-native의-new-architecture-더-빠르고-효"
readingTime: 8
isPublic: true
---

> 이전 포스트에서는 기존 아키텍쳐의 한계, 특히 브릿지 소통 방식의 한계에 대해 살펴보았고, 
>
> 그 한계를 개선해주는 React Native의 New Architecture: JSI에 대해 알아보았다. 
>
> 이번 포스트에서는 이어서 New Architecture의 다른 개선 사항들에 대해 알아보자!

기존 아키텍처에서 브릿지는 JavaScript와 네이티브 코드 사이의 통신을 담당하는 핵심 역할을 했으며,

이 통신의 주 목적은 다음 두 가지였다.

1. UI 렌더링

   * JavaScript 코드에서 React 컴포넌트를 렌더링하고, 이를 네이티브 UI 요소로 변환하는 과정

   * Shadow Tree를 생성하고 레이아웃을 계산하여 네이티브 UI로 전달하는 작업
2. 네이티브 모듈 관리

   * JavaScript 코드에서 네이티브 기능(예: 블루투스, 위치 서비스 등)을 호출하고, 그 결과를 받아오는 작업

   * 네이티브 모듈을 초기화하고 관리하는 역할

React Native 팀은 New Architecture에서 이러한 통신 구조를 더 최적화되고 분리된 형태로 재구성하기로 결정했다.

JSI가 브릿지를 대체하여 직접적이고 동기적인 통신이 가능한 환경을 제공하고,

그 위에서 **Fabric**과 **TurboModules**가 각각 UI 렌더링과 네이티브 모듈 관리를 보다 효율적으로 수행하는 역할을 맡는 것이다.

그렇다면 **Fabric과 TurboModules이 어떤 식으로 해당 역할을 수행하는지 자세히 살펴보자!**

## New Architecture의 두 번째 개선사항: Fabric

Fabric을 소개하기 전에 앞서, 이번에도 우선 React Native의 기존 UI 렌더링에 대해 먼저 알아보자

### 기존 아키텍처의 UI 렌더링

기존 아키텍처 UI 렌더링 과정에는 중요한 역할을 맡은 3가지 요소가 있다.

1. **React Reconciler**: UI 변경사항을 감지하고 업데이트 명령을 생성하는 React의 핵심 엔진
2. **UIManagerModule**: JavaScript와 네이티브 코드 사이의 UI 작업 조정자 역할을 하는 네이티브 모듈
3. **UIImplementation**: Shadow Tree를 관리하고, Yoga 엔진을 사용하여 레이아웃을 계산하며, 실제 UI 작업(네이티브 뷰 렌더링)을 수행하는 컴포넌트

이 3가지 요소는 React Native의 세가지 스레드

* JavaScript 스레드

* 메인 스레드 (UI 스레드)

* shadow 스레드 (feat. Yoga엔진)

에서 다음 과정을 통해 UI 렌더링 작업을 수행한다.

1. JavaScript 스레드에서 React 컴포넌트 렌더링:

   * React 컴포넌트의 state나 props가 변경되면, React Reconciler가 Diffing을 수행

   * UI 업데이트 명령을 생성 후 브릿지를 통해 메인 스레드로 전달
2. 메인 스레드에서 UI 업데이트 명령 수신 및 처리:

   * UIManagerModule은 이 명령을 해석하고, 필요한 UI 작업을 조정

   * 레이아웃 계산이 필요한 경우, 이를 위한 명령을 **UIImplementation**으로 전달
3. 섀도우 스레드에서 레이아웃 계산 (Yoga 엔진 사용):

   * UIImplementation이 UIManagerModule로부터 받은 명령을 바탕으로 Shadow Node를 생성

     * Shadow Node는 UI 요소의 레이아웃 정보를 나타내는 가벼운 객체이며,
       이러한 Shadow Node들은 트리 구조로 조직되어 Shadow Tree를 형성

   * Shadow Tree가 구성된 후, Yoga 엔진과 상호작용하여 레이아웃을 계산

   * 계산된 레이아웃 정보를 다시 메인 스레드로 전달
4. 메인 스레드에서 실제 네이티브 UI 컴포넌트를 생성하고 화면에 렌더링:

   * UIManagerModule이 계산된 레이아웃 정보를 바탕으로 UIImplementation에게 구체적인 UI 작업을 지시

   * UIImplementation이 최종적으로 네이티브 뷰를 화면에 렌더링

### 기존 렌더링 방식의 한계

기존 React Native UI 렌더링 방식은 몇 가지 중요한 한계점을 가지고 있다. (대부분 브릿지를 통한 비동기적 통신에서 발생한 문제..!)

1. 레이아웃 점프: 여러 스레드 간의 비동기적 통신과 레이아웃 계산 과정에서 발생하는 지연으로 인해 UI 업데이트가 부드럽지 못할 수 있다.

   예시

   1. JS 스레드에서 네이티브 스레드에 대용량 리스트 렌더링 요청
   2. 사용자가 매우 빠른 속도로 리스트 스크롤
   3. 네이티브 스레드에서 JS 스레드로 스크롤 이벤트 전송
      (이후 d가 진행 되기전에 빈 화면을 보게 된다..!)
   4. JS 스레드에서 네이티브 스레드에 업데이트된 리스트 렌더링 요청

2. 프레임 드롭: 비동기 통신과 JSON 직렬화/역직렬화 과정에서 발생하는 성능 오버헤드로 인해 프레임 드랍이 발생할 수 있으며, 특히 복잡한 UI나 애니메이션 작업에서 문제가 두드러진다.

3. 일관성 부족: iOS와 Android에서 서로 다른 렌더링 로직 사용

이러한 한계점들을 해결하기 위해 React Native 팀은 Fabric이라는 새로운 렌더링 시스템을 도입했다.

### Fabric: 새로운 렌더링 시스템

Fabric은 기존 아키텍처에서 스레드와 요소와의 관계를 다음과 같이 재구성하고 개선했다.

* JavaScript 스레드:

  * 여전히 React 컴포넌트 렌더링과 상태 관리를 담당

  * React Reconciler는 계속 사용되지만, JSI를 통해 네이티브 측과 보다 효율적으로 상호작용

* 메인 스레드:

  * Fabric은 UIManagerModule의 역할을 새롭게 재구성하여 **Compositor**라는 C++ 기반의 새로운 개념을 도입

  * 기존의 여러 스레드에 분산된 UI 작업을 Compositor를 통해 메인 스레드에 집중하여 통합 관리

  * UIImplementation의 기능을 통합하여 Compositor가 C++ 레이어에서 직접 Shadow Tree를 생성하고 Yoga 엔진을 사용하여 레이아웃 계산

  * 작업의 복잡성과 현재 시스템 부하에 따라 동적으로 유연하게 적절한 스레드를 할당

* 백그라운드 스레드:

  * 일부 무거운 계산이나 비동기 작업은 여전히 백그라운드 스레드에서 수행 가능

  * 그러나 이전처럼 전용 Shadow 스레드를 사용하는 대신, 필요에 따라 동적으로 스레드를 활용

* 추가적인 개선사항:

  * 크로스 플랫폼 일관성: iOS와 Android에서 동일한 렌더링 로직을 사용

  * 우선순위 기반 렌더링: React 18의 Concurrent Rendering 기능을 도입하여 UI 업데이트의 중요도에 따라 처리 순서를 조정

### Fabric의 렌더 파이프라인

Fabric의 렌더링 과정은 크게 세 단계로 나뉜다:

1. Render 단계:

   ![fabric-render](https://github.com/user-attachments/assets/5b3a3fb9-c855-4a32-8075-f4d50049511c)

   * React Element Tree를 생성

   * 이를 C++로 작성된 React Shadow Tree로 변환

2. Commit 단계:

   ![fabric-commit](https://github.com/user-attachments/assets/acd77837-8e0a-4e48-ae80-d0ad29949c21)

   * 생성된 React Shadow Tree를 기반으로 Yoga 엔진을 호출하여 레이아웃 계산

3. Mount 단계:

   ![fabric-mount](https://github.com/user-attachments/assets/d09ce19a-4356-47e7-9e18-298c141bd322)

   * 계산된 레이아웃 정보를 가진 React Shadow Tree를 Host View Tree로 변환하여 UI로 렌더링

### Fabric 마무리 !!!

Fabric의 도입으로 레이아웃 점프 문제, 프레임 드롭, 크로스 플랫폼 일관성 부족 등 기존 아키텍처의 여러 한계점들이 극복되면서 React Native 앱의 UI 성능과 사용자 경험이 크게 개선되었다.

그러나 New Architecture의 혁신은 여기서 그치지 않는다!

UI 렌더링이 Fabric을 통해 개선되었다면, 네이티브 모듈과의 상호작용 역시 새로운 방식으로 재구성될 필요가 있었다.

이를 위해 React Native 팀은 Turbo Modules라는 새로운 시스템을 도입했다.

Turbo Modules는 네이티브 기능을 더 효율적으로 활용하고, 앱의 성능을 한층 더 끌어올리는 역할을 한다.

이제 Turbo Modules가 어떻게 작동하고, 어떤 이점을 제공하는지 자세히 살펴보자!

## New Architecture의 세 번째 개선사항: Turbo Modules(feat. CodeGen)

### Turbo Modules

Turbo Modules는 네이티브 모듈과의 상호작용을 더 효율적으로 만들기 위해 도입된 새로운 방식이다.

주요 특징은 다음과 같다:

1. **Lazy Initialization**:

   * 기존 아키텍처에서는 모든 네이티브 모듈이 앱 시작 시 초기화되었고, 이는 초기 로딩 시간을 지연시키는 원인이 되었다.

   * Turbo Modules는 필요한 순간에만 네이티브 모듈을 로드하여 초기 로딩 시간을 단축시킨다.
     → 이는 앱 성능을 향상시키는 중요한 요소!!
2. **JSI 사용**:

   * JSI를 통해 JavaScript와 네이티브 코드 간의 직접 통신이 가능하고, 더 이상 비동기적으로 호출할 필요가 없어 성능이 크게 향상

### CodeGen

CodeGen은 Turbo Modules와 함께 사용되어 네이티브 모듈의 인터페이스를 자동으로 생성하고, 일관성을 유지한다. 주요 특징은 다음과 같다:

1. **자동 코드 생성**:

   * JavaScript와 네이티브 코드 간의 인터페이스를 자동으로 생성

   * 이는 개발 생산성을 높이고, 코드의 일관성을 유지하는 데 기여
2. **타입 안전성**:

   * TypeScript/Flow 타입 정의를 C++ 코드로 변환

   * 컴파일 시간에 타입 오류를 잡아 런타임 오류를 줄임
3. 일관성 보장:

   * JavaScript와 네이티브 코드 간의 인터페이스 일관성을 보장

### Turbo Modules와 CodeGen의 상호작용

Turbo Modules와 CodeGen은 함께 작동하여 네이티브 모듈과의 상호작용을 최적화하고, 개발자 경험을 향상시킨다. 다음은 두 개념이 어떻게 상호작용하는지 설명하는 예시이다:

1. **네이티브 모듈 정의**:

   * 개발자는 네이티브 모듈의 인터페이스를 정의하며, 이 인터페이스는 TypeScript 또는 Flow와 같은 정적 타입 검사 도구를 사용하여 정의될 수 있다.
2. **CodeGen을 통한 자동 코드 생성**:

   * CodeGen은 정의된 인터페이스를 바탕으로 네이티브 모듈의 코드를 자동으로 생성

   * 이 과정에서 JavaScript와 네이티브 코드 간의 인터페이스가 일관되게 유지됨
3. **Turbo Modules을 통한 효율적인 상호작용**:

   * 생성된 네이티브 모듈 코드는 Turbo Modules을 통해 JavaScript와 네이티브 코드 간의 직접 통신을 가능하게 함

   * JSI를 사용하여 네이티브 모듈을 필요한 시점에 로드하고, 성능을 최적화

### 결론

Turbo Modules와 CodeGen은 함께 작동하여 React Native의 네이티브 모듈과의 상호작용을 최적화하고, 개발자 경험을 크게 향상시킨다. 이를 통해 React Native 애플리케이션은 더 빠르고 효율적으로 동작하며, 개발자는 더 생산적으로 작업할 수 있다.

## New Architecture의 세 번째 개선사항: Turbo Modules(feat. CodeGen)

> 💡 React Native의 기존 네이티브 모듈 시스템에는 몇 가지 문제점이 있다.
>
> 1. 초기화 지연: 모든 네이티브 모듈이 앱 시작 시 초기화되어 앱 실행 시간 증가
> 2. 타입 안정성 부족: JavaScript와 네이티브 코드 간의 타입 불일치로 인한 런타임 오류 발생 가능성

### Turbo Modules

Turbo Modules는 이러한 문제를 해결하기 위해 설계된 새로운 네이티브 모듈 시스템으로

주요 특징은 다음과 같다:

1. 지연 로딩: 필요할 때만 모듈을 로드하여 앱 시작 시간을 단축
2. 동기적 통신: JSI를 통해 JavaScript에서 네이티브 함수를 직접 호출
3. 향상된 타입 안정성: CodeGen을 사용하여 컴파일 시간에 타입 체크를 수행
4. 코드 재사용: C++ 구현을 통해 iOS와 Android 간 코드 공유가 가능

### Turbo Modules의 작동 방식

> 대략적인 코드 예시를 들어가며 설명하겠지만 C++ 코드에 대해서 정확하게 이해하고 넘어갈 필요는 없고
> 그냥 이런식이구나\~\~ 하고 넘어가도록 하자..ㅎ

1. 모듈 정의:
   개발자는 TypeScript나 Flow를 사용하여 Turbo Module의 인터페이스를 정의

   ````tsx
   import {TurboModule} from 'react-native';

       export interface Spec extends TurboModule {
         multiply(a: number, b: number): number;
       }

       export default Spec;
       ```

   ````

2. CodeGen 사용:
   개발자가 정의한 인터페이스를 바탕으로 네이티브 코드 뼈대를 자동으로 생성
   `cpp
   class MyTurboModuleSpecJSI : public TurboModule {
   public:
     virtual jsi::Value multiply(jsi::Runtime& runtime, double a, double b) = 0;
     // ... 기타 필요한 메서드와 구조
   };
   `

3. 네이티브 구현:
   개발자는 CodeGen이 생성한 뼈대를 바탕으로 실제 네이티브 구현을 작성하고, 구현된 클래스를 React Native 런타임에 등록하여 JavaScript에서 사용할 수 있게 한다.

   ````cpp
   class MyTurboModule : public MyTurboModuleSpecJSI {
   public:
   MyTurboModule(std::shared_ptr<CallInvoker> jsInvoker)
   : MyTurboModuleSpecJSI(std::move(jsInvoker)) {}

         jsi::Value multiply(jsi::Runtime& runtime, double a, double b) override {
           double result = a * b;
           return jsi::Value(result);
         }
       };

       // 모듈 등록
       TurboModuleRegistry::registerNativeModule(
         "MyTurboModule",
         [](const std::string& name, std::shared_ptr<CallInvoker> jsInvoker) {
           return std::make_shared<MyTurboModule>(std::move(jsInvoker));
         }
       );
       ```

   ````

4. JavaScript에서 사용:

   ```jsx
   import { NativeModules } from 'react-native'

   const result = NativeModules.MyTurboModule.multiply(3, 7)
   ```

### 추가 설명: CodeGen 작동 방식

CodeGen은 Turbo Modules와 Fabric 모두에서 중요한 역할을 하는 코드 생성 도구이다.

CodeGen이 작동하는 순서는 다음과 같다.

1. 타입 정의 분석: TypeScript/Flow 파일에서 타입 정의를 분석
2. 중간 표현 생성: 분석된 타입 정의를 중간 표현(IR)으로 변환
3. 네이티브 코드 뼈대 생성: IR을 바탕으로 C++, Objective-C, Java 코드를 생성

CodeGen은 이 과정에서 반복적이고 오류가 발생하기 쉬운 부분을 자동화하여 개발 효율성과 타입 안정성을 크게 향상시켜준다!

## React Native의 New Architecture가 가져올 미래

지금까지 React Native의 New Architecture에 대해 자세히 살펴보았다.

New Architecture는 아직 완전히 안정화되지 않았지만, 그 잠재력은 매우 크다.

New Architecture는 React Native 앱의 성능을 향상시킬 뿐만 아니라, 우리 개발자들이 더 쉽게 네이티브 기능을 활용할 수 있도록 돕는다.

이 새로운 혁신은 React Native가 네이티브 개발과의 격차를 더욱 좁히고, 크로스 플랫폼 개발의 새로운 표준을 제시할 것으로 기대된다!