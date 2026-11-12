# SceneBoost

**Create marketing links to social media and video platforms.**

SceneBoost gives creators, artists and brands one smart link per *scene* (a video, drop or campaign) that fans can use to watch, listen and shop across every platform — with UTM tracking built in so you know which platform is actually boosting the scene.

> One scene. One link. Every platform.

---

## What it does

| Area | What you get |
|---|---|
| **Dashboard** | Total clicks, live scenes, active links, connected platforms, top scenes, clicks-by-platform and recent activity |
| **Scenes** | Full CRUD for scenes — title, slug, description, video URL, thumbnail style, accent colour, live/draft/paused status |
| **Platform links** | Add a link per platform (YouTube, TikTok, Instagram, Facebook, X, LinkedIn, Spotify, Website/Custom), reorder, enable/disable, with automatic UTM parameters |
| **Public hub** | A shareable page at `#/s/{slug}` with a hero, platform buttons, copy-link and native share — every click is tracked back to the scene + link |
| **Analytics** | Clicks per platform, per scene and per link, leaderboard, and CSV export |
| **Share Kit** | Copy hub link, copy tracked per-platform links, downloadable QR code (PNG), embed code, and ready-to-paste post templates for X / Facebook / LinkedIn / WhatsApp |
| **Platforms** | Connect/disconnect accounts, store default handles, see how UTMs are built |
| **Settings** | Brand name, handle, accent colour, default UTM campaign/medium, reset to demo data |

Data is persisted in the browser via `localStorage` (`scenboost_data_v1`) and seeded with three demo scenes on first load, so the app is fully usable with no backend.

### Configured profiles

The owner's real profiles are pre-configured (see `YOUTUBE_URL` / `TIKTOK_URL` / `FACEBOOK_URL` / `LINKEDIN_URL` in `src/lib/store.ts`):

| Platform | URL |
|---|---|
| YouTube | https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ |
| Facebook | https://www.facebook.com/profile.php?id=61595379711660 |
| LinkedIn | https://www.linkedin.com/company/145348282 |
| TikTok | https://www.tiktok.com/@scenering.com |

X and Website still use demo handles — update them in **Platforms** (or provide the URLs to be wired into the seed). Instagram and Spotify are intentionally left disconnected (owner will not add them); they remain available as platform options if needed later. Existing browsers with demo data are migrated automatically on load (only exact demo values are replaced; your own scenes/links are untouched).

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
