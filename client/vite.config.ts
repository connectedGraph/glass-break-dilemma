import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5181,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8091', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
});
