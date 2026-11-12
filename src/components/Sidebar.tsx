import {
  LayoutDashboard,
  Clapperboard,
  Share2,
  Plug2,
  Settings,
  Zap,
  ExternalLink,
} from 'lucide-react'

export type View =
  | 'dashboard'
  | 'posts'
  | 'editor'
  | 'share'
  | 'platforms'
  | 'settings'

interface Props {
  view: View
  onNavigate: (v: View) => void
  postCount: number
  liveCount: number
}

const NAV: { id: View; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, hint: 'Stats & click analytics' },
  { id: 'posts', label: 'Posts', icon: <Clapperboard size={18} />, hint: 'YouTube & social posts' },
  { id: 'share', label: 'Share Kit', icon: <Share2 size={18} />, hint: 'Links, QR & captions' },
  { id: 'platforms', label: 'Platforms', icon: <Plug2 size={18} />, hint: 'Connected accounts' },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} />, hint: 'Brand & Gemini key' },
]

export default function Sidebar({ view, onNavigate, postCount, liveCount }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Zap size={20} strokeWidth={2.6} />
        </div>
        <div>
          <div className="brand-name">SceneBoost</div>
          <div className="brand-sub">YouTube &amp; social boost</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id || (item.id === 'posts' && view === 'editor') ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">
              <span className="nav-label">{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </span>
            {item.id === 'posts' && postCount > 0 && <span className="nav-count">{postCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <div className="sidebar-card-title">
          <span className="live-dot" /> {liveCount} post{liveCount === 1 ? '' : 's'} live
        </div>
        <p>Publish to YouTube first, then share every post across your social channels to drive views in YouTube.</p>
        <button className="btn btn-accent btn-sm btn-block" onClick={() => onNavigate('posts')}>
          <ExternalLink size={14} /> Open Posts
        </button>
      </div>

      <div className="sidebar-foot">
        <span>YouTube first. Boost everywhere.</span>
      </div>
    </aside>
  )
}
