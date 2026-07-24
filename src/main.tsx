import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import App from './App';
import './pwa/installPrompt'; // registers beforeinstallprompt capture at boot
import './styles.css';

// Windows desktop fonts lack country-flag glyphs, so flag emoji fall back to
// bare letter pairs (MX, ZA, …). This injects a flag webfont — but only on
// browsers that need it, leaving iOS/macOS native flags untouched. The font is
// served locally (see public/) so it's precached by the PWA and works offline.
polyfillCountryFlagEmojis(
  'Twemoji Country Flags',
  `${import.meta.env.BASE_URL}TwemojiCountryFlags.woff2`,
);

// Keep the app shell exactly as tall as the screen.
// iOS resolves `100dvh`/`100vh` unreliably: in standalone/PWA mode it can land
// shorter than the real screen (leaving a gap below the tab bar), and in Safari
// it's computed lazily so a gap lingers until a scroll/resize fires (the "drag
// and it snaps back" behaviour). window.innerHeight is always the true visible
// height — and, unlike visualViewport.height, it does NOT shrink when the
// on-screen keyboard appears, so the shell won't jump while typing. We mirror it
// into a CSS variable and refresh it on every viewport change.
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);

const root = createRoot(document.getElementById('root')!);

// Dev-only template editor at #/admin/templates. The `import.meta.env.DEV`
// guard plus the dynamic import means Vite tree-shakes this branch out of the
// production build entirely.
if (import.meta.env.DEV && window.location.hash.startsWith('#/admin/templates')) {
  import('./admin/TemplateEditor').then(({ default: TemplateEditor }) => {
    root.render(
      <StrictMode>
        <TemplateEditor />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
