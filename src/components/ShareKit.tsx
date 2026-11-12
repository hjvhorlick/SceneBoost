import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Copy,
  Check,
  QrCode,
  ExternalLink,
  Download,
  Youtube,
  Share2,
  Edit3,
  Sparkles,
  RefreshCw,
  Lock,
} from 'lucide-react'
import type { AppData, Scene, SceneLink } from '../types'
import { copyText, timeAgo, uid } from '../lib/utils'
import { coverStyle } from '../lib/platforms'
import {
  SOCIAL_BOOST_PLATFORMS,
  PLATFORM_COMPOSER_LINKS,
  buildYoutubeStudioPack,
  buildSocialBoostPost,
  downloadYoutubeThumbnail,
  extractTopDescription,
  formatFileSize,
  resolveYoutubeBoostUrl,
  type SocialBoostPlatform,
} from '../lib/scenering'
import { generateSeoTagsWithGemini, loadGeminiApiKey } from '../lib/gemini'
import { autoFetchYoutubeVideoForPost } from '../lib/youtube'
import { Badge, EmptyState } from './ui'

interface Props {
  data: AppData
  onEditScene?: (sceneId: string) => void
  onUpdateScene?: (scene: Scene) => void
  notify: (msg: string) => void
}

export default function ShareKit({ data, onEditScene, onUpdateScene, notify }: Props) {
  const [selectedId, setSelectedId] = useState<string>(data.scenes[0]?.id ?? '')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [boostPlatform, setBoostPlatform] = useState<SocialBoostPlatform>('facebook')
  const [geminiBusy, setGeminiBusy] = useState(false)
  const [ytChecking, setYtChecking] = useState(false)
  const checkingRef = useRef(false)

  useEffect(() => {
    if (!selectedId && data.scenes[0]) setSelectedId(data.scenes[0].id)
  }, [data.scenes, selectedId])

  const scene = data.scenes.find((s) => s.id === selectedId) ?? data.scenes[0]

  const ytBoostTarget = useMemo(
    () =>
      scene
        ? resolveYoutubeBoostUrl(scene, data.platforms)
        : { url: '', isSpecificVideo: false, channelUrl: '' },
    [scene, data.platforms]
  )

  const ytPack = useMemo(() => (scene ? buildYoutubeStudioPack(scene) : null), [scene])

  // QR code ALWAYS points straight to YouTube (automated — no choice)
  useEffect(() => {
    if (!ytBoostTarget.isSpecificVideo || !ytBoostTarget.url) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(ytBoostTarget.url, {
      width: 320,
      margin: 2,
      color: { dark: '#070A12', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [ytBoostTarget.isSpecificVideo, ytBoostTarget.url])

  const doCopy = async (key: string, text: string, msg = 'Copied ✓') => {
    const ok = await copyText(text)
    setCopied(key)
    notify(ok ? msg : 'Copy failed — select the text manually')
    setTimeout(() => setCopied(null), 1600)
  }

  const syncYoutubeAutomatically = useCallback(
    async (manualTrigger = false) => {
      if (!scene || !onUpdateScene || checkingRef.current) return
      if (!scene.title.trim() || scene.title === 'Untitled post') return

      checkingRef.current = true
      setYtChecking(true)
      try {
        const res = await autoFetchYoutubeVideoForPost(scene, data.scenes, data.platforms, {
          checkClipboard: manualTrigger,
        })
        if (res.matched) {
          const nowIso = new Date().toISOString()
          const hasYt = scene.links.some((l) => l.platform === 'youtube')
          const nextLinks: SceneLink[] = hasYt
            ? scene.links.map((l, idx) =>
                l.platform === 'youtube' &&
                idx === scene.links.findIndex((x) => x.platform === 'youtube')
                  ? { ...l, url: res.matched!.url, enabled: true, label: 'Watch Full Video on YouTube' }
                  : l
              )
            : [
                {
                  id: uid(),
                  platform: 'youtube',
                  label: 'Watch Full Video on YouTube',
                  url: res.matched.url,
                  enabled: true,
                  clicks: 0,
                  order: 0,
                },
                ...scene.links.map((l) => ({ ...l, order: l.order + 1 })),
              ]
          onUpdateScene({
            ...scene,
            videoUrl: res.matched.url,
            youtubeVideoTitle: res.matched.title,
            youtubeFetchedAt: nowIso,
            status: 'live',
            links: nextLinks,
            updatedAt: nowIso,
          })
          if (manualTrigger || scene.videoUrl !== res.matched.url) {
            notify(`Fetched this video’s URL (${res.matched.url}) & placed in all social posts ✓`)
          }
        } else if (manualTrigger) {
          notify('Video not posted on YouTube yet — post it first, then click Fetch This Video’s URL')
        }
      } catch (err) {
        if (manualTrigger) {
          notify(err instanceof Error ? err.message : 'Could not check YouTube right now')
        }
      } finally {
        checkingRef.current = false
        setYtChecking(false)
      }
    },
    [scene, onUpdateScene, data.scenes, data.platforms, notify]
  )

  useEffect(() => {
    if (!scene || ytBoostTarget.isSpecificVideo) return
    const t = setTimeout(() => void syncYoutubeAutomatically(false), 600)
    const onFocus = () => {
      if (document.visibilityState === 'visible') void syncYoutubeAutomatically(false)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearTimeout(t)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [scene, ytBoostTarget.isSpecificVideo, syncYoutubeAutomatically])

  const handleAskGemini = async () => {
    if (!scene || !onUpdateScene) return
    const key = loadGeminiApiKey()
    if (!key) {
      notify('Add your Gemini API key in Settings or Post Editor first')
      if (onEditScene) onEditScene(scene.id)
      return
    }
    setGeminiBusy(true)
    try {
      const seoTags = await generateSeoTagsWithGemini({
        apiKey: key,
        title: scene.title,
        topDescription: extractTopDescription(scene.description, 600),
      })
      onUpdateScene({
        ...scene,
        tags: seoTags,
        updatedAt: new Date().toISOString(),
      })
      notify(`Gemini generated ${seoTags.length} SEO-friendly tags ✓`)
    } catch (err) {
      notify(`Gemini error: ${err instanceof Error ? err.message : 'failed'}`)
    } finally {
      setGeminiBusy(false)
    }
  }

  if (!scene || !ytPack) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Share Kit</h1>
            <p className="page-sub">
              The 4 YouTube items + automated YouTube link fetch + platform-tailored social posts.
            </p>
          </div>
        </div>
        <EmptyState
          icon={<QrCode size={28} />}
          title="No posts yet"
          body="Create a post from your Scenering folder first — then copy your 4 YouTube items and social posts here."
        />
      </div>
    )
  }

  const socialPost = buildSocialBoostPost(scene, boostPlatform, {
    platforms: data.platforms,
  })
  const composerLink = PLATFORM_COMPOSER_LINKS[boostPlatform]
  const hasRealThumbnail = scene.thumbnail.startsWith('data:image/')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Share Kit</h1>
          <p className="page-sub">
            Post the video &amp; 4 items on YouTube first — SceneBoost fetches that video’s own URL right after posting and places it into all the other social pages’ posts.
          </p>
        </div>
        <div className="btn-row">
          <select
            value={scene.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="select"
          >
            {data.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {onEditScene && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onEditScene(scene.id)}
            >
              <Edit3 size={14} /> Edit post
            </button>
          )}
        </div>
      </div>

      {/* THE 4 ITEMS FOR YOUTUBE */}
      <div className="share-grid">
        <div className="card yt-step-card">
          <div className="card-head">
            <div>
              <div className="step-kicker yt-kicker">FIRST POST — YOUTUBE (THE 4 ITEMS)</div>
              <h3>YouTube Upload Items</h3>
              <p>Ready for YouTube Studio alongside your channel’s predefined upload defaults.</p>
            </div>
            <a
              className="btn btn-ghost btn-sm"
              href="https://studio.youtube.com"
              target="_blank"
              rel="noreferrer"
            >
              <Youtube size={15} color="#FF0033" /> YouTube Studio <ExternalLink size={12} />
            </a>
          </div>

          <div className="yt-copy-block">
            <div className="yt-copy-head">
              <strong>
                1. Video &amp; Title{' '}
                {scene.videoFileName && (
                  <span className="muted small">
                    ({scene.videoFileName}
                    {scene.videoSizeBytes ? ` · ${formatFileSize(scene.videoSizeBytes)}` : ''})
                  </span>
                )}
              </strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void doCopy('yt-title', ytPack.title, 'Title copied ✓')}
              >
                {copied === 'yt-title' ? <Check size={13} /> : <Copy size={13} />} Copy title
              </button>
            </div>
            <pre className="code-block">{ytPack.title}</pre>
          </div>

          <div className="yt-copy-block">
            <div className="yt-copy-head">
              <strong>2. Script Description + Complete Credit Document (YouTube Only)</strong>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() =>
                  void doCopy(
                    'yt-desc',
                    ytPack.descriptionWithCredits,
                    'Script + complete credit document copied ✓'
                  )
                }
              >
                {copied === 'yt-desc' ? <Check size={13} /> : <Copy size={13} />} Copy script + full credits
              </button>
            </div>
            <pre className="code-block tall">{ytPack.descriptionWithCredits}</pre>
          </div>

          <div className="yt-copy-block">
            <div className="yt-copy-head">
              <strong>4. SEO-Friendly Tags ({ytPack.tagsCharCount} / 500 chars)</strong>
              <div className="btn-row" style={{ gap: 6 }}>
                {onUpdateScene && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={geminiBusy}
                    onClick={() => void handleAskGemini()}
                  >
                    <Sparkles size={13} /> {geminiBusy ? 'Asking Gemini…' : 'Ask Gemini'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void doCopy('yt-tags', ytPack.tagsCsv, 'SEO tags copied ✓')}
                >
                  {copied === 'yt-tags' ? <Check size={13} /> : <Copy size={13} />} Copy tags
                </button>
              </div>
            </div>
            <pre className="code-block">{ytPack.tagsCsv}</pre>
          </div>

          <div className="divider" />
          <div className={`yt-live-url-box ${ytBoostTarget.isSpecificVideo ? 'ready' : 'pending'}`}>
            <div className="yt-copy-head" style={{ marginBottom: 6 }}>
              <span>
                <Lock size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                <strong>
                  {ytBoostTarget.isSpecificVideo
                    ? 'This Video’s YouTube URL — Placed in All Social Posts'
                    : 'After Posting the Video → Fetch That Video’s Own URL'}
                </strong>
              </span>
              <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                {ytBoostTarget.isSpecificVideo
                  ? '✓ Placed in social posts'
                  : ytChecking
                  ? 'Fetching…'
                  : 'Waiting for video'}
              </Badge>
            </div>

            {ytBoostTarget.isSpecificVideo ? (
              <>
                <div className="hub-link-box" style={{ marginBottom: 8 }}>
                  <code>{ytBoostTarget.url}</code>
                </div>
                <div className="step1-toggles-row">
                  <span className="muted small">
                    {scene.youtubeFetchedAt ? `Fetched ${timeAgo(scene.youtubeFetchedAt)}` : 'Placed in all social posts'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={ytChecking}
                    onClick={() => void syncYoutubeAutomatically(true)}
                  >
                    <RefreshCw size={13} /> Re-fetch Video URL
                  </button>
                </div>
              </>
            ) : (
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-accent btn-sm"
                  disabled={ytChecking}
                  onClick={() => void syncYoutubeAutomatically(true)}
                >
                  <RefreshCw size={13} />{' '}
                  {ytChecking ? 'Fetching This Video’s URL…' : 'Video Posted — Fetch This Video’s URL'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ITEM 3 THUMBNAIL + AUTOMATED YOUTUBE QR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>3. Thumbnail</h3>
                <p>
                  {hasRealThumbnail
                    ? scene.thumbnailFileName || 'Fetched / uploaded thumbnail'
                    : 'Not found in folder — upload in Editor'}
                </p>
              </div>
              <Badge tone={hasRealThumbnail ? 'live' : 'draft'}>
                {hasRealThumbnail ? '✓ Ready' : 'Missing'}
              </Badge>
            </div>
            <div
              className="thumb-preview-16x9"
              style={{ ...coverStyle(scene.thumbnail, 'swatch'), width: '100%', height: 164, marginBottom: 12 }}
            >
              <span className="thumb-res-badge">
                {hasRealThumbnail ? '✓ 1280×720 HD' : 'Upload needed'}
              </span>
            </div>
            <div className="btn-row">
              {hasRealThumbnail && (
                <button
                  type="button"
                  className="btn btn-accent btn-sm"
                  onClick={async () => {
                    const ok = await downloadYoutubeThumbnail(scene.thumbnail, scene.slug)
                    notify(ok ? 'Downloaded 1280×720 thumbnail (.jpg) ✓' : 'Could not export thumbnail')
                  }}
                >
                  <Download size={14} /> Download 1280×720 (.jpg)
                </button>
              )}
              {onEditScene && (
                <button
                  type="button"
                  className={hasRealThumbnail ? 'btn btn-ghost btn-sm' : 'btn btn-accent btn-sm'}
                  onClick={() => onEditScene(scene.id)}
                >
                  {hasRealThumbnail ? 'Replace thumbnail' : 'Upload thumbnail'}
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>YouTube QR Code</h3>
                <p>Scans straight to the YouTube video</p>
              </div>
              <QrCode size={18} className="muted-icon" />
            </div>
            <div className="qr-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`YouTube QR code for ${scene.title}`} />
              ) : (
                <div className="qr-placeholder">
                  QR activates automatically once the YouTube video link is fetched.
                </div>
              )}
            </div>
            {qrDataUrl && (
              <a
                className="btn btn-ghost btn-sm btn-block"
                href={qrDataUrl}
                download={`${scene.slug}-youtube-qr.png`}
              >
                <Download size={14} /> Download YouTube QR (PNG)
              </a>
            )}
          </div>
        </div>
      </div>

      {/* OTHER SOCIAL POSTS — SCRIPT ONLY + SCENERING.COM + YOUTUBE LINK */}
      <div className="card boost-step-card">
        <div className="card-head">
          <div>
            <div className="step-kicker boost-kicker">OTHER SOCIAL POSTS — SCRIPT + SCENERING.COM + YOUTUBE LINK</div>
            <h3>Other Social Posts (tailored per platform)</h3>
            <p>
              Uses only the short description (the script — no credit document), always includes{' '}
              <code>https://scenering.com</code>, and plays the video via its fetched YouTube URL.
            </p>
          </div>
          <Share2 size={18} className="muted-icon" />
        </div>

        {ytBoostTarget.isSpecificVideo ? (
          <>
            <div className="boost-target-banner ok">
              <span>🔒 Locked YouTube video link:</span> <code>{ytBoostTarget.url}</code>
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

            <pre className="code-block tall">{socialPost}</pre>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() =>
                  void doCopy(
                    `boost-${boostPlatform}`,
                    socialPost,
                    `${SOCIAL_BOOST_PLATFORMS.find(([id]) => id === boostPlatform)?.[1] ?? 'Social'} post copied ✓`
                  )
                }
              >
                {copied === `boost-${boostPlatform}` ? <Check size={14} /> : <Copy size={14} />} Copy{' '}
                {SOCIAL_BOOST_PLATFORMS.find(([id]) => id === boostPlatform)?.[1]} post
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
          </>
        ) : (
          <div className="boost-target-banner warn" style={{ marginBottom: 0 }}>
            <strong>⏳ Waiting for your first post on YouTube</strong>
            <p className="muted small" style={{ marginTop: 4 }}>
              Publish your video on YouTube first — SceneBoost will automatically fetch the YouTube video link from your channel and unlock all social posts here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
