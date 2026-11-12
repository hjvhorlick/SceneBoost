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
  Film,
  Youtube,
  Share2,
} from 'lucide-react'
import type { AppData, PlatformId, Scene, SceneLink } from '../types'
import { PLATFORMS, COVER_THEMES, ACCENTS, coverStyle, platformById } from '../lib/platforms'
import {
  SOCIAL_BOOST_PLATFORMS,
  PLATFORM_COMPOSER_LINKS,
  buildYoutubeStudioPack,
  buildSocialBoostPost,
  downloadYoutubeThumbnail,
  formatYoutubeTagsCsv,
  generateYoutubeRankingTags,
  grabVideoFrameToYoutubeThumbnail,
  isSpecificYoutubeVideoUrl,
  parseSceneringFiles,
  parseTagsInput,
  renderImageFileToYoutubeThumbnail,
  resolveYoutubeBoostUrl,
  type SocialBoostPlatform,
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
  const [includeBoostCredits, setIncludeBoostCredits] = useState(false)
  const [tagsText, setTagsText] = useState<string>(() =>
    formatYoutubeTagsCsv(
      scene.tags && scene.tags.length > 0
        ? scene.tags
        : generateYoutubeRankingTags({
            title: scene.title,
            shortDescription: scene.description,
            credits: scene.credits,
          })
    )
  )
  const [importedVideoFile, setImportedVideoFile] = useState<File | null>(null)
  const [thumbDropActive, setThumbDropActive] = useState(false)
  const [showCoverPresets, setShowCoverPresets] = useState(false)
  const [showCreditsEditor, setShowCreditsEditor] = useState(false)

  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const thumbInputRef = useRef<HTMLInputElement | null>(null)
  const videoFrameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(scene)
    setSlugTouched(false)
    setImportedVideoFile(null)
    const initialTags =
      scene.tags && scene.tags.length > 0
        ? scene.tags
        : generateYoutubeRankingTags({
            title: scene.title,
            shortDescription: scene.description,
            credits: scene.credits,
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

  // Import a custom YouTube/social thumbnail image (.jpg / .png / .webp) -> 1280x720 HD
  const handleThumbnailFile = async (file: File | undefined) => {
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
        updatedAt: new Date().toISOString(),
      }))
      notify(`Thumbnail imported (1280×720 YouTube HD): ${file.name} ✓`)
    } catch {
      notify('Could not read that image file — try PNG, JPG or WebP')
    }
  }

  const handleThumbDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setThumbDropActive(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) {
      void handleThumbnailFile(file)
      return
    }
    const vid = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('video/'))
    if (vid) {
      setImportedVideoFile(vid)
      void handleGrabFrameFromVideo(vid, 0.25)
    }
  }

  const handleGrabFrameFromVideo = async (videoFile: File | undefined, ratio = 0.25) => {
    if (!videoFile) return
    try {
      const dataUrl = await grabVideoFrameToYoutubeThumbnail(videoFile, ratio)
      if (!dataUrl) {
        notify('Could not grab frame from video')
        return
      }
      setImportedVideoFile(videoFile)
      setDraft((d) => ({
        ...d,
        thumbnail: dataUrl,
        thumbnailFileName: `${videoFile.name.replace(/\.[^.]+$/, '')}-frame-${Math.round(ratio * 100)}pct.jpg`,
        videoFileName: d.videoFileName || videoFile.name,
        updatedAt: new Date().toISOString(),
      }))
      notify(`Grabbed 1280×720 thumbnail frame (${Math.round(ratio * 100)}%) ✓`)
    } catch {
      notify('Browser could not decode a frame from that video file')
    }
  }

  const handleDownloadThumbnail = async () => {
    const ok = await downloadYoutubeThumbnail(draft.thumbnail, draft.slug || 'scenering-video')
    notify(
      ok
        ? 'Downloaded 1280×720 YouTube thumbnail (.jpg) ✓'
        : 'Could not export thumbnail — try importing an image first'
    )
  }

  // Import Scenering saved folder (`Videos/Scenering/<Video Name>`) or credit file
  const handleImportScenering = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const imported = await parseSceneringFiles(files)
    if (imported.videoFile) {
      setImportedVideoFile(imported.videoFile)
    }

    setDraft((d) => {
      const shouldUpdateTitle =
        imported.title && (!d.title.trim() || d.title === 'Untitled scene')
      const nextTitle = shouldUpdateTitle ? imported.title : d.title
      const nextSlug =
        shouldUpdateTitle && !slugTouched ? slugify(imported.title) : d.slug
      const nextDesc = imported.shortDescription || d.description
      const nextCredits = imported.credits || d.credits
      const nextTags = generateYoutubeRankingTags({
        title: nextTitle,
        shortDescription: nextDesc,
        credits: nextCredits,
        extraKeywords: imported.tags,
      })
      setTagsText(formatYoutubeTagsCsv(nextTags))

      const hasCustomThumbAlready = d.thumbnail.startsWith('data:image/')
      const nextThumb =
        imported.thumbnailDataUrl || (hasCustomThumbAlready ? d.thumbnail : d.thumbnail)
      const nextThumbName = imported.thumbnailFileName || d.thumbnailFileName

      return {
        ...d,
        title: nextTitle,
        slug: nextSlug,
        description: nextDesc,
        credits: nextCredits,
        tags: nextTags,
        videoFileName: imported.videoFileName || d.videoFileName,
        thumbnail: nextThumb,
        thumbnailFileName: nextThumbName,
        updatedAt: new Date().toISOString(),
      }
    })

    const parts: string[] = []
    if (imported.title) parts.push('title')
    if (imported.shortDescription) parts.push('short description')
    if (imported.credits) parts.push('credits')
    if (imported.thumbnailDataUrl) parts.push('1280×720 thumbnail')
    parts.push('SEO tags')

    notify(`Imported ${parts.join(', ')} from ${imported.sourceSummary} ✓`)
  }

  const handleRegenerateTags = () => {
    const nextTags = generateYoutubeRankingTags({
      title: draft.title,
      shortDescription: draft.description,
      credits: draft.credits,
    })
    setTagsText(formatYoutubeTagsCsv(nextTags))
    set('tags', nextTags)
    notify('YouTube ranking tags regenerated from title, description & credits ✓')
  }

  const handleTagsInputChange = (val: string) => {
    setTagsText(val)
    const parsed = parseTagsInput(val)
    set('tags', parsed)
  }

  // Keep YouTube video URL synced with the scene's primary YouTube link
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

  const ytPack = useMemo(
    () => buildYoutubeStudioPack(draft, data.platforms),
    [draft, data.platforms]
  )

  const ytBoostTarget = useMemo(
    () => resolveYoutubeBoostUrl(draft, data.platforms),
    [draft, data.platforms]
  )

  const socialBoostText = useMemo(
    () =>
      buildSocialBoostPost(draft, boostPlatform, {
        platforms: data.platforms,
        includeCredits: includeBoostCredits,
      }),
    [draft, boostPlatform, data.platforms, includeBoostCredits]
  )

  const handleSave = () => {
    if (!draft.title.trim()) {
      notify('Add a title before saving.')
      return
    }
    const normalizedTags =
      draft.tags && draft.tags.length > 0 ? draft.tags : ytPack.tags
    onSave({ ...draft, tags: normalizedTags })
    notify('Scene & YouTube Boost Kit saved ✓')
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

  const isCustomThumbnail = draft.thumbnail.startsWith('data:image/')
  const composerLink = PLATFORM_COMPOSER_LINKS[boostPlatform]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={15} /> All scenes
          </button>
          <h1>{draft.title || 'Untitled scene'}</h1>
          <p className="page-sub">
            Step 1: Import credit page &amp; thumbnail → Step 2: Rank on YouTube first → Step 3: Send all social traffic straight to YouTube.
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
              STEP 1 — IMPORT SCENERING CREDIT PAGE, TAGS & THUMBNAIL
             ========================================================= */}
          <div className="card">
            <div className="card-head">
              <div>
                <div className="step-kicker">STEP 1 OF 3 — PREPARE ASSETS</div>
                <h3>Import Scenering credit page, SEO tags &amp; thumbnail</h3>
                <p>
                  Pulls your title, short description, media credits, ranking tags and 1280×720 thumbnail so YouTube ranks your video properly.
                </p>
              </div>
              <Badge tone={draft.status}>{draft.status}</Badge>
            </div>

            <div className="scenering-import-bar">
              <div>
                <strong>1A. Import Scenering saved folder or credit page</strong>
                <p className="muted small">
                  Select <code>Videos/Scenering/&lt;Video Name&gt;</code> (auto-reads <code>*_attribution_credits.txt</code>, video &amp; thumbnail).
                </p>
                {draft.videoFileName && (
                  <p className="small" style={{ marginTop: 4, color: 'var(--accent)' }}>
                    🎬 Video detected: <code>{draft.videoFileName}</code>
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
                  className="btn btn-accent btn-sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderOpen size={14} /> Import folder
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileText size={14} /> Credit page (.txt)
                </button>
              </div>
            </div>

            {/* DEDICATED THUMBNAIL IMPORT & 1280x720 PREVIEW */}
            <div
              className={`thumb-import-panel ${thumbDropActive ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setThumbDropActive(true)
              }}
              onDragLeave={() => setThumbDropActive(false)}
              onDrop={handleThumbDrop}
            >
              <div className="thumb-preview-16x9" style={coverStyle(draft.thumbnail, 'swatch')}>
                <span className="thumb-res-badge">
                  {isCustomThumbnail ? '✓ Imported 1280×720 HD' : '16:9 Cover Preset'}
                </span>
              </div>

              <div className="thumb-import-controls">
                <div>
                  <strong>1B. YouTube &amp; Social Thumbnail (1280×720 HD)</strong>
                  <p className="muted small">
                    Import your custom thumbnail image (or drag &amp; drop it here), or grab a crisp frame straight from your Scenering video.
                  </p>
                  {draft.thumbnailFileName && (
                    <p className="small" style={{ marginTop: 4, color: 'var(--accent)' }}>
                      🖼️ Active thumbnail: <code>{draft.thumbnailFileName}</code>
                    </p>
                  )}
                </div>

                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void handleThumbnailFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <input
                  ref={videoFrameInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void handleGrabFrameFromVideo(e.target.files?.[0], 0.25)
                    e.target.value = ''
                  }}
                />

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    onClick={() => thumbInputRef.current?.click()}
                  >
                    <ImagePlus size={14} /> Import thumbnail image
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (importedVideoFile) {
                        void handleGrabFrameFromVideo(importedVideoFile, 0.35)
                      } else {
                        videoFrameInputRef.current?.click()
                      }
                    }}
                  >
                    <Film size={14} /> Grab frame from video
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleDownloadThumbnail}
                  >
                    <Download size={14} /> Download 1280×720 (.jpg)
                  </button>
                </div>

                {importedVideoFile && (
                  <div className="frame-seek-row">
                    <span className="muted small">Pick frame point:</span>
                    {[0.15, 0.35, 0.6, 0.8].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        className="chip"
                        onClick={() => void handleGrabFrameFromVideo(importedVideoFile, pct)}
                      >
                        {Math.round(pct * 100)}%
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    className="link-toggle-btn"
                    onClick={() => setShowCoverPresets((v) => !v)}
                  >
                    {showCoverPresets ? 'Hide Scenering cover themes ▲' : 'Or pick a Scenering studio cover theme ▼'}
                  </button>
                </div>

                {showCoverPresets && (
                  <div className="cover-themes-grid" style={{ marginTop: 8 }}>
                    {COVER_THEMES.map((theme) => {
                      const active = draft.thumbnail === theme.id
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          className={`cover-theme-card ${active ? 'active' : ''}`}
                          style={coverStyle(theme.id, 'swatch')}
                          onClick={() => {
                            setDraft((d) => ({
                              ...d,
                              thumbnail: theme.id,
                              thumbnailFileName: undefined,
                              updatedAt: new Date().toISOString(),
                            }))
                          }}
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

            <label className="field">
              <span>Video Title (used for YouTube ranking &amp; social hooks)</span>
              <input
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. How Ancient Rome Built an Unstoppable Empire"
              />
            </label>

            <label className="field">
              <span>Short description (from credit page — placed in lines 1–2 of YouTube &amp; every social post)</span>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Write a clear 1–3 sentence summary with your main search keywords — YouTube weighs the first 2 lines heavily for search ranking…"
              />
            </label>

            <div className="field">
              <div className="field-label-row">
                <span>YouTube SEO ranking tags (comma-separated, max 500 chars)</span>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.tagsCharCount} / 500 chars</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleRegenerateTags}
                  >
                    <Sparkles size={13} /> Auto-generate tags
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={tagsText}
                onChange={(e) => handleTagsInputChange(e.target.value)}
                placeholder="keyword 1, keyword phrase 2, scenering…"
              />
            </div>

            {/* Website per-video switch + Credit Page text toggle */}
            <div className="step1-toggles-row">
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={websiteEnabled}
                  onChange={(e) => handleToggleWebsiteForPost(e.target.checked)}
                />
                <span>
                  Include Website link (<code>scenering.com</code>) on this video (switch off when not posted to website)
                </span>
              </label>

              <button
                type="button"
                className="link-toggle-btn"
                onClick={() => setShowCreditsEditor((v) => !v)}
              >
                {showCreditsEditor
                  ? 'Hide credit page text ▲'
                  : draft.credits?.trim()
                  ? '✓ Credit page loaded — view / edit ▼'
                  : '+ Paste or edit credit page text ▼'}
              </button>
            </div>

            {showCreditsEditor && (
              <label className="field" style={{ marginTop: 10 }}>
                <span>Scenering Credit Page (<code>📢 CREDITS &amp; ATTRIBUTIONS</code> — included in YouTube description)</span>
                <textarea
                  rows={6}
                  value={draft.credits ?? ''}
                  onChange={(e) => set('credits', e.target.value)}
                  placeholder="Paste or import your *_attribution_credits.txt block here…"
                />
              </label>
            )}
          </div>

          {/* =========================================================
              STEP 2 — POST TO YOUTUBE FIRST (SEO RANKING PACK)
             ========================================================= */}
          <div className="card yt-step-card">
            <div className="card-head">
              <div>
                <div className="step-kicker yt-kicker">STEP 2 OF 3 — PUBLISH TO YOUTUBE FIRST</div>
                <h3>YouTube Studio SEO Upload Pack</h3>
                <p>
                  Copy your ranked Title, Description + Credits, Tags and 1280×720 Thumbnail into YouTube Studio, then paste your live YouTube video link below.
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

            {/* 1. YouTube Title */}
            <div className="yt-copy-block">
              <div className="yt-copy-head">
                <strong>1. YouTube Title</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.title.length} / 100</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void doCopy('yt-title', ytPack.title, 'YouTube title')}
                  >
                    {copied === 'yt-title' ? <Check size={13} /> : <Copy size={13} />} Copy title
                  </button>
                </div>
              </div>
              <pre className="code-block">{ytPack.title}</pre>
            </div>

            {/* 2. YouTube Ranked Description + Credits */}
            <div className="yt-copy-block">
              <div className="yt-copy-head">
                <strong>2. YouTube Description (Short Description + Subscribe CTA + Credit Page + Hashtags)</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.description.length} / 5000</span>
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    onClick={() => void doCopy('yt-desc', ytPack.description, 'YouTube description')}
                  >
                    {copied === 'yt-desc' ? <Check size={13} /> : <Copy size={13} />} Copy description
                  </button>
                </div>
              </div>
              <pre className="code-block tall">{ytPack.description}</pre>
            </div>

            {/* 3. YouTube Studio Tags */}
            <div className="yt-copy-block">
              <div className="yt-copy-head">
                <strong>3. YouTube Studio Tags (paste into “Show more → Tags”)</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.tagsCharCount} / 500</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void doCopy('yt-tags', ytPack.tagsCsv, 'YouTube tags')}
                  >
                    {copied === 'yt-tags' ? <Check size={13} /> : <Copy size={13} />} Copy tags
                  </button>
                </div>
              </div>
              <pre className="code-block">{ytPack.tagsCsv}</pre>
            </div>

            {/* 4. YouTube Thumbnail quick download */}
            <div className="yt-thumb-reminder">
              <div>
                <strong>4. Upload your 1280×720 Thumbnail in YouTube Studio</strong>
                <p className="muted small">
                  {draft.thumbnailFileName
                    ? `Ready: ${draft.thumbnailFileName}`
                    : 'Download your 1280×720 HD thumbnail JPG below and upload it in YouTube Studio.'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleDownloadThumbnail}
              >
                <Download size={14} /> Download 1280×720 Thumbnail
              </button>
            </div>

            <div className="divider" />

            {/* 5. PASTE PUBLISHED YOUTUBE URL */}
            <div className={`yt-live-url-box ${ytBoostTarget.isSpecificVideo ? 'ready' : 'pending'}`}>
              <div className="yt-copy-head" style={{ marginBottom: 6 }}>
                <strong>5. Paste your published YouTube video link here once uploaded</strong>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                  {ytBoostTarget.isSpecificVideo ? '✓ YouTube Video Linked' : 'Waiting for YouTube URL'}
                </Badge>
              </div>
              <p className="muted small" style={{ marginBottom: 8 }}>
                Every social post in Step 3 will automatically send viewers straight to this YouTube video so your views, watch hours and subscribers grow on YouTube.
              </p>
              <input
                value={draft.videoUrl}
                onChange={(e) => handleYoutubeVideoUrlChange(e.target.value)}
                placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…"
              />
            </div>
          </div>

          {/* =========================================================
              STEP 3 — SOCIAL BOOST POSTS STRAIGHT TO YOUTUBE
             ========================================================= */}
          <div className="card boost-step-card">
            <div className="card-head">
              <div>
                <div className="step-kicker boost-kicker">STEP 3 OF 3 — BOOST YOUTUBE FROM SOCIALS</div>
                <h3>Create social posts that send viewers straight to YouTube</h3>
                <p>
                  Share on Facebook, LinkedIn, TikTok, X, Threads and more — every click goes directly to YouTube where viewers find more of your videos, boosting rankings &amp; channel monetization.
                </p>
              </div>
              <Share2 size={18} className="muted-icon" />
            </div>

            <div className={`boost-target-banner ${ytBoostTarget.isSpecificVideo ? 'ok' : 'warn'}`}>
              {ytBoostTarget.isSpecificVideo ? (
                <>
                  <span>🎯 Direct YouTube destination:</span>{' '}
                  <code>{ytBoostTarget.url}</code>
                </>
              ) : (
                <>
                  <span>⚠️ Paste your specific YouTube video link in Step 2 above!</span>{' '}
                  <span className="muted small">
                    (Currently pointing to your YouTube channel: <code>{ytBoostTarget.url}</code>)
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

            {draft.credits?.trim() && (boostPlatform === 'facebook' || boostPlatform === 'vimeo') && (
              <label className="inline-check" style={{ marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={includeBoostCredits}
                  onChange={(e) => setIncludeBoostCredits(e.target.checked)}
                />
                <span>Also append media credits to this {boostPlatform} post</span>
              </label>
            )}

            <pre className="code-block tall">{socialBoostText}</pre>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() =>
                  void doCopy(
                    `boost-${boostPlatform}`,
                    socialBoostText,
                    `${SOCIAL_BOOST_PLATFORMS.find(([id]) => id === boostPlatform)?.[1] ?? 'Social'} boost post`
                  )
                }
              >
                {copied === `boost-${boostPlatform}` ? <Check size={14} /> : <Copy size={14} />} Copy post → YouTube
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleDownloadThumbnail}
              >
                <Download size={14} /> Download thumbnail (.jpg)
              </button>
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
              OPTIONAL: EXTRA HUB & CHANNEL SETTINGS
             ========================================================= */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Optional Hub page &amp; extra links ({draft.links.length})</h3>
                <p>Backup smart page (/s/{draft.slug}) — YouTube stays #1 at the top</p>
              </div>
              <Link2 size={18} className="muted-icon" />
            </div>

            <div className="field-row" style={{ marginBottom: 14 }}>
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

            {draft.links.length === 0 ? (
              <div className="empty-inline">
                <p>Paste your YouTube URL in Step 2 above to auto-add YouTube, or click a platform chip.</p>
              </div>
            ) : (
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
            SIDEBAR — YOUTUBE RANK & BOOST CHECKLIST + LIVE PREVIEW
           ========================================================= */}
        <aside className="editor-side">
          <div className="card sticky-card">
            <div className="card-head">
              <div>
                <h3>YouTube Boost Checklist</h3>
                <p>Rank &amp; monetize workflow</p>
              </div>
            </div>

            <div className="yt-checklist">
              <div className={`yt-check-item ${draft.title.trim() && draft.description.trim() ? 'done' : ''}`}>
                <span className="yt-check-dot">{draft.title.trim() && draft.description.trim() ? '✓' : '1'}</span>
                <div>
                  <strong>Title &amp; credit description</strong>
                  <p className="muted small">
                    {draft.description.trim() ? 'Short description ready for SEO' : 'Add or import short description'}
                  </p>
                </div>
              </div>

              <div className={`yt-check-item ${isCustomThumbnail ? 'done' : ''}`}>
                <span className="yt-check-dot">{isCustomThumbnail ? '✓' : '2'}</span>
                <div>
                  <strong>1280×720 Thumbnail</strong>
                  <p className="muted small">
                    {isCustomThumbnail
                      ? draft.thumbnailFileName || 'Custom HD thumbnail imported'
                      : 'Import custom thumbnail or grab video frame'}
                  </p>
                </div>
              </div>

              <div className={`yt-check-item ${ytPack.tags.length >= 3 ? 'done' : ''}`}>
                <span className="yt-check-dot">{ytPack.tags.length >= 3 ? '✓' : '3'}</span>
                <div>
                  <strong>Ranking tags ({ytPack.tagsCharCount}/500)</strong>
                  <p className="muted small">{ytPack.tags.length} tags ready for YouTube Studio</p>
                </div>
              </div>

              <div className={`yt-check-item ${ytBoostTarget.isSpecificVideo ? 'done' : ''}`}>
                <span className="yt-check-dot">{ytBoostTarget.isSpecificVideo ? '✓' : '4'}</span>
                <div>
                  <strong>YouTube published &amp; linked</strong>
                  <p className="muted small">
                    {ytBoostTarget.isSpecificVideo
                      ? 'All social posts point straight to YouTube!'
                      : 'Paste live YouTube link in Step 2'}
                  </p>
                </div>
              </div>
            </div>

            <div className="divider" />
            <h4 className="section-label">Thumbnail &amp; video card preview</h4>
            <div className="phone-preview">
              <div className="phone-hero" style={coverStyle(draft.thumbnail, 'hero')}>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : draft.status}>
                  {ytBoostTarget.isSpecificVideo ? '▶ YouTube Live' : draft.status}
                </Badge>
                <div className="phone-hero-title">{draft.title || 'Your video title'}</div>
              </div>
              <div className="phone-body">
                <p>{draft.description || 'Your short description from the credit page appears here…'}</p>
                <a
                  className="phone-link yt-primary-cta"
                  href={ytBoostTarget.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <PlatformPill short="YT" color="#FF0033" bg="#FF003322" text="#FF6B81" />
                  <span>Watch Full Video on YouTube</span>
                  <ExternalLink size={13} />
                </a>
              </div>
              <div className="phone-foot" style={{ color: draft.accent }}>
                All social posts boost → YouTube
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
                onClick={() => void doCopy('hub', hubUrl(draft.slug), 'Backup hub link')}
              >
                {copied === 'hub' ? <Check size={14} /> : <Copy size={14} />} Copy hub URL
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
