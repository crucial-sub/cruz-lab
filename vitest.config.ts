// 단위 테스트 설정 (재건 2단계 T1)
// - tests/unit, tests/library 아래의 *.test.ts만 실행한다(tests/library는 문서 서가 1단계).
// - '@/…' 경로 별칭을 Astro 설정과 같게 맞춘다.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/library/**/*.test.ts'],
    environment: 'node',
  },
});
