import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` genera un único archivo HTML autocontenido (dist-single/index.html)
// que se puede abrir con doble clic, sin servidor.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    chunkSizeWarningLimit: 1000,
    ...(mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000 } : {}),
  },
}));
