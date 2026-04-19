import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: '0.0.0.0', port: 3000 },
  integrations: [tailwind({ applyBaseStyles: false })],
  security: {
    checkOrigin: false,
  },
  vite: {
    ssr: { external: ['better-sqlite3'] },
  },
})
