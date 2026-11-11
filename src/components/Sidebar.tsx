import {
  LayoutDashboard,
  Clapperboard,
  BarChart3,
  Share2,
  Plug2,
  Settings,
  Zap,
  ExternalLink,
} from 'lucide-react'

export type View =
  | 'dashboard'
  | 'scenes'
  | 'editor'
  | 'analytics'
  | 'share'
  | 'platforms'
  | 'settings'

interface Props {
  view: View
  onNavigate: (v: View) => void
  sceneCount: number
  liveCount: number
}

const NAV: { id: View; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, hint: 'Overview & momentum' },
  { id: 'scenes', label: 'Scenes', icon: <Clapperboard size={18} />, hint: 'Videos & campaigns' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} />, hint: 'Clicks per platform' },
  { id: 'share', label: 'Share Kit', icon: <Share2 size={18} />, hint: 'Links, QR & embeds' },
  { id: 'platforms', label: 'Platforms', icon: <Plug2 size={18} />, hint: 'Connected accounts' },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} />, hint: 'Brand & tracking' },
]

export default function Sidebar({ view, onNavigate, sceneCount, liveCount }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Zap size={20} strokeWidth={2.6} />
        </div>
        <div>
          <div className="brand-name">SceneBoost</div>
          <div className="brand-sub">Marketing links</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id || (item.id === 'scenes' && view === 'editor') ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">
              <span className="nav-label">{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </span>
            {item.id === 'scenes' && sceneCount > 0 && <span className="nav-count">{sceneCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <div className="sidebar-card-title">
          <span className="live-dot" /> {liveCount} scene{liveCount === 1 ? '' : 's'} live
        </div>
        <p>Every live scene gets a public hub link you can drop in any bio, post or QR code.</p>
        <button className="btn btn-accent btn-sm btn-block" onClick={() => onNavigate('scenes')}>
          <ExternalLink size={14} /> Open Scenes
        </button>
      </div>

      <div className="sidebar-foot">
        <span>One link. Every platform.</span>
      </div>
    </aside>
  )
}
