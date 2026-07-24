import { getPlatform, isStandalone } from '../utils/platform';
import { useInstallPrompt } from '../pwa/installPrompt';

/**
 * The "Install on your phone" block. Renders exactly one of four states, in priority
 * order:
 *   1. already installed (standalone)  -> a confirmation note
 *   2. a native prompt is available    -> a one-tap Install button (Android/Chromium)
 *   3. iOS                             -> Add-to-Home-Screen steps
 *   4. everything else                 -> generic browser-menu steps
 */
export default function InstallInstructions() {
  const { canPrompt, promptInstall } = useInstallPrompt();

  if (isStandalone()) {
    return <p className="install-note">✓ You’ve already installed the app.</p>;
  }

  if (canPrompt) {
    return (
      <button type="button" className="btn primary full" onClick={() => void promptInstall()}>
        ⬇ Install app
      </button>
    );
  }

  if (getPlatform() === 'ios') {
    return (
      <ol className="install-steps">
        <li>
          Tap the <strong>Share</strong> button <span aria-hidden="true">⬆</span> in the toolbar.
        </li>
        <li>
          Choose <strong>“Add to Home Screen”</strong>.
        </li>
        <li>
          Tap <strong>“Add”</strong>.
        </li>
      </ol>
    );
  }

  return (
    <ol className="install-steps">
      <li>
        Open the browser menu <span aria-hidden="true">⋮</span>.
      </li>
      <li>
        Choose <strong>“Install app”</strong> or <strong>“Add to Home screen”</strong>.
      </li>
      <li>Confirm to add it to your home screen.</li>
    </ol>
  );
}
