import { useState } from 'react'
import { Save, RotateCcw, Zap, Check, KeyRound } from 'lucide-react'
import type { AppData, AppSettings } from '../types'
import { ACCENTS } from '../lib/platforms'
import { loadGeminiApiKey, saveGeminiApiKey } from '../lib/gemini'

interface Props {
  data: AppData
  onSave: (settings: AppSettings) => void
  onReset: () => void
  notify: (msg: string) => void
}

export default function Settings({ data, onSave, onReset, notify }: Props) {
  const [draft, setDraft] = useState<AppSettings>(data.settings)
  const [geminiKey, setGeminiKey] = useState<string>(() => loadGeminiApiKey())
  const [confirmReset, setConfirmReset] = useState(false)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Brand details and default tracking values applied to every new link.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-accent" onClick={() => { onSave(draft); notify('Settings saved ✓') }} disabled={!dirty}>
            <Save size={15} /> Save settings
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Brand</h3>
              <p>Shown on hubs and exports</p>
            </div>
          </div>

          <label className="field">
            <span>Brand / artist name</span>
            <input value={draft.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder="SceneBoost" />
          </label>
          <label className="field">
            <span>Main handle</span>
            <input value={draft.handle} onChange={(e) => set('handle', e.target.value)} placeholder="@sceneboost" />
          </label>

          <div className="field">
            <span>Accent colour</span>
            <div className="swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={`swatch swatch-dot ${draft.accent === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('accent', c)}
                  aria-label={`Accent ${c}`}
                >
                  {draft.accent === c && <Check size={14} color="#070A12" />}
                </button>
              ))}
            </div>
          </div>

          <div className="brand-preview" style={{ borderColor: draft.accent + '55' }}>
            <span className="brand-mark" style={{ background: draft.accent, color: '#070A12' }}>
              <Zap size={18} strokeWidth={2.6} />
            </span>
            <div>
              <strong>{draft.brandName || 'Your brand'}</strong>
              <div className="muted small">{draft.handle || '@handle'} · Powered by SceneBoost</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Default tracking (UTMs)</h3>
              <p>Applied automatically to every platform link</p>
            </div>
          </div>

          <label className="field">
            <span>Default campaign</span>
            <input value={draft.defaultCampaign} onChange={(e) => set('defaultCampaign', e.target.value)} placeholder="neon-nights-launch" />
            <span className="field-hint">Use one campaign per drop or release so reports stay clean.</span>
          </label>
          <label className="field">
            <span>Default medium</span>
            <input value={draft.defaultMedium} onChange={(e) => set('defaultMedium', e.target.value)} placeholder="social" />
            <span className="field-hint">Common values: social, organic, paid, email, qr.</span>
          </label>

          <div className="utm-preview">
            <span className="muted small">Example tracked URL</span>
            <code>
              https://youtube.com/watch?v=…?utm_source=youtube&amp;utm_medium={draft.defaultMedium || 'social'}&amp;utm_campaign={draft.defaultCampaign || 'campaign'}&amp;utm_content=your-post-slug
            </code>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Google API Key — Gemini SEO Tags &amp; Instant YouTube Sync</h3>
            <p>
              Generates strictly SEO-friendly YouTube tags with Gemini and enables instant YouTube Data API v3 link fetching (stored only in this browser). Without a key, YouTube links still auto-fetch from your public channel feed.
            </p>
          </div>
          <KeyRound size={18} className="muted-icon" />
        </div>
        <div className="btn-row">
          <input
            type="password"
            style={{ flex: 1 }}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIzaSy… (Google AI Studio API key)"
          />
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={() => {
              saveGeminiApiKey(geminiKey)
              notify(geminiKey.trim() ? 'Gemini API key saved ✓' : 'Gemini API key cleared')
            }}
          >
            <Save size={14} /> Save Gemini key
          </button>
        </div>
      </div>

      <div className="card danger-zone">
        <div className="card-head">
          <div>
            <h3>Data</h3>
            <p>Your posts, links and clicks live in this browser (localStorage).</p>
          </div>
        </div>
        {!confirmReset ? (
          <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={15} /> Reset to demo data
          </button>
        ) : (
          <div className="confirm-row">
            <span>Replace all current data with the demo dataset?</span>
            <button
              className="btn btn-danger"
              onClick={() => {
                onReset()
                setDraft(data.settings)
                setConfirmReset(false)
                notify('Demo data restored')
              }}
            >
              Yes, reset everything
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
