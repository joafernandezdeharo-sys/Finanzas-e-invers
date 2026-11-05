import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' permite publicar la app en cualquier subcarpeta (ej. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
});
