import { useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { APP_VERSION, APP_COMMIT, BUILD_TIME_LABEL } from '../version';
import AlbumHelpSteps from './AlbumHelpSteps';

type Screen = 'root' | 'help' | 'about';

/** `‹ Back` control shown at the top of each sub-screen. */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="settings-back" onClick={onBack} aria-label="Back to settings">
      ‹ Back
    </button>
  );
}

/** The ⚙️ Settings tab: appearance toggle + two informational sub-screens. */
export default function SettingsView() {
  const [screen, setScreen] = useState<Screen>('root');
  const theme = useCollection((s) => s.theme);
  const toggleTheme = useCollection((s) => s.toggleTheme);
  const dark = theme === 'dark';

  if (screen === 'help') {
    return (
      <div className="settings-view">
        <BackButton onBack={() => setScreen('root')} />
        <h2 className="settings-title">How to modify my album</h2>
        <AlbumHelpSteps />
      </div>
    );
  }

  if (screen === 'about') {
    return (
      <div className="settings-view">
        <BackButton onBack={() => setScreen('root')} />
        <h2 className="settings-title">About</h2>
        <section className="settings-section">
          <div className="settings-card">
            <div className="setting-row">
              <span className="setting-row-title">Version</span>
              <span className="setting-row-value">v{APP_VERSION}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-title">Build</span>
              <span className="setting-row-value">{APP_COMMIT}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-title">Built</span>
              <span className="setting-row-value">{BUILD_TIME_LABEL}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-title">Developer</span>
              <span className="setting-row-value">Alex Basurto</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // root
  return (
    <div className="settings-view">
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <h3 className="settings-heading">Appearance</h3>
        <button
          type="button"
          className="setting-toggle"
          role="switch"
          aria-checked={dark}
          onClick={toggleTheme}
        >
          <span className="setting-label">{dark ? '🌙 Dark mode' : '☀️ Light mode'}</span>
          <span className={`switch${dark ? ' on' : ''}`} aria-hidden="true">
            <span className="knob" />
          </span>
        </button>
      </section>

      <section className="settings-section">
        <div className="settings-card">
          <button type="button" className="setting-nav-row" onClick={() => setScreen('help')}>
            <span className="setting-row-title">How to modify my album</span>
            <span className="setting-nav-chevron" aria-hidden="true">›</span>
          </button>
          <button type="button" className="setting-nav-row" onClick={() => setScreen('about')}>
            <span className="setting-row-title">About</span>
            <span className="setting-nav-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </div>
  );
}
