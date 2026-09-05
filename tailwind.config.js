/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // SheetPage brand — a restrained green reserved for the logo,
        // primary actions and selection states.
        brand: {
          50: '#F1F8F4',
          100: '#DCEDE3',
          200: '#BADCC8',
          300: '#8CC3A5',
          400: '#55A47D',
          500: '#2F8760',
          600: '#1F6B4A',
          700: '#1A573D',
          800: '#164632',
          900: '#0F3123',
        },
        // Neutral scale — carries almost the whole interface.
        ink: {
          50: '#F7F8F7',
          100: '#EFF1F0',
          200: '#E2E5E3',
          300: '#CBD0CD',
          400: '#9BA39E',
          500: '#737B77',
          600: '#565D59',
          700: '#3F4643',
          800: '#2A2F2C',
          900: '#171A18',
        },
        canvas: '#FBFCFB',
        danger: {
          50: '#FDF2F2',
          200: '#F6C9C9',
          600: '#C0392B',
          700: '#9E2E23',
        },
        warn: {
          50: '#FEF8EC',
          200: '#F5DFAE',
          700: '#8A5A00',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard GOV',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.45' }],
      },
      boxShadow: {
        // Used sparingly — only for elements that genuinely float.
        pop: '0 6px 24px -8px rgba(23, 26, 24, 0.18), 0 1px 2px rgba(23, 26, 24, 0.06)',
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
    },
  },
  plugins: [],
}
