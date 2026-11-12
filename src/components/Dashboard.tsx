import { useMemo, useState } from 'react'
import {
  MousePointerClick,
  Clapperboard,
  Link2,
  Plug2,
  ArrowRight,
  TrendingUp,
  Plus,
  Download,
} from 'lucide-react'
import type { AppData } from '../types'
import { downloadText, formatNumber, sceneClicks, timeAgo } from '../lib/utils'
import { coverStyle, platformById } from '../lib/platforms'
import { StatCard, Badge, PlatformPill } from './ui'

interface Props {
  data: AppData
  onNavigate: (v: 'posts' | 'share' | 'editor', id?: string) => void
  onCreate: () => void
}

export default function Dashboard({ data, onNavigate, onCreate }: Props) {
  const [postFilter, setPostFilter] = useState<string>('all')

  const scopedPosts = useMemo(
    () =>
      postFilter === 'all'
        ? data.scenes
        : data.scenes.filter((p) => p.id === postFilter),
    [data.scenes, postFilter]
  )

  const totalClicks = scopedPosts.reduce((s, p) => s + sceneClicks(p), 0)
  const liveCount = scopedPosts.filter((p) => p.status === 'live').length
  const totalLinks = scopedPosts.reduce((s, p) => s + p.links.filter((l) => l.enabled).length, 0)
  const connected = data.platforms.filter((p) => p.connected).length

  const sortedPosts = [...scopedPosts].sort((a, b) => sceneClicks(b) - sceneClicks(a))
  const maxPostClicks = Math.max(1, ...sortedPosts.map(sceneClicks))

  const platformRows = useMemo(() => {
    const map = new Map<string, number>()
    scopedPosts.forEach((p) =>
      p.links.forEach((l) => {
        map.set(l.platform, (map.get(l.platform) ?? 0) + l.clicks)
      })
    )
    return [...map.entries()]
      .map(([id, clicks]) => ({ def: platformById(id as never), clicks }))
      .sort((a, b) => b.clicks - a.clicks)
  }, [scopedPosts])

  const maxPlatform = Math.max(1, ...platformRows.map((r) => r.clicks))

  const linkRows = useMemo(() => {
    const rows: {
      postId: string
      postTitle: string
      slug: string
      platform: string
      label: string
      url: string
      clicks: number
    }[] = []
    scopedPosts.forEach((p) =>
      p.links.forEach((l) =>
        rows.push({
          postId: p.id,
          postTitle: p.title,
          slug: p.slug,
          platform: l.platform,
          label: l.label,
          url: l.url,
          clicks: l.clicks,
        })
      )
    )
    return rows.sort((a, b) => b.clicks - a.clicks)
  }, [scopedPosts])

  const exportCsv = () => {
    const header = 'post,slug,platform,label,url,clicks\n'
    const body = linkRows
      .map((r) =>
        [r.postTitle, r.slug, r.platform, r.label, r.url, r.clicks]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n')
    downloadText('sceneboost-post-analytics.csv', header + body, 'text/csv')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">
            {data.settings.brandName} · {data.settings.handle} — overview and click analytics across all your posts and platforms.
          </p>
        </div>
        <div className="page-actions">
          {data.scenes.length > 0 && (
            <>
              <select
                value={postFilter}
                onChange={(e) => setPostFilter(e.target.value)}
                className="select"
              >
                <option value="all">All posts</option>
                {data.scenes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost" onClick={exportCsv}>
                <Download size={15} /> Export CSV
              </button>
            </>
          )}
          <button className="btn btn-accent" onClick={onCreate}>
            <Plus size={16} /> New post
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total clicks"
          value={formatNumber(totalClicks)}
          sub={postFilter === 'all' ? 'Across all posts & platforms' : 'Selected post'}
          icon={<MousePointerClick size={18} />}
        />
        <StatCard
          label="Posts"
          value={String(scopedPosts.length)}
          sub={`${liveCount} live · ${scopedPosts.length - liveCount} draft/paused`}
          icon={<Clapperboard size={18} />}
        />
        <StatCard
          label="Active links"
          value={String(totalLinks)}
          sub="Enabled platform links"
          icon={<Link2 size={18} />}
        />
        <StatCard
          label="Platforms connected"
          value={`${connected} / ${data.platforms.length}`}
          sub="Social + video accounts"
          icon={<Plug2 size={18} />}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Top posts</h3>
              <p>Ranked by tracked clicks</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('posts')}>
              All posts <ArrowRight size={14} />
            </button>
          </div>

          {sortedPosts.length === 0 ? (
            <p className="muted">No posts yet. Create your first post to start boosting YouTube views.</p>
          ) : (
            <div className="scene-rank">
              {sortedPosts.map((post, i) => {
                const clicks = sceneClicks(post)
                return (
                  <button
                    key={post.id}
                    className="rank-row"
                    onClick={() => onNavigate('editor', post.id)}
                  >
                    <span className="rank-num">{i + 1}</span>
                    <span className="rank-thumb" style={coverStyle(post.thumbnail, 'card')}>
                      <Clapperboard size={16} />
                    </span>
                    <span className="rank-main">
                      <span className="rank-title">{post.title}</span>
                      <span className="rank-bar">
                        <span
                          style={{
                            width: `${Math.max(4, (clicks / maxPostClicks) * 100)}%`,
                            background: post.accent,
                          }}
                        />
                      </span>
                    </span>
                    <span className="rank-clicks">{formatNumber(clicks)}</span>
                    <Badge tone={post.status}>{post.status}</Badge>
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
              <p>Share of clicks across channels</p>
            </div>
            <TrendingUp size={18} className="muted-icon" />
          </div>
          <div className="platform-bars">
            {platformRows.length === 0 && <p className="muted">No platform clicks yet.</p>}
            {platformRows.map(({ def, clicks }) => {
              const pct = totalClicks ? Math.round((clicks / totalClicks) * 100) : 0
              return (
                <div key={def.id} className="platform-bar-row">
                  <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />
                  <span className="platform-bar-name">{def.name}</span>
                  <span className="platform-bar-track">
                    <span style={{ width: `${(clicks / maxPlatform) * 100}%`, background: def.color }} />
                  </span>
                  <span className="platform-bar-val">
                    {formatNumber(clicks)} · {pct}%
                  </span>
                </div>
              )
            })}
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

      {linkRows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>All tracked links</h3>
              <p>Every platform link with its click count</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Platform</th>
                  <th>Label</th>
                  <th>Destination</th>
                  <th style={{ textAlign: 'right' }}>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {linkRows.map((r, i) => {
                  const def = platformById(r.platform as never)
                  return (
                    <tr key={i}>
                      <td>
                        <button
                          type="button"
                          className="link-toggle-btn"
                          style={{ color: 'var(--text)' }}
                          onClick={() => onNavigate('editor', r.postId)}
                        >
                          <strong>{r.postTitle}</strong>
                        </button>
                        <div className="muted small">/s/{r.slug}</div>
                      </td>
                      <td>
                        <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} /> {def.name}
                      </td>
                      <td>{r.label}</td>
                      <td className="muted cell-url">{r.url || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{formatNumber(r.clicks)}</strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card hero-card">
        <div className="hero-copy">
          <Badge tone="accent">How SceneBoost works</Badge>
          <h2>Post to YouTube first. Boost everywhere.</h2>
          <p>
            Fetch your video, credits, top description and thumbnail from your Scenering folder, generate SEO-friendly
            tags with Gemini, upload the 4 items to YouTube, and create native social posts that play the video in YouTube.
          </p>
          <div className="hero-steps">
            <span><strong>1</strong> Fetch Scenering folder</span>
            <span><strong>2</strong> Upload 4 items to YouTube</span>
            <span><strong>3</strong> Paste YouTube link</span>
            <span><strong>4</strong> Fetch social posts</span>
          </div>
        </div>
        <div className="hero-actions">
          <button className="btn btn-accent" onClick={onCreate}>
            <Plus size={16} /> Create a new post
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('share')}>
            Open Share Kit <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
