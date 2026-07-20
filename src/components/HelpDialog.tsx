import { isDesktop } from '../utils/device';
import { VERSION_LABEL } from '../version';

interface Props {
  onClose: () => void;
}

/**
 * A demo sticker cell mirroring the real album cell states, used purely to
 * illustrate the tap / long-press gestures — it is not interactive.
 */
function DemoCell({ owned, swap }: { owned?: boolean; swap?: boolean }) {
  return (
    <div className={`cell${owned ? ' owned' : ''}`} aria-hidden="true">
      1
      {swap && <span className="dupe-badge">+1</span>}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      className="help-arrow"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

export default function HelpDialog({ onClose }: Props) {
  const desktop = isDesktop();
  const addLabel = desktop
    ? 'Click to add it to your collection'
    : 'Tap to add it to your collection';
  const swapLabel = desktop
    ? 'Click it again to mark it as a swap'
    : 'Tap it again to mark it as a swap';
  const removeLabel = desktop ? 'Right-click to remove it' : 'Long press to remove it';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="help-title">How it works?</h2>

        <div className="help-steps">
          <section className="help-step">
            <p className="help-step-label">{addLabel}</p>
            <div className="help-demo">
              <DemoCell />
              <Arrow />
              <DemoCell owned />
            </div>
          </section>

          <section className="help-step">
            <p className="help-step-label">{swapLabel}</p>
            <div className="help-demo">
              <DemoCell owned />
              <Arrow />
              <DemoCell owned swap />
            </div>
          </section>

          <section className="help-step">
            <p className="help-step-label">{removeLabel}</p>
            <div className="help-demo">
              <DemoCell owned swap />
              <Arrow />
              <DemoCell owned />
            </div>
          </section>
        </div>

        <div className="btn-row">
          <button className="btn primary full" onClick={onClose}>
            Got it
          </button>
        </div>
        <p className="settings-version">{VERSION_LABEL}</p>
      </div>
    </div>
  );
}
