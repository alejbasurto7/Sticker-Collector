import type { ReactNode } from 'react';
import { isDesktop } from '../utils/device';
import Carousel from './Carousel';
import { DemoCell, Arrow } from './AlbumHelpSteps';

interface Props {
  /** Dismiss the carousel. The caller records it as seen so it never re-fires. */
  onClose: () => void;
}

/** One gesture slide: the before → after cell demo with its instruction. */
function GestureSlide({ before, after, title, text }: {
  before: ReactNode;
  after: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="ob-slide">
      <div className="ob-demo">
        {before}
        <Arrow />
        {after}
      </div>
      <h3 className="ob-slide-title">{title}</h3>
      <p className="ob-slide-text">{text}</p>
    </div>
  );
}

/** Closing slide: a static mock of the Settings row where these steps live for good. */
function SettingsPointerSlide() {
  return (
    <div className="ob-slide">
      <div className="ob-settings-card" aria-hidden="true">
        <div className="ob-settings-row"><span className="ob-settings-ico">⚙️</span>Settings</div>
        <div className="ob-settings-row nav hi">How to modify my album<span className="ob-chev">›</span></div>
        <div className="ob-settings-row nav">About<span className="ob-chev">›</span></div>
      </div>
      <h3 className="ob-slide-title">Need a refresher later?</h3>
      <p className="ob-slide-text">
        Find these steps anytime in <b>Settings › How to modify my album</b>.
      </p>
    </div>
  );
}

/**
 * The first-album onboarding carousel: shown once to a brand-new user so they know
 * how to fill their album right away. Reuses the shared bottom-sheet modal + Carousel
 * and the same DemoCell/Arrow visuals as the Settings help screen, with the album
 * gradient as its signature accent. Any dismissal (✕, Skip, or "Start collecting")
 * calls `onClose`, which marks it seen.
 */
export default function AlbumOnboardingDialog({ onClose }: Props) {
  const desktop = isDesktop();
  const addLabel = desktop
    ? 'Click to add it to your collection'
    : 'Tap to add it to your collection';
  const swapLabel = desktop
    ? 'Click it again to mark it as a swap'
    : 'Tap it again to mark it as a swap';
  const removeLabel = desktop ? 'Right-click to remove it' : 'Long press to remove it';

  const slides: ReactNode[] = [
    <GestureSlide
      key="add"
      before={<DemoCell />}
      after={<DemoCell owned />}
      title={addLabel}
      text="Every number you tap turns green as owned."
    />,
    <GestureSlide
      key="swap"
      before={<DemoCell owned />}
      after={<DemoCell owned swap />}
      title={swapLabel}
      text="Doubles get a +1 badge so you know what you can trade."
    />,
    <GestureSlide
      key="remove"
      before={<DemoCell owned swap />}
      after={<DemoCell owned />}
      title={removeLabel}
      text="Changed your mind? Take a copy back off just as easily."
    />,
    <SettingsPointerSlide key="settings" />,
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal whats-new-modal album-onboarding-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Getting started"
      >
        <div className="onboarding-ribbon" aria-hidden="true" />
        <div className="whats-new-head">
          <div>
            <p className="whats-new-eyebrow">Getting started</p>
            <h2 className="whats-new-title">Welcome to your album</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <Carousel
          slides={slides}
          ariaLabel="How to fill your album"
          onSkip={onClose}
          onDone={onClose}
          doneLabel="Start collecting"
        />
      </div>
    </div>
  );
}
