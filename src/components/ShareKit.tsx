import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import type { AppData, Scene } from '../types'
import { copyText, hubUrl } from '../lib/utils'
import { coverStyle } from '../lib/platforms'
import {
  SOCIAL_BOOST_PLATFORMS,
  PLATFORM_COMPOSER_LINKS,
  buildYoutubeStudioPack,
  buildSocialBoostPost,
  downloadYoutubeThumbnail,
  extractTopDescription,
  formatFileSize,
  isSpecificYoutubeVideoUrl,
  resolveYoutubeBoostUrl,
  type SocialBoostPlatform,
} from '../lib/scenering'
import { generateSeoTagsWithGemini, loadGeminiApiKey } from '../lib/gemini'
import { Badge, EmptyState } from './ui'

interface Props {
  data: AppData
  onEditScene?: (sceneId: string) => void
  onUpdateScene?: (scene: Scene) => void
  notify: (msg: string) => void
}

export default function ShareKit({ data, onEditScene, onUpdateScene, notify }: Props) {
  const [selectedId, setSelectedId] = useState<string>(data.scenes[0]?.id ?? '')
  const [qrTargetMode, setQrTargetMode] = useState<'youtube' | 'hub'>('youtube')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [boostPlatform, setBoostPlatform] = useState<SocialBoostPlatform>('facebook')
  const [geminiBusy, setGeminiBusy] = useState(false)

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

  const hub = scene ? hubUrl(scene.slug) : ''
  const qrUrl = qrTargetMode === 'youtube' ? ytBoostTarget.url : hub

  useEffect(() => {
    if (!qrUrl) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(qrUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#070A12', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [qrUrl])

  const doCopy = async (key: string, text: string, msg = 'Copied ✓') => {
    const ok = await copyText(text)
    setCopied(key)
    notify(ok ? msg : 'Copy failed — select the text manually')
    setTimeout(() => setCopied(null), 1600)
  }

  const handleQuickYoutubeUrl = (rawUrl: string) => {
    if (!scene || !onUpdateScene) return
    const url = rawUrl.trim()
    const autoLive =
      isSpecificYoutubeVideoUrl(url) && scene.status === 'draft' ? 'live' : scene.status
    const hasYt = scene.links.some((l) => l.platform === 'youtube')
    const nextLinks = url
      ? hasYt
        ? scene.links.map((l, idx) =>
            l.platform === 'youtube' && idx === scene.links.findIndex((x) => x.platform === 'youtube')
              ? { ...l, url, enabled: true, label: 'Watch Full Video on YouTube' }
              : l
          )
        : [
            {
              id: `${scene.id}-yt`,
              platform: 'youtube' as const,
              label: 'Watch Full Video on YouTube',
              url,
              enabled: true,
              clicks: 0,
              order: 0,
            },
            ...scene.links.map((l) => ({ ...l, order: l.order + 1 })),
          ]
      : scene.links
    onUpdateScene({
      ...scene,
      videoUrl: rawUrl,
      status: autoLive,
      links: nextLinks,
      updatedAt: new Date().toISOString(),
    })
  }

  const handleAskGemini = async () => {
    if (!scene || !onUpdateScene) return
    const key = loadGeminiApiKey()
    if (!key) {
      notify('Add your Gemini API key in Settings or Scene Editor first')
      if (onEditScene) onEditScene(scene.id)
      return
    }
    setGeminiBusy(true)
    try {
      const seoTags = await generateSeoTagsWithGemini({
        apiKey: key,
        title: scene.title,
        topDescription: extractTopDescription(scene.description, 300),
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
              The 4 YouTube items + platform-tailored social posts that play the video in YouTube.
            </p>
          </div>
        </div>
        <EmptyState
          icon={<QrCode size={28} />}
          title="No videos yet"
          body="Import a Scenering folder first — then copy your 4 YouTube items and social posts here."
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
            Upload the 4 items to YouTube first, then fetch each social post below — every post plays the video in YouTube.
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
              <Edit3 size={14} /> Edit / Upload thumbnail
            </button>
          )}
        </div>
      </div>

      {/* THE 4 ITEMS FOR YOUTUBE */}
      <div className="share-grid">
        <div className="card yt-step-card">
          <div className="card-head">
            <div>
              <div className="step-kicker yt-kicker">YOUTUBE FIRST — THE 4 ITEMS</div>
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
              <strong>2. Top Description &amp; Credits</strong>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() =>
                  void doCopy(
                    'yt-desc',
                    ytPack.descriptionWithCredits,
                    'Description + credits copied ✓'
                  )
                }
              >
                {copied === 'yt-desc' ? <Check size={13} /> : <Copy size={13} />} Copy description + credits
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
              <strong>Published YouTube Video Link (plays in YouTube)</strong>
              <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                {ytBoostTarget.isSpecificVideo ? '✓ Linked' : 'Paste YouTube link'}
              </Badge>
            </div>
            {onUpdateScene ? (
              <input
                value={scene.videoUrl}
                onChange={(e) => handleQuickYoutubeUrl(e.target.value)}
                placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…"
              />
            ) : (
              <div className="hub-link-box">
                <code>{ytBoostTarget.url}</code>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ITEM 3 THUMBNAIL + QR */}
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
                <h3>QR Code</h3>
                <p>Scans straight to YouTube</p>
              </div>
              <QrCode size={18} className="muted-icon" />
            </div>
            <div className="filter-tabs" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`filter-tab ${qrTargetMode === 'youtube' ? 'active' : ''}`}
                onClick={() => setQrTargetMode('youtube')}
              >
                Play in YouTube
              </button>
              <button
                type="button"
                className={`filter-tab ${qrTargetMode === 'hub' ? 'active' : ''}`}
                onClick={() => setQrTargetMode('hub')}
              >
                SceneBoost Hub
              </button>
            </div>
            <div className="qr-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR code for ${scene.title}`} />
              ) : (
                <div className="qr-placeholder">Generating QR…</div>
              )}
            </div>
            {qrDataUrl && (
              <a
                className="btn btn-ghost btn-sm btn-block"
                href={qrDataUrl}
                download={`${scene.slug}-${qrTargetMode}-qr.png`}
              >
                <Download size={14} /> Download QR (PNG)
              </a>
            )}
          </div>
        </div>
      </div>

      {/* OTHER SOCIAL POSTS FETCHED IN SCENEBOOST -> PLAYS IN YOUTUBE */}
      <div className="card boost-step-card">
        <div className="card-head">
          <div>
            <div className="step-kicker boost-kicker">FETCH SOCIAL POSTS — PLAYS IN YOUTUBE</div>
            <h3>Other Social Posts (tailored per platform)</h3>
            <p>
              Uses only the top part of the description and links straight to <code>{ytBoostTarget.url}</code> so every viewer plays the video in YouTube.
            </p>
          </div>
          <Share2 size={18} className="muted-icon" />
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
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void doCopy('yt-direct-url', ytBoostTarget.url, 'YouTube link copied ✓')}
          >
            {copied === 'yt-direct-url' ? <Check size={14} /> : <Copy size={14} />} Copy YouTube link
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
    </div>
  )
}
