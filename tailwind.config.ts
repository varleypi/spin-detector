import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bias-left': '#2563eb',
        'bias-center': '#7c3aed',
        'bias-right': '#dc2626',
      },
    },
  },
  plugins: [],
}
export default config
