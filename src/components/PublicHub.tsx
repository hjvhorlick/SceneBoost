import { useEffect, useState } from 'react'
import { Play, ExternalLink, Copy, Check, Zap, ArrowLeft, Share2 } from 'lucide-react'
import type { Scene } from '../types'
import { coverStyle, platformById, resolveCoverImageUrl } from '../lib/platforms'
import { resolveYoutubeBoostUrl } from '../lib/scenering'
import { buildTrackedUrl, copyText, hubUrl } from '../lib/utils'
import { Badge } from './ui'

interface Props {
  scene: Scene
  defaultMedium: string
  defaultCampaign: string
  brandName: string
  onBack: () => void
  onTrackClick: (sceneId: string, linkId: string) => void
}

export default function PublicHub({ scene, defaultMedium, defaultCampaign, brandName, onBack, onTrackClick }: Props) {
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  const enabled = [...scene.links].sort((a, b) => a.order - b.order).filter((l) => l.enabled && l.url.trim())
  const ytTarget = resolveYoutubeBoostUrl(scene)

  useEffect(() => {
    const prevTitle = document.title
    document.title = `${scene.title} — ${brandName}`
    const absCover = new URL(resolveCoverImageUrl(scene.thumbnail), window.location.origin).href
    for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      const el = document.querySelector(sel)
      if (el) el.setAttribute('content', absCover)
    }
    return () => {
      document.title = prevTitle
    }
  }, [scene.title, scene.thumbnail, brandName])

  const handleClick = (linkId: string, url: string) => {
    onTrackClick(scene.id, linkId)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleCopy = async () => {
    const ok = await copyText(hubUrl(scene.slug))
    setCopied(ok)
    setTimeout(() => setCopied(false), 1600)
  }

  const handleShare = async () => {
    const text = `${scene.title} — ${scene.description}\n${hubUrl(scene.slug)}`
    if (navigator.share) {
      try {
        await navigator.share({ title: scene.title, text, url: hubUrl(scene.slug) })
        setShared(true)
        setTimeout(() => setShared(false), 1600)
      } catch {
        // user cancelled
      }
    } else {
      await handleCopy()
    }
  }

  return (
    <div className="hub-page">
      <div className="hub-topbar">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back to app
        </button>
        <span className="hub-topbar-label">Public hub preview · /s/{scene.slug}</span>
        <Badge tone={scene.status}>{scene.status}</Badge>
      </div>

      <div className="hub-wrap">
        <div className="hub-hero" style={coverStyle(scene.thumbnail, 'hero')}>
          <div className="hub-hero-inner">
            <span className="hub-brand">
              <Zap size={14} strokeWidth={2.6} /> {brandName}
            </span>
            <h1>{scene.title}</h1>
            <p>{scene.description}</p>
            {ytTarget.url && (
              <a className="btn btn-accent" href={ytTarget.url} target="_blank" rel="noreferrer">
                <Play size={16} /> Watch Full Video on YouTube
              </a>
            )}
          </div>
        </div>

        <div className="hub-body">
          {scene.status !== 'live' && (
            <div className="hub-notice">
              This scene is <strong>{scene.status}</strong> — fans will see this page, but you may want to go live
              before sharing it widely.
            </div>
          )}

          {enabled.length === 0 ? (
            <p className="muted center">No active platform links yet. Add links in the scene editor.</p>
          ) : (
            <div className="hub-links">
              {enabled.map((link) => {
                const def = platformById(link.platform)
                const url = buildTrackedUrl(link.url, {
                  source: def.utmSource,
                  medium: defaultMedium,
                  campaign: defaultCampaign,
                  content: scene.slug,
                })
                return (
                  <button
                    key={link.id}
                    className="hub-link"
                    style={{ borderColor: def.color + '55' }}
                    onClick={() => handleClick(link.id, url)}
                  >
                    <span
                      className="hub-link-icon"
                      style={{ background: def.bg, color: def.text, borderColor: def.color + '55' }}
                    >
                      {def.icon}
                    </span>
                    <span className="hub-link-label">{link.label}</span>
                    <span className="hub-link-meta">
                      <span className="muted small">{def.name}</span>
                      <ExternalLink size={14} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="hub-actions">
            <button className="btn btn-ghost" onClick={handleCopy}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied!' : 'Copy hub link'}
            </button>
            <button className="btn btn-ghost" onClick={handleShare}>
              {shared ? <Check size={15} /> : <Share2 size={15} />} {shared ? 'Shared!' : 'Share'}
            </button>
          </div>

          <p className="hub-foot" style={{ color: scene.accent }}>
            <Zap size={13} /> One link. Every platform. — SceneBoost
          </p>
        </div>
      </div>
    </div>
  )
}
