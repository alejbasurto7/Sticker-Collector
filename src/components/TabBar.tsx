export type Tab = 'album' | 'swaps' | 'stats' | 'trade';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  openSwaps: number;
}

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'album', icon: '📖', label: 'Album' },
  { key: 'swaps', icon: '🔄', label: 'Swaps' },
  { key: 'trade', icon: '📷', label: 'Trade' },
  { key: 'stats', icon: '📊', label: 'Stats' },
];

export default function TabBar({ active, onChange, openSwaps }: Props) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={active === t.key ? 'active' : ''}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-icon">
            {t.icon}
            {t.key === 'swaps' && openSwaps > 0 && <span className="tab-badge">{openSwaps}</span>}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
