import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/login':  { target: 'http://localhost:5000', changeOrigin: true },
      '/logout': { target: 'http://localhost:5000', changeOrigin: true },
      '/chat':   { target: 'http://localhost:5000', changeOrigin: true },
      '/upload': { target: 'http://localhost:5000', changeOrigin: true },
      '/scrape': { target: 'http://localhost:5000', changeOrigin: true },
      '/feedback': { target: 'http://localhost:5000', changeOrigin: true },
      '/api':    { target: 'http://localhost:5000', changeOrigin: true },
    }
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  }
})
