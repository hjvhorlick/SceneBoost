import { Plug2, PlugZap, Check } from 'lucide-react'
import type { AppData, PlatformId } from '../types'
import { PLATFORMS, platformById } from '../lib/platforms'
import { PlatformPill } from './ui'

interface Props {
  data: AppData
  onToggle: (id: PlatformId) => void
  onHandle: (id: PlatformId, handle: string) => void
  notify: (msg: string) => void
}

export default function Platforms({ data, onToggle, onHandle, notify }: Props) {
  const connectedCount = data.platforms.filter((p) => p.connected).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Platforms</h1>
          <p className="page-sub">
            Connect the social and video accounts you publish to. Connected platforms appear first in the post editor.
          </p>
        </div>
        <div className="page-actions">
          <span className="pill-stat">
            <PlugZap size={14} /> {connectedCount} / {PLATFORMS.length} connected
          </span>
        </div>
      </div>

      <div className="platforms-grid">
        {PLATFORMS.map((def) => {
          const settings = data.platforms.find((p) => p.id === def.id)
          const connected = settings?.connected ?? false
          return (
            <div key={def.id} className={`platform-card ${connected ? 'connected' : ''}`}>
              <div className="platform-card-head">
                <PlatformPill short={def.short} color={def.color} bg={def.bg} text={def.text} />
                <div>
                  <h3>{def.name}</h3>
                  <p>{def.hint}</p>
                </div>
                <span className="spacer" />
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={connected}
                    onChange={() => {
                      onToggle(def.id)
                      notify(connected ? `${def.name} disconnected` : `${def.name} connected ✓`)
                    }}
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </label>
              </div>

              <label className="field">
                <span>Default handle / page</span>
                <input
                  value={settings?.defaultHandle ?? ''}
                  onChange={(e) => onHandle(def.id, e.target.value)}
                  placeholder={def.placeholder}
                  disabled={!connected}
                />
              </label>

              <div className="platform-card-foot">
                <span className="muted small">
                  UTM source: <code>{def.utmSource}</code>
                </span>
                {connected && (
                  <span className="connected-tag">
                    <Check size={13} /> Connected
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>How tracking works</h3>
            <p>Every link you add gets UTM parameters automatically</p>
          </div>
          <Plug2 size={18} className="muted-icon" />
        </div>
        <div className="how-grid">
          <div>
            <strong>utm_source</strong>
            <p className="muted">The platform — e.g. <code>youtube</code>, <code>tiktok</code>, <code>twitch</code>, <code>vimeo</code>.</p>
          </div>
          <div>
            <strong>utm_medium</strong>
            <p className="muted">Set in Settings — default is <code>{data.settings.defaultMedium}</code>.</p>
          </div>
          <div>
            <strong>utm_campaign</strong>
            <p className="muted">Set in Settings — default is <code>{data.settings.defaultCampaign}</code>.</p>
          </div>
          <div>
            <strong>utm_content</strong>
            <p className="muted">The post slug — so you can compare posts inside any analytics tool.</p>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Example: <code>https://youtube.com/watch?v=…?utm_source=youtube&amp;utm_medium=social&amp;utm_campaign=neon-nights-launch&amp;utm_content=neon-nights-official-video</code>
        </p>
      </div>
    </div>
  )
}
