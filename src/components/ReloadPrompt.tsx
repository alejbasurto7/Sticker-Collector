import { useRegisterSW } from 'virtual:pwa-register/react';

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
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

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
