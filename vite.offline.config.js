// Builds the whole game into a single HTML file (dist-offline/index.html)
// that you can open by double-clicking, with no internet connection.
// Run with: npm run build:offline
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-offline',
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
