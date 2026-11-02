import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // Never proxy to the legacy desktop Express server. Configure a dedicated
  // same-origin /api/v1 reverse proxy to the audited NestJS backend in Plesk.
  server: { strictPort: true, port: 5174 },
});
