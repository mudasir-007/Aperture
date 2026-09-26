import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the dev server proxy /api to the backend so the browser never
      // needs a different origin during local development (production
      // deployment still uses VITE_API_BASE_URL, see .env.example).
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
