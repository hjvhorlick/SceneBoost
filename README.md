# SceneBoost

**YouTube-first video ranking & social boost studio.**

SceneBoost is built around a **YouTube-first ranking & social boost workflow**:

1. **Fetch from your Scenering folder (`Videos/Scenering/<Video Name>`)**:
   - **Video**: Detected in the folder with filename & size ready for YouTube Studio.
   - **Credits & Top Part of Description**: Fetches `📢 CREDITS & ATTRIBUTIONS` and extracts **only the top part of the description**.
   - **Thumbnail**: Automatically loaded if a thumbnail image is in the same folder; if none is in the folder, SceneBoost flags it and provides an **Upload thumbnail** option (`1280×720` HD).
   - **SEO-Friendly Tags (with Gemini AI)**: Click **Ask Gemini for SEO tags** (using your Google Gemini API key stored locally in your browser) to generate strictly SEO-friendly search keywords and long-tail phrases (`<= 500` characters, zero filler/hashtags).
2. **Upload ONLY the 4 items to YouTube first**: Since your YouTube Channel Settings already holds your predefined upload defaults, SceneBoost gives you just the 4 per-video items (Video/Title, Top Description + Credits, Thumbnail, and SEO Tags) — then paste your published YouTube video URL.
3. **Fetch the other social posts in SceneBoost (video plays in YouTube)**: Generates native posts tailored for Facebook, LinkedIn, TikTok, X, Threads, Twitch/Kick, Vimeo and WhatsApp using **only the top part of the description** and your **YouTube video link** so every click plays the video directly **in YouTube**.

---

## What it does

| Area | What you get |
|---|---|
| **Dashboard** | Unified overview & click analytics — filter by post, export CSV, total clicks, live posts, active links, connected platforms, top posts, clicks-by-platform, recent activity, and full link table |
| **Posts** | Full CRUD for posts — fetch your Scenering saved folder (`Videos/Scenering/<Video Name>`), prepare the 4 YouTube items (video/title, top description + credits, thumbnail, Gemini SEO tags), and generate social posts |
| **Platform links** | Add a link per platform (YouTube, TikTok, Facebook, LinkedIn, X, Twitch, Kick, Vimeo, Threads, Instagram, Website/Custom), reorder, enable/disable, with automatic UTM parameters |
| **Public hub** | A shareable page at `#/s/{slug}` with cover artwork, primary **Watch Full Video on YouTube** CTA, platform buttons, copy-link and native share |
| **Share Kit** | Quick-copy the 4 YouTube items, downloadable QR code (scans straight to YouTube or hub), and platform-tailored social posts that play the video in YouTube |
| **Platforms** | Connect/disconnect accounts, store default handles, see how UTMs are built |
| **Settings** | Brand name, handle, accent colour, Google Gemini API key (SEO tags), default UTM campaign/medium, reset to demo data |

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
| `#/dashboard` | Unified Dashboard & Analytics |
| `#/posts` | Posts list |
| `#/posts/{id}` | Post editor |
| `#/share` | Share Kit |
| `#/platforms` | Connected platforms |
| `#/settings` | Settings |
| `#/s/{slug}` | Public hub |

## License

MIT — see `LICENSE`.
