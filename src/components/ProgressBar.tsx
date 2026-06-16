interface Props {
  label?: string;
  value?: string;
  pct: number; // 0..1
}

export default function ProgressBar({ label, value, pct }: Props) {
  const width = `${Math.round(Math.min(Math.max(pct, 0), 1) * 100)}%`;
  return (
    <div>
      {(label || value) && (
        <div className="bar-row">
          {label && <span className="label">{label}</span>}
          {value && <span className="value">{value}</span>}
        </div>
      )}
      <div className="bar">
        <span style={{ width }} />
      </div>
    </div>
  );
}
