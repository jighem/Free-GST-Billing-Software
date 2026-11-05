import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root:path.join(root,'src'),
  base:'/billing/',
  publicDir:false,
  plugins:[react()],
  build:{
    outDir:path.join(root,'dist-saas'),
    emptyOutDir:true,
    rollupOptions:{input:path.join(root,'src/saas-index.html')}
  },
  define:{__APP_VERSION__:JSON.stringify('anytime-gst-saas-integration')}
});
