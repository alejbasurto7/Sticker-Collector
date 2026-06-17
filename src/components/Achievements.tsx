import type { Achievement } from '../utils/stats';

const BADGES: Record<string, string> = {
  'first-sticker': '⭐',
  'first-page': '📄',
  liftoff: '🚀',
  quarter: '🥉',
  halfway: '🥈',
  'on-a-roll': '🔥',
  'home-stretch': '🥇',
  'final-push': '💎',
  complete: '🏆',
  century: '🎯',
  bookworm: '📚',
  librarian: '🗂️',
  'shiny-hunter': '✨',
  'squad-goals': '👕',
  'by-the-book': '🟦',
  'first-dupe': '🃏',
  'swap-master': '🔄',
  hoarder: '📦',
  'seeing-double': '👯',
  'first-trade': '🤝',
  'wheeler-dealer': '🔁',
  'three-day-streak': '🗓️',
  'week-warrior': '📆',
  'speed-run': '⏱️',
};

export default function Achievements({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="achievements">
      {achievements.map((a) => (
        <div key={a.key} className={`achievement ${a.unlocked ? 'unlocked' : ''}`}>
          <span className="badge">{a.unlocked ? BADGES[a.key] ?? '🎖' : '🔒'}</span>
          <span>
            <div className="a-label">{a.label}</div>
            <div className="a-desc">{a.description}</div>
          </span>
        </div>
      ))}
    </div>
  );
}
