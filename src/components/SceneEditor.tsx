import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ArrowLeft,
  Save,
  Trash2,
  Eye,
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
  Lock,
  Globe,
} from 'lucide-react'
import type { AppData, Scene, SceneLink } from '../types'
import { COVER_THEMES, ACCENTS, coverStyle } from '../lib/platforms'
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
import {
  autoFetchYoutubeVideoForPost,
  extractYoutubeChannelId,
} from '../lib/youtube'
import { copyText, slugify, timeAgo, uid } from '../lib/utils'
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

  // Automated YouTube fetch state
  const [ytChecking, setYtChecking] = useState(false)
  const [ytStatusNote, setYtStatusNote] = useState<string>('')
  const checkingRef = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const thumbInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(scene)
    setSlugTouched(false)
    setYtStatusNote('')
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

  // Apply an automatically fetched YouTube video URL onto the post (no manual choice)
  const applyFetchedYoutubeVideo = useCallback(
    (videoUrl: string, ytTitle: string) => {
      const nowIso = new Date().toISOString()
      const current = draftRef.current
      const hasYtLink = current.links.some((l) => l.platform === 'youtube')
      const nextLinks: SceneLink[] = hasYtLink
        ? current.links.map((l, idx) =>
            l.platform === 'youtube' &&
            idx === current.links.findIndex((x) => x.platform === 'youtube')
              ? { ...l, url: videoUrl, enabled: true, label: 'Watch Full Video on YouTube' }
              : l
          )
        : [
            {
              id: uid(),
              platform: 'youtube',
              label: 'Watch Full Video on YouTube',
              url: videoUrl,
              enabled: true,
              clicks: 0,
              order: 0,
            },
            ...current.links.map((l) => ({ ...l, order: l.order + 1 })),
          ]

      const updated: Scene = {
        ...current,
        videoUrl,
        youtubeVideoTitle: ytTitle,
        youtubeFetchedAt: nowIso,
        status: 'live',
        links: nextLinks,
        updatedAt: nowIso,
      }
      setDraft(updated)
      onSave(updated)
    },
    [onSave]
  )

  // Automatically fetch the published video link from the connected YouTube channel
  const checkYoutubeForPublishedPost = useCallback(
    async (manualTrigger = false) => {
      if (checkingRef.current) return
      const current = draftRef.current
      if (!current.title.trim() || current.title === 'Untitled post') {
        if (manualTrigger) {
          notify('Fetch your Scenering folder or set the video title first')
        }
        return
      }

      checkingRef.current = true
      setYtChecking(true)
      try {
        const res = await autoFetchYoutubeVideoForPost(
          current,
          data.scenes,
          data.platforms
        )
        if (res.matched) {
          const alreadySame = current.videoUrl === res.matched.url
          applyFetchedYoutubeVideo(res.matched.url, res.matched.title)
          setYtStatusNote(`Fetched from ${res.source}: “${res.matched.title}”`)
          if (!alreadySame || manualTrigger) {
            notify(`YouTube link fetched automatically: ${res.matched.url} ✓`)
          }
        } else {
          setYtStatusNote(
            res.latestOnChannel
              ? `Checked channel (${res.checkedCount} videos) — waiting for “${current.title}” to be published on YouTube.`
              : `Checked channel (${res.channelId}) — waiting for your first YouTube post to go live.`
          )
          if (manualTrigger) {
            notify('Not live on your YouTube channel yet — finish publishing in YouTube Studio first')
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not check YouTube right now'
        setYtStatusNote(msg)
        if (manualTrigger) notify(msg)
      } finally {
        checkingRef.current = false
        setYtChecking(false)
      }
    },
    [applyFetchedYoutubeVideo, data.platforms, data.scenes, notify]
  )

  const ytBoostTarget = useMemo(
    () => resolveYoutubeBoostUrl(draft, data.platforms),
    [draft, data.platforms]
  )

  // Automatically check YouTube when waiting for the first post to finish:
  // - on initial open
  // - whenever the user switches back from YouTube Studio (focus / visibilitychange)
  // - every 25 seconds while waiting
  useEffect(() => {
    if (ytBoostTarget.isSpecificVideo) return
    if (!draft.title.trim() || draft.title === 'Untitled post') return

    const initialTimer = setTimeout(() => {
      void checkYoutubeForPublishedPost(false)
    }, 600)

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkYoutubeForPublishedPost(false)
      }
    }

    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)

    const pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkYoutubeForPublishedPost(false)
      }
    }, 25000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(pollTimer)
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  }, [ytBoostTarget.isSpecificVideo, draft.id, draft.title, checkYoutubeForPublishedPost])

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
        imported.title &&
        (!d.title.trim() || d.title === 'Untitled post' || d.title === 'Untitled scene')
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

  // Toggle Website (`https://scenering.com`) on/off per post
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

  const ytPack = useMemo(() => buildYoutubeStudioPack(draft), [draft])

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
    notify('Post saved ✓')
  }

  const hasRealThumbnail = draft.thumbnail.startsWith('data:image/')
  const needsThumbnailUpload = Boolean(draft.thumbnailMissing) || !hasRealThumbnail
  const composerLink = PLATFORM_COMPOSER_LINKS[boostPlatform]
  const channelId = extractYoutubeChannelId(data.platforms)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={15} /> All posts
          </button>
          <h1>{draft.title || 'Untitled post'}</h1>
          <p className="page-sub">
            1) Post the 4 items to YouTube first → 2) SceneBoost automatically fetches the YouTube link → 3) Copy your social posts.
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
                <div className="step-kicker yt-kicker">FIRST POST — YOUTUBE (THE 4 ITEMS)</div>
                <h3>Fetch Scenering folder &amp; publish on YouTube</h3>
                <p>
                  Your YouTube Channel Settings already holds your predefined setup — upload these 4 items in YouTube Studio, and SceneBoost will fetch the live YouTube link automatically.
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

            {/* AUTOMATED YOUTUBE LINK SYNC — NO MANUAL INPUT / NO CHOICE */}
            <div className={`yt-live-url-box ${ytBoostTarget.isSpecificVideo ? 'ready' : 'pending'}`}>
              <div className="yt-copy-head" style={{ marginBottom: 6 }}>
                <span>
                  <Lock size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                  <strong>Automated YouTube Video Link (fetched from channel {channelId})</strong>
                </span>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                  {ytBoostTarget.isSpecificVideo
                    ? '✓ Auto-fetched from YouTube'
                    : ytChecking
                    ? 'Checking YouTube…'
                    : 'Auto-waiting for YouTube upload'}
                </Badge>
              </div>

              {ytBoostTarget.isSpecificVideo ? (
                <>
                  <div className="hub-link-box" style={{ marginBottom: 8 }}>
                    <code>{ytBoostTarget.url}</code>
                  </div>
                  <div className="step1-toggles-row">
                    <span className="muted small">
                      {draft.youtubeVideoTitle
                        ? `Matched YouTube upload: “${draft.youtubeVideoTitle}”`
                        : 'Locked to YouTube video'}
                      {draft.youtubeFetchedAt ? ` · synced ${timeAgo(draft.youtubeFetchedAt)}` : ''}
                    </span>
                    <div className="btn-row">
                      <a
                        className="btn btn-ghost btn-sm"
                        href={ytBoostTarget.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={13} /> Open on YouTube
                      </a>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={ytChecking}
                        onClick={() => void checkYoutubeForPublishedPost(true)}
                      >
                        <RefreshCw size={13} /> {ytChecking ? 'Checking…' : 'Re-sync from YouTube'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted small" style={{ marginBottom: 10 }}>
                    No manual link needed — as soon as your first post is published in YouTube Studio, SceneBoost automatically fetches its YouTube video link from your channel (when you switch back to this tab or every 25s) and locks it into all social posts below.
                  </p>
                  {ytStatusNote && (
                    <p className="small" style={{ marginBottom: 10, color: '#FFB03A' }}>
                      {ytStatusNote}
                    </p>
                  )}
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-accent btn-sm"
                      disabled={ytChecking}
                      onClick={() => void checkYoutubeForPublishedPost(true)}
                    >
                      <RefreshCw size={14} />{' '}
                      {ytChecking
                        ? 'Fetching from YouTube…'
                        : 'First post done on YouTube — Fetch link now'}
                    </button>
                    <a
                      className="btn btn-ghost btn-sm"
                      href="https://studio.youtube.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Youtube size={14} color="#FF0033" /> Open YouTube Studio
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* =========================================================
              OTHER SOCIAL POSTS — AUTOMATICALLY LOCKED TO YOUTUBE LINK
             ========================================================= */}
          <div className="card boost-step-card">
            <div className="card-head">
              <div>
                <div className="step-kicker boost-kicker">OTHER SOCIAL POSTS — PLAYS IN YOUTUBE</div>
                <h3>Fetch platform-ready social posts from SceneBoost</h3>
                <p>
                  Formatted the way each platform needs it — uses only the top part of your description, with the YouTube link automatically locked in so every viewer plays the video in YouTube.
                </p>
              </div>
              <Share2 size={18} className="muted-icon" />
            </div>

            {ytBoostTarget.isSpecificVideo ? (
              <>
                <div className="boost-target-banner ok">
                  <span>🔒 Locked YouTube video link:</span>{' '}
                  <code>{ytBoostTarget.url}</code>
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
              </>
            ) : (
              <div className="boost-target-banner warn" style={{ marginBottom: 0 }}>
                <strong>⏳ Waiting for your first post on YouTube</strong>
                <p className="muted small" style={{ marginTop: 4 }}>
                  Publish this video on YouTube first using the 4 items above. As soon as YouTube publishes it on your channel, SceneBoost automatically fetches the YouTube video link and generates your Facebook, LinkedIn, TikTok, X, Threads, Twitch/Kick, Vimeo and WhatsApp posts here.
                </p>
              </div>
            )}
          </div>

          {/* =========================================================
              PER-POST WEBSITE SWITCH & APPEARANCE
             ========================================================= */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Website &amp; post options</h3>
                <p>Switch off Website when a video isn’t posted to scenering.com</p>
              </div>
              <Globe size={18} className="muted-icon" />
            </div>

            <label className="inline-check" style={{ marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={websiteEnabled}
                onChange={(e) => handleToggleWebsiteForPost(e.target.checked)}
              />
              <span>
                Include Website link (<code>scenering.com</code>) on this post
              </span>
            </label>

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
        </div>

        {/* =========================================================
            SIDEBAR — THE 4 YOUTUBE ITEMS + AUTO YOUTUBE STATUS
           ========================================================= */}
        <aside className="editor-side">
          <div className="card sticky-card">
            <div className="card-head">
              <div>
                <h3>Post Progress</h3>
                <p>4 YouTube items + auto link fetch</p>
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

              <div className={`yt-check-item ${ytBoostTarget.isSpecificVideo ? 'done' : ''}`}>
                <span className="yt-check-dot">{ytBoostTarget.isSpecificVideo ? '✓' : '▶'}</span>
                <div>
                  <strong>YouTube link auto-fetched</strong>
                  <p className="muted small">
                    {ytBoostTarget.isSpecificVideo
                      ? 'Locked in — social posts ready!'
                      : 'Auto-fetches once published on YouTube'}
                  </p>
                </div>
              </div>
            </div>

            <div className="divider" />
            <h4 className="section-label">Plays in YouTube</h4>
            <div className="phone-preview">
              <div className="phone-hero" style={coverStyle(draft.thumbnail, 'hero')}>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : draft.status}>
                  {ytBoostTarget.isSpecificVideo ? '▶ Plays in YouTube' : 'Waiting for YouTube'}
                </Badge>
                <div className="phone-hero-title">{draft.title || 'Your post title'}</div>
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
                Automated YouTube link — no manual choice
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-accent btn-sm btn-block"
                onClick={handleSave}
                disabled={!dirty}
              >
                <Save size={14} /> {dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
