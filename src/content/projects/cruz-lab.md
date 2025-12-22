---
title: "Cruz Lab"
description: "Astro 5 + React 19 기반의 블로그 겸 포트폴리오 사이트"
longDescription: "기존의 정적 블로그 운영 방식의 불편함을 개선하기 위해 직접 CMS를 구축한 포트폴리오 사이트다. Astro와 React를 활용하여 성능과 상호작용을 모두 확보했으며, 웹에서 직접 글을 작성하고 배포할 수 있는 환경을 만들었다."
image: "../../assets/img/crusub.png"
tags:
  - "Portfolio"
  - "Astro"
  - "React"
  - "CMS"
  - "Firebase"
tech:
  - "Astro 5"
  - "React 19"
  - "TypeScript"
  - "Firebase"
  - "Milkdown"
  - "Tailwind CSS"
github: "https://github.com/crucial-sub/cruz-lab"
featured: true
order: 2
startDate: 2024-12
endDate: 2025-01
---

## 프로젝트 개요

**Cruz Lab**은 크래프톤 정글 수료 후 포트폴리오를 준비하면서 시작된 프로젝트다.

기존에 Next.js로 개발하여 운영하던 개인 블로그([amgona-blog](https://amgona-blog.vercel.app/dev))가 있었으나, 포트폴리오 사이트를 새로 만드는 김에 블로그 기능을 통합하기로 결정했다. 단순히 정보를 나열하는 정적인 사이트보다는, 방문자가 상호작용할 수 있는 재미있는 요소들을 넣어 '살아있는' 느낌을 주고자 했다.

## 주요 기능 및 특징

### 1. 자체 구축 CMS (Content Management System)

이 프로젝트의 핵심 기능 중 하나는 웹상에서 직접 포스트를 작성하고 관리할 수 있는 Admin 페이지다.

**기존 방식의 문제점**
기존 블로그는 전형적인 정적 사이트(SSG) 방식으로 운영했다.
1. VS Code에서 Markdown 파일을 생성하고 작성
2. 로컬에서 이미지 파일 관리 및 경로 설정
3. Git Commit & Push
4. Vercel 배포 대기

이 과정은 글을 하나 발행하거나 오타를 수정할 때마다 번거로운 작업을 거쳐야 했고, 글쓰기의 접근성을 떨어뜨리는 요인이었다.

**개선된 워크플로우**
이를 해결하기 위해 사이트 내에 **Admin 페이지**를 구축했다.
*   **WYSIWYG 에디터:** Milkdown을 활용하여 노션(Notion)이나 옵시디언(Obsidian)과 유사한 사용자 경험을 구현했다. 마크다운 문법을 실시간으로 렌더링해서 보여준다.
*   **이미지 처리:** 드래그 앤 드롭으로 이미지를 쉽게 첨부할 수 있으며, 업로드 시 자동으로 Firebase Storage에 저장되고 본문에 삽입된다.
*   **즉시 배포:** 작성 완료 후 '출간' 버튼을 누르면 Firestore에 데이터가 저장되고 사이트에 즉시 반영된다.

### 2. 인터랙티브 UI/UX

'Lab(실험실)'이라는 이름에 걸맞게 다양한 인터랙티브 요소를 구현했다.
*   메인 히어로 섹션의 3D 틸트 효과
*   스크롤에 반응하는 애니메이션
*   마우스 커서 인터랙션

방문자가 사이트를 탐색하는 동안 지루하지 않도록 시각적인 재미를 더하는 데 집중했다.

### 3. 반응형 디자인

모바일, 태블릿, 데스크탑 등 다양한 디바이스 환경에서 깨짐 없이 콘텐츠를 열람할 수 있도록 반응형 디자인을 완벽하게 적용했다.

## 기술 스택 및 아키텍처

*   **Frontend & Hosting:** Vercel (Client 배포), Astro 5 (프레임워크), React 19 (UI 라이브러리)
*   **Backend & Database:** Firebase Auth (관리자 인증), Firestore (포스트 및 메타데이터 저장), Firebase Storage (이미지 호스팅)
*   **Styling:** Tailwind CSS

Astro의 **Island Architecture**를 활용하여, 정적 콘텐츠가 주를 이루는 블로그 영역은 빠른 로딩 속도를 보장하고, Admin 페이지와 같은 동적 기능이 필요한 부분은 React로 처리하여 효율성을 높였다.
