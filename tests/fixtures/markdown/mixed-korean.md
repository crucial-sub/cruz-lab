## 크래프톤 정글 회고

이번 주에는 **C 언어**로 `malloc`을 구현했다. 어려웠지만
재미있었다.

* 월요일: 설계
* 화요일: 구현
    * 세부 1
    * 세부 2
* 수요일: 디버깅

> 💡 **팁:** 포인터는 그림으로 그리자.

```c
void *my_malloc(size_t size) {
  return sbrk(size);
}
```

***

![결과](https://firebasestorage.googleapis.com/v0/b/bucket/o/images%2Fresult.png?alt=media "결과 화면")

| 항목 | 시간 |
|---|---|
| 구현 | 3h |
| 디버깅 | 5h |

끝.
