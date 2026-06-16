import type { CollectorSkill } from '../utils/stats';

const BADGES: Record<string, string> = {
  'first-sticker': '⭐',
  'first-page': '📄',
  quarter: '🥉',
  halfway: '🥈',
  'swap-master': '🔄',
  'home-stretch': '🥇',
  complete: '🏆',
};

export default function CollectorSkills({ skills }: { skills: CollectorSkill[] }) {
  return (
    <div className="skills">
      {skills.map((s) => (
        <div key={s.key} className={`skill ${s.unlocked ? 'unlocked' : ''}`}>
          <span className="badge">{s.unlocked ? BADGES[s.key] ?? '🎖' : '🔒'}</span>
          <span>
            <div className="s-label">{s.label}</div>
            <div className="s-desc">{s.description}</div>
          </span>
        </div>
      ))}
    </div>
  );
}
