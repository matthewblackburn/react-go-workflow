import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dagrejs/dagre': path.resolve(__dirname, './node_modules/@dagrejs/dagre/dist/dagre.esm.js'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    hmr: {
      clientPort: 3000,
    },
    proxy: {
      '/v1': 'http://api:8080',
      '/bff': 'http://api:8080',
      '/ws': {
        target: 'http://api:8080',
        ws: true,
      },
      '/webhooks': 'http://api:8080',
      '/health': 'http://api:8080',
    },
  },
});
