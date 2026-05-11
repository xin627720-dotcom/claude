import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#F2F2F7',
          secondary: '#FFFFFF',
          tertiary: '#E5E5EA',
        },
        text: {
          primary: '#1C1C1E',
          secondary: '#6E6E73',
          tertiary: '#AEAEB2',
        },
        accent: {
          DEFAULT: '#5E5CE6',
          light: '#EEEEFd',
        },
        success: '#34C759',
        danger: '#FF3B30',
        warning: '#FF9500',
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '20px',
        xl: '28px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.07)',
        sm: '0 1px 4px rgba(0,0,0,0.06)',
      },
      animation: {
        'fade-up': 'fadeUp 0.25s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'slide-right': 'slideRight 0.25s ease-out',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      maxWidth: { content: '720px' },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}

export default config
