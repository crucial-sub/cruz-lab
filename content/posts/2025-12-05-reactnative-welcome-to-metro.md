---
title: "[ReactNative] Welcome to Metro"
description: "Metro번들러에 대해 알아보자!"
pubDate: "2025-12-05T14:24:41.844Z"
updatedDate: "2025-12-05T14:24:41.844Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1764944680214.webp?alt=media&token=37867002-407c-477d-8407-646b8019c67f"
tags: ["ReactNative"]
slug: "reactnative-welcome-to-metro"
readingTime: 2
isPublic: true
---

![터미널1](https://github.com/crucial-sub/odot/assets/87363422/48179de4-34d1-485f-8684-59869573abc1)

"Welcome to Metro"

React Native 프로젝트를 실행할 때마다 터미널에서 볼 수 있는 문구이다.

Metro가 뭐길래 환영한다는 것일까?

## Metro 번들러

![metro](https://github.com/crucial-sub/odot/assets/87363422/8ae258e1-834f-4668-8395-3e7d8795338f)

Metro는 React Native를 위한 자바스크립트 번들러라고 소개된다.

> 번들링이란 기본적으로 여러 파일들을 하나의 파일로 모아주는 것을 말하며, 더 정확하게는 모듈들의 의존성 관계를 파악하여 그룹화 및 최적화하는 과정을 의미한다.

Metro가 React Native에서 번들링을 수행하는 과정또한 이와 비슷하게 크게 3단계로 나누어 진행된다.

### Resolution

Resolution이란 모듈 해석을 말하며, 코드 내의 참조(`import`)가 어느 모듈을 참조하는지 찾아 로드하는 과정을 의미한다.

### Transformation

모든 모듈들을 React Native 실행 환경에 맞게 이해 가능한 형식으로 변환하는 과정이다.

### Serialization

모든 모듈이 변환 과정을 거치면 모듈을 결합하여 하나의 최적화된 번들을 생성한다.

## Metro가 제공하는 서비스

Metro는 번들링 이외에도 React Native 개발을 위해 다양한 서비스를 제공한다.

1. Assets 관리

   Metro는 자바스크립트 파일 외에도 React Native 프로젝트에 사용되는 이미지, 글꼴 및 기타 리소스와 같은 정적 자산도 관리함으로써 자산들이 적절하게 번들링되고 애플리케이션에 액세스할 수 있도록 보장한다.

2. 캐싱 및 최적화

   빌드 성능을 향상시키기 위해 Metro Server는 이전에 빌드된 자산과 모듈을 저장하는 캐싱 메커니즘을 통합한다. 이 캐싱은 후속 빌드 중에 중복 작업을 방지하여 빌드 시간을 줄이는 데 도움이 되며 결과적으로 개발자의 반복 주기가 빨라진다.

3. **개발 서버**

   Metro는 개발 중에 React Native 애플리케이션을 실행하고 테스트하는 데 필요한 인프라를 제공하는 개발 서버 역할도 한다. 번들로 제공되는 JavaScript 코드와 자산을 개발 환경에 제공하여 개발자가 실시간으로 변경 사항을 확인할 수 있도록 한다.

4. **HMR(핫 모듈 리로딩)**

   Metro 서버는 개발자가 전체 리로드 없이 실행 중인 애플리케이션에 즉시 반영된 코드 변경 사항을 확인할 수 있는 개발 기능인 HMR(핫 모듈 리로딩)을 지원하여 개발 중에 신속한 피드백을 제공하여 개발자 경험을 향상시킨다.

## Metro 서버를 통한 ios앱 실행 과정

Metro에 대해 얼추 알아보았으니 이제 다시 맨 처음 React Native 실행 사진으로 돌아가보자
![터미널2](https://github.com/crucial-sub/odot/assets/87363422/ac856d39-6644-4208-a122-54cdca69d7bb)

우리는 처음 프로젝트를 실행하고자 할 때 yarn start cli를 입력하는데
이를 통해 Metro dev server가 port 8081에 열리는 것을 확인할 수 있다.

![터미널2](https://github.com/crucial-sub/odot/assets/87363422/7a96e42b-07f9-445d-8759-9ad230773fc3)

이후 react native 프로젝트 내부의 ios 폴더로 이동 후
pod프로그램으로 ios/Podfile 파일을 참조해 원격 저장소에서 빌드시 필요한 패키지를 다운받아 설치한다.

![터미널2](https://github.com/crucial-sub/odot/assets/87363422/2fda3b9e-590a-45d2-bf07-13d076127c07)

yarn ios cli를 입력하면 Xcode가 패키지를 사용해 앱을 빌드하고, 빌드된 앱을 에뮬레이터에 설치하고 실행까지 해준다.

![터미널2](https://github.com/crucial-sub/odot/assets/87363422/0a4e1a6c-15a0-40dd-834b-33510b1691bc)

Metro 서버에서 javascript 코드 번들을 내려받게 되면 최종적으로 앱이 실행된다!
