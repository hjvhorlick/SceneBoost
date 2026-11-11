import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Check, QrCode, Code2, MessageSquare, ExternalLink, Download } from 'lucide-react'
import type { AppData } from '../types'
import { buildTrackedUrl, copyText, hubUrl } from '../lib/utils'
import { platformById } from '../lib/platforms'
import { EmptyState, PlatformPill } from './ui'

interface Props {
  data: AppData
  notify: (msg: string) => void
}

export default function ShareKit({ data, notify }: Props) {
  const [selectedId, setSelectedId] = useState<string>(data.scenes[0]?.id ?? '')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [templatePlatform, setTemplatePlatform] = useState<'x' | 'facebook' | 'linkedin' | 'whatsapp'>('x')

  useEffect(() => {
    if (!selectedId && data.scenes[0]) setSelectedId(data.scenes[0].id)
  }, [data.scenes, selectedId])

  const scene = data.scenes.find((s) => s.id === selectedId) ?? data.scenes[0]

  const hub = scene ? hubUrl(scene.slug) : ''

  useEffect(() => {
    if (!hub) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(hub, { width: 320, margin: 2, color: { dark: '#070A12', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [hub])

  const trackedLinks = useMemo(() => {
    if (!scene) return []
    return scene.links
      .filter((l) => l.enabled && l.url.trim())
      .map((l) => ({
        link: l,
        url: buildTrackedUrl(l.url, {
          source: platformById(l.platform).utmSource,
          medium: data.settings.defaultMedium,
          campaign: data.settings.defaultCampaign,
          content: scene.slug,
        }),
      }))
  }, [scene, data.settings])

  const doCopy = async (key: string, text: string, msg = 'Copied') => {
    const ok = await copyText(text)
    setCopied(key)
    notify(ok ? msg : 'Copy failed — select the text manually')
    setTimeout(() => setCopied(null), 1600)
  }

  const embedCode = scene
    ? `<iframe src="${hub}?embed=1" width="100%" height="640" frameborder="0" title="${scene.title} — SceneBoost"></iframe>`
    : ''

  const postTemplate = (platform: typeof templatePlatform) => {
    if (!scene) return ''
    const base = `🎬 ${scene.title}\n\n${scene.description}\n\nWatch / listen / shop everywhere 👇\n${hub}`
    if (platform === 'x') return `${base}\n\n#SceneBoost #${scene.slug.replace(/-/g, '')}`
    if (platform === 'facebook') return `${base}\n\nTap your favourite platform and share the scene you loved most.`
    if (platform === 'linkedin') return `${scene.title} — now live across every platform.\n\n${scene.description}\n\nOne link, every platform: ${hub}`
    return `${base}\n\nForward this to anyone who needs to see this scene!`
  }

  if (!scene) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Share Kit</h1>
            <p className="page-sub">Copy links, generate QR codes and grab embed code.</p>
          </div>
        </div>
        <EmptyState
          icon={<QrCode size={28} />}
          title="No scenes to share yet"
          body="Create a scene first — then come back here for its hub link, QR code and post templates."
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Share Kit</h1>
          <p className="page-sub">Everything you need to put this scene in front of fans — on every platform.</p>
        </div>
        <select value={scene.id} onChange={(e) => setSelectedId(e.target.value)} className="select">
          {data.scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="share-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Hub link</h3>
              <p>Put this in bios, captions, emails and press</p>
            </div>
          </div>
          <div className="hub-link-box large">
            <code>{hub}</code>
          </div>
          <div className="btn-row">
            <button className="btn btn-accent btn-sm" onClick={() => doCopy('hub', hub, 'Hub link copied')}>
              {copied === 'hub' ? <Check size={14} /> : <Copy size={14} />} Copy hub link
            </button>
            <a className="btn btn-ghost btn-sm" href={hub} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open hub
            </a>
          </div>

          <div className="divider" />
          <h4 className="section-label">Tracked platform links</h4>
          <p className="muted small">UTMs included — share these directly in posts and ads.</p>
          <div className="share-links">
            {trackedLinks.map(({ link, url }) => {
              const def = platformById(link.platform)
              return (
                <div key={link.id} className="share-link-row">
                  <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />
                  <div className="share-link-main">
                    <strong>{link.label}</strong>
                    <code>{url}</code>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => doCopy(link.id, url, 'Tracked link copied')}>
                    {copied === link.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              )
            })}
            {trackedLinks.length === 0 && <p className="muted">Add enabled links with URLs in the scene editor.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>QR code</h3>
              <p>Print it, project it, put it on merch</p>
            </div>
            <QrCode size={18} className="muted-icon" />
          </div>
          <div className="qr-box">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR code for ${scene.title}`} />
            ) : (
              <div className="qr-placeholder">Generating QR…</div>
            )}
          </div>
          <p className="muted small center">Scans straight to the hub link above.</p>
          {qrDataUrl && (
            <a className="btn btn-ghost btn-sm btn-block" href={qrDataUrl} download={`scenboost-qr-${scene.slug}.png`}>
              <Download size={14} /> Download QR (PNG)
            </a>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Embed code</h3>
              <p>Drop the hub into any website or blog</p>
            </div>
            <Code2 size={18} className="muted-icon" />
          </div>
          <pre className="code-block">{embedCode}</pre>
          <button className="btn btn-ghost btn-sm" onClick={() => doCopy('embed', embedCode, 'Embed code copied')}>
            {copied === 'embed' ? <Check size={14} /> : <Copy size={14} />} Copy embed code
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Post templates</h3>
              <p>Ready-to-paste captions per platform</p>
            </div>
            <MessageSquare size={18} className="muted-icon" />
          </div>
          <div className="filter-tabs" style={{ marginBottom: 12 }}>
            {(
              [
                ['x', 'X'],
                ['facebook', 'Facebook'],
                ['linkedin', 'LinkedIn'],
                ['whatsapp', 'WhatsApp'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`filter-tab ${templatePlatform === id ? 'active' : ''}`}
                onClick={() => setTemplatePlatform(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <pre className="code-block tall">{postTemplate(templatePlatform)}</pre>
          <button
            className="btn btn-accent btn-sm"
            onClick={() => doCopy('template', postTemplate(templatePlatform), 'Post template copied')}
          >
            {copied === 'template' ? <Check size={14} /> : <Copy size={14} />} Copy template
          </button>
        </div>
      </div>
    </div>
  )
}
