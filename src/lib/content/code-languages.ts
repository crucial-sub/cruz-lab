// 코드 블록 언어 목록 (재건 3단계 D10, 4단계 D8)
// - 에디터 언어 선택 드롭다운(lowlight.ts)과 Shiki 하이라이트가 같은 언어를 쓴다.
// - 같은 언어 목록이 네 곳에 있다: 이 목록, 미리보기 highlighter.ts의 LANGUAGES, shiki-languages.ts의 SITE_GRAMMARS,
//   공개 페이지 server/code-highlighter.ts의 GRAMMAR_LOADERS. 언어를 더하면 네 곳을 함께 고친다
//   (tests/unit/code-highlighter.test.ts가 이 목록·SITE_GRAMMARS·GRAMMAR_LOADERS가 맞는지 본다).
// - value는 마크다운 펜스의 언어 이름이다. Shiki 이름이 다르면 shiki-languages.ts의 별칭이 맞춘다.
// - 서버·브라우저·Node 스크립트가 같이 가져온다. 의존성이 없다.

export const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'nasm', label: 'NASM' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
];
