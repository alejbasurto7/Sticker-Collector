import type { PageProgress } from '../utils/stats';

interface Props {
  pages: PageProgress[];
}

export default function BarChart({ pages }: Props) {
  return (
    <div className="barchart">
      {pages.map((p) => (
        <div className="row" key={p.pageId}>
          <span className="name">
            {p.emoji} {p.code}
          </span>
          <span className="track">
            <span style={{ width: `${Math.round(p.pct * 100)}%` }} />
          </span>
          <span className="pct">{Math.round(p.pct * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
