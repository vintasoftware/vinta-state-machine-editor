import { defineConfig } from 'vite';

export default defineConfig({
  root: 'dev',
  // host: true binds every interface, so the demo can be opened from a phone on
  // the same network and still get hot reloading.
  server: { open: true, port: 5173, host: true },
  build: { outDir: '../dev-dist', emptyOutDir: true },
});
