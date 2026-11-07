import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * В dev-режиме фронтенд ходит в относительный /api,
 * а Vite проксирует запросы на FastAPI. В проде
 * VITE_API_BASE_URL указывает на задеплоенный бэкенд.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
