---
title: "[Pintos] UserProgram - 시스템 콜 동작 흐름"
description: "유저 프로그램이 커널에게 요청을 보내는 방법, 시스템 콜(System Call)의 동작 원리와 핸들러 구현 파헤치기"
pubDate: "2025-12-23T13:57:42.398Z"
updatedDate: "2025-12-23T13:57:42.398Z"
heroImage: "https://firebasestorage.googleapis.com/v0/b/cruz-lab.firebasestorage.app/o/images%2Fheroes%2Fhero-1766498230728.webp?alt=media&token=3770e34c-e12b-4b1b-b186-aa24f42b95c0"
tags: ["운영체제", "pintos", "크래프톤 정글"]
slug: "pintos-userprogram-02"
readingTime: 9
isPublic: true
---

## 시스템 콜 동작 흐름과 구현 개요

**시스템 콜(System Call)​**​은 **사용자 프로그램이 운영체제의 커널 기능을 사용하기 위해​** 제공되는 인터페이스다.

일반적인 동작 흐름은 다음과 같다.

## 1. 사용자 모드에서의 호출

사용자 프로그램은 라이브러리 함수(e.g. **​`write`​**, **​`exec`​**, **​`open`​**)를 통해 시스템 콜을 요청한다.

이때 x86-64 시스템에서는 보통 어셈블리 명령어 **​`syscall`​**을 사용한다.

> **​`syscall`​** 명령은 CPU를 **​유저 모드 → 커널 모드**로 전환시키는 특수 명령

```c
// pintos/lib/user/syscall.c
// 라이브러리 함수들
int write(int fd, const void *buffer, unsigned size)
{
	return syscall3(SYS_WRITE, fd, buffer, size);
}

int exec(const char *file)
{
	return (pid_t)syscall1(SYS_EXEC, file);
}

int open(const char *file)
{
	return syscall1(SYS_OPEN, file);
}

// syscall 함수를 간략하게 표현
syscall(syscall_num, arg1, ..., arg6)
{
	int64_t ret;
	register uint64_t *num asm("rax") = (uint64_t *)syscall_num;
	register uint64_t *a1 asm("rdi") = (uint64_t *)arg1;
	register uint64_t *a2 asm("rsi") = (uint64_t *)arg2;
	register uint64_t *a3 asm("rdx") = (uint64_t *)arg3;
	register uint64_t *a4 asm("r10") = (uint64_t *)arg4;
	register uint64_t *a5 asm("r8") = (uint64_t *)arg5;
	register uint64_t *a6 asm("r9") = (uint64_t *)arg6;

	__asm __volatile(
		"mov %1, %%rax\n"
		"mov %2, %%rdi\n"
		"mov %3, %%rsi\n"
		"mov %4, %%rdx\n"
		"mov %5, %%r10\n"
		"mov %6, %%r8\n"
		"mov %7, %%r9\n"
		"syscall\n"
		: "=a"(ret)
		: "g"(num), "g"(a1), "g"(a2), "g"(a3), "g"(a4), "g"(a5), "g"(a6)
		: "cc", "memory");
	return ret;
}
```

**`syscall`​** 함수 코드는 어떤 레지스트를 쓰는구나 정도만 가볍게 파악하고 넘어가자…

## 2. 커널 진입

**​`syscall`​** 명령이 실행되면 CPU는 **​`syscall_init`​**에서 미리 부팅 시 지정해둔 주소로 점프하여 커널의 시스템 콜 엔트리 함수를 실행한다. (해당 내용은 아래에서 다시 한 번 다룰 예정)

* Pintos의 경우 이 엔트리 함수가 어셈블리로 작성된 **​`syscall_entry`**이다.

```nasm
#include "threads/loader.h"

.text
.globl syscall_entry
.type syscall_entry, @function
syscall_entry:
	movq %rbx, temp1(%rip)
	movq %r12, temp2(%rip)     /* callee saved registers */
	movq %rsp, %rbx            /* Store userland rsp    */
	movabs $tss, %r12
	movq (%r12), %r12
	movq 4(%r12), %rsp         /* Read ring0 rsp from the tss */
	/* Now we are in the kernel stack */
	pushq $(SEL_UDSEG)      /* if->ss */
	pushq %rbx              /* if->rsp */
	pushq %r11              /* if->eflags */
	pushq $(SEL_UCSEG)      /* if->cs */
	pushq %rcx              /* if->rip */
	subq $16, %rsp         /* skip error_code, vec_no */
	pushq $(SEL_UDSEG)      /* if->ds */
	pushq $(SEL_UDSEG)      /* if->es */
	pushq %rax
	movq temp1(%rip), %rbx
	pushq %rbx
	pushq $0
	pushq %rdx
	pushq %rbp
	pushq %rdi
	pushq %rsi
	pushq %r8
	pushq %r9
	pushq %r10
	pushq $0 /* skip r11 */
	movq temp2(%rip), %r12
	pushq %r12
	pushq %r13
	pushq %r14
	pushq %r15
	movq %rsp, %rdi

check_intr:
	btsq $9, %r11          /* Check whether we recover the interrupt */
	jnb no_sti
	sti                    /* restore interrupt */
no_sti:
	movabs $syscall_handler, %r12
	call *%r12
	popq %r15
	popq %r14
	popq %r13
	popq %r12
	popq %r11
	popq %r10
	popq %r9
	popq %r8
	popq %rsi
	popq %rdi
	popq %rbp
	popq %rdx
	popq %rcx
	popq %rbx
	popq %rax
	addq $32, %rsp
	popq %rcx              /* if->rip */
	addq $8, %rsp
	popq %r11              /* if->eflags */
	popq %rsp              /* if->rsp */
	sysretq

.section .data
.globl temp1
temp1:
.quad	0
.globl temp2
temp2:
.quad	0
```

~~자세한 설명은 생략. 얘도 가볍게 넘어가자…~~

## 3. CPU 상태 저장

커널 진입과 함께 CPU는 **현재 유저 모드의 레지스터 값들을 모두 저장​**​한다.

* Pintos에서는 위에서 본 **`syscall_entry`​**​함수가 현재 유저 레지스터 값을 커널 스택에 차곡차곡 push하여 **`struct intr_frame`​** 구조체 형태로 저장한다.

* 이 과정에서 **​유저 스택 포인터, 플래그 레지스터, 명령어 주소(RIP)​** 등을 포함해 모든 일반 레지스터 값들이 **​`intr_frame`​**에 담긴다.

> ### 💡 intr_frame 구조체
>
> **​`intr_frame`​**은 인터럽트 프레임을 나타내는 구조체로, **​시스템 콜이나 예외 발생 시 CPU의 상태(레지스터 값들)** 를 저장하기 위해 정의된 자료구조이다.
>
> Pintos에서는 `interrupt.h`에 아래와 같이 정의되어있으며, 그 안에 CPU의 레지스터(r15, r14, ..., rax, rsp 등), RIP(명령어 주소), FLAGS(플래그), 오류 코드 등이 필드로 포함되어 있다.
>
> ```c
> /* 일반 레지스터 묶음 */
> struct gp_registers {
> 	...
> 	uint64_t r10;
> 	uint64_t r9;
> 	uint64_t r8;
> 	uint64_t rsi;
> 	uint64_t rdi;
> 	uint64_t rbp;
> 	uint64_t rdx;
> 	uint64_t rcx;
> 	uint64_t rbx;
> 	uint64_t rax;
> }
>
> struct intr_frame {
> 	struct gp_registers R;
> 	...
> 	uint64_t error_code;
> 	uintptr_t rip;
> 	uint64_t eflags;
> 	uintptr_t rsp;
> 	...
> }
> ```
>
> 예시로 아래 코드에서
>
> ```c
> void syscall_handler(struct intr_frame *f)
> {
> 	uint64_t n = f->R.rax; // %rax에는 시스템 콜 번호가 저장
> 	...
> }
> ```
>
> **`f→R.rax`​**​는 **시스템 콜 발생 시 유저 프로그램의 RAX 레지스터 값​**​을 의미한다.

## 4. 시스템 콜 핸들러 호출

**`syscall_entry`​**​는 레지스터 저장을 마치면, **`syscall.c`​**​에 정의해놓은 **`syscall_handler()`​**​함수를 호출한다.

이때 **`struct intr_frame *f`​**가 그 인자로 전달되며, 이 구조체 안에 유저 모드의 문맥(context) 정보가 모두 들어있다.
이제 커널의 C 코드에서 **​`f`​**를 통해 어떤 시스템 콜이 호출되었는지, 인자는 무엇인지를 파악하여 해당 시스템 콜을 수행하면 된다.

> ### 💡 Lookup Table 방식 syscall_handler 함수
>
> 시스템 콜 번호에 따라 각각 다른 기능을 수행해야 할 때, **​Lookup Table​** 방식으로 효율적이고 깔끔하게 구현 가능하다. (형일님이 사용하신 방식 적용 🙇‍♂️)
>
> **​`syscall-nr.h`​** 파일에 정의된 시스템 콜 번호(⇒ **​`rax`​** 레지스터에 저장된 번호)에 대응하는 함수 포인터들을 배열로 미리 마련해 두고,
>
> 시스템 콜이 발생하면 **​`f->R.rax`** 값을 인덱스로 삼아 해당하는 함수를 바로 호출하는 방식이다.
>
> ```c
> // syscall_handler_t 라는 이름의 타입을 정의하는데
> // 이 타입은 "struct intr_frame*을 인자로 받아서 void를 리턴하는 함수의 포인터"를 의미
> typedef void (*syscall_handler_t)(struct intr_frame *f);
>
> // 시스템 콜 핸들러 테이블
> // 현재 exit과 write 시스템 콜만 핸들러 등록
> static const syscall_handler_t syscall_tbl[] = {
> 	NULL,      // SYS_HALT
> 	sys_exit,  // SYS_EXIT
> 	NULL,      // SYS_FORK
> 	NULL,      // SYS_EXEC
> 	NULL,      // SYS_WAIT
> 	NULL,      // SYS_CREATE
> 	NULL,      // SYS_REMOVE
> 	NULL,      // SYS_OPEN
> 	NULL,      // SYS_FILESIZE
> 	NULL,      // SYS_READ
> 	sys_write, // SYS_WRITE
> 	NULL,      // SYS_SEEK
> 	NULL,      // SYS_TELL
> 	NULL,      // SYS_CLOSE
> };
> ```
>
> ```c
> void syscall_handler(struct intr_frame *f)
> {
> 	// 시스템 콜 번호
> 	uint64_t n = f->R.rax;
>
> 	// n이 테이블 크기보다 크거나 같으면 존재하지 않는 시스템 콜 번호라는 뜻
> 	// 시스템 콜 번호가 범위 밖이거나, 해당 번호에 등록된 핸들러가 없으면 sys_badcall을 호출
> 	if (n >= (sizeof(syscall_tbl) / sizeof(syscall_tbl[0])) || syscall_tbl[n] == NULL)
> 	{
> 		sys_badcall(f);
> 		return;
> 	}
> 	
> 	// 시스템 콜 테이블에서 해당 인덱스에 등록된 핸들러 호출
> 	syscall_tbl[n](f);
> }
> ```

## 5. 시스템 콜 수행

Lookup Table을 이용해 시스템 콜 번호에 해당하는 커널 함수를 호출하고, 그 결과(return 값)를 **`intr_frame`​** 구조체 내 **​`R.rax`​** 등에 저장한다.

**​`write`​** 시스템 콜을 예시로 시스템 콜 수행 흐름을 살펴보자.

시스템 콜 번호는 **​`%rax`​**에 담겨있고, 시스템 콜에 필요한 인자들은 차례대로 **​`%rdi`​**, **​`%rsi`​**, **​`%rdx`​**, **​`%r10`​**, **​`%r8`​**, **​`%r9`​** 레지스터에 담겨 있다. (7번째 부터는 스택 메모리에 저장)

> ### ❓ %r10, %r8, %r9 순서인 이유
>
> 일반 함수 호출은 인자 1~6을 **​`rdi`,** **`rsi`,** **`rdx`,** **`rcx`,** **`r8`,** **`r9`​**에 둔다.
>
> 그런데 **​`syscall`​** 명령은 4번째 인자 자리인 **​`rcx`​**를 내부적으로 복귀 주소를 저장하느라 사용한다.
>
> 그래서 시스템 콜에서는 4번째 인자 자리를 **​`rcx`​**에서 빼서 **​`r10`​**으로 바꿔 사용하도록 규약을 정해두었다.
>
> 이 때 5, 6번째 인자는 기존대로 **​`r8`​**, **​`r9`​** 순서를 유지하기 때문에
>
> 최종 순서가 **​`rdi`,** **`rsi`,** **`rdx`,** **`r10`,** **`r8`,** **`r9`​**가 된 것이다!

**​`syscall_handler`​**는 핸들러 테이블에서 **​`%rax`​** 에 담긴 시스템 콜 번호에 해당하는 핸들러 함수 `sys_write`를 찾아서 호출한다.

```c
static void sys_write(struct intr_frame *f)
{
	int fd = (int)f->R.rdi;
	const char *buf = (const char *)f->R.rsi;
	size_t size = (size_t)f->R.rdx;

	if (fd == 1) // printf 찍으려고 일단 표준 출력(fd번호 1)에 한해서만 로직을 구현함
	{
		putbuf(buf, size);
		f->R.rax = size;
	}
	else // 나머지는 아직 미구현이므로 -1
	{
		f->R.rax = (uint64_t)-1;
	}
}
```

**`write`​** 시스템 콜은 인자 3개를 필요로 하기 때문에 **​`%rdi`​**, **​`%rsi`​**, **​`%rdx`​**에 순서대로 담긴 값들을 사용해 **​`write`​** 작업을 수행한 후 반환값을 다시 **​`f→R.rax`​**에 넣어둔다.

## 6. 유저 모드로 복귀

시스템 콜 처리 함수가 끝나면 **​`syscall_handler`​**는 리턴하고, 곧이어 **​`do_iret(&_if)`​**을 호출하여 이전의 유저 모드로 복귀한다.

> **​`do_iret()`​**: 인자로 들어온 **​`intr_frame`** **내의 정보를 CPU로 복원시키는 함수​**

**​`f→R.rax`​**에 넣어둔 리턴값도 복귀 후 사용자 레지스터 **​`%rax`​**에 반영되므로, 사용자 프로그램은 마치 일반 함수를 호출한 것처럼 시스템 콜의 반환값을 얻을 수 있다.

**​`write`​** 시스템 콜 예시에서는 **​`f→R.rax`​**에 기록한 바이트 수가 유저 프로그램의 **​`%rax`​**로 전달되어, 유저 영역의 라이브러리 함수 **​`write`​**가 이 값을 반환한다.

***

# 추가 내용: MSR과 syscall_init()

앞서 **​“2. 커널 진입”​** 파트에서 **​`syscall_init`​** 함수에 대해 얘기한 바 있다.

**​`syscall_init`​**은 CPU에게 “시스템 콜을 받으면 커널의 어디로 들어가서 어떻게 동작한다”를 알려주는 작업을 수행하는 함수이며,

**​MSR(Model-Specific Registers)**이라는 특별한 레지스터들을 설정하는 것이 이 작업들에 해당한다.

```c
#define MSR_STAR 0xc0000081			/* Segment selector msr */
#define MSR_LSTAR 0xc0000082		/* Long mode SYSCALL target */
#define MSR_SYSCALL_MASK 0xc0000084 /* Mask for the eflags */

void syscall_init(void)
{
	write_msr(MSR_STAR, ((uint64_t)SEL_UCSEG - 0x10) << 48 |
										((uint64_t)SEL_KCSEG) << 32);
	write_msr(MSR_LSTAR, (uint64_t)syscall_entry);

	write_msr(MSR_SYSCALL_MASK,
			  FLAG_IF | FLAG_TF | FLAG_DF | FLAG_IOPL | FLAG_AC | FLAG_NT);
}
```

* **MSR_STAR (0xc0000081)​**

  MSR_STAR는 **​`SYSCALL`​**/**​`SYSRET`​** 전환 시 사용할 ‘세그먼트 셀렉터 쌍(커널/유저)’을 CPU에 미리 알려주는 레지스터이다.

  > **​코드 세그먼트 = 코드가 저장된 메모리 영역​**
  >
  > CPU는 실행할 명령어를 가져오기 위해 항상 “지금 실행할 코드가 어디에 있는지”를 알아야 하며, 그 위치를 가리키는 게 바로 **​코드 세그먼트 레지스터(CS 레지스터)​**이다.

  Pintos는 부팅 때 커널 세그먼트 레지스터 값 **​`SEL_UCSEG`​**와 유저 세그먼트 레지스터 값 **​`SEL_KCSEG`​**를 MSR_STAR에 기록한다.

  덕분에 **​`syscall`​** 하면 커널 CS로, **​`sysret`​** 하면 유저 CS로 자동 전환되어 안전하게 오간다.

* **​MSR_LSTAR (0xc0000082)​**

  **​시스템 콜 엔트리 포인트(커널 함수 주소)​**를 지정하는 MSR이다.

  즉, 이 레지스터에 커널의 시스템 콜 처리 루틴 주소를 써놓으면, 유저 프로그램이 **​`syscall`​** 명령을 실행할 때 CPU가 해당 주소로 점프한다.

  Pintos에서는

  ```c
  write_msr(MSR_LSTAR, (uint64_t) syscall_entry);
  ```

  와 같이 사용하는데, 이는 곧 “MSR_LSTAR 레지스터에 **​`syscall_entry`​** 함수의 주소값을 기록”하는 동작이다.

  그 결과 **​어떤 유저 프로그램이 시스템 콜을 일으키면 CPU가 자동으로 syscall_entry로 진입​**하게 된다.

* **​MSR_SYSCALL_MASK (0xc0000084)​**

  시스템 콜 진입 시 **​CPU의 제어 플래그(RFLAGS) 중 어떤 비트를 마스크(무시)할 지 지정​**하는 MSR이다. ⇒ 주로 **​인터럽트 플래그(IF)​**를 끄는데 사용!

  Pintos에서는 **​`FLAG_IF`​**(인터럽트 플래그) 뿐만 아니라 **​`FLAG_TF`​**(트랩 플래그), **​`FLAG_DF`​**(방향 플래그) 등 몇 가지 플래그를 OR 연산으로 합쳐 MSR_SYSCALL_MASK에 설정한다.

  이렇게 하면 유저 모드에서 **​`syscall`​**을 호출하는 순간 **​CPU가 해당 플래그들을 0으로 클리어​**하고 커널에 진입한다.

  특히 인터럽트 플래그(IF)를 0으로 만들어주는 것은 **​시스템 콜 처리 도중에는 타이머 인터럽트 등 다른 인터럽트가 발생하지 않도록​** 하는 효과가 있다.

  ⇒ 즉, 시스템 콜 엔트리에서 유저 스택을 커널 스택으로 바꾸는 민감한 작업이 끝날 때까지 인터럽트가 잠시 마스킹됨으로써 안전성을 확보

요약하면 **​`syscall_init`​**함수는 시스템 콜을 위한 CPU 레지스터들을 설정하여, 이후에 발생하는 모든 시스템 콜이 올바른 경로로 진입할 수 있도록 준비하는 단계이다.

이로써 커널은 시스템 콜 번호와 인자를 안전하게 전달받아 **​`syscall_handler`​**로 처리할 수 있게 된다.

***

# 정리

**​커널에서는​** **​`syscall_init`​**으로 CPU의 시스템 콜 엔트리를 설정하고, **​`syscall_handler`​**를 구현하여 번호별 시스템 콜 함수를 호출하여 시스템 콜을 처리하며,

**​유저 프로그램에서는​** 라이브러리 함수(e.g. **​`write`​**, **​`exit`​**, **​`open`​**)를 통해 **​`syscall`** 어셈블리를 실행하여 시스템 콜을 트리거하고 결과를 리턴값으로 받는 흐름이다.

즉, 시스템 콜은 커널과 유저 공간을 잇는 공식 통로이다!
