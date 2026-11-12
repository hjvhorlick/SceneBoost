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
  isSpecificYoutubeVideoUrl,
  resolveYoutubeBoostUrl,
  type SocialBoostPlatform,
} from '../lib/scenering'
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
  const [includeCredits, setIncludeCredits] = useState(false)

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

  const ytPack = useMemo(
    () => (scene ? buildYoutubeStudioPack(scene, data.platforms) : null),
    [scene, data.platforms]
  )

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

  if (!scene || !ytPack) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>YouTube Boost &amp; Share Kit</h1>
            <p className="page-sub">
              Publish to YouTube with full ranking SEO, then drive every social platform straight to your YouTube video.
            </p>
          </div>
        </div>
        <EmptyState
          icon={<QrCode size={28} />}
          title="No videos to boost yet"
          body="Create a scene from your Scenering folder first — then copy your YouTube SEO pack and social boost posts here."
        />
      </div>
    )
  }

  const socialPost = buildSocialBoostPost(scene, boostPlatform, {
    platforms: data.platforms,
    includeCredits,
  })
  const composerLink = PLATFORM_COMPOSER_LINKS[boostPlatform]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>YouTube Boost &amp; Share Kit</h1>
          <p className="page-sub">
            1) Post to YouTube first with ranked SEO &amp; thumbnail → 2) Send every social post straight to YouTube to grow views &amp; monetize.
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
              <Edit3 size={14} /> Edit video &amp; thumbnail
            </button>
          )}
        </div>
      </div>

      {/* STEP 1 IN SHARE KIT: YOUTUBE STUDIO SEO PACK + THUMBNAIL */}
      <div className="share-grid">
        <div className="card yt-step-card">
          <div className="card-head">
            <div>
              <div className="step-kicker yt-kicker">STEP 1 — POST TO YOUTUBE FIRST</div>
              <h3>YouTube Ranking Pack (Title, Description, Tags &amp; Thumbnail)</h3>
              <p>Paste these straight into YouTube Studio so your video ranks in search &amp; suggested feeds.</p>
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
              <strong>YouTube Title</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void doCopy('yt-title', ytPack.title, 'YouTube title copied ✓')}
              >
                {copied === 'yt-title' ? <Check size={13} /> : <Copy size={13} />} Copy title
              </button>
            </div>
            <pre className="code-block">{ytPack.title}</pre>
          </div>

          <div className="yt-copy-block">
            <div className="yt-copy-head">
              <strong>YouTube Description + Credit Page</strong>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() =>
                  void doCopy('yt-desc', ytPack.description, 'YouTube description copied ✓')
                }
              >
                {copied === 'yt-desc' ? <Check size={13} /> : <Copy size={13} />} Copy description
              </button>
            </div>
            <pre className="code-block tall">{ytPack.description}</pre>
          </div>

          <div className="yt-copy-block">
            <div className="yt-copy-head">
              <strong>YouTube Tags ({ytPack.tagsCharCount} / 500 chars)</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void doCopy('yt-tags', ytPack.tagsCsv, 'YouTube tags copied ✓')}
              >
                {copied === 'yt-tags' ? <Check size={13} /> : <Copy size={13} />} Copy tags
              </button>
            </div>
            <pre className="code-block">{ytPack.tagsCsv}</pre>
          </div>

          <div className="divider" />
          <div className={`yt-live-url-box ${ytBoostTarget.isSpecificVideo ? 'ready' : 'pending'}`}>
            <div className="yt-copy-head" style={{ marginBottom: 6 }}>
              <strong>Published YouTube Video Link</strong>
              <Badge tone={ytBoostTarget.isSpecificVideo ? 'live' : 'draft'}>
                {ytBoostTarget.isSpecificVideo ? '✓ Live & Boosting' : 'Paste after YouTube upload'}
              </Badge>
            </div>
            {onUpdateScene ? (
              <input
                value={scene.videoUrl}
                onChange={(e) => handleQuickYoutubeUrl(e.target.value)}
                placeholder="Paste https://youtu.be/… or https://www.youtube.com/watch?v=…"
              />
            ) : (
              <div className="hub-link-box">
                <code>{ytBoostTarget.url}</code>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: THUMBNAIL + QR STRAIGHT TO YOUTUBE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>1280×720 Thumbnail</h3>
                <p>For YouTube Studio &amp; social teasers</p>
              </div>
            </div>
            <div
              className="thumb-preview-16x9"
              style={{ ...coverStyle(scene.thumbnail, 'swatch'), width: '100%', height: 164, marginBottom: 12 }}
            >
              <span className="thumb-res-badge">
                {scene.thumbnail.startsWith('data:image/') ? '✓ Imported HD' : '16:9 Preset'}
              </span>
            </div>
            <div className="btn-row">
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
              {onEditScene && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onEditScene(scene.id)}
                >
                  Change thumbnail
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>QR Code → YouTube</h3>
                <p>Scans straight to your YouTube video</p>
              </div>
              <QrCode size={18} className="muted-icon" />
            </div>
            <div className="filter-tabs" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`filter-tab ${qrTargetMode === 'youtube' ? 'active' : ''}`}
                onClick={() => setQrTargetMode('youtube')}
              >
                Direct YouTube
              </button>
              <button
                type="button"
                className={`filter-tab ${qrTargetMode === 'hub' ? 'active' : ''}`}
                onClick={() => setQrTargetMode('hub')}
              >
                Backup Hub
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

      {/* STEP 2 IN SHARE KIT: ALL OTHER SOCIAL POSTS -> STRAIGHT TO YOUTUBE */}
      <div className="card boost-step-card">
        <div className="card-head">
          <div>
            <div className="step-kicker boost-kicker">STEP 2 — SEND EVERY SOCIAL PLATFORM STRAIGHT TO YOUTUBE</div>
            <h3>Social Boost Posts (Facebook, LinkedIn, TikTok, X, Threads &amp; more)</h3>
            <p>
              Every post uses your short description and sends viewers directly to <code>{ytBoostTarget.url}</code> so they watch on YouTube, discover more videos on your channel, and boost rankings &amp; monetization.
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

        {scene.credits?.trim() && (boostPlatform === 'facebook' || boostPlatform === 'vimeo') && (
          <label className="inline-check" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={includeCredits}
              onChange={(e) => setIncludeCredits(e.target.checked)}
            />
            <span>Append Scenering media credits</span>
          </label>
        )}

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
            {copied === `boost-${boostPlatform}` ? <Check size={14} /> : <Copy size={14} />} Copy post → YouTube
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
