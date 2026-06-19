import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Repo name for GitHub Pages project-site base path.
const REPO = 'Sticker-Collector';

// Dev-only: lets the in-app album-type builder (#/admin/templates) write its
// Export straight to src/data/albumTypesData.ts. The builder POSTs the generated
// module source to /__write-album-types and Vite writes the file (Vite then
// hot-reloads it). `apply: 'serve'` keeps this out of `vite build`, so a
// production build never gets a write endpoint.
function albumTypesWriter(): Plugin {
  return {
    name: 'album-types-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__write-album-types', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const target = resolve(server.config.root, 'src/data/albumTypesData.ts');
            writeFileSync(target, body, 'utf8');
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: 'src/data/albumTypesData.ts' }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Short commit hash for the build. CI exposes GITHUB_SHA; locally we ask git.
// Either way it's resolved at build time and baked into the bundle, so the
// running app can report exactly which commit it was built from.
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command }) => ({
  // On GitHub Pages the app is served from /<repo>/; locally from /.
  base: command === 'build' ? `/${REPO}/` : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitSha()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    albumTypesWriter(),
    react(),
    VitePWA({
      // 'prompt' keeps a freshly deployed service worker waiting instead of
      // silently swapping in, so the app can show a "new version" banner and
      // reload deterministically (see ReloadPrompt.tsx).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sticker Collector',
        short_name: 'Sticker Collector',
        description: 'Track your sticker album, view stats, and organize swaps.',
        theme_color: '#0b8a4b',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
}));
