import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
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
  ImagePlus,
  Download,
  Sparkles,
  Youtube,
  Share2,
  KeyRound,
  RefreshCw,
} from 'lucide-react'
import type { AppData, PlatformId, Scene, SceneLink } from '../types'
import { PLATFORMS, COVER_THEMES, ACCENTS, coverStyle, platformById } from '../lib/platforms'
import {
  SOCIAL_BOOST_PLATFORMS,
  PLATFORM_COMPOSER_LINKS,
  buildYoutubeStudioPack,
  buildSocialBoostPost,
  downloadYoutubeThumbnail,
  extractTopDescription,
  formatFileSize,
  formatYoutubeTagsCsv,
  generateYoutubeRankingTags,
  isSpecificYoutubeVideoUrl,
  parseSceneringFiles,
  parseTagsInput,
  renderImageFileToYoutubeThumbnail,
  resolveYoutubeBoostUrl,
  type SocialBoostPlatform,
} from '../lib/scenering'
import {
  generateSeoTagsWithGemini,
  loadGeminiApiKey,
  saveGeminiApiKey,
} from '../lib/gemini'
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

export default function SceneEditor({
  scene,
  data,
  onBack,
  onSave,
  onDelete,
  onOpenHub,
  notify,
}: Props) {
  const [draft, setDraft] = useState<Scene>(scene)
  const [slugTouched, setSlugTouched] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [boostPlatform, setBoostPlatform] = useState<SocialBoostPlatform>('facebook')
  const [tagsText, setTagsText] = useState<string>(() =>
    formatYoutubeTagsCsv(
      scene.tags && scene.tags.length > 0
        ? scene.tags
        : generateYoutubeRankingTags({
            title: scene.title,
            shortDescription: scene.description,
          })
    )
  )
  const [thumbDropActive, setThumbDropActive] = useState(false)
  const [showCoverPresets, setShowCoverPresets] = useState(false)
  const [showCreditsEditor, setShowCreditsEditor] = useState(false)

  // Gemini SEO tags state
  const [geminiKey, setGeminiKey] = useState<string>(() => loadGeminiApiKey())
  const [showGeminiKeyBox, setShowGeminiKeyBox] = useState(false)
  const [geminiBusy, setGeminiBusy] = useState(false)

  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const thumbInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(scene)
    setSlugTouched(false)
    const initialTags =
      scene.tags && scene.tags.length > 0
        ? scene.tags
        : generateYoutubeRankingTags({
            title: scene.title,
            shortDescription: scene.description,
          })
    setTagsText(formatYoutubeTagsCsv(initialTags))
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

  const doCopy = async (key: string, text: string, label: string) => {
    const ok = await copyText(text)
    setCopied(key)
    notify(ok ? `${label} copied ✓` : 'Copy failed — select the text manually')
    setTimeout(() => setCopied(null), 1800)
  }

  // Upload thumbnail when not present in the folder (or when replacing)
  const handleThumbnailUpload = async (file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await renderImageFileToYoutubeThumbnail(file)
      if (!dataUrl) {
        notify('Could not process thumbnail image')
        return
      }
      setDraft((d) => ({
        ...d,
        thumbnail: dataUrl,
        thumbnailFileName: file.name,
        thumbnailMissing: false,
        updatedAt: new Date().toISOString(),
      }))
      notify(`Thumbnail uploaded (1280×720 HD): ${file.name} ✓`)
    } catch {
      notify('Could not read that image file — try PNG, JPG or WebP')
    }
  }

  const handleThumbDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setThumbDropActive(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) {
      void handleThumbnailUpload(file)
    }
  }

  const handleDownloadThumbnail = async () => {
    const ok = await downloadYoutubeThumbnail(draft.thumbnail, draft.slug || 'video')
    notify(
      ok
        ? 'Downloaded 1280×720 thumbnail (.jpg) ✓'
        : 'Upload a thumbnail image first'
    )
  }

  // Fetch video + credits + top part of description + thumbnail from Scenering folder
  const handleImportScenering = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const imported = await parseSceneringFiles(files)

    setDraft((d) => {
      const shouldUpdateTitle =
        imported.title && (!d.title.trim() || d.title === 'Untitled post' || d.title === 'Untitled scene')
      const nextTitle = shouldUpdateTitle ? imported.title : d.title
      const nextSlug =
        shouldUpdateTitle && !slugTouched ? slugify(imported.title) : d.slug
      const nextTopDesc = imported.shortDescription || extractTopDescription(d.description, 300)
      const nextCredits = imported.credits || d.credits
      const nextTags = generateYoutubeRankingTags({
        title: nextTitle,
        shortDescription: nextTopDesc,
        extraKeywords: imported.tags,
      })
      setTagsText(formatYoutubeTagsCsv(nextTags))

      const hasUploadedThumbAlready = d.thumbnail.startsWith('data:image/')
      const nextThumb = imported.thumbnailFoundInFolder
        ? imported.thumbnailDataUrl
        : d.thumbnail
      const nextThumbName = imported.thumbnailFoundInFolder
        ? imported.thumbnailFileName
        : d.thumbnailFileName
      const nextThumbMissing =
        !imported.thumbnailFoundInFolder && !hasUploadedThumbAlready

      return {
        ...d,
        title: nextTitle,
        slug: nextSlug,
        description: nextTopDesc,
        credits: nextCredits,
        tags: nextTags,
        videoFileName: imported.videoFileName || d.videoFileName,
        videoSizeBytes: imported.videoSizeBytes || d.videoSizeBytes,
        thumbnail: nextThumb,
        thumbnailFileName: nextThumbName,
        thumbnailMissing: nextThumbMissing,
        updatedAt: new Date().toISOString(),
      }
    })

    if (imported.thumbnailFoundInFolder) {
      notify(`Fetched video, credits, top description & thumbnail (${imported.thumbnailFileName}) ✓`)
    } else {
      notify('Fetched video & credits — no thumbnail found in folder, upload one in Item 3 below')
    }
  }

  // Generate SEO-friendly tags via Google Gemini
  const handleGenerateGeminiTags = async () => {
    const activeKey = geminiKey.trim() || loadGeminiApiKey()
    if (!activeKey) {
      setShowGeminiKeyBox(true)
      notify('Enter your Gemini API key below to generate SEO tags with Gemini')
      return
    }
    setGeminiBusy(true)
    try {
      saveGeminiApiKey(activeKey)
      const topDesc = extractTopDescription(draft.description, 300)
      const seoTags = await generateSeoTagsWithGemini({
        apiKey: activeKey,
        title: draft.title,
        topDescription: topDesc,
      })
      setTagsText(formatYoutubeTagsCsv(seoTags))
      set('tags', seoTags)
      setShowGeminiKeyBox(false)
      notify(`Gemini generated ${seoTags.length} SEO-friendly tags ✓`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini tag generation failed'
      notify(`Gemini error: ${msg}`)
      setShowGeminiKeyBox(true)
    } finally {
      setGeminiBusy(false)
    }
  }

  const handleLocalSeoTags = () => {
    const seoTags = generateYoutubeRankingTags({
      title: draft.title,
      shortDescription: draft.description,
    })
    setTagsText(formatYoutubeTagsCsv(seoTags))
    set('tags', seoTags)
    notify('SEO-friendly tags refreshed from title & top description ✓')
  }

  const handleTagsInputChange = (val: string) => {
    setTagsText(val)
    const parsed = parseTagsInput(val)
    set('tags', parsed)
  }

  // Sync published YouTube video link -> plays the video IN YouTube across all social posts
  const handleYoutubeVideoUrlChange = (rawUrl: string) => {
    const url = rawUrl.trim()
    setDraft((d) => {
      const hasYtLink = d.links.some((l) => l.platform === 'youtube')
      let nextLinks = d.links
      if (url) {
        if (hasYtLink) {
          nextLinks = d.links.map((l, idx) =>
            l.platform === 'youtube' && idx === d.links.findIndex((x) => x.platform === 'youtube')
              ? { ...l, url, enabled: true, label: 'Watch Full Video on YouTube' }
              : l
          )
        } else {
          const bumped = d.links.map((l) => ({ ...l, order: l.order + 1 }))
          nextLinks = [
            {
              id: uid(),
              platform: 'youtube',
              label: 'Watch Full Video on YouTube',
              url,
              enabled: true,
              clicks: 0,
              order: 0,
            },
            ...bumped,
          ]
        }
      }
      const autoLive = isSpecificYoutubeVideoUrl(url) && d.status === 'draft' ? 'live' : d.status
      return {
        ...d,
        videoUrl: rawUrl,
        status: autoLive,
        links: nextLinks,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  // Toggle Website (`https://scenering.com`) on/off per video
  const websiteLink = draft.links.find((l) => l.platform === 'website')
  const websiteEnabled = Boolean(websiteLink?.enabled)
  const handleToggleWebsiteForPost = (enabled: boolean) => {
    const defaultWebsiteUrl =
      data.platforms.find((p) => p.id === 'website')?.defaultHandle?.trim() ||
      'https://scenering.com'

    setDraft((d) => {
      const existing = d.links.find((l) => l.platform === 'website')
      let nextLinks: SceneLink[]
      if (existing) {
        nextLinks = d.links.map((l) =>
          l.id === existing.id
            ? { ...l, enabled, url: l.url.trim() || defaultWebsiteUrl }
            : l
        )
      } else if (enabled) {
        nextLinks = [
          ...d.links,
          {
            id: uid(),
            platform: 'website',
            label: 'Visit Scenering',
            url: defaultWebsiteUrl,
            enabled: true,
            clicks: 0,
            order: d.links.length,
          },
        ]
      } else {
        nextLinks = d.links
      }
      return { ...d, links: nextLinks, updatedAt: new Date().toISOString() }
    })
  }

  const addLink = (platform: PlatformId) => {
    const def = platformById(platform)
    const defaultHandle =
      data.platforms.find((p) => p.id === platform)?.defaultHandle?.trim() || ''
    const defaultUrl = defaultHandle.startsWith('http') ? defaultHandle : ''
    const existing = draft.links.filter((l) => l.platform === platform).length
    const link: SceneLink = {
      id: uid(),
      platform,
      label: existing === 0 ? `Watch on ${def.name}` : `${def.name} link ${existing + 1}`,
      url: defaultUrl,
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

  const ytPack = useMemo(() => buildYoutubeStudioPack(draft), [draft])

  const ytBoostTarget = useMemo(
    () => resolveYoutubeBoostUrl(draft, data.platforms),
    [draft, data.platforms]
  )

  const socialBoostText = useMemo(
    () => buildSocialBoostPost(draft, boostPlatform, { platforms: data.platforms }),
    [draft, boostPlatform, data.platforms]
  )

  const handleSave = () => {
    if (!draft.title.trim()) {
      notify('Add a title before saving.')
      return
    }
    const normalizedTags =
      draft.tags && draft.tags.length > 0 ? draft.tags : ytPack.tags
    onSave({ ...draft, tags: normalizedTags })
    notify('Saved ✓')
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

  const hasRealThumbnail = draft.thumbnail.startsWith('data:image/')
  const needsThumbnailUpload = Boolean(draft.thumbnailMissing) || !hasRealThumbnail
  const composerLink = PLATFORM_COMPOSER_LINKS[boostPlatform]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={15} /> All posts
          </button>
          <h1>{draft.title || 'Untitled post'}</h1>
          <p className="page-sub">
            Fetch from your Scenering folder → Post the 4 items to YouTube first → Fetch social posts here that play the video in YouTube.
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
          {/* =========================================================
              FOLDER FETCH + THE 4 ITEMS FOR YOUTUBE
             ========================================================= */}
          <div className="card yt-step-card">
            <div className="card-head">
              <div>
                <div className="step-kicker yt-kicker">YOUTUBE FIRST — THE 4 ITEMS</div>
                <h3>Fetch Scenering folder &amp; upload to YouTube</h3>
                <p>
                  Your YouTube Channel Settings already holds your predefined channel defaults — these 4 items are all YouTube needs for this video.
                </p>
              </div>
              <a
                className="btn btn-ghost btn-sm"
                href="https://studio.youtube.com"
                target="_blank"
                rel="noreferrer"
              >
                <Youtube size={15} color="#FF0033" /> Open YouTube Studio <ExternalLink size={12} />
              </a>
            </div>

            {/* FOLDER FETCHER */}
            <div className="scenering-import-bar">
              <div>
                <strong>Fetch from Scenering saved folder</strong>
                <p className="muted small">
                  Select <code>Videos/Scenering/&lt;Video Name&gt;</code> — fetches the video, credits + top part of description, and thumbnail from the same folder.
                </p>
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
                  className="btn btn-accent btn-sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderOpen size={14} /> Select Scenering folder
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

            {/* ITEM 1 — VIDEO & TITLE */}
            <div className="four-item-box">
              <div className="yt-copy-head">
                <strong>1. Video (fetched in folder) &amp; Title</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.title.length} / 100</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void doCopy('yt-title', ytPack.title, 'Video title')}
                  >
                    {copied === 'yt-title' ? <Check size={13} /> : <Copy size={13} />} Copy title
                  </button>
                </div>
              </div>
              {draft.videoFileName ? (
                <p className="small" style={{ marginBottom: 8, color: 'var(--accent)' }}>
                  ✓ Video in folder: <code>{draft.videoFileName}</code>
                  {draft.videoSizeBytes ? ` (${formatFileSize(draft.videoSizeBytes)})` : ''} — upload this file in YouTube Studio
                </p>
              ) : (
                <p className="muted small" style={{ marginBottom: 8 }}>
                  Select your Scenering folder above to detect the rendered video file automatically.
                </p>
              )}
              <input
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Video title…"
              />
            </div>

            {/* ITEM 2 — TOP PART OF DESCRIPTION + CREDITS */}
            <div className="four-item-box">
              <div className="yt-copy-head">
                <strong>2. Description (top part only) &amp; Credits</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.descriptionWithCredits.length} / 5000</span>
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    onClick={() =>
                      void doCopy(
                        'yt-desc',
                        ytPack.descriptionWithCredits,
                        'YouTube description & credits'
                      )
                    }
                  >
                    {copied === 'yt-desc' ? <Check size={13} /> : <Copy size={13} />} Copy description + credits
                  </button>
                </div>
              </div>

              <label className="field" style={{ marginBottom: 10 }}>
                <span className="muted small">
                  Top part of description (used for YouTube &amp; all social posts)
                </span>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Opening summary of the video (only this top part is used across social posts)…"
                />
              </label>

              <div className="step1-toggles-row" style={{ marginBottom: 8 }}>
                <span className="muted small">
                  {draft.credits?.trim()
                    ? '✓ Credits fetched from folder and attached below for YouTube'
                    : 'No credits block loaded yet (import folder or paste below if needed)'}
                </span>
                <button
                  type="button"
                  className="link-toggle-btn"
                  onClick={() => setShowCreditsEditor((v) => !v)}
                >
                  {showCreditsEditor ? 'Hide credits editor ▲' : 'View / edit fetched credits ▼'}
                </button>
              </div>

              {showCreditsEditor && (
                <textarea
                  rows={5}
                  style={{ marginBottom: 10 }}
                  value={draft.credits ?? ''}
                  onChange={(e) => set('credits', e.target.value)}
                  placeholder="📢 CREDITS & ATTRIBUTIONS…"
                />
              )}

              <pre className="code-block tall" style={{ marginBottom: 0 }}>
                {ytPack.descriptionWithCredits}
              </pre>
            </div>

            {/* ITEM 3 — THUMBNAIL (FROM SAME FOLDER OR UPLOAD IF MISSING) */}
            <div
              className={`four-item-box ${thumbDropActive ? 'drag-over' : ''} ${
                needsThumbnailUpload ? 'thumb-missing-box' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setThumbDropActive(true)
              }}
              onDragLeave={() => setThumbDropActive(false)}
              onDrop={handleThumbDrop}
            >
              <div className="yt-copy-head">
                <strong>3. Thumbnail (from same folder, or upload if missing)</strong>
                <Badge tone={hasRealThumbnail ? 'live' : 'draft'}>
                  {hasRealThumbnail
                    ? `✓ Ready (${draft.thumbnailFileName || '1280×720'})`
                    : 'Upload needed'}
                </Badge>
              </div>

              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void handleThumbnailUpload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />

              <div className="thumb-import-panel" style={{ marginBottom: 0 }}>
                <div className="thumb-preview-16x9" style={coverStyle(draft.thumbnail, 'swatch')}>
                  <span className="thumb-res-badge">
                    {hasRealThumbnail ? '✓ 1280×720 Thumbnail' : 'No folder thumbnail yet'}
                  </span>
                </div>

                <div className="thumb-import-controls">
                  {hasRealThumbnail ? (
                    <p className="small" style={{ color: 'var(--accent)' }}>
                      ✓ Thumbnail loaded: <code>{draft.thumbnailFileName || 'thumbnail.jpg'}</code>
                    </p>
                  ) : (
                    <p className="small" style={{ color: '#FFB03A' }}>
                      ⚠️ No thumbnail image was found in the folder — upload your thumbnail below (or drag &amp; drop it here).
                    </p>
                  )}

                  <div className="btn-row">
                    <button
                      type="button"
                      className={hasRealThumbnail ? 'btn btn-ghost btn-sm' : 'btn btn-accent btn-sm'}
                      onClick={() => thumbInputRef.current?.click()}
                    >
                      <ImagePlus size={14} />{' '}
                      {hasRealThumbnail ? 'Replace thumbnail' : 'Upload thumbnail'}
                    </button>

                    {hasRealThumbnail && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleDownloadThumbnail}
                      >
                        <Download size={14} /> Download 1280×720 (.jpg)
                      </button>
                    )}

                    <button
                      type="button"
                      className="link-toggle-btn"
                      onClick={() => setShowCoverPresets((v) => !v)}
                    >
                      {showCoverPresets ? 'Hide hub presets ▲' : 'Hub cover presets ▼'}
                    </button>
                  </div>

                  {showCoverPresets && (
                    <div className="cover-themes-grid" style={{ marginTop: 6 }}>
                      {COVER_THEMES.map((theme) => {
                        const active = draft.thumbnail === theme.id
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            className={`cover-theme-card ${active ? 'active' : ''}`}
                            style={coverStyle(theme.id, 'swatch')}
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                thumbnail: theme.id,
                                thumbnailFileName: undefined,
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            title={theme.label}
                          >
                            <span className="cover-theme-check">{active && <Check size={13} />}</span>
                            <span className="cover-theme-label">{theme.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ITEM 4 — SEO-FRIENDLY TAGS WITH GEMINI OPTION */}
            <div className="four-item-box">
              <div className="yt-copy-head">
                <strong>4. SEO-Friendly Tags (Gemini AI)</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.tagsCharCount} / 500 chars</span>
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    disabled={geminiBusy}
                    onClick={() => void handleGenerateGeminiTags()}
                  >
                    <Sparkles size={13} />{' '}
                    {geminiBusy ? 'Asking Gemini…' : 'Ask Gemini for SEO tags'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void doCopy('yt-tags', ytPack.tagsCsv, 'SEO tags')}
                  >
                    {copied === 'yt-tags' ? <Check size={13} /> : <Copy size={13} />} Copy tags
                  </button>
                </div>
              </div>

              <p className="muted small" style={{ marginBottom: 8 }}>
                Uses strictly SEO-friendly search keywords &amp; long-tail phrases (no hashtags or filler). Paste directly into YouTube Studio → <em>Show more → Tags</em>.
              </p>

              {showGeminiKeyBox && (
                <div className="gemini-key-inline">
                  <div className="yt-copy-head" style={{ marginBottom: 6 }}>
                    <span>
                      <KeyRound size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                      <strong>Google Gemini API Key</strong>{' '}
                      <span className="muted small">(saved locally in this browser)</span>
                    </span>
                    <button
                      type="button"
                      className="link-toggle-btn"
                      onClick={() => setShowGeminiKeyBox(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="btn-row">
                    <input
                      type="password"
                      style={{ flex: 1 }}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy… (from Google AI Studio)"
                    />
                    <button
                      type="button"
                      className="btn btn-accent btn-sm"
                      disabled={geminiBusy || !geminiKey.trim()}
                      onClick={() => void handleGenerateGeminiTags()}
                    >
                      <Sparkles size={13} /> Save &amp; generate
                    </button>
                  </div>
                </div>
              )}

              <textarea
                rows={2}
                value={tagsText}
                onChange={(e) => handleTagsInputChange(e.target.value)}
                placeholder="seo keyword 1, long tail search phrase 2…"
              />

              <div className="step1-toggles-row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="link-toggle-btn"
                  onClick={handleLocalSeoTags}
                >
                  <RefreshCw size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  Quick refresh from title &amp; description
                </button>
                <button
                  type="button"
                  className="link-toggle-btn"
                  onClick={() => setShowGeminiKeyBox((v) => !v)}
                >
                  <KeyRound size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {geminiKey ? 'Update Gemini API key' : 'Set Gemini API key'}
                </button>
              </div>
            </div>

            <div className="divider" />

            {/* PASTE PUBLISHED YOUTUBE LINK */}
            <div className={`yt-live-url-box ${ytBoostTarget.isSpecificVideo ? 'ready' : 'pending'}`}>
              <div className="yt-copy-head" style={{ marginBottom: 6 }}>
                <strong>Once YouTube is published — paste the YouTube video link here</strong>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                  {ytBoostTarget.isSpecificVideo ? '✓ Plays in YouTube' : 'Waiting for YouTube link'}
                </Badge>
              </div>
              <p className="muted small" style={{ marginBottom: 8 }}>
                Every social post fetched from SceneBoost below will use this YouTube link to play the video in YouTube.
              </p>
              <input
                value={draft.videoUrl}
                onChange={(e) => handleYoutubeVideoUrlChange(e.target.value)}
                placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…"
              />
            </div>
          </div>

          {/* =========================================================
              OTHER SOCIAL POSTS — FETCHED IN SCENEBOOST, PLAYS IN YOUTUBE
             ========================================================= */}
          <div className="card boost-step-card">
            <div className="card-head">
              <div>
                <div className="step-kicker boost-kicker">OTHER SOCIAL POSTS — PLAYS IN YOUTUBE</div>
                <h3>Fetch platform-ready social posts from SceneBoost</h3>
                <p>
                  Formatted the way each platform needs it — uses only the top part of your description, and uses your YouTube link to play the video in YouTube.
                </p>
              </div>
              <Share2 size={18} className="muted-icon" />
            </div>

            <div className={`boost-target-banner ${ytBoostTarget.isSpecificVideo ? 'ok' : 'warn'}`}>
              {ytBoostTarget.isSpecificVideo ? (
                <>
                  <span>▶️ Video link in every post (plays in YouTube):</span>{' '}
                  <code>{ytBoostTarget.url}</code>
                </>
              ) : (
                <>
                  <span>⚠️ Paste your published YouTube video link above first</span>{' '}
                  <span className="muted small">
                    (currently falling back to channel: <code>{ytBoostTarget.url}</code>)
                  </span>
                </>
              )}
            </div>

            <div className="filter-tabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              {SOCIAL_BOOST_PLATFORMS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`filter-tab ${boostPlatform === id ? 'active' : ''}`}
                  onClick={() => setBoostPlatform(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <pre className="code-block tall">{socialBoostText}</pre>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() =>
                  void doCopy(
                    `boost-${boostPlatform}`,
                    socialBoostText,
                    `${SOCIAL_BOOST_PLATFORMS.find(([id]) => id === boostPlatform)?.[1] ?? 'Social'} post`
                  )
                }
              >
                {copied === `boost-${boostPlatform}` ? <Check size={14} /> : <Copy size={14} />} Copy{' '}
                {SOCIAL_BOOST_PLATFORMS.find(([id]) => id === boostPlatform)?.[1]} post
              </button>
              {hasRealThumbnail && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleDownloadThumbnail}
                >
                  <Download size={14} /> Download thumbnail (.jpg)
                </button>
              )}
              {composerLink && (
                <a
                  className="btn btn-ghost btn-sm"
                  href={composerLink.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> {composerLink.label}
                </a>
              )}
            </div>
          </div>

          {/* =========================================================
              PER-VIDEO WEBSITE TOGGLE & OPTIONAL SCENEBOOST LINKS
             ========================================================= */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Channel &amp; Website links ({draft.links.length})</h3>
                <p>Switch off Website when a video isn’t posted to scenering.com</p>
              </div>
              <Link2 size={18} className="muted-icon" />
            </div>

            <label className="inline-check" style={{ marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={websiteEnabled}
                onChange={(e) => handleToggleWebsiteForPost(e.target.checked)}
              />
              <span>
                Include Website link (<code>scenering.com</code>) on this video’s SceneBoost hub
              </span>
            </label>

            <div className="field-row" style={{ marginBottom: 14 }}>
              <label className="field">
                <span>Slug (SceneBoost URL)</span>
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
              </label>
            </div>

            <div className="add-platform-bar">
              <span className="muted">Quick add:</span>
              <div className="chip-row">
                {orderedPlatforms.map((p) => {
                  const isConnected = connectedIds.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${usedPlatforms.has(p.id) ? 'chip-used' : ''}`}
                      style={!isConnected ? { opacity: 0.5 } : undefined}
                      onClick={() => addLink(p.id)}
                      title={isConnected ? `Add ${p.name}` : `${p.name} (not connected)`}
                    >
                      <Plus size={12} /> {p.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {draft.links.length > 0 && (
              <div className="link-editor-list">
                {[...draft.links]
                  .sort((a, b) => a.order - b.order)
                  .map((l, idx, arr) => {
                    const def = platformById(l.platform)
                    const tr = tracked.find((t) => t.link.id === l.id)?.url ?? l.url
                    return (
                      <div key={l.id} className={`link-editor-row ${!l.enabled ? 'disabled' : ''}`}>
                        <div className="link-reorder">
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={idx === 0}
                            onClick={() => moveLink(l.id, -1)}
                            title="Move up"
                          >
                            ▲
                          </button>
                          <GripVertical size={14} className="muted-icon" />
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={idx === arr.length - 1}
                            onClick={() => moveLink(l.id, 1)}
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>

                        <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />

                        <div className="link-fields">
                          <div className="link-fields-top">
                            <select
                              value={l.platform}
                              onChange={(e) => updateLink(l.id, { platform: e.target.value as PlatformId })}
                            >
                              {PLATFORMS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <input
                              value={l.label}
                              onChange={(e) => updateLink(l.id, { label: e.target.value })}
                              placeholder="Button label"
                            />
                            <label className="switch" title={l.enabled ? 'Enabled' : 'Hidden'}>
                              <input
                                type="checkbox"
                                checked={l.enabled}
                                onChange={(e) => updateLink(l.id, { enabled: e.target.checked })}
                              />
                              <span />
                            </label>
                            <button
                              type="button"
                              className="icon-btn danger"
                              onClick={() => removeLink(l.id)}
                              title="Remove link"
                            >
                              <X size={15} />
                            </button>
                          </div>

                          <input
                            value={l.url}
                            onChange={(e) => updateLink(l.id, { url: e.target.value })}
                            placeholder={def.placeholder}
                          />

                          {l.url.trim() && (
                            <div className="tracked-preview">
                              <span>Tracked:</span>
                              <code>{tr}</code>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================
            SIDEBAR — THE 4 YOUTUBE ITEMS CHECKLIST + PREVIEW
           ========================================================= */}
        <aside className="editor-side">
          <div className="card sticky-card">
            <div className="card-head">
              <div>
                <h3>The 4 YouTube Items</h3>
                <p>Ready check before social boost</p>
              </div>
            </div>

            <div className="yt-checklist">
              <div className={`yt-check-item ${draft.videoFileName || draft.title.trim() ? 'done' : ''}`}>
                <span className="yt-check-dot">{draft.videoFileName ? '✓' : '1'}</span>
                <div>
                  <strong>1. Video in folder</strong>
                  <p className="muted small">
                    {draft.videoFileName || 'Select Scenering folder to fetch video'}
                  </p>
                </div>
              </div>

              <div className={`yt-check-item ${ytPack.topDescription ? 'done' : ''}`}>
                <span className="yt-check-dot">{ytPack.topDescription ? '✓' : '2'}</span>
                <div>
                  <strong>2. Top description &amp; credits</strong>
                  <p className="muted small">
                    {draft.credits?.trim()
                      ? 'Top description + credits ready'
                      : ytPack.topDescription
                      ? 'Top description ready'
                      : 'Fetch or enter opening summary'}
                  </p>
                </div>
              </div>

              <div className={`yt-check-item ${hasRealThumbnail ? 'done' : ''}`}>
                <span className="yt-check-dot">{hasRealThumbnail ? '✓' : '3'}</span>
                <div>
                  <strong>3. Thumbnail</strong>
                  <p className="muted small">
                    {hasRealThumbnail
                      ? draft.thumbnailFileName || 'Thumbnail ready'
                      : 'Not in folder — upload in Item 3'}
                  </p>
                </div>
              </div>

              <div className={`yt-check-item ${ytPack.tags.length >= 3 ? 'done' : ''}`}>
                <span className="yt-check-dot">{ytPack.tags.length >= 3 ? '✓' : '4'}</span>
                <div>
                  <strong>4. SEO tags ({ytPack.tagsCharCount}/500)</strong>
                  <p className="muted small">
                    {ytPack.tags.length} SEO-friendly tags ready
                  </p>
                </div>
              </div>
            </div>

            <div className="divider" />
            <h4 className="section-label">Plays in YouTube</h4>
            <div className="phone-preview">
              <div className="phone-hero" style={coverStyle(draft.thumbnail, 'hero')}>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : draft.status}>
                  {ytBoostTarget.isSpecificVideo ? '▶ Plays in YouTube' : draft.status}
                </Badge>
                <div className="phone-hero-title">{draft.title || 'Your video title'}</div>
              </div>
              <div className="phone-body">
                <p>{ytPack.topDescription || 'Top part of your description appears here…'}</p>
                <a
                  className="phone-link yt-primary-cta"
                  href={ytBoostTarget.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <PlatformPill short="YT" color="#FF0033" bg="#FF003322" text="#FF6B81" />
                  <span>Play Video in YouTube</span>
                  <ExternalLink size={13} />
                </a>
              </div>
              <div className="phone-foot" style={{ color: draft.accent }}>
                Social posts fetched in SceneBoost → Play in YouTube
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={handleSave}
                disabled={!dirty}
              >
                <Save size={14} /> {dirty ? 'Save changes' : 'Saved'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void doCopy('hub', hubUrl(draft.slug), 'SceneBoost link')}
              >
                {copied === 'hub' ? <Check size={14} /> : <Copy size={14} />} Hub URL
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
