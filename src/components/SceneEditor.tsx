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
  CloudUpload,
  Film,
  AlertCircle,
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
  connectYoutubeAccount,
  getConnectedYoutubeChannelLabel,
  loadGoogleOAuthClientId,
  saveGoogleOAuthClientId,
  snapshotExistingChannelVideoIds,
  uploadPostDirectlyToYoutube,
  verifyStudioVideoUrlForPost,
} from '../lib/youtube'
import { loadVideoFileForPost, saveVideoFileForPost } from '../lib/videoStore'
import { copyText, slugify, timeAgo, uid } from '../lib/utils'
import { Badge, PlatformPill } from './ui'

interface Props {
  scene: Scene
  initialVideoFile?: File | null
  onRememberVideoFile?: (postId: string, file: File) => void
  data: AppData
  onBack: () => void
  onSave: (scene: Scene) => void
  onDelete: (id: string) => void
  onOpenHub: (slug: string) => void
  notify: (msg: string) => void
}

export default function SceneEditor({
  scene,
  initialVideoFile,
  onRememberVideoFile,
  data,
  onBack,
  onSave,
  onDelete,
  onOpenHub,
  notify,
}: Props) {
  const [draft, setDraft] = useState<Scene>(scene)
  const [videoFile, setVideoFile] = useState<File | null>(initialVideoFile ?? null)
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

  // Real YouTube upload & strict post-upload verification state
  const [ytChecking, setYtChecking] = useState(false)
  const [ytStatusNote, setYtStatusNote] = useState<string>('')
  const [ytUploading, setYtUploading] = useState(false)
  const [ytUploadStage, setYtUploadStage] = useState<string>('')
  const [ytUploadPct, setYtUploadPct] = useState<number>(0)
  const [ytPrivacy, setYtPrivacy] = useState<'public' | 'unlisted' | 'private'>('public')
  const [showOauthBox, setShowOauthBox] = useState(false)
  const [oauthClientId, setOauthClientId] = useState<string>(() => loadGoogleOAuthClientId())
  const [connectedChannelLabel, setConnectedChannelLabel] = useState<string>(() =>
    getConnectedYoutubeChannelLabel()
  )
  const [connectingYt, setConnectingYt] = useState(false)
  const [showUnlistedVerify, setShowUnlistedVerify] = useState(false)
  const [studioVideoUrlInput, setStudioVideoUrlInput] = useState('')
  const checkingRef = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const thumbInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(scene)
    setVideoFile(initialVideoFile ?? null)
    setSlugTouched(false)
    setYtStatusNote('')
    setYtUploadPct(0)
    const initialTags =
      scene.tags && scene.tags.length > 0
        ? scene.tags
        : generateYoutubeRankingTags({
            title: scene.title,
            shortDescription: scene.description,
          })
    setTagsText(formatYoutubeTagsCsv(initialTags))

    if (!initialVideoFile) {
      let alive = true
      void loadVideoFileForPost(scene.id).then((persisted) => {
        if (alive && persisted) {
          setVideoFile(persisted)
          onRememberVideoFile?.(scene.id, persisted)
        }
      })
      return () => {
        alive = false
      }
    }
  }, [scene.id, initialVideoFile, onRememberVideoFile])

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
        youtubeVerified: true,
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

  // Strictly verify whether a BRAND-NEW video was uploaded to the YouTube channel
  // AFTER this post was created (NEVER auto-matching old channel videos!)
  const checkYoutubeForPublishedPost = useCallback(
    async () => {
      if (checkingRef.current) return
      const current = draftRef.current
      if (!current.title.trim() || current.title === 'Untitled post') {
        notify('Select your Scenering folder or enter the video title first')
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
          applyFetchedYoutubeVideo(res.matched.url, res.matched.title)
          setYtStatusNote(
            `Verified new upload on YouTube: “${res.matched.title}” (${res.matched.url})`
          )
          notify(`Verified new YouTube video (${res.matched.url}) & placed in all social posts ✓`)
        } else {
          const msg =
            res.reason ||
            'Not posted on YouTube yet — no new video was found on your channel since this post was created.'
          setYtStatusNote(msg)
          notify('Not posted on YouTube yet — upload the video first')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not verify with YouTube right now'
        setYtStatusNote(msg)
        notify(msg)
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

  // Snapshot existing channel videos once if missing (NEVER auto-marks a draft post as live!)
  useEffect(() => {
    if (ytBoostTarget.isSpecificVideo) return
    if (draft.knownChannelVideoIdsAtCreate && draft.knownChannelVideoIdsAtCreate.length > 0) return

    let alive = true
    void snapshotExistingChannelVideoIds(data.platforms).then((ids) => {
      if (!alive || ids.length === 0) return
      const current = draftRef.current
      if (current.knownChannelVideoIdsAtCreate?.length) return
      const next = { ...current, knownChannelVideoIdsAtCreate: ids }
      setDraft(next)
      onSave(next)
    })
    return () => {
      alive = false
    }
  }, [ytBoostTarget.isSpecificVideo, draft.id, draft.knownChannelVideoIdsAtCreate, data.platforms, onSave])

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

  // Attach a single .mp4 / .webm / .mov video file and persist it in IndexedDB
  const handleAttachVideoFile = (file: File | undefined) => {
    if (!file) return
    setVideoFile(file)
    onRememberVideoFile?.(draft.id, file)
    void saveVideoFileForPost(draft.id, file)
    setDraft((d) => ({
      ...d,
      videoFileName: file.name,
      videoSizeBytes: file.size,
      updatedAt: new Date().toISOString(),
    }))
    notify(`Video file attached & ready for YouTube upload: ${file.name} ✓`)
  }

  // Fetch video + credits + top part of description + thumbnail from Scenering folder
  const handleImportScenering = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const imported = await parseSceneringFiles(files)
    if (imported.videoFile) {
      setVideoFile(imported.videoFile)
      onRememberVideoFile?.(draft.id, imported.videoFile)
      void saveVideoFileForPost(draft.id, imported.videoFile)
    }

    setDraft((d) => {
      const shouldUpdateTitle =
        imported.title &&
        (!d.title.trim() || d.title === 'Untitled post' || d.title === 'Untitled scene')
      const nextTitle = shouldUpdateTitle ? imported.title : d.title
      const nextSlug =
        shouldUpdateTitle && !slugTouched ? slugify(imported.title) : d.slug
      const nextTopDesc = imported.shortDescription || extractTopDescription(d.description, 600)
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
      const topDesc = extractTopDescription(draft.description, 600)
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

  const handleConnectYoutubeChannel = async () => {
    const cleanClientId = oauthClientId.trim() || loadGoogleOAuthClientId()
    if (!cleanClientId) {
      setShowOauthBox(true)
      notify('Paste your Google Cloud Web OAuth Client ID first')
      return
    }
    saveGoogleOAuthClientId(cleanClientId)
    setConnectingYt(true)
    try {
      const ch = await connectYoutubeAccount(cleanClientId)
      const label = `${ch.channelTitle} (${ch.channelId})`
      setConnectedChannelLabel(label)
      setShowOauthBox(false)
      notify(`Connected to YouTube channel: ${ch.channelTitle} ✓`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not connect YouTube account')
    } finally {
      setConnectingYt(false)
    }
  }

  const handleDirectUploadToYoutube = async () => {
    if (!videoFile) {
      notify('Attach your video file (.mp4/.webm) or select your Scenering folder first')
      videoInputRef.current?.click()
      return
    }
    const cleanClientId = oauthClientId.trim() || loadGoogleOAuthClientId()
    if (!cleanClientId) {
      setShowOauthBox(true)
      notify('Connect your YouTube Google OAuth Client ID below to upload directly from SceneBoost')
      return
    }
    saveGoogleOAuthClientId(cleanClientId)
    setYtUploading(true)
    setYtUploadPct(2)
    setYtUploadStage('Signing in & starting YouTube upload…')
    setYtStatusNote('')
    try {
      const created = await uploadPostDirectlyToYoutube({
        clientId: cleanClientId,
        videoFile,
        title: ytPack.title,
        descriptionWithCredits: ytPack.descriptionWithCredits,
        tags: ytPack.tags,
        thumbnailDataUrl: hasRealThumbnail ? draft.thumbnail : undefined,
        privacyStatus: ytPrivacy,
        onStage: (stage, pct) => {
          setYtUploadStage(stage)
          setYtUploadPct(pct)
        },
      })
      applyFetchedYoutubeVideo(created.url, created.title)
      setShowOauthBox(false)
      setYtStatusNote(
        `Uploaded & verified on YouTube (${created.url}) — placed into all social posts!`
      )
      notify(`Video uploaded & verified on YouTube (${created.url}) ✓`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Direct YouTube upload failed'
      setYtStatusNote(`Upload did NOT complete: ${msg}`)
      notify(msg)
    } finally {
      setYtUploading(false)
      setYtUploadStage('')
    }
  }

  const handleVerifyStudioVideoUrl = async () => {
    if (!studioVideoUrlInput.trim()) {
      notify('Paste the newly created https://youtu.be/... video URL from YouTube Studio')
      return
    }
    setYtChecking(true)
    try {
      const verified = await verifyStudioVideoUrlForPost(
        studioVideoUrlInput,
        draftRef.current,
        data.scenes
      )
      applyFetchedYoutubeVideo(verified.url, verified.title)
      setShowUnlistedVerify(false)
      setStudioVideoUrlInput('')
      setYtStatusNote(`Verified on YouTube (${verified.url}) & placed into all social posts`)
      notify(`Verified YouTube video (${verified.url}) & placed in all social posts ✓`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not verify video URL on YouTube'
      setYtStatusNote(msg)
      notify(msg)
    } finally {
      setYtChecking(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={15} /> All posts
          </button>
          <h1>{draft.title || 'Untitled post'}</h1>
          <p className="page-sub">
            1) Post the video &amp; 4 items to YouTube → 2) Fetch that video’s own URL → 3) Placed automatically into all the other social pages’ posts.
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
                <strong>1. Video File &amp; Title</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.mkv"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      handleAttachVideoFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    className={videoFile ? 'btn btn-ghost btn-sm' : 'btn btn-accent btn-sm'}
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Film size={13} /> {videoFile ? 'Change video file' : 'Attach video (.mp4)'}
                  </button>
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
              {videoFile ? (
                <p className="small" style={{ marginBottom: 8, color: 'var(--accent)' }}>
                  ✓ Video file attached &amp; ready to upload: <code>{videoFile.name}</code> (
                  {formatFileSize(videoFile.size)})
                </p>
              ) : draft.videoFileName ? (
                <p className="small" style={{ marginBottom: 8, color: '#FFB03A' }}>
                  ⚠ Filename recorded (<code>{draft.videoFileName}</code>), but video file is not attached yet — click{' '}
                  <strong>Select Scenering folder</strong> or <strong>Attach video (.mp4)</strong> to upload directly.
                </p>
              ) : (
                <p className="muted small" style={{ marginBottom: 8 }}>
                  Select your Scenering folder (or click <strong>Attach video (.mp4)</strong>) so SceneBoost has your rendered video ready to upload.
                </p>
              )}
              <input
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Video title…"
              />
            </div>

            {/* ITEM 2 — SHORT DESCRIPTION (SCRIPT) + COMPLETE CREDIT DOCUMENT (YOUTUBE ONLY) */}
            <div className="four-item-box">
              <div className="yt-copy-head">
                <strong>2. Script Description + Complete Credit Document (YouTube Only)</strong>
                <div className="btn-row" style={{ gap: 8 }}>
                  <span className="char-pill">{ytPack.descriptionWithCredits.length} / 5000</span>
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    onClick={() =>
                      void doCopy(
                        'yt-desc',
                        ytPack.descriptionWithCredits,
                        'YouTube script & complete credit document'
                      )
                    }
                  >
                    {copied === 'yt-desc' ? <Check size={13} /> : <Copy size={13} />} Copy script + full credits
                  </button>
                </div>
              </div>

              <label className="field" style={{ marginBottom: 10 }}>
                <span className="muted small">
                  Short description — the script (used for YouTube &amp; all other social posts; <code>https://scenering.com</code> is placed at the end of the script section)
                </span>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Short description from your script…"
                />
              </label>

              <div className="step1-toggles-row" style={{ marginBottom: 8 }}>
                <span className="muted small">
                  {draft.credits?.trim()
                    ? '✓ Complete credit document attached for YouTube only (YouTube plays & stores the video)'
                    : 'No credit document loaded yet (select Scenering folder or paste below)'}
                </span>
                <button
                  type="button"
                  className="link-toggle-btn"
                  onClick={() => setShowCreditsEditor((v) => !v)}
                >
                  {showCreditsEditor ? 'Hide credit document ▲' : 'View / edit credit document ▼'}
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

            {/* REAL YOUTUBE UPLOAD & VERIFIED PER-VIDEO URL */}
            <div className={`yt-live-url-box ${ytBoostTarget.isSpecificVideo ? 'ready' : 'pending'}`}>
              <div className="yt-copy-head" style={{ marginBottom: 6 }}>
                <span>
                  <Lock size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                  <strong>
                    {ytBoostTarget.isSpecificVideo
                      ? 'Verified on YouTube — Video URL Placed in All Social Posts'
                      : 'Not Posted to YouTube Yet — Upload Video & Verify'}
                  </strong>
                </span>
                <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                  {ytBoostTarget.isSpecificVideo
                    ? '✓ Verified on YouTube'
                    : ytUploading
                    ? `Uploading ${ytUploadPct}%…`
                    : ytChecking
                    ? 'Verifying on YouTube…'
                    : 'Not posted yet'}
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
                        ? `Verified YouTube video: “${draft.youtubeVideoTitle}”`
                        : 'Verified YouTube video URL'}
                      {draft.youtubeFetchedAt ? ` · verified ${timeAgo(draft.youtubeFetchedAt)}` : ''}
                      {' · placed into all social posts below'}
                    </span>
                    <div className="btn-row">
                      <a
                        className="btn btn-ghost btn-sm"
                        href={ytBoostTarget.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={13} /> Watch on YouTube
                      </a>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const cleared: Scene = {
                            ...draftRef.current,
                            videoUrl: '',
                            youtubeVerified: false,
                            youtubeVideoTitle: undefined,
                            youtubeFetchedAt: undefined,
                            status: 'draft',
                            updatedAt: new Date().toISOString(),
                          }
                          setDraft(cleared)
                          onSave(cleared)
                          notify('Cleared YouTube link — post reset to Draft')
                        }}
                      >
                        Reset link
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted small" style={{ marginBottom: 10 }}>
                    SceneBoost will <strong>never</strong> mark a post Live until a real video is uploaded and verified on YouTube. Use{' '}
                    <strong>Upload &amp; Publish Video to YouTube</strong> below to upload the video + 4 items directly via the YouTube API, or upload manually in YouTube Studio and click{' '}
                    <strong>Verify Newly Uploaded Video</strong>.
                  </p>

                  {ytUploading && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="small" style={{ marginBottom: 4, color: 'var(--accent)' }}>
                        {ytUploadStage || `Uploading to YouTube (${ytUploadPct}%)…`}
                      </div>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${ytUploadPct}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            transition: 'width 180ms ease',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {ytStatusNote && (
                    <p
                      className="small"
                      style={{
                        marginBottom: 10,
                        color: '#FFB03A',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 6,
                      }}
                    >
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{ytStatusNote}</span>
                    </p>
                  )}

                  {connectedChannelLabel && (
                    <p className="small" style={{ marginBottom: 8, color: 'var(--accent)' }}>
                      ✓ Connected YouTube account: <strong>{connectedChannelLabel}</strong>
                    </p>
                  )}

                  {showOauthBox && (
                    <div className="gemini-key-inline" style={{ marginBottom: 12 }}>
                      <div className="yt-copy-head" style={{ marginBottom: 6 }}>
                        <span>
                          <KeyRound size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                          <strong>Connect YouTube Account (Google Cloud OAuth Client ID)</strong>
                        </span>
                        <button
                          type="button"
                          className="link-toggle-btn"
                          onClick={() => setShowOauthBox(false)}
                        >
                          Close
                        </button>
                      </div>
                      <p className="muted small" style={{ marginBottom: 8 }}>
                        To let SceneBoost upload video files directly to your YouTube channel, create a Web OAuth 2.0 Client ID in{' '}
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'underline' }}
                        >
                          Google Cloud Console
                        </a>{' '}
                        (with <strong>YouTube Data API v3</strong> enabled) and add{' '}
                        <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code> under{' '}
                        <em>Authorized JavaScript origins</em>.
                      </p>
                      <div className="btn-row" style={{ marginBottom: 6 }}>
                        <input
                          type="text"
                          style={{ flex: 1 }}
                          value={oauthClientId}
                          onChange={(e) => setOauthClientId(e.target.value)}
                          placeholder="1234567890-abcdef.apps.googleusercontent.com"
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={connectingYt || !oauthClientId.trim()}
                          onClick={() => void handleConnectYoutubeChannel()}
                        >
                          {connectingYt ? 'Connecting…' : 'Connect & Test Channel'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-accent btn-sm"
                          disabled={ytUploading || !oauthClientId.trim()}
                          onClick={() => void handleDirectUploadToYoutube()}
                        >
                          <CloudUpload size={13} /> Save &amp; Upload Video
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PRIMARY: DIRECT AUTOMATED UPLOAD TO YOUTUBE */}
                  <div className="btn-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-accent btn-sm"
                      disabled={ytUploading}
                      onClick={() => void handleDirectUploadToYoutube()}
                    >
                      <CloudUpload size={14} />{' '}
                      {ytUploading
                        ? ytUploadStage || `Uploading (${ytUploadPct}%)…`
                        : videoFile
                        ? 'Upload & Publish Video to YouTube'
                        : 'Attach Video & Upload to YouTube'}
                    </button>

                    <select
                      className="select"
                      style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                      value={ytPrivacy}
                      onChange={(e) =>
                        setYtPrivacy(e.target.value as 'public' | 'unlisted' | 'private')
                      }
                      title="YouTube visibility"
                    >
                      <option value="public">Visibility: Public</option>
                      <option value="unlisted">Visibility: Unlisted</option>
                      <option value="private">Visibility: Private</option>
                    </select>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowOauthBox((v) => !v)}
                    >
                      <KeyRound size={13} />{' '}
                      {oauthClientId.trim() ? 'YouTube API Settings' : 'Connect YouTube API'}
                    </button>
                  </div>

                  {/* SECONDARY: MANUAL UPLOAD IN YOUTUBE STUDIO + STRICT VERIFICATION */}
                  <div
                    style={{
                      paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span className="muted small" style={{ marginRight: 4 }}>
                      Or upload manually in YouTube Studio first:
                    </span>
                    <a
                      className="btn btn-ghost btn-sm"
                      href="https://studio.youtube.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Youtube size={14} color="#FF0033" /> Open YouTube Studio <ExternalLink size={11} />
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={ytChecking || ytUploading}
                      onClick={() => void checkYoutubeForPublishedPost()}
                    >
                      <RefreshCw size={13} />{' '}
                      {ytChecking
                        ? 'Verifying on YouTube…'
                        : 'I Uploaded in Studio — Verify New Video'}
                    </button>
                    <button
                      type="button"
                      className="link-toggle-btn"
                      onClick={() => setShowUnlistedVerify((v) => !v)}
                    >
                      {showUnlistedVerify ? 'Hide Unlisted URL check ▲' : 'Uploaded as Unlisted? Verify URL ▼'}
                    </button>
                  </div>

                  {showUnlistedVerify && (
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <input
                        type="url"
                        style={{ flex: 1 }}
                        value={studioVideoUrlInput}
                        onChange={(e) => setStudioVideoUrlInput(e.target.value)}
                        placeholder="Paste newly created https://youtu.be/... link from YouTube Studio to verify"
                      />
                      <button
                        type="button"
                        className="btn btn-accent btn-sm"
                        disabled={ytChecking || !studioVideoUrlInput.trim()}
                        onClick={() => void handleVerifyStudioVideoUrl()}
                      >
                        Verify on YouTube
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* =========================================================
              OTHER SOCIAL POSTS — SCRIPT ONLY + SCENERING WEBSITE + YOUTUBE LINK
             ========================================================= */}
          <div className="card boost-step-card">
            <div className="card-head">
              <div>
                <div className="step-kicker boost-kicker">OTHER SOCIAL POSTS — SCRIPT + SCENERING.COM + YOUTUBE LINK</div>
                <h3>Fetch platform-ready social posts from SceneBoost</h3>
                <p>
                  Uses only the short description (the script — no credit document), always includes{' '}
                  <code>https://scenering.com</code>, and locks in this video’s YouTube URL to play the video in YouTube.
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
