# SceneBoost

**YouTube-first video ranking & social boost studio.**

SceneBoost is built around a **YouTube-first growth & monetization workflow**:

1. **Step 1 — Import your Scenering video folder, credit page & thumbnail**: Pulls the project title, short description, `📢 CREDITS & ATTRIBUTIONS`, SEO ranking tags (up to 500 chars), and a **1280×720 HD YouTube thumbnail** (via direct image import, drag-and-drop, Scenering folder auto-detection, or grabbing a frame directly from your rendered Scenering video).
2. **Step 2 — Publish to YouTube first with full ranking SEO**: Copy your keyword-ranked Title, Description (short description in lines 1–2, `?sub_confirmation=1` subscribe & watch-more CTA, optional `scenering.com` website toggle, full credit page, and search hashtags), 500-character YouTube Studio Tags, and 1280×720 thumbnail straight into YouTube Studio — then paste your live YouTube video URL.
3. **Step 3 — Boost YouTube from every other social platform**: Generate ready-to-post teasers for Facebook, LinkedIn, TikTok, X, Threads, Twitch/Kick, Vimeo and WhatsApp that send viewers **straight to your YouTube video**, where they find more of your videos, subscribe, and grow watch hours to rank and monetize your channel.

---

## What it does

| Area | What you get |
|---|---|
| **Dashboard** | Total clicks, live scenes, active links, connected platforms, top scenes, clicks-by-platform and recent activity |
| **Scenes** | Full CRUD for scenes — title, slug, short description, video URL, thumbnail style, accent colour, live/draft/paused status — plus **1-click import from a Scenering saved folder (`Videos/Scenering/<Video Name>`)** that reads the video name, short description and media credits from the folder's `*_attribution_credits.txt` |
| **Platform links** | Add a link per platform (YouTube, TikTok, Facebook, LinkedIn, X, Twitch, Kick, Vimeo, Threads, Instagram, Website/Custom), reorder, enable/disable, with automatic UTM parameters |
| **Public hub** | A shareable page at `#/s/{slug}` with a hero, platform buttons, copy-link and native share — every click is tracked back to the scene + link |
| **Analytics** | Clicks per platform, per scene and per link, leaderboard, and CSV export |
| **Share Kit** | Copy hub link, copy tracked per-platform links, downloadable QR code (PNG), embed code, and ready-to-paste post wording (automatically including the short description + optional Scenering media credits) for YouTube / TikTok / X / Threads / Facebook / LinkedIn / Twitch & Kick / Vimeo / WhatsApp |
| **Platforms** | Connect/disconnect accounts, store default handles, see how UTMs are built |
| **Settings** | Brand name, handle, accent colour, default UTM campaign/medium, reset to demo data |

Data is persisted in the browser via `localStorage` (`scenboost_data_v1`) and seeded with three demo scenes on first load, so the app is fully usable with no backend.

### Configured profiles

The owner's real profiles are pre-configured (see `YOUTUBE_URL` / `TIKTOK_URL` / `FACEBOOK_URL` / `LINKEDIN_URL` / `WEBSITE_URL` in `src/lib/store.ts`):

| Platform | URL |
|---|---|
| YouTube | https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ |
| Facebook | https://www.facebook.com/profile.php?id=61595379711660 |
| LinkedIn | https://www.linkedin.com/company/145348282 |
| TikTok | https://www.tiktok.com/@scenering.com |
| Website | https://scenering.com |

Twitch, Kick, Vimeo and Threads are enabled and ready for your channel/profile URLs (Spotify was removed in favour of video-focused platforms). X still uses a demo handle — update it in **Platforms** (or provide the URL to be wired into the seed). Instagram is intentionally left disconnected (available as a platform option if needed later). Existing browsers with demo data are migrated automatically on load (only exact demo values are replaced; your own scenes/links are untouched).

---

## Tech stack

- **Vite 6 + React 18 + TypeScript**
- **lucide-react** for icons, **qrcode** for QR generation
- Hash routing (`#/dashboard`, `#/scenes`, `#/s/{slug}`, …) — no server routing required
- Plain CSS design system (dark, cinematic) in `src/styles.css`

## Project structure

```
src/
  App.tsx                  — shell, hash routing, global state + persistence
  main.tsx
  styles.css               — full design system
  types.ts                 — Scene, SceneLink, PlatformSettings, AppData…
  lib/
    platforms.ts           — platform definitions, gradients, accents
    store.ts               — localStorage load/save + seed data
    utils.ts               — slugify, UTM builder, copy/download helpers
  components/
    Sidebar.tsx            — navigation
    Dashboard.tsx          — stats, rankings, platform bars, activity
    Scenes.tsx             — scene grid + search/filter
    SceneEditor.tsx        — details form, link manager, live phone preview
    Analytics.tsx          — charts (CSS bars), table, CSV export
    ShareKit.tsx           — hub link, tracked links, QR, embed, templates
    Platforms.tsx          — connect toggles + handles + UTM explainer
    Settings.tsx           — brand + default tracking + reset
    PublicHub.tsx          — public fan-facing hub page
    ui.tsx                 — shared Card/Badge/Modal/Toast/StatCard…
```

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

## How tracking works

Every platform link gets UTMs automatically:

```
https://youtube.com/watch?v=…?utm_source=youtube&utm_medium=social&utm_campaign=neon-nights-launch&utm_content=neon-nights-official-video
```

- `utm_source` — the platform (`youtube`, `tiktok`, `instagram`, …)
- `utm_medium` — default medium from Settings (default: `social`)
- `utm_campaign` — default campaign from Settings
- `utm_content` — the scene slug, so scenes can be compared in any analytics tool

Clicks on the public hub increment the matching link's counter and appear in Analytics + recent activity.

## Routes

| Route | Page |
|---|---|
| `#/dashboard` | Overview |
| `#/scenes` | Scene list |
| `#/scenes/{id}` | Scene editor |
| `#/analytics` | Analytics |
| `#/share` | Share Kit |
| `#/platforms` | Connected platforms |
| `#/settings` | Settings |
| `#/s/{slug}` | Public hub (fan-facing) |

## License

MIT — see `LICENSE`.
