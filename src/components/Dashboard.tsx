import { MousePointerClick, Clapperboard, Link2, Plug2, ArrowRight, TrendingUp, Plus } from 'lucide-react'
import type { AppData } from '../types'
import { formatNumber, sceneClicks, timeAgo } from '../lib/utils'
import { platformById, GRADIENTS } from '../lib/platforms'
import { StatCard, Badge, PlatformPill } from './ui'

interface Props {
  data: AppData
  onNavigate: (v: 'scenes' | 'analytics' | 'share' | 'editor', id?: string) => void
  onCreate: () => void
}

export default function Dashboard({ data, onNavigate, onCreate }: Props) {
  const totalClicks = data.scenes.reduce((s, sc) => s + sceneClicks(sc), 0)
  const liveCount = data.scenes.filter((s) => s.status === 'live').length
  const totalLinks = data.scenes.reduce((s, sc) => s + sc.links.filter((l) => l.enabled).length, 0)
  const connected = data.platforms.filter((p) => p.connected).length

  const sorted = [...data.scenes].sort((a, b) => sceneClicks(b) - sceneClicks(a))
  const maxClicks = Math.max(1, ...sorted.map(sceneClicks))

  // platform totals
  const platformTotals = new Map<string, number>()
  data.scenes.forEach((sc) =>
    sc.links.forEach((l) => {
      platformTotals.set(l.platform, (platformTotals.get(l.platform) ?? 0) + l.clicks)
    })
  )
  const platformRows = [...platformTotals.entries()]
    .map(([id, clicks]) => ({ def: platformById(id as never), clicks }))
    .sort((a, b) => b.clicks - a.clicks)
  const maxPlatform = Math.max(1, ...platformRows.map((r) => r.clicks))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Good to see you back 👋</h1>
          <p className="page-sub">
            {data.settings.brandName} · {data.settings.handle} — here’s how your scenes are travelling across platforms.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => onNavigate('analytics')}>
            View analytics <ArrowRight size={15} />
          </button>
          <button className="btn btn-accent" onClick={onCreate}>
            <Plus size={16} /> New scene
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total clicks" value={formatNumber(totalClicks)} sub="Across all scenes & platforms" icon={<MousePointerClick size={18} />} />
        <StatCard label="Scenes" value={String(data.scenes.length)} sub={`${liveCount} live · ${data.scenes.length - liveCount} not live`} icon={<Clapperboard size={18} />} />
        <StatCard label="Active links" value={String(totalLinks)} sub="Enabled platform links" icon={<Link2 size={18} />} />
        <StatCard label="Platforms connected" value={`${connected} / ${data.platforms.length}`} sub="Social + video accounts" icon={<Plug2 size={18} />} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Top scenes</h3>
              <p>Ranked by tracked clicks</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('scenes')}>
              All scenes <ArrowRight size={14} />
            </button>
          </div>

          {sorted.length === 0 ? (
            <p className="muted">No scenes yet. Create your first scene to start tracking clicks.</p>
          ) : (
            <div className="scene-rank">
              {sorted.map((sc, i) => {
                const clicks = sceneClicks(sc)
                return (
                  <button key={sc.id} className="rank-row" onClick={() => onNavigate('editor', sc.id)}>
                    <span className="rank-num">{i + 1}</span>
                    <span className="rank-thumb" style={{ background: GRADIENTS[sc.thumbnail] ?? GRADIENTS.mono }}>
                      <Clapperboard size={16} />
                    </span>
                    <span className="rank-main">
                      <span className="rank-title">{sc.title}</span>
                      <span className="rank-bar">
                        <span style={{ width: `${Math.max(4, (clicks / maxClicks) * 100)}%`, background: sc.accent }} />
                      </span>
                    </span>
                    <span className="rank-clicks">{formatNumber(clicks)}</span>
                    <Badge tone={sc.status}>{sc.status}</Badge>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Clicks by platform</h3>
              <p>Where fans are actually clicking</p>
            </div>
            <TrendingUp size={18} className="muted-icon" />
          </div>
          <div className="platform-bars">
            {platformRows.length === 0 && <p className="muted">No platform clicks yet.</p>}
            {platformRows.map(({ def, clicks }) => (
              <div key={def.id} className="platform-bar-row">
                <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />
                <span className="platform-bar-name">{def.name}</span>
                <span className="platform-bar-track">
                  <span style={{ width: `${(clicks / maxPlatform) * 100}%`, background: def.color }} />
                </span>
                <span className="platform-bar-val">{formatNumber(clicks)}</span>
              </div>
            ))}
          </div>

          <div className="divider" />
          <h4 className="section-label">Recent activity</h4>
          <div className="activity-list">
            {data.activity.slice(0, 5).map((a) => (
              <div key={a.id} className="activity-row">
                <span className={`activity-dot activity-${a.kind}`} />
                <span className="activity-text">{a.text}</span>
                <span className="activity-time">{timeAgo(a.time)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card hero-card">
        <div className="hero-copy">
          <Badge tone="accent">How SceneBoost works</Badge>
          <h2>One scene. One link. Every platform.</h2>
          <p>
            Create a scene for your video or drop, add a link for each platform, and share a single hub link
            everywhere — bios, captions, QR codes and press releases. Every click is tracked with UTMs so you
            know which platform is actually boosting the scene.
          </p>
          <div className="hero-steps">
            <span><strong>1</strong> Create a scene</span>
            <span><strong>2</strong> Add platform links</span>
            <span><strong>3</strong> Share the hub link</span>
            <span><strong>4</strong> Watch clicks roll in</span>
          </div>
        </div>
        <div className="hero-actions">
          <button className="btn btn-accent" onClick={onCreate}>
            <Plus size={16} /> Create your first scene
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('share')}>
            <Share2Icon /> Open Share Kit
          </button>
        </div>
      </div>
    </div>
  )
}

function Share2Icon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}
