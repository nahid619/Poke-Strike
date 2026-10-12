import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1200, // Three.js alone is ~500 kB
  },
  server: {
    open: true,
  },
});
