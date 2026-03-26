---
title: "에디터 전수조사 샘플"
description: "외부 markdown import와 publish round-trip에서 깨질 수 있는 케이스를 한 파일에 모았다."
pubDate: "2026-03-26T00:00:00.000Z"
updatedDate: "2026-03-26T00:00:00.000Z"
heroImage: "https://example.com/hero.png?size=1200:630"
tags:
  - "CMS"
  - "Markdown"
  - "한글"
slug: "editor-roundtrip-stress"
readingTime: 4
isPublic: true
---

> 이 샘플은 import 후 아무 수정 없이 다시 publish했을 때 원본이 얼마나 보존되는지 보기 위한 문서다.

## 한글과 마크다운 문법이 붙는 경우

이 문장은 조사와**볼드**가 바로 붙어 있다.

이 문장은 `코드`와조사가 붙어 있다.

이 문장은 [링크](https://example.com)와조사가 붙어 있다.

## 리스트와 표

- 첫 번째 항목
- 두 번째 항목
  - 중첩 항목

1. 순서 있는 항목
2. 두 번째 항목

| 항목 | 설명 |
| --- | --- |
| bold | 조사와**볼드**가 붙는 경우 |
| code | `inline code` |

## 코드 블록

```ts
export function greet(name: string) {
  return `hello, ${name}`;
}
```

## 이미지와 링크

![샘플 이미지](https://example.com/sample.png "샘플 이미지")

문단 중간에 <br /> 같은 HTML이 들어가도 유지되는지 확인한다.

## 체크리스트

- [ ] import 후 tags가 유지되는지
- [ ] 한글과 볼드 사이에 보이지 않는 문자가 들어가는지
- [ ] publish 후 frontmatter 배열 형식이 바뀌는지
- [ ] publish 후 문단/표/코드블록이 변형되는지
