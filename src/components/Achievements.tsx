import type { Achievement } from '../utils/stats';
import { badgeFor } from '../data/achievementBadges';

export default function Achievements({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="achievements">
      {achievements.map((a) => (
        <div key={a.key} className={`achievement ${a.unlocked ? 'unlocked' : ''}`}>
          <span className="badge">{a.unlocked ? badgeFor(a.key) : '🔒'}</span>
          <span>
            <div className="a-label">{a.label}</div>
            <div className="a-desc">{a.description}</div>
          </span>
        </div>
      ))}
    </div>
  );
}
