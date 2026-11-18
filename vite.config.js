import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works from any sub-path (GitHub Pages project sites included)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 4748, strictPort: true },
});
