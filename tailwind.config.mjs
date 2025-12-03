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
      padding: '1rem', // 모든 브레이크포인트에서 16px 고정
      screens: {
        sm: '100%',
        md: '100%',
        lg: '992px',
        xl: '992px',
        '2xl': '992px',
      },
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
      // Typography 커스터마이징
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--text-primary)',
            '--tw-prose-headings': 'var(--text-primary)',
            '--tw-prose-lead': 'var(--text-secondary)',
            '--tw-prose-links': 'var(--brand)',
            '--tw-prose-bold': 'var(--text-primary)',
            '--tw-prose-counters': 'var(--text-secondary)',
            '--tw-prose-bullets': 'var(--text-secondary)',
            '--tw-prose-hr': 'var(--border)',
            '--tw-prose-quotes': 'var(--text-primary)',
            '--tw-prose-quote-borders': 'var(--brand)',
            '--tw-prose-captions': 'var(--text-secondary)',
            '--tw-prose-code': 'var(--brand-weak)',
            '--tw-prose-pre-code': 'var(--text-primary)',
            '--tw-prose-pre-bg': 'var(--bg-surface)',
            '--tw-prose-th-borders': 'var(--border)',
            '--tw-prose-td-borders': 'var(--border)',
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            a: {
              textDecoration: 'none',
              '&:hover': {
                color: 'var(--brand-hover)',
              },
            },
            'pre': {
              borderRadius: '12px',
              border: '1px solid var(--border)',
            },
            'blockquote': {
              borderLeftColor: 'var(--brand)',
              fontStyle: 'normal',
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
