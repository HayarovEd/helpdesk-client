import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://10.222.222.174:9092',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://10.222.222.174:9092',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://10.222.222.174:9092',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://10.222.222.174:9092',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://10.222.222.174:9092',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
