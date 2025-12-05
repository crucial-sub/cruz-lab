---
title: "[ReactNative] JavaScript 번들에서 네이티브 UI까지"
description: "Metro 번들러에 의해 번들링된 JavaScript 코드가 실제로 앱에서 어떻게 실행되는지 살펴보자!"
pubDate: "2025-12-05T14:43:36.042Z"
updatedDate: "2025-12-05T14:43:36.042Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764945811943.webp?alt=media&token=f95a0a3e-bc3a-489c-8317-baaaff9daf4d"
tags: ["ReactNative"]
slug: "reactnative-javascript-번들에서-네이티브-ui까지"
readingTime: 6
isPublic: true
---

> 이전에 작성한 [Welcome to Metro](https://amgona-blog.vercel.app/post/dev/reactnative-welcome-to-metro) 포스트에서 Metro 번들러가 React Native 앱에서 어떤 역할을 하는지에 대해 알아보았다.
>
> 이번 포스트에서는 Metro 번들러에 의해 번들링된 JavaScript 코드가 실제로 앱에서 어떻게 실행되는지 살펴보자!

## **AppRegistry.registerComponent()**

**AppRegistry?**

…

갑자기 이게 뭔데?

…

내가 써본 적 있는건가?

라는 생각이 든다면..!

당장 아무 React Native 프로젝트 코드를 띄우고 가장 기본 파일인 `index.js`를 살펴보자.

```jsx
import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)
```

😱😱😱😱😱😱😱😱😱😱

놀랍게도(?) `AppRegistry.registerComponent()`는 프로젝트 가장 기본 파일의 첫 실행 메서드였다.

### 그래서 위의 코드가 하는 일은?

우리는 컴포넌트를 작성하여 화면을 렌더링한다.

하지만 우리가 작성한 컴포넌트들은 스스로 실행되지 않으며, 이는 우리가 컴포넌트들을 정의하는 `App.js` 또한 마찬가지이다.

🖐️여기에 제가 작성한 환상적인 앱이 있어요!!🖐️

하고 React Native에 렌더링을 시작할 진입점을 구체적으로 알려줘야 하며, `AppRegistry`가 바로 그 진입점을 등록하는 역할을 하는 것이다.

위 코드에서는 `app.json`에 설정된 앱 이름으로 우리의 루트 컴포넌트(여기서는 `App`)를 등록하는 거다.

이렇게 하면 네이티브 코드에서 이 이름을 사용해 우리의 컴포넌트를 로드하고 실행할 수 있게 된다.

## 등록은 했는데 실행은 누가?

알다시피 우리가 작성한 javascript 코드들은 Metro 번들러에 의해 하나의 파일로 번들링 된다.

즉, 우리가 `AppRegistry.registerComponent()`을 통해 등록한 컴포넌트 정보 또한 번들링된 js 파일 안에 있다는 것!

이렇게 번들링된 js파일은

개발 모드일 땐 로컬 서버(metro 서버)에서 제공해주고,

프로덕션 모드에서는 앱패키지에 포함되어 배포된다.

* **iOS**: ios폴더의 `main.jsbundle`파일

* **Android**: assets폴더의 `index.android.bundle`파일)

그리고 React Native에서 번들링된 파일을 로드해주는 역할은 네이티브 코드가 담당하고 있다

* **iOS**: `AppDelegate.m` 또는 `AppDelegate.mm` 또는 `AppDelegate.swift`

* **Android**: `MainActivity.java` 또는 `MainActivity.kt`

이 파일들은 앱이 실행될 때 가장 먼저 호출되어 앱의 초기 설정을 담당하며,

JavaScript 엔진을 초기화하고 번들 파일을 로드하는 역할을 한다.

### `AppDelegate.mm` 파일 예시 & 설명

아래 코드는 `AppDelegate.mm` 파일의 예시이다.

```objectivec
#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"LOCAT";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end

```

이를 메서드 별로 하나하나 살펴보자

### `application:didFinishLaunchingWithOptions:`

```objectivec
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"LOCAT";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}
```

이 메서드는 애플리케이션이 시작될 때 호출되어 앱의 초기 설정을 수행하고, 필요한 초기화 작업을 처리한다.

이 때 `moduleName`은 앞서 등록한 이름과 일치해야 하며, 이를 통해 네이티브 코드와 React Native 코드가 연결된다.

### **`sourceURLForBridge`**

```objectivec
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}
```

이 메서드는 RCTBridge에 사용할 JavaScript 번들의 URL을 반환한다.

RCTBridge는 JavaScript와 네이티브 코드 간의 통신을 담당하는 브리지 역할을 한다.

### **`getBundleURL`**

```objectivec
- (NSURL *)getBundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
```

이 메서드는 js 번들의 URL을 반환한다.

이 때 위에서 설명했듯이 개발 모드와 프로덕션 모드에서 다른 URL을 반환한다!

### `MainActivity.kt` 파일 예시 & 설명

`MainActivity.kt` 파일 예시

```java
package com.locat

import android.os.Bundle;
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "LOCAT"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}

```

`MainActivity.kt`에서 js 번들 로드는 `createReactActivityDelegate`에서 이뤄진다.

`ReactActivityDelegate`내부에서 `DefaultReactActivityDelegate`가 `ReactInstanceManager`를 사용하여 번들 파일의 위치를 설정하고, JavaScript 코드를 로드한다.

## **브릿지 및 RCTRootView 초기화**

처음 앱을 실행할 때 번들링된 JS파일을 실행하고 UI 렌더링을 시작하기 앞서
`AppDelegate` 혹은 `MainActivity`에서 이루어지는 중요한 과정이 하나 있는데,

바로 **브릿지 및** **`RCTRootView`를 초기화하는 것이다.**

> 💡 브릿지?
>
> React Native에서 브릿지는 JavaScript와 네이티브 코드 간의 통신을 담당한다.
>
> 브릿지를 통해 JavaScript 코드가 네이티브 모듈을 호출하거나, 네이티브 코드가 JavaScript 함수를 호출할 수 있는 것이다.
>
> 이 때 이루어지는 모든 통신은 비동기적이며 JSON 형식의 문자열로 직렬화되어 전달되는 방식이다.

> 💡 **RCTRootView?**
>
> `RCTRootView`는 React Native 앱의 루트 뷰로, JavaScript 코드에서 정의된 React 컴포넌트를 네이티브 UI로 렌더링하는 역할을 하며, 모든 React 컴포넌트가 렌더링되는 컨테이너이다.

<br />

### **브릿지 및 RCTRootView를** 초기화 하는 이유

* JavaScript 코드를 로드하고 실행하기 위해 JS 번들의 URL 설정

* 브릿지 초기화를 통해 JavaScript와 네이티브 간의 통신 채널을 설정

* `RCTRootView`를 생성하고, 이를 통해 React Native 컴포넌트를 iOS 뷰 계층 구조에 통합

* `UIWindow`와 `UIViewController`를 설정하여 `RCTRootView`를 화면에 표시

> 이제 번들링된 JS파일이 어떻게 네이티브 UI로 그려지는지 쓰레드와 연관해서 알아보자!

## React Native 스레드

React Native는 여러 스레드를 사용하여 효율적으로 UI를 렌더링한다. 주요 스레드는 다음과 같다.

### **1. JavaScript Thread**

* **역할**: React 컴포넌트의 렌더링 로직을 실행

* **동작**:

  1. React 컴포넌트의 `render` 메서드를 호출
  2. 가상 DOM을 생성하고 이전 상태와 비교
  3. 변경된 부분을 식별하고 업데이트 정보를 생성

### **2. Shadow Thread**

* **역할**: 레이아웃 계산을 담당

* **동작**:

  1. JavaScript Thread로부터 레이아웃 정보를 받음
  2. Yoga 엔진을 사용하여 각 요소의 크기와 위치를 계산
  3. 계산된 레이아웃 정보를 Main Thread로 전달

> 💡 Yoga 엔진 </br>
> Facebook에서 개발한 크로스 플랫폼 레이아웃 엔진으로, Flexbox 알고리즘을 구현하여 효율적인 레이아웃 계산을 수행한다.

**동작 방식**:

1. 요소의 스타일 속성(예: flexDirection, justifyContent, alignItems 등)을 분석
2. 부모-자식 관계와 형제 관계를 고려하여 각 요소의 크기와 위치를 계산
3. 계산된 레이아웃 정보를 Shadow Thread에 반환

<br />

### **3. Main Thread (UI Thread)**

* **역할**: 실제 네이티브 UI 요소를 생성하고 업데이트

* **동작**:

  1. Shadow Thread로부터 계산된 레이아웃 정보를 받음
  2. 네이티브 UI 요소를 생성하거나 업데이트
  3. 화면에 UI 렌더링

### **각 쓰레드에서 렌더링 프로세스**

1. **초기 렌더링**:

   * JavaScript Thread: React 컴포넌트 렌더링

   * Shadow Thread: Yoga 엔진을 사용한 레이아웃 계산

   * Main Thread: 네이티브 UI 요소 생성 및 화면에 표시
2. **상태 업데이트 시**:

   * JavaScript Thread: 새로운 상태로 컴포넌트 리렌더링

   * Shadow Thread: 변경된 부분의 레이아웃 재계산

   * Main Thread: 변경된 UI 요소만 업데이트

## 앱이 실행되어 번들을 그리는 순서

전체적인 앱 실행 플로우를 요약하면 다음과 같은 순서로 진행된다.

1. 앱 실행
2. `AppDelegate` / `MainActivity` 초기화

   1. 브리지 및 `RCTRootView` 초기화
   2. 번들링된 JS 파일의 위치 파악
3. Main Thread(UI Thread)가 JS 번들을 로드 후 코드를 JavaScript Thread로 보내 실행
4. `AppRegistry.registerComponent`에 의해 등록된 루트 컴포넌트 실행
5. Shadow Thread에서 레이아웃 계산(Yoga 엔진 사용)하여 UI Thread로 보냄
6. UI Thread에서 네이티브 UI 업데이트
7. 화면 렌더링
