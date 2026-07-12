import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DECOY_PATH_PREFIXES } from './shared/decoy-paths';

const functionsProxy = { target: 'http://localhost:9999', changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': functionsProxy,
      // Honeypot paths also need to reach the local function server instead
      // of falling through to the SPA — matches Netlify's routing in prod.
      ...Object.fromEntries(DECOY_PATH_PREFIXES.map((p) => [p, functionsProxy]))
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
