import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/SocialWorld/',   // must match your GitHub repo name exactly
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to the Express server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Three.js is large — allow bigger chunks
    chunkSizeWarningLimit: 2000,
  },
})
