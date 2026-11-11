import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar, { type View } from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Scenes from './components/Scenes'
import SceneEditor from './components/SceneEditor'
import Analytics from './components/Analytics'
import ShareKit from './components/ShareKit'
import Platforms from './components/Platforms'
import Settings from './components/Settings'
import PublicHub from './components/PublicHub'
import { Modal, Toast } from './components/ui'
import { loadData, saveData, resetData } from './lib/store'
import { slugify, uid } from './lib/utils'
import type { AppData, PlatformId, Scene } from './types'

function parseHash(): { view: View; sceneId: string | null; hubSlug: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const parts = hash.split('/').filter(Boolean)

  if (parts[0] === 's' && parts[1]) {
    return { view: 'dashboard', sceneId: null, hubSlug: parts[1] }
  }
  if (parts[0] === 'scenes' && parts[1]) {
    return { view: 'editor', sceneId: parts[1], hubSlug: null }
  }
  const valid: View[] = ['dashboard', 'scenes', 'analytics', 'share', 'platforms', 'settings']
  if (valid.includes(parts[0] as View)) {
    return { view: parts[0] as View, sceneId: null, hubSlug: null }
  }
  return { view: 'dashboard', sceneId: null, hubSlug: null }
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [route, setRoute] = useState(parseHash)
  const [toast, setToast] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null)

  useEffect(() => {
    saveData(data)
  }, [data])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const notify = useCallback((msg: string) => setToast(msg), [])

  const navigate = useCallback((view: View, sceneId?: string) => {
    if (view === 'editor' && sceneId) {
      window.location.hash = `#/scenes/${sceneId}`
    } else if (view === 'scenes') {
      window.location.hash = '#/scenes'
    } else {
      window.location.hash = `#/${view}`
    }
    // hashchange will update route; also set immediately for reliability
    setRoute(parseHash())
  }, [])

  const openHub = useCallback((slug: string) => {
    window.location.hash = `#/s/${slug}`
    setRoute(parseHash())
  }, [])

  const createScene = () => {
    const title = newTitle.trim() || 'Untitled scene'
    const slugBase = slugify(title)
    const exists = data.scenes.some((s) => s.slug === slugBase)
    const scene: Scene = {
      id: uid(),
      title,
      slug: exists ? `${slugBase}-${uid().slice(0, 4)}` : slugBase,
      description: '',
      thumbnail: 'neon',
      videoUrl: '',
      status: 'draft',
      accent: data.settings.accent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      links: [],
    }
    setData((d) => ({
      ...d,
      scenes: [scene, ...d.scenes],
      activity: [
        { id: uid(), text: `New scene created: “${title}”`, time: new Date().toISOString(), kind: 'scene' as const },
        ...d.activity,
      ].slice(0, 20),
    }))
    setShowCreate(false)
    setNewTitle('')
    notify('Scene created — add your platform links')
    navigate('editor', scene.id)
  }

  const saveScene = (updated: Scene) => {
    // ensure slug uniqueness
    const clash = data.scenes.some((s) => s.id !== updated.id && s.slug === updated.slug)
    const finalScene = clash ? { ...updated, slug: `${updated.slug}-${uid().slice(0, 4)}` } : updated
    setData((d) => ({
      ...d,
      scenes: d.scenes.map((s) => (s.id === finalScene.id ? finalScene : s)),
    }))
  }

  const deleteScene = (id: string) => {
    const target = data.scenes.find((s) => s.id === id)
    setData((d) => ({
      ...d,
      scenes: d.scenes.filter((s) => s.id !== id),
      activity: [
        { id: uid(), text: `Scene deleted: “${target?.title ?? id}”`, time: new Date().toISOString(), kind: 'system' as const },
        ...d.activity,
      ].slice(0, 20),
    }))
    setDeleteTarget(null)
    notify('Scene deleted')
    if (route.view === 'editor') navigate('scenes')
  }

  const toggleStatus = (id: string) => {
    setData((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === id
          ? { ...s, status: s.status === 'live' ? ('paused' as const) : ('live' as const), updatedAt: new Date().toISOString() }
          : s
      ),
    }))
    notify('Scene status updated')
  }

  const trackClick = useCallback((sceneId: string, linkId: string) => {
    setData((d) => {
      const scene = d.scenes.find((s) => s.id === sceneId)
      const link = scene?.links.find((l) => l.id === linkId)
      return {
        ...d,
        totalClicks: d.totalClicks + 1,
        scenes: d.scenes.map((s) =>
          s.id === sceneId
            ? { ...s, links: s.links.map((l) => (l.id === linkId ? { ...l, clicks: l.clicks + 1 } : l)) }
            : s
        ),
        activity: link
          ? [
              {
                id: uid(),
                text: `${link.platform} link for “${scene?.title ?? 'scene'}” clicked`,
                time: new Date().toISOString(),
                kind: 'click' as const,
              },
              ...d.activity,
            ].slice(0, 20)
          : d.activity,
      }
    })
  }, [])

  const togglePlatform = (id: PlatformId) => {
    setData((d) => ({
      ...d,
      platforms: d.platforms.map((p) => (p.id === id ? { ...p, connected: !p.connected } : p)),
    }))
  }

  const setPlatformHandle = (id: PlatformId, handle: string) => {
    setData((d) => ({
      ...d,
      platforms: d.platforms.map((p) => (p.id === id ? { ...p, defaultHandle: handle } : p)),
    }))
  }

  // Public hub route takes over the whole screen
  const hubScene = useMemo(
    () => (route.hubSlug ? data.scenes.find((s) => s.slug === route.hubSlug) ?? null : null),
    [route.hubSlug, data.scenes]
  )

  if (route.hubSlug) {
    if (!hubScene) {
      return (
        <div className="hub-page">
          <div className="hub-topbar">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('dashboard')}>
              ← Back to app
            </button>
          </div>
          <div className="hub-wrap center-wrap">
            <h1>Scene not found</h1>
            <p className="muted">This hub link doesn’t match any scene. Check the slug or create the scene in the app.</p>
            <button className="btn btn-accent" onClick={() => navigate('scenes')}>
              Go to Scenes
            </button>
          </div>
        </div>
      )
    }
    return (
      <PublicHub
        scene={hubScene}
        defaultMedium={data.settings.defaultMedium}
        defaultCampaign={data.settings.defaultCampaign}
        brandName={data.settings.brandName}
        onBack={() => navigate('dashboard')}
        onTrackClick={trackClick}
      />
    )
  }

  const editorScene = route.view === 'editor' ? data.scenes.find((s) => s.id === route.sceneId) ?? null : null

  return (
    <div className="app-shell">
      <Sidebar
        view={route.view}
        onNavigate={(v) => navigate(v)}
        sceneCount={data.scenes.length}
        liveCount={data.scenes.filter((s) => s.status === 'live').length}
      />

      <main className="main">
        {route.view === 'dashboard' && (
          <Dashboard
            data={data}
            onNavigate={(v, id) => navigate(v as View, id)}
            onCreate={() => setShowCreate(true)}
          />
        )}

        {route.view === 'scenes' && (
          <Scenes
            data={data}
            onCreate={() => setShowCreate(true)}
            onEdit={(id) => navigate('editor', id)}
            onDelete={(id) => setDeleteTarget(data.scenes.find((s) => s.id === id) ?? null)}
            onToggleStatus={toggleStatus}
            onOpenHub={openHub}
          />
        )}

        {route.view === 'editor' &&
          (editorScene ? (
            <SceneEditor
              scene={editorScene}
              data={data}
              onBack={() => navigate('scenes')}
              onSave={saveScene}
              onDelete={(id) => setDeleteTarget(data.scenes.find((s) => s.id === id) ?? null)}
              onOpenHub={openHub}
              notify={notify}
            />
          ) : (
            <div className="page">
              <h1>Scene not found</h1>
              <p className="muted">It may have been deleted. Head back to Scenes to pick another.</p>
              <button className="btn btn-accent" onClick={() => navigate('scenes')}>
                Back to Scenes
              </button>
            </div>
          ))}

        {route.view === 'analytics' && <Analytics data={data} />}

        {route.view === 'share' && <ShareKit data={data} notify={notify} />}

        {route.view === 'platforms' && (
          <Platforms data={data} onToggle={togglePlatform} onHandle={setPlatformHandle} notify={notify} />
        )}

        {route.view === 'settings' && (
          <Settings
            data={data}
            onSave={(settings) => setData((d) => ({ ...d, settings }))}
            onReset={() => setData(resetData())}
            notify={notify}
          />
        )}
      </main>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create a new scene">
        <p className="muted" style={{ marginBottom: 16 }}>
          A scene is a video, drop or campaign. You’ll add platform links next.
        </p>
        <label className="field">
          <span>Scene title</span>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createScene()}
            placeholder="e.g. Neon Nights — Official Video"
          />
          {newTitle.trim() && <span className="field-hint">Hub URL will be /s/{slugify(newTitle)}</span>}
        </label>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-accent" onClick={createScene}>
            Create scene
          </button>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>
            Cancel
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete scene?">
        <p>
          Delete <strong>“{deleteTarget?.title}”</strong> and its {deleteTarget?.links.length ?? 0} platform links?
          This cannot be undone.
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-danger" onClick={() => deleteTarget && deleteScene(deleteTarget.id)}>
            Delete scene
          </button>
          <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
            Keep it
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  )
}
