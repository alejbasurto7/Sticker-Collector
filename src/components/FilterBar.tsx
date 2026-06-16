export type AlbumFilter = 'all' | 'missing' | 'swaps';

interface Props {
  value: AlbumFilter;
  onChange: (f: AlbumFilter) => void;
  counts: { all: number; missing: number; swaps: number };
}

const OPTIONS: { key: AlbumFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'swaps', label: 'Swaps' },
];

export default function FilterBar({ value, onChange, counts }: Props) {
  return (
    <div className="filterbar">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          className={value === o.key ? 'active' : ''}
          onClick={() => onChange(o.key)}
        >
          {o.label} ({counts[o.key]})
        </button>
      ))}
    </div>
  );
}
