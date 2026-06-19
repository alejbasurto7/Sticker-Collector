import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// While the app stays open, re-check for a freshly deployed service worker on
// this cadence (plus whenever the tab regains focus) so a long-lived session
// still surfaces the update banner without a manual reload.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Watches the service worker for a newly deployed build and, when one is
 * waiting, shows a non-blocking banner inviting the user to reload into it.
 *
 * The PWA is registered with `registerType: 'prompt'` (see vite.config.ts), so
 * a fresh service worker installs but stays in "waiting" until we explicitly
 * activate it. `updateServiceWorker(true)` skips the wait and reloads the page,
 * guaranteeing the user lands on the new build — which is the whole point:
 * removing the doubt about whether a deploy has actually taken effect.
 */
export default function ReloadPrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swScriptUrl, reg) {
      if (reg) setRegistration(reg);
    },
  });

  // Poll for a new build, and re-check whenever the tab becomes visible again.
  // `registration.update()` is a cheap conditional request; if a new worker
  // exists it installs and — because we register with `prompt` — waits, which
  // flips needRefresh and shows the banner below.
  useEffect(() => {
    if (!registration) return;
    const check = () => {
      if (registration.installing || ('onLine' in navigator && !navigator.onLine)) return;
      registration.update().catch(() => { /* offline / transient — retry next tick */ });
    };
    const intervalId = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [registration]);

  if (!needRefresh) return null;

  return (
    <div className="reload-prompt" aria-live="polite" role="status">
      <div className="reload-prompt-banner">
        <div className="rp-body">
          <div className="rp-title">A new version is available</div>
          <div className="rp-desc">Reload to get the latest update.</div>
        </div>
        <button type="button" className="btn primary" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
        <button
          type="button"
          className="rp-dismiss"
          aria-label="Dismiss update notice"
          onClick={() => setNeedRefresh(false)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
