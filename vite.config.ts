import { defineConfig } from 'vite';

export default defineConfig({
  root: 'dev',
  server: { open: true, port: 5173 },
  build: { outDir: '../dev-dist', emptyOutDir: true },
});
