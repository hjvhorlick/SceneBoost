import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, FileText, ImagePlus } from 'lucide-react'
import Sidebar, { type View } from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Scenes from './components/Scenes'
import SceneEditor from './components/SceneEditor'
import ShareKit from './components/ShareKit'
import Platforms from './components/Platforms'
import Settings from './components/Settings'
import PublicHub from './components/PublicHub'
import { Modal, Toast } from './components/ui'
import {
  generateYoutubeRankingTags,
  parseSceneringFiles,
  renderImageFileToYoutubeThumbnail,
} from './lib/scenering'
import { loadData, saveData, resetData } from './lib/store'
import { slugify, uid } from './lib/utils'
import type { AppData, PlatformId, Scene, SceneLink } from './types'

function parseHash(): { view: View; sceneId: string | null; hubSlug: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const parts = hash.split('/').filter(Boolean)

  if (parts[0] === 's' && parts[1]) {
    return { view: 'dashboard', sceneId: null, hubSlug: parts[1] }
  }
  if ((parts[0] === 'posts' || parts[0] === 'scenes') && parts[1]) {
    return { view: 'editor', sceneId: parts[1], hubSlug: null }
  }
  if (parts[0] === 'scenes') {
    return { view: 'posts', sceneId: null, hubSlug: null }
  }
  if (parts[0] === 'analytics') {
    return { view: 'dashboard', sceneId: null, hubSlug: null }
  }
  const valid: View[] = ['dashboard', 'posts', 'share', 'platforms', 'settings']
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
  const [newThumbDataUrl, setNewThumbDataUrl] = useState('')
  const [newThumbName, setNewThumbName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null)
  const createFolderRef = useRef<HTMLInputElement | null>(null)
  const createFileRef = useRef<HTMLInputElement | null>(null)
  const createThumbRef = useRef<HTMLInputElement | null>(null)
  const videoFilesByPostRef = useRef<Map<string, File>>(new Map())

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
      window.location.hash = `#/posts/${sceneId}`
    } else if (view === 'posts') {
      window.location.hash = '#/posts'
    } else {
      window.location.hash = `#/${view}`
    }
    setRoute(parseHash())
  }, [])

  const openHub = useCallback((slug: string) => {
    window.location.hash = `#/s/${slug}`
    setRoute(parseHash())
  }, [])

  const buildInitialSceneLinks = useCallback((): SceneLink[] => {
    const ytUrl =
      data.platforms.find((p) => p.id === 'youtube')?.defaultHandle?.trim() ||
      'https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ'
    const webPlatform = data.platforms.find((p) => p.id === 'website')
    const links: SceneLink[] = [
      {
        id: uid(),
        platform: 'youtube',
        label: 'Watch Full Video on YouTube',
        url: ytUrl,
        enabled: true,
        clicks: 0,
        order: 0,
      },
    ]
    if (webPlatform?.connected && webPlatform.defaultHandle.trim()) {
      links.push({
        id: uid(),
        platform: 'website',
        label: 'Visit Scenering',
        url: webPlatform.defaultHandle.trim(),
        enabled: true,
        clicks: 0,
        order: 1,
      })
    }
    return links
  }, [data.platforms])

  const createScene = () => {
    const title = newTitle.trim() || 'Untitled post'
    const slugBase = slugify(title)
    const exists = data.scenes.some((s) => s.slug === slugBase)
    const scene: Scene = {
      id: uid(),
      title,
      slug: exists ? `${slugBase}-${uid().slice(0, 4)}` : slugBase,
      description: '',
      tags: generateYoutubeRankingTags({ title }),
      thumbnail: newThumbDataUrl || 'neon',
      thumbnailFileName: newThumbName || undefined,
      videoUrl: '',
      status: 'draft',
      accent: data.settings.accent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      links: buildInitialSceneLinks(),
    }
    setData((d) => ({
      ...d,
      scenes: [scene, ...d.scenes],
      activity: [
        { id: uid(), text: `New post created: “${title}”`, time: new Date().toISOString(), kind: 'scene' as const },
        ...d.activity,
      ].slice(0, 20),
    }))
    setShowCreate(false)
    setNewTitle('')
    setNewThumbDataUrl('')
    setNewThumbName('')
    notify('Post created — prepare your 4 YouTube items first!')
    navigate('editor', scene.id)
  }

  const createSceneFromScenering = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const imported = await parseSceneringFiles(files)
    const title = (newTitle.trim() || imported.title || 'Untitled post').trim()
    const slugBase = slugify(title)
    const exists = data.scenes.some((s) => s.slug === slugBase)
    const hasThumb = Boolean(newThumbDataUrl || imported.thumbnailFoundInFolder)
    const sceneId = uid()
    if (imported.videoFile) {
      videoFilesByPostRef.current.set(sceneId, imported.videoFile)
    }
    const scene: Scene = {
      id: sceneId,
      title,
      slug: exists ? `${slugBase}-${uid().slice(0, 4)}` : slugBase,
      description: imported.shortDescription || '',
      tags: imported.tags,
      credits: imported.credits || undefined,
      videoFileName: imported.videoFileName || undefined,
      videoSizeBytes: imported.videoSizeBytes || undefined,
      thumbnail: newThumbDataUrl || imported.thumbnailDataUrl || 'neon',
      thumbnailFileName: newThumbName || imported.thumbnailFileName || undefined,
      thumbnailMissing: !hasThumb,
      videoUrl: '',
      status: 'draft',
      accent: data.settings.accent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      links: buildInitialSceneLinks(),
    }
    setData((d) => ({
      ...d,
      scenes: [scene, ...d.scenes],
      activity: [
        { id: uid(), text: `Post imported from Scenering: “${title}”`, time: new Date().toISOString(), kind: 'scene' as const },
        ...d.activity,
      ].slice(0, 20),
    }))
    setShowCreate(false)
    setNewTitle('')
    setNewThumbDataUrl('')
    setNewThumbName('')
    notify(
      hasThumb
        ? 'Fetched video, credits, top description & thumbnail ✓'
        : 'Fetched video & credits — upload a thumbnail in Item 3'
    )
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
        { id: uid(), text: `Post deleted: “${target?.title ?? id}”`, time: new Date().toISOString(), kind: 'system' as const },
        ...d.activity,
      ].slice(0, 20),
    }))
    setDeleteTarget(null)
    notify('Post deleted')
    if (route.view === 'editor') navigate('posts')
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
    notify('Post status updated')
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
                text: `${link.platform} link for “${scene?.title ?? 'post'}” clicked`,
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
    setData((d) => {
      const exists = d.platforms.some((p) => p.id === id)
      return {
        ...d,
        platforms: exists
          ? d.platforms.map((p) => (p.id === id ? { ...p, connected: !p.connected } : p))
          : [...d.platforms, { id, connected: true, defaultHandle: '' }],
      }
    })
  }

  const setPlatformHandle = (id: PlatformId, handle: string) => {
    setData((d) => {
      const exists = d.platforms.some((p) => p.id === id)
      return {
        ...d,
        platforms: exists
          ? d.platforms.map((p) => (p.id === id ? { ...p, defaultHandle: handle } : p))
          : [...d.platforms, { id, connected: true, defaultHandle: handle }],
      }
    })
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
            <h1>Post not found</h1>
            <p className="muted">This hub link doesn’t match any post. Check the slug or create the post in the app.</p>
            <button className="btn btn-accent" onClick={() => navigate('posts')}>
              Go to Posts
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
        postCount={data.scenes.length}
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

        {route.view === 'posts' && (
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
              initialVideoFile={videoFilesByPostRef.current.get(editorScene.id) ?? null}
              onRememberVideoFile={(postId, file) => {
                videoFilesByPostRef.current.set(postId, file)
              }}
              data={data}
              onBack={() => navigate('posts')}
              onSave={saveScene}
              onDelete={(id) => setDeleteTarget(data.scenes.find((s) => s.id === id) ?? null)}
              onOpenHub={openHub}
              notify={notify}
            />
          ) : (
            <div className="page">
              <h1>Post not found</h1>
              <p className="muted">It may have been deleted. Head back to Posts to pick another.</p>
              <button className="btn btn-accent" onClick={() => navigate('posts')}>
                Back to Posts
              </button>
            </div>
          ))}

        {route.view === 'share' && (
          <ShareKit
            data={data}
            onEditScene={(id) => navigate('editor', id)}
            onUpdateScene={saveScene}
            notify={notify}
          />
        )}

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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create a new post">
        <p className="muted" style={{ marginBottom: 14 }}>
          Import your Scenering saved folder (reads title, credit page, SEO ranking tags &amp; thumbnail automatically), then post to YouTube first and boost from every social platform.
        </p>
        <div className="scenering-import-bar" style={{ marginBottom: 14 }}>
          <div>
            <strong>1. Import Scenering folder &amp; credit page</strong>
            <p className="muted small">Auto-extracts description, credits, SEO tags &amp; 1280×720 thumbnail</p>
          </div>
          <div className="btn-row">
            <input
              ref={createFolderRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => {
                void createSceneFromScenering(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={createFileRef}
              type="file"
              accept=".txt,.json,.md"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void createSceneFromScenering(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={createThumbRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const dataUrl = await renderImageFileToYoutubeThumbnail(file)
                  setNewThumbDataUrl(dataUrl)
                  setNewThumbName(file.name)
                  notify(`Thumbnail ready: ${file.name} ✓`)
                } catch {
                  notify('Could not read thumbnail image')
                }
              }}
            />
            <button
              type="button"
              className="btn btn-accent btn-sm"
              onClick={() => createFolderRef.current?.click()}
            >
              <FolderOpen size={14} /> Select folder
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => createFileRef.current?.click()}
            >
              <FileText size={14} /> Credits (.txt)
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => createThumbRef.current?.click()}
            >
              <ImagePlus size={14} /> {newThumbName ? 'Thumbnail ✓' : 'Thumbnail'}
            </button>
          </div>
        </div>
        {newThumbName && (
          <p className="small" style={{ marginBottom: 10, color: 'var(--accent)' }}>
            🖼️ Imported 1280×720 thumbnail: <code>{newThumbName}</code>
          </p>
        )}
        <label className="field">
          <span>Or enter video title manually</span>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createScene()}
            placeholder="e.g. How Ancient Rome Built an Unstoppable Empire"
          />
          {newTitle.trim() && <span className="field-hint">Slug: /s/{slugify(newTitle)}</span>}
        </label>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-accent" onClick={createScene}>
            Continue to YouTube SEO Pack
          </button>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>
            Cancel
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete post?">
        <p>
          Delete <strong>“{deleteTarget?.title}”</strong> and its {deleteTarget?.links.length ?? 0} platform links?
          This cannot be undone.
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-danger" onClick={() => deleteTarget && deleteScene(deleteTarget.id)}>
            Delete post
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
