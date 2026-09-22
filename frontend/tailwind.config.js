/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f6',
          100: '#eeeeec',
          200: '#d7d6d1',
          300: '#b6b4ac',
          400: '#8e8b80',
          500: '#6f6c60',
          600: '#57544a',
          700: '#46443c',
          800: '#302e29',
          900: '#1c1b17',
          950: '#100f0d',
        },
        pine: {
          50: '#eefbf5',
          100: '#d6f4e6',
          200: '#afe8cf',
          300: '#7ad6b3',
          400: '#45bd93',
          500: '#22a179',
          600: '#158162',
          700: '#0f6e5c', // marca
          800: '#12503f',
          900: '#0f4234',
          950: '#08251d',
        },
        gold: {
          50: '#fbf6ec',
          100: '#f5e7c8',
          200: '#eccf95',
          300: '#e1b25e',
          400: '#d69a3c',
          500: '#bf8129',
          600: '#9c6521',
          700: '#7d501e',
          800: '#66421e',
          900: '#57381c',
        },
        canvas: '#faf8f5',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,27,23,0.04), 0 4px 16px rgba(28,27,23,0.06)',
        card: '0 1px 3px rgba(28,27,23,0.06), 0 8px 24px -6px rgba(28,27,23,0.10)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')({ strategy: 'class' })],
};
