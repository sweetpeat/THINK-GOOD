import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative asset paths: the build serves correctly from any host or subpath
  base: './',
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
