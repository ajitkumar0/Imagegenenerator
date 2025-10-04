import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          pink: '#FF6B9D',
          purple: '#A855F7',
        },
        background: {
          start: '#FFF5F7',
          end: '#FFFFFF',
        },
        text: {
          body: '#1F2937',
        },
      },
    },
  },
  plugins: [],
};
export default config;
