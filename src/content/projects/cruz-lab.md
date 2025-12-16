---
title: "Cruz Lab"
description: "Astro & Framer Motion 기반 고성능 인터랙티브 포트폴리오"
longDescription: "단순한 정보 전달을 넘어, 웹사이트 자체로 프론트엔드 역량을 증명하기 위해 개발한 포트폴리오입니다. Astro Islands 아키텍처로 TBT 0ms의 성능을 확보하고, Framer Motion의 useMotionValue를 활용해 리렌더링 없는 60fps 물리 기반 애니메이션을 구현했습니다. 또한 Milkdown 기반의 커스텀 에디터를 내장하여 콘텐츠 관리(CMS)까지 직접 수행합니다."
image: "../../assets/img/projects/placeholder.svg"
tags:
  - "Portfolio"
  - "Interactive"
  - "Performance"
  - "CMS"
tech:
  - "Astro"
  - "React"
  - "TypeScript"
  - "Framer Motion"
  - "Tailwind CSS"
  - "Milkdown"
  - "Firebase"
github: "https://github.com/crucial-sub/cruz-lab"
demo: "https://cruz-lab.vercel.app"
featured: true
order: 2
startDate: 2024-12-10
endDate: 2024-12-12
---


# Cruz Lab: 60fps 애니메이션과 Zero JS를 동시에 잡다

취업 준비를 하며 "나를 가장 잘 보여줄 수 있는 포트폴리오 사이트"를 직접 만들어보기로 했다.
단순히 이력을 나열하는 것이 아니라, **사이트 자체의 성능과 인터랙션으로 개발 역량을 증명**하고 싶었다.

이에 **Astro**와 **Framer Motion**, 그리고 직접 구현한 **에디터(CMS)**까지 활용하여 기술적 욕심을 부려보았다. 그 과정에서 겪은 고민들을 정리해본다.

---

## 1. 화려한데 가벼울 수 있을까? (Astro Islands)

### 딜레마: React SPA의 무거움 🪨

인터랙티브한 웹사이트를 만들 때 가장 먼저 떠오르는 도구는 React다. 하지만 포트폴리오 사이트 특성상 **"첫인상(초기 로딩 속도)"**이 무엇보다 중요하다. 로딩이 3초 이상 걸린다면 방문자는 이미 떠나고 없을 것이다.

React SPA(Single Page Application)는 치명적인 단점이 있다.
**"단순한 텍스트나 이미지까지 모두 자바스크립트로 렌더링해야 한다"**는 점이다. (Hydration 비용). 내 사이트에는 12개의 인터랙티브 컴포넌트가 포함될 예정이었는데, 이를 하나의 번들로 처리하면 성능 저하가 뻔했다.

### 해결: 필요한 곳만 깨우자, Astro Islands 🏝️

그래서 선택한 것이 **Astro**다.
Astro의 **Islands Architecture**는 매우 효율적이다. 기본적으로 모든 페이지를 **정적 HTML(Zero JS)**로 빌드하고, 개발자가 지정한 컴포넌트만 선택적으로 React로 실행(Hydrate)시킨다.

```astro
<!-- index.astro -->

<!-- 1. Hero 섹션: 즉시 실행 필요 -->
<InteractiveHero client:load />

<!-- 2. 자기소개: 정적 텍스트 (JS 0kb) -->
<AboutMe />

<!-- 3. 프로젝트 목록: 스크롤 시 로드 -->
<ProjectsPreview client:visible />
```

`client:load`(즉시), `client:visible`(뷰포트 진입 시) 지시어를 활용하여 하이드레이션 시점을 제어했다.
덕분에 화려한 효과를 모두 구현하면서도 초기 로딩 속도(TBT) **0ms**와 Lighthouse 점수 100점을 달성할 수 있었다.

---

## 2. 리렌더링 없는 60fps 애니메이션 (Framer Motion)

### 문제: React State는 애니메이션에 적합하지 않다 🐢

마우스 커서를 따라 카드가 3D로 기울어지는 효과(`TiltCard`)를 만든다고 가정해보자.
일반적인 React 방식은 다음과 같다.

```javascript
// ❌ 성능 이슈 발생 코드
const [xy, setXY] = useState({ x: 0, y: 0 });

<div onMouseMove={(e) => setXY({ x: e.clientX, y: e.clientY })} />
```

마우스가 1픽셀 움직일 때마다 `setState`가 호출되고, 컴포넌트 리렌더링과 DOM 업데이트가 발생한다. 초당 60회 이상의 연산은 메인 스레드에 과부하를 주어 버벅거림(Jank)을 유발한다.

### 해결: useMotionValue로 리액트 우회하기 🚀

이를 해결하려면 **"값은 변경되지만 리렌더링은 발생하지 않는"** 방법이 필요하다. Framer Motion의 `useMotionValue`가 그 해답이다.

```javascript
// ✅ 리렌더링 0회
const x = useMotionValue(0); // React State가 아님

// 마우스 움직임이 컴포넌트 재실행을 유발하지 않음
<motion.div style={{ x }} />
```

이 방식은 React의 렌더링 사이클을 우회하여 GPU가 처리하는 CSS `transform` 속성에 값을 직접 주입한다.
여기에 물리 엔진인 `useSpring`을 결합하여, 마우스가 멈출 때 관성에 따라 부드럽게 감속하는 효과까지 **60fps 고정**으로 구현할 수 있었다.

---

## 3. 내가 쓸 에디터는 내가 만든다 (Milkdown)

### 욕심: "Notion은 느리고 Markdown은 불편해"

블로그 기능을 구현하며 글쓰기 환경에 대한 고민이 있었다.
- **Notion**: UI는 좋지만 API 연동 속도가 느리다.
- **Markdown 파일**: 개발자 친화적이지만, 이미지 미리보기가 불편하다.

"그럼 **Obsidian의 단축키** 효율성과 **Notion의 WYSIWYG(보이는 대로 편집)** 경험을 결합한 에디터를 직접 만들자"는 결론에 도달했다.

### 구현: Headless CMS 구축

**Milkdown** 라이브러리를 활용하여 커스텀 에디터를 구현했다.
단순한 텍스트 에디터가 아니라 플러그인 기반의 모듈형 구조를 갖추고 있다.

- **Slash Command**: `/` 입력 시 메뉴 호출 기능 구현.
- **이미지 업로드**: 드래그 앤 드롭 시 Firebase 스토리지 업로드 자동화.
- **배포 자동화**: 에디터 내 '출간' 버튼 클릭 시 Firestore 저장 및 사이트 즉시 반영.

이를 통해 단순히 화면만 구현하는 것을 넘어, **콘텐츠 생산부터 배포까지의 파이프라인**을 설계하고 구축하는 풀스택 역량을 기를 수 있었다.

---

## 마치며

2일이라는 짧은 시간이었지만, **"기술적 최적화가 뒷받침될 때 비로소 훌륭한 UX가 완성된다"**는 것을 확실히 느꼈다.

아무리 화려한 디자인도 성능이 떨어지면 사용자에게 외면받는다. Astro와 Framer Motion의 조합은 성능과 심미성을 모두 잡을 수 있는 강력한 도구임을 확인했다.

포트폴리오 사이트 구축을 고민 중이라면 **Astro**를 강력히 추천한다.

---

*👉 [Cruz Lab 구경하러 가기](https://cruz-lab.vercel.app)*