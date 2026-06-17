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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
