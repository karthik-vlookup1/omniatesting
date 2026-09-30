import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app entry (index.html + main.tsx) lives in src/app/, so every web file sits inside a
// feature's declared scope. Feature code under src/features/ is imported from there.
export default defineConfig({
  root: 'src/app',
  plugins: [react()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // server's default PORT
        changeOrigin: false,
      },
    },
  },
});
