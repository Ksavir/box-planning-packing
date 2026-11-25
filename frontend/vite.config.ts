import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], gauge: ['motion/react', '@number-flow/react'] } },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.PACKFLOW_API_PROXY || 'http://127.0.0.1:8001',
    },
  },
})
