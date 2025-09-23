/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // 기본 다크(변수도 다크 기준). .light로 라이트 전환
  content: [
    './src/**/*.{astro,html,md,mdx,js,ts,jsx,tsx}',
    './content/**/*.{md,mdx}',
    './public/**/*.html',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', lg: '2rem', '2xl': '3rem' },
    },
    borderRadius: {
      none: '0px',
      sm: '8px', // # radius.sm (8)
      md: '12px', // # radius.md (12)
      lg: '16px', // # radius.lg (16)
      xl: '20px', // # radius.xl (20)
      '2xl': '24px', // # radius.2xl (24)
      pill: '999px', // # radius.pill (999)
      full: '9999px',
    },
    extend: {
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          'IBM Plex Sans KR',
          'Noto Sans KR',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        /* Semantic tokens (CSS 변수 매핑) */
        bg: {
          app: 'var(--bg-app)', // #0E0F12
          surface: 'var(--bg-surface)', // #14161A
        },
        text: {
          primary: 'var(--text-primary)', // #E7E9EE
          secondary: 'var(--text-secondary)', // #A8B0BA
        },
        border: {
          DEFAULT: 'var(--border)', // #262A31
        },
        /* Brand: Emerald core */
        brand: {
          DEFAULT: 'var(--brand)', // #10B981
          hover: 'var(--brand-hover)', // #059669
          weak: 'var(--brand-weak)', // #34D399
          tint: 'var(--brand-tint)', // #07221B
        },
        ring: {
          focus: 'var(--ring-focus)', // #34D399
        },
        graph: {
          1: 'var(--graph-1)', // #10B981
          2: 'var(--graph-2)', // #34D399
          3: 'var(--graph-3)', // #059669
          4: 'var(--graph-4)', // #0EA5A4
          5: 'var(--graph-5)', // #22C55E
          6: 'var(--graph-6)', // #4ADE80
        },
      },
      boxShadow: {
        card: 'var(--shadow-card)', // 0 1px 0 rgba(255,255,255,0.02), 0 6px 20px rgba(0,0,0,0.35)
        popover: 'var(--shadow-popover)', // 0 10px 30px rgba(0,0,0,0.45)
      },
    },
  },
  plugins: [
    // require('@tailwindcss/typography'), // 사용 시 주석 해제
  ],
};
