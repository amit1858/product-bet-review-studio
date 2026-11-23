import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [react(), {
    name: 'studio-shell-cache',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const template = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8');
      const paths = [...new Set(['/', '/index.html', '/theme.js', '/manifest.webmanifest', '/icon.svg',
        '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', ...Object.keys(bundle).map(name => `/${name}`)])];
      const build = createHash('sha256').update(template + JSON.stringify(bundle)).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset', fileName: 'sw.js',
        source: template.replace('__BUILD_ID__', build).replace('__PRECACHE__', JSON.stringify(paths)),
      });
    },
  }],
  server: { host: '127.0.0.1' },
  build: { sourcemap: false },
});
