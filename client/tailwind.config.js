/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        backdrop: '#0b0f17',
        neon: '#14f1d9',
        accent: '#ff7a90'
      }
    },
  },
  darkMode: 'class',
  plugins: [],
};
