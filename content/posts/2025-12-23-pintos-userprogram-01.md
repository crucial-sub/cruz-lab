---
title: "[Pintos] UserProgram - Argument Passing"
description: "UserProgram 과제 Argument passing 구현"
pubDate: "2025-12-23T13:54:22.733Z"
updatedDate: "2025-12-23T13:54:22.732Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1766498014396.webp?alt=media&token=c4991161-693d-465c-b546-bf4b78a1ca44"
tags: ["운영체제", "pintos", "크래프톤 정글"]
slug: "pintos-userprogram-01"
readingTime: 2
isPublic: true
---

## User Programs 목표

Pintos 과제 Part 2: User Programs의 목표는 **사용자 영역의 프로그램을 로드하고 실행​**​할 수 있는 기능을 구현하는 것이다.

지금까지의 코드가 모든 권한을 가진 커널 모드에서 실행되었다면, 이제는 권한이 제한된 사용자 모드에서 프로그램을 실행시키고 관리해야 한다.

주요 구현 단계는 다음과 같다.

1. **실행 파일 로드​**​: 디스크의 프로그램을 메모리로 읽어온다.
2. **메모리 할당​**​: 코드, 데이터, 스택 영역을 위한 가상 메모리를 설정한다.
3. **Argument Passing​**​: 커맨드 라인 인자를 사용자 스택에 전달한다.
4. **Context Switching​**​: 커널 모드에서 사용자 모드로 전환한다.
5. **시스템 콜**​: 사용자 프로그램이 커널 기능을 사용할 수 있도록 인터페이스를 제공한다.

***

## Argument Passing (인자 전달)

## 개념

터미널에서 `/bin/ls -l foo bar`와 같은 명령어를 실행할 때, 운영체제는 이 인자들을 프로그램의 메인 함수로 전달해야 한다.

```c
int main(int argc, char *argv[])
```

이를 위해 프로그램 시작 전, **유저 스택(User Stack)**​에 `argc`와 `argv` 정보를 미리 구성해두어야 한다.

## 구현 상세

### 1. 문자열 파싱 (Parsing)

입력받은 명령어 문자열(`"ls -l foo bar"`)을 공백 기준으로 분리한다.
`strtok_r` 함수를 활용하여 구현할 수 있다.

```c
/* 예시 코드 */
char *argv[64];
int argc = 0;
for (token = strtok_r(file_name, " ", &save_ptr); token != NULL; token = strtok_r(NULL, " ", &save_ptr)) {
    argv[argc++] = token;
}
```

### 2. 유저 스택 구성 (Stack Setup)

x86-64 아키텍처의 호출 규약(Calling Convention)에 따라 스택을 **높은 주소에서 낮은 주소로​** 채워 넣는다.

1. **​인자 데이터​**: 문자열 실체(`argv[i]`)를 스택에 복사한다.
2. **​Word-Align Padding​**: 스택 포인터가 8의 배수가 되도록 패딩을 추가한다.
3. **​인자 포인터 배열​**: 문자열들의 주소를 가리키는 포인터(`argv`)들을 저장한다.
4. **​Return Address​**: Fake Return Address (0)를 저장한다.

최종적으로 `%rdi` 레지스터에는 `argc`, `%rsi` 레지스터에는 `argv`(배열의 시작 주소)를 설정한다.

***

## Troubleshooting

### 1. 프로세스 이름 파싱 문제

프로세스 종료 로그(`process_exit`)에 프로그램 이름뿐만 아니라 인자까지 포함되어 출력되는 문제가 있었다.

* **원인**​: `thread_create`에 파싱되지 않은 전체 커맨드 라인(`"echo x"`)을 이름으로 전달했기 때문이다.

* **해결**​: `load` 함수 내에서 파싱이 완료된 후, 첫 번째 토큰(`argv[0]`)을 사용하여 스레드 이름을 갱신(`strlcpy`)하도록 수정했다.

### 2. Exec 시 부모 프로세스 이름 변경

`exec` 호출 시 호출한 스레드의 이름이 변경되면 안 된다는 요구사항이 있다.
하지만 초기 구현에서는 `load` 과정에서 이름을 덮어쓰면서 이 규칙이 위반되었다.

* **해결**​: `process_create_initd` 함수에서 스레드를 생성하기 전에 미리 프로그램 이름만 추출하여 `thread_create`에 전달했다. 이렇게 하면 생성 시점부터 올바른 이름을 갖게 되므로, 이후 강제로 이름을 변경할 필요가 없다.

***

## 마무리

Argument Passing은 스택 메모리의 구조를 이해하고 직접 조작해보는 중요한 과정이었다.

이 과정이 정확해야 이후 시스템 콜 구현도 정상적으로 진행될 수 있다.
