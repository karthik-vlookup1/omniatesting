/// <reference types="node" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API is a separate service (Omnia_recon-backend, default port 3001). In development every
// /api request is proxied there, so the session cookie stays same-origin and SameSite=Strict holds.
const apiTarget = process.env.OMNIA_API_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the UI kit and framework in their own long-cached chunks; route code is split per page.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@mantine') || id.includes('@floating-ui')) return 'mantine';
          if (id.includes('@tabler')) return 'icons';
          if (id.includes('react-router') || id.includes('@tanstack')) return 'framework';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
