// 코드 블록 언어 목록 (재건 3단계 D10, 4단계 D8)
// - 에디터 언어 선택 드롭다운(lowlight.ts)과 공개 하이라이트(highlighter.ts)가 같은 목록을 쓴다.
// - value는 마크다운 펜스의 언어 이름이다. Shiki 이름이 다르면 highlighter.ts의 별칭이 맞춘다.
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
