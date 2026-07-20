import Carousel from './Carousel';
import { LATEST_RELEASE } from '../whatsNew/releases';

interface Props {
  /** Dismiss the dialog. The caller records the release as seen so it never re-fires. */
  onClose: () => void;
}

/**
 * The post-upgrade "What's New" sheet: the app's bottom-sheet modal wrapping the
 * feature carousel. Any dismissal (✕, Skip, or the final "Got it") calls `onClose`,
 * which marks the release seen — we never nag the same user twice.
 */
export default function WhatsNewDialog({ onClose }: Props) {
  const { versionLabel, slides } = LATEST_RELEASE;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal whats-new-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`What’s new in ${versionLabel}`}
      >
        <div className="whats-new-head">
          <div>
            <p className="whats-new-eyebrow">New in {versionLabel}</p>
            <h2 className="whats-new-title">What’s new</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <Carousel
          slides={slides}
          ariaLabel="What’s new in this version"
          onSkip={onClose}
          onDone={onClose}
        />
      </div>
    </div>
  );
}
