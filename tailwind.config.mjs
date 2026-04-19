/** Brutalist tokens inherited from tacit-web. */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#fff',
        fg: '#000',
        accent: '#ff6b35',
        muted: '#f5f5f5',
        'muted-fg': '#666',
        border: '#000',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0',
      },
    },
  },
  plugins: [],
}
