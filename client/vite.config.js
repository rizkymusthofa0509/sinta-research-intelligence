import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = process.env.API_PORT || 5174;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
    },
  },
});
