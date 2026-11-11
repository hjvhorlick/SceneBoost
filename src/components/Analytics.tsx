import { useMemo, useState } from 'react'
import { Download, MousePointerClick, TrendingUp, Link2, Clapperboard } from 'lucide-react'
import type { AppData } from '../types'
import { formatNumber, sceneClicks, downloadText } from '../lib/utils'
import { platformById } from '../lib/platforms'
import { StatCard, PlatformPill, EmptyState } from './ui'

interface Props {
  data: AppData
}

export default function Analytics({ data }: Props) {
  const [sceneFilter, setSceneFilter] = useState<string>('all')

  const scenes = sceneFilter === 'all' ? data.scenes : data.scenes.filter((s) => s.id === sceneFilter)

  const totalClicks = scenes.reduce((s, sc) => s + sceneClicks(sc), 0)
  const totalLinks = scenes.reduce((s, sc) => s + sc.links.length, 0)
  const avgPerLink = totalLinks ? Math.round(totalClicks / totalLinks) : 0

  const platformTotals = useMemo(() => {
    const map = new Map<string, { clicks: number; links: number }>()
    scenes.forEach((sc) =>
      sc.links.forEach((l) => {
        const cur = map.get(l.platform) ?? { clicks: 0, links: 0 }
        cur.clicks += l.clicks
        cur.links += 1
        map.set(l.platform, cur)
      })
    )
    return [...map.entries()]
      .map(([id, v]) => ({ def: platformById(id as never), ...v }))
      .sort((a, b) => b.clicks - a.clicks)
  }, [scenes])

  const maxPlatform = Math.max(1, ...platformTotals.map((p) => p.clicks))

  const linkRows = useMemo(() => {
    const rows: { sceneTitle: string; slug: string; platform: string; label: string; url: string; clicks: number }[] = []
    scenes.forEach((sc) =>
      sc.links.forEach((l) =>
        rows.push({
          sceneTitle: sc.title,
          slug: sc.slug,
          platform: l.platform,
          label: l.label,
          url: l.url,
          clicks: l.clicks,
        })
      )
    )
    return rows.sort((a, b) => b.clicks - a.clicks)
  }, [scenes])

  const exportCsv = () => {
    const header = 'scene,slug,platform,label,url,clicks\n'
    const body = linkRows
      .map((r) =>
        [r.sceneTitle, r.slug, r.platform, r.label, r.url, r.clicks]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n')
    downloadText('scenboost-analytics.csv', header + body, 'text/csv')
  }

  if (data.scenes.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Analytics</h1>
            <p className="page-sub">Track clicks per platform, per scene and per link.</p>
          </div>
        </div>
        <EmptyState
          icon={<TrendingUp size={28} />}
          title="No data yet"
          body="Create a scene and add platform links — clicks from the public hub will appear here."
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="page-sub">See which platforms are actually boosting each scene.</p>
        </div>
        <div className="page-actions">
          <select value={sceneFilter} onChange={(e) => setSceneFilter(e.target.value)} className="select">
            <option value="all">All scenes</option>
            {data.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total clicks" value={formatNumber(totalClicks)} sub="In selected scope" icon={<MousePointerClick size={18} />} />
        <StatCard label="Links tracked" value={String(totalLinks)} sub="Across selected scenes" icon={<Link2 size={18} />} />
        <StatCard label="Avg clicks / link" value={formatNumber(avgPerLink)} sub="Mean performance" icon={<TrendingUp size={18} />} />
        <StatCard label="Scenes in scope" value={String(scenes.length)} sub="Live + draft + paused" icon={<Clapperboard size={18} />} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Clicks by platform</h3>
              <p>Share of total clicks</p>
            </div>
          </div>
          <div className="platform-bars">
            {platformTotals.map(({ def, clicks }) => {
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
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Scene leaderboard</h3>
              <p>Clicks per scene in scope</p>
            </div>
          </div>
          <div className="leaderboard">
            {[...scenes]
              .sort((a, b) => sceneClicks(b) - sceneClicks(a))
              .map((sc) => {
                const clicks = sceneClicks(sc)
                const pct = totalClicks ? Math.round((clicks / totalClicks) * 100) : 0
                return (
                  <div key={sc.id} className="leader-row">
                    <span className="leader-title">{sc.title}</span>
                    <span className="platform-bar-track">
                      <span style={{ width: `${totalClicks ? (clicks / totalClicks) * 100 : 0}%`, background: sc.accent }} />
                    </span>
                    <span className="leader-val">
                      {formatNumber(clicks)} · {pct}%
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>All links</h3>
            <p>Every platform link with its click count</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Scene</th>
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
                      <strong>{r.sceneTitle}</strong>
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
    </div>
  )
}
