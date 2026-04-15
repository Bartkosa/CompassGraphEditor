import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // When VITE_API_BASE_URL is unset, same-origin `/api/*` hits the FastAPI server.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
