/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: "#141414",
        secondary: "#FF3366", // Uber/Ola vibe but distinct maybe pinkish
        accent: "#00E676",
        background: "#F5F5F5",
      }
    },
  },
  plugins: [],
}
