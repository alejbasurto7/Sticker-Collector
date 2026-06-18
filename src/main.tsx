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

// Keep the app shell exactly as tall as the visible viewport.
// iOS Safari's `100dvh` is resolved lazily — at load it can land a few px short
// and only corrects after a scroll/resize, leaving a white gap below the tab
// bar until you drag the screen. visualViewport.height (innerHeight fallback)
// is always the true visible height, so we mirror it into a CSS variable and
// refresh it on every viewport change.
function setAppHeight() {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
}
setAppHeight();
window.visualViewport?.addEventListener('resize', setAppHeight);
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
