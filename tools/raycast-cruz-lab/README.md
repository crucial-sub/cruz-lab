# cruz-lab Raycast 확장

문서 서가의 맥 입구 하나다(서가 1단계 T9, Plan L2·J19). 스토어에 내지 않는다. 이 맥에만 설치한다.

## 명령

| 명령 | 하는 일 |
|---|---|
| 서가에 올리기 | Finder에서 고른 md·html 파일이나 폴더째 문서를 바로 올린다. 고른 것이 없으면 파일 고르기 칸을 연다. 끝나면 문서마다 QR과 주소를 보인다 |
| 서가 문서 | 서가 문서를 최근 것부터 보인다. ↵ 맥 브라우저에서 열기, ⌘↵ QR 보기, ⌘⇧C 주소 복사, ⌃X 내리기, ⌘R 새로 고침 |

- 올리기 규칙은 `lab push`와 같다. 공용 모듈 `src/library/client/push.ts`를 함께 쓴다.
- 같은 이름의 md·html은 고른 파일만 올린다. 둘 다 고르면 한 문서가 된다.
- 내리기는 서가 사본만 지운다. 맥의 원본 파일은 그대로다. 같은 파일을 다시 올리면 같은 주소로 돌아온다.
- 페이지 열기(`cruzlab.dev`, `/admin/library` 등)는 이 확장이 아니라 Raycast 퀵링크로 한다.

## 설치 (E8, 사용자가 한다)

1. 확장 폴더로 간다.

   ```bash
   cd ~/projects/cruz-lab/tools/raycast-cruz-lab
   ```

2. 의존성을 받는다(처음 한 번).

   ```bash
   npm install
   ```

3. Raycast에 가져온다. 명령이 개발 모드로 돌면 Raycast에 확장이 생긴다.

   ```bash
   npm run dev
   ```

4. 터미널에서 ⌃C로 멈춘다. 확장은 Raycast에 남는다.
5. 터미널에서 서가 토큰을 클립보드에 넣는다.

   ```bash
   lab token --copy
   ```

6. Raycast에서 "서가 문서"를 연다. 설정 칸이 나온다.
7. "서가 토큰" 칸에 붙여 넣는다(⌘V). 토큰은 화면에 보이지 않는다.
8. "서버 주소" 칸에 넣는다: 운영 서가를 켜기 전(T11 전)에는 `http://localhost:4341`. 켠 뒤에는 칸을 비운다(기본값 `https://www.cruzlab.dev`).
9. 다른 글을 복사해 클립보드의 토큰을 덮는다.

코드를 바꾸면 3~4단계를 다시 한다.

## 검사

```bash
npm run typecheck
```

```bash
npm run build
```

- `npm run build`는 `ray build -e dist -o dist`다. 결과는 이 폴더의 `dist/`에만 쓴다(Raycast에 설치하지 않는다).
- `ray build`를 `-e` 없이 부르면 기본 환경 `dev`로 빌드해 Raycast 확장 폴더(`~/.config/raycast/extensions/cruz-lab`)에 바로 쓴다.
- UI 밖 부분(`src/lib/`)은 `@raycast/api`를 가져오지 않는다. 저장소 뿌리의 `pnpm test`가 시험한다(`tests/library/raycast-lib.test.ts`).
