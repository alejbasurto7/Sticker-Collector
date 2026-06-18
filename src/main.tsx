import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import App from './App';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
