/** @type {import('tailwindcss').Config} */
// Tailwind 설정 (재건 4단계 D10)
// - 색·모서리 이름은 global.css 토큰을 그대로 쓴다(bg-bg-app, text-text-primary …).
// - typography 플러그인은 지웠다. 글 본문은 src/styles/prose.css 한 파일이다.
// - container 플러그인은 껐다. .container는 global.css에서 --container(960px)로 정한다.
export default {
  darkMode: 'class', // 기본 다크(변수도 다크 기준). .light로 라이트 전환
  content: ['./src/**/*.{astro,html,md,mdx,js,ts,jsx,tsx}', './content/**/*.{md,mdx}', './public/**/*.html'],
  corePlugins: {
    container: false,
  },
  theme: {
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
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        /* Semantic tokens (CSS 변수 매핑) */
        bg: {
          app: 'var(--bg-app)', // #0E0F12
          surface: 'var(--bg-surface)', // #14161A
          card: 'var(--bg-card)', // #1a1d23 - 카드/스켈레톤용
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
  plugins: [],
};
