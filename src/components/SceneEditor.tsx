import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  Link2,
  Eye,
  GripVertical,
  X,
  Check,
  ExternalLink,
  Copy,
  FolderOpen,
  FileText,
  MessageSquare,
  ImagePlus,
} from 'lucide-react'
import type { AppData, PlatformId, Scene, SceneLink } from '../types'
import { PLATFORMS, COVER_THEMES, ACCENTS, coverStyle, platformById } from '../lib/platforms'
import {
  POST_TEMPLATE_PLATFORMS,
  buildPostWording,
  parseSceneringFiles,
  type PostTemplatePlatform,
} from '../lib/scenering'
import { buildTrackedUrl, copyText, hubUrl, slugify, uid } from '../lib/utils'
import { Badge, PlatformPill } from './ui'

interface Props {
  scene: Scene
  data: AppData
  onBack: () => void
  onSave: (scene: Scene) => void
  onDelete: (id: string) => void
  onOpenHub: (slug: string) => void
  notify: (msg: string) => void
}

export default function SceneEditor({ scene, data, onBack, onSave, onDelete, onOpenHub, notify }: Props) {
  const [draft, setDraft] = useState<Scene>(scene)
  const [slugTouched, setSlugTouched] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [wordingPlatform, setWordingPlatform] = useState<PostTemplatePlatform>('youtube')
  const [includeCredits, setIncludeCredits] = useState(false)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  const handleCustomCoverUpload = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxW = 960
        const scale = Math.min(1, maxW / Math.max(1, img.width))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        set('thumbnail', dataUrl)
        notify('Custom hub cover image applied ✓')
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleImportScenering = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const imported = await parseSceneringFiles(files)
    setDraft((d) => {
      const shouldUpdateTitle =
        imported.title && (!d.title.trim() || d.title === 'Untitled scene')
      const nextTitle = shouldUpdateTitle ? imported.title : d.title
      const nextSlug =
        shouldUpdateTitle && !slugTouched ? slugify(imported.title) : d.slug
      return {
        ...d,
        title: nextTitle,
        slug: nextSlug,
        description: imported.shortDescription || d.description,
        credits: imported.credits || d.credits,
        videoFileName: imported.videoFileName || d.videoFileName,
        updatedAt: new Date().toISOString(),
      }
    })
    if (imported.shortDescription) {
      notify(`Loaded short description from ${imported.sourceSummary} ✓`)
    } else if (imported.title || imported.credits || imported.videoFileName) {
      notify(`Imported ${imported.sourceSummary} — add or tweak short description below`)
    } else {
      notify('No credits or description text found in selected files')
    }
  }

  useEffect(() => {
    setDraft(scene)
    setSlugTouched(false)
  }, [scene.id])

  const dirty = JSON.stringify(draft) !== JSON.stringify(scene)

  const set = <K extends keyof Scene>(key: K, value: Scene[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value, updatedAt: new Date().toISOString() }
      if (key === 'title' && !slugTouched && typeof value === 'string') {
        next.slug = slugify(value)
      }
      return next
    })
  }

  const addLink = (platform: PlatformId) => {
    const def = platformById(platform)
    const existing = draft.links.filter((l) => l.platform === platform).length
    const link: SceneLink = {
      id: uid(),
      platform,
      label: existing === 0 ? `Watch on ${def.name}` : `${def.name} link ${existing + 1}`,
      url: '',
      enabled: true,
      clicks: 0,
      order: draft.links.length,
    }
    setDraft((d) => ({ ...d, links: [...d.links, link] }))
  }

  const updateLink = (id: string, patch: Partial<SceneLink>) => {
    setDraft((d) => ({
      ...d,
      links: d.links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      updatedAt: new Date().toISOString(),
    }))
  }

  const removeLink = (id: string) => {
    setDraft((d) => ({ ...d, links: d.links.filter((l) => l.id !== id) }))
  }

  const moveLink = (id: string, dir: -1 | 1) => {
    setDraft((d) => {
      const links = [...d.links].sort((a, b) => a.order - b.order)
      const idx = links.findIndex((l) => l.id === id)
      const swap = idx + dir
      if (idx < 0 || swap < 0 || swap >= links.length) return d
      const tmp = links[idx].order
      links[idx] = { ...links[idx], order: links[swap].order }
      links[swap] = { ...links[swap], order: tmp }
      return { ...d, links }
    })
  }

  const tracked = useMemo(
    () =>
      draft.links.map((l) => ({
        link: l,
        url: buildTrackedUrl(l.url, {
          source: platformById(l.platform).utmSource,
          medium: data.settings.defaultMedium,
          campaign: data.settings.defaultCampaign,
          content: draft.slug,
        }),
      })),
    [draft.links, draft.slug, data.settings]
  )

  const handleSave = () => {
    if (!draft.title.trim()) {
      notify('Add a title before saving.')
      return
    }
    onSave(draft)
    notify('Scene saved ✓')
  }

  const handleCopyHub = async () => {
    const ok = await copyText(hubUrl(draft.slug))
    setCopied('hub')
    notify(ok ? 'Hub link copied' : 'Copy failed — select the link manually')
    setTimeout(() => setCopied(null), 1600)
  }

  const usedPlatforms = new Set(draft.links.map((l) => l.platform))
  const connectedIds = useMemo(
    () => new Set(data.platforms.filter((p) => p.connected).map((p) => p.id)),
    [data.platforms]
  )
  const orderedPlatforms = useMemo(
    () =>
      [...PLATFORMS].sort(
        (a, b) => Number(connectedIds.has(b.id)) - Number(connectedIds.has(a.id))
      ),
    [connectedIds]
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={15} /> All scenes
          </button>
          <h1>{draft.title || 'Untitled scene'}</h1>
          <p className="page-sub">
            Edit details, add platform links and preview how fans will see this scene.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => onOpenHub(draft.slug)}>
            <Eye size={15} /> Preview hub
          </button>
          <button className="btn btn-danger" onClick={() => onDelete(draft.id)}>
            <Trash2 size={15} /> Delete
          </button>
          <button className="btn btn-accent" onClick={handleSave} disabled={!dirty}>
            <Save size={15} /> {dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      <div className="editor-grid">
        <div className="editor-main">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Scene details</h3>
                <p>What fans see at the top of the hub</p>
              </div>
              <Badge tone={draft.status}>{draft.status}</Badge>
            </div>

            <div className="scenering-import-bar">
              <div>
                <strong>Scenering saved folder</strong>
                <p className="muted small">
                  Pick your <code>Videos/Scenering/&lt;Video Name&gt;</code> folder (or its credits file) to pull the video name, short description and credits straight into this post.
                </p>
                {draft.videoFileName && (
                  <p className="small" style={{ marginTop: 4, color: 'var(--accent)' }}>
                    🎬 Video in folder: <code>{draft.videoFileName}</code>
                  </p>
                )}
              </div>
              <div className="btn-row">
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                  onChange={(e) => {
                    void handleImportScenering(e.target.files)
                    e.target.value = ''
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.json,.md"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void handleImportScenering(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderOpen size={14} /> Select folder
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileText size={14} /> Credits (.txt)
                </button>
              </div>
            </div>

            <label className="field">
              <span>Title</span>
              <input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Neon Nights — Official Video" />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Slug (hub URL)</span>
                <div className="slug-input">
                  <span>/s/</span>
                  <input
                    value={draft.slug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))
                    }}
                  />
                </div>
              </label>
              <label className="field">
                <span>Status</span>
                <select value={draft.status} onChange={(e) => set('status', e.target.value as Scene['status'])}>
                  <option value="live">Live</option>
                  <option value="draft">Draft</option>
                  <option value="paused">Paused</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Short description (included in post wording &amp; hub)</span>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Short description from your Scenering credits (or write one here — automatically added to every post caption)…"
              />
            </label>

            <label className="field">
              <span>Main video URL (optional)</span>
              <input value={draft.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://youtube.com/watch?v=…" />
            </label>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span>Hub cover artwork (Scenering themes)</span>
                <div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      handleCustomCoverUpload(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <ImagePlus size={13} /> Custom image
                  </button>
                </div>
              </div>
              <div className="cover-themes-grid">
                {COVER_THEMES.map((theme) => {
                  const active = draft.thumbnail === theme.id
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`cover-theme-card ${active ? 'active' : ''}`}
                      style={coverStyle(theme.id, 'swatch')}
                      onClick={() => set('thumbnail', theme.id)}
                      title={theme.label}
                      aria-label={`Cover ${theme.label}`}
                    >
                      <span className="cover-theme-check">
                        {active && <Check size={13} />}
                      </span>
                      <span className="cover-theme-label">{theme.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="field">
              <span>Accent colour</span>
              <div className="swatches">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch swatch-dot ${draft.accent === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => set('accent', c)}
                    title={c}
                    aria-label={`Accent ${c}`}
                  >
                    {draft.accent === c && <Check size={14} color="#070A12" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Platform links</h3>
                <p>One link per platform — UTMs are added automatically</p>
              </div>
              <span className="muted">{draft.links.filter((l) => l.enabled).length} active</span>
            </div>

            <div className="add-platforms">
              {orderedPlatforms.map((p) => (
                <button
                  key={p.id}
                  className={`add-platform ${usedPlatforms.has(p.id) ? 'used' : ''}`}
                  onClick={() => addLink(p.id)}
                  title={p.hint}
                >
                  <PlatformPill short={p.short} color={p.color} bg={p.bg} text={p.text} />
                  <span>{p.name}</span>
                  <Plus size={13} />
                </button>
              ))}
            </div>

            {draft.links.length === 0 && (
              <p className="muted" style={{ marginTop: 12 }}>
                No links yet. Add a platform above — for example YouTube and TikTok — then paste the URL for each.
              </p>
            )}

            <div className="link-list">
              {[...draft.links]
                .sort((a, b) => a.order - b.order)
                .map((link) => {
                  const def = platformById(link.platform)
                  const t = tracked.find((x) => x.link.id === link.id)?.url ?? ''
                  return (
                    <div key={link.id} className={`link-row ${link.enabled ? '' : 'disabled'}`}>
                      <div className="link-row-head">
                        <GripVertical size={15} className="grip" />
                        <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />
                        <strong>{def.name}</strong>
                        <span className="muted">{link.clicks} clicks</span>
                        <span className="spacer" />
                        <button className="btn btn-ghost btn-sm" onClick={() => moveLink(link.id, -1)} title="Move up">↑</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => moveLink(link.id, 1)} title="Move down">↓</button>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={link.enabled}
                            onChange={(e) => updateLink(link.id, { enabled: e.target.checked })}
                          />
                          <span className="toggle-track"><span className="toggle-thumb" /></span>
                        </label>
                        <button className="icon-btn danger" onClick={() => removeLink(link.id)} title="Remove link">
                          <X size={15} />
                        </button>
                      </div>
                      <div className="link-fields">
                        <label className="field">
                          <span>Button label</span>
                          <input value={link.label} onChange={(e) => updateLink(link.id, { label: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Destination URL</span>
                          <input
                            value={link.url}
                            onChange={(e) => updateLink(link.id, { url: e.target.value })}
                            placeholder={def.placeholder}
                          />
                        </label>
                      </div>
                      {link.url.trim() && (
                        <div className="tracked-url">
                          <Link2 size={13} />
                          <code>{t}</code>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              await copyText(t)
                              setCopied(link.id)
                              notify('Tracked link copied')
                              setTimeout(() => setCopied(null), 1600)
                            }}
                          >
                            {copied === link.id ? <Check size={13} /> : <Copy size={13} />} Copy
                          </button>
                          <a className="btn btn-ghost btn-sm" href={t} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Open
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Post wording</h3>
                <p>Ready-to-paste caption with your short description built in</p>
              </div>
              <MessageSquare size={18} className="muted-icon" />
            </div>

            <div className="filter-tabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              {POST_TEMPLATE_PLATFORMS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`filter-tab ${wordingPlatform === id ? 'active' : ''}`}
                  onClick={() => setWordingPlatform(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {draft.credits?.trim() &&
              (wordingPlatform === 'youtube' || wordingPlatform === 'vimeo' || wordingPlatform === 'facebook') && (
                <label className="inline-check" style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={includeCredits}
                    onChange={(e) => setIncludeCredits(e.target.checked)}
                  />
                  <span>Append Scenering media credits (<code>📢 CREDITS &amp; ATTRIBUTIONS</code>)</span>
                </label>
              )}

            <pre className="code-block tall">
              {buildPostWording(draft, hubUrl(draft.slug), wordingPlatform, includeCredits)}
            </pre>

            <button
              type="button"
              className="btn btn-accent btn-sm"
              onClick={async () => {
                const text = buildPostWording(draft, hubUrl(draft.slug), wordingPlatform, includeCredits)
                const ok = await copyText(text)
                setCopied('wording')
                notify(ok ? 'Post wording copied ✓' : 'Copy failed — select the text manually')
                setTimeout(() => setCopied(null), 1600)
              }}
            >
              {copied === 'wording' ? <Check size={14} /> : <Copy size={14} />} Copy post wording
            </button>
          </div>
        </div>

        <aside className="editor-side">
          <div className="card sticky-card">
            <div className="card-head">
              <div>
                <h3>Hub link</h3>
                <p>Share this everywhere</p>
              </div>
            </div>
            <div className="hub-link-box">
              <code>{hubUrl(draft.slug)}</code>
            </div>
            <div className="btn-row">
              <button className="btn btn-accent btn-sm" onClick={handleCopyHub}>
                {copied === 'hub' ? <Check size={14} /> : <Copy size={14} />} Copy hub link
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onOpenHub(draft.slug)}>
                <ExternalLink size={14} /> Open hub
              </button>
            </div>

            <div className="divider" />
            <h4 className="section-label">Live preview</h4>
            <div className="phone-preview">
              <div className="phone-hero" style={coverStyle(draft.thumbnail, 'hero')}>
                <Badge tone={draft.status}>{draft.status}</Badge>
                <div className="phone-hero-title">{draft.title || 'Your scene title'}</div>
              </div>
              <div className="phone-body">
                <p>{draft.description || 'Your scene description will appear here…'}</p>
                {[...draft.links]
                  .sort((a, b) => a.order - b.order)
                  .filter((l) => l.enabled)
                  .map((l) => {
                    const def = platformById(l.platform)
                    return (
                      <div key={l.id} className="phone-link" style={{ borderColor: def.color + '66' }}>
                        <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />
                        <span>{l.label}</span>
                        <ExternalLink size={13} />
                      </div>
                    )
                  })}
                {draft.links.filter((l) => l.enabled).length === 0 && (
                  <p className="muted">Add an enabled link to see buttons here.</p>
                )}
              </div>
              <div className="phone-foot" style={{ color: draft.accent }}>
                Powered by SceneBoost
              </div>
            </div>

            <p className="muted small">
              Tip: save before sharing — the hub always shows the last saved version.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
