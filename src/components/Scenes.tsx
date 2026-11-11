import { useState } from 'react'
import { Plus, Search, Clapperboard, Trash2, ExternalLink, Pause, Play, Pencil } from 'lucide-react'
import type { AppData, Scene } from '../types'
import { formatNumber, sceneClicks, timeAgo } from '../lib/utils'
import { GRADIENTS, platformById } from '../lib/platforms'
import { Badge, EmptyState, PlatformPill } from './ui'

interface Props {
  data: AppData
  onCreate: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string) => void
  onOpenHub: (slug: string) => void
}

export default function Scenes({ data, onCreate, onEdit, onDelete, onToggleStatus, onOpenHub }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'draft' | 'paused'>('all')

  const filtered = data.scenes.filter((sc) => {
    const q = query.toLowerCase()
    const matchesQ = !q || sc.title.toLowerCase().includes(q) || sc.slug.includes(q)
    const matchesF = filter === 'all' || sc.status === filter
    return matchesQ && matchesF
  })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Scenes</h1>
          <p className="page-sub">Each scene is a video, drop or campaign with its own hub link and platform links.</p>
        </div>
        <button className="btn btn-accent" onClick={onCreate}>
          <Plus size={16} /> New scene
        </button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Search scenes by title or slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {(['all', 'live', 'draft', 'paused'] as const).map((f) => (
            <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Clapperboard size={28} />}
          title={data.scenes.length === 0 ? 'No scenes yet' : 'No scenes match your search'}
          body={
            data.scenes.length === 0
              ? 'Create your first scene — add a title, drop in your video link and connect every platform.'
              : 'Try a different search term or filter.'
          }
          action={
            data.scenes.length === 0 ? (
              <button className="btn btn-accent" onClick={onCreate}>
                <Plus size={16} /> Create a scene
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="scenes-grid">
          {filtered.map((sc) => (
            <SceneCard
              key={sc.id}
              scene={sc}
              onEdit={() => onEdit(sc.id)}
              onDelete={() => onDelete(sc.id)}
              onToggleStatus={() => onToggleStatus(sc.id)}
              onOpenHub={() => onOpenHub(sc.slug)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SceneCard({
  scene,
  onEdit,
  onDelete,
  onToggleStatus,
  onOpenHub,
}: {
  scene: Scene
  onEdit: () => void
  onDelete: () => void
  onToggleStatus: () => void
  onOpenHub: () => void
}) {
  const clicks = sceneClicks(scene)
  const enabledLinks = scene.links.filter((l) => l.enabled)
  return (
    <article className="scene-card">
      <div className="scene-thumb" style={{ background: GRADIENTS[scene.thumbnail] ?? GRADIENTS.mono }}>
        <div className="scene-thumb-overlay">
          <span className="scene-play">
            <Clapperboard size={20} />
          </span>
          <Badge tone={scene.status}>{scene.status}</Badge>
        </div>
        <div className="scene-thumb-title">{scene.title}</div>
      </div>

      <div className="scene-body">
        <h3>{scene.title}</h3>
        <p className="scene-desc">{scene.description || 'No description yet.'}</p>

        <div className="scene-meta">
          <span className="slug">/s/{scene.slug}</span>
          <span className="muted">· updated {timeAgo(scene.updatedAt)}</span>
        </div>

        <div className="scene-platforms">
          {enabledLinks.slice(0, 6).map((l) => {
            const def = platformById(l.platform)
            return <PlatformPill key={l.id} short={def.short} color={def.color} bg={def.bg} text={def.text} />
          })}
          {enabledLinks.length > 6 && <span className="muted">+{enabledLinks.length - 6}</span>}
          {enabledLinks.length === 0 && <span className="muted">No active links</span>}
        </div>

        <div className="scene-stats">
          <span><strong>{formatNumber(clicks)}</strong> clicks</span>
          <span><strong>{enabledLinks.length}</strong> links</span>
        </div>
      </div>

      <div className="scene-actions">
        <button className="btn btn-accent btn-sm" onClick={onEdit}>
          <Pencil size={13} /> Edit
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onOpenHub}>
          <ExternalLink size={13} /> Hub
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onToggleStatus} title={scene.status === 'live' ? 'Pause' : 'Go live'}>
          {scene.status === 'live' ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete} title="Delete scene">
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  )
}
