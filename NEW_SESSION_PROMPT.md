# NEW_SESSION_PROMPT.md — SceneBoost session recreation

> **How to use this file:** start a new Arena session on this repository, paste the full text of this file as your first message, and let the new session recreate, verify and push with its own GitHub connection. This file is the complete handoff — it contains everything the new session needs without any prior conversation context.

---

## Paste everything below this line into the new session

---

You are continuing work on **SceneBoost** (`hjvhorlick/SceneBoost`) — *"Create marketing links to social media and video Platforms."*

### Current state (already done — verify, don't rebuild from zero)

- Repo root: `/home/user/SceneBoost`, branch: `arena/bd793a72-sceneboost` (branched from `main` @ `0160c04`).
- The app is **fully built**: Vite 6 + React 18 + TypeScript, `lucide-react` + `qrcode`, hash routing, `localStorage` persistence (`scenboost_data_v1`), seeded with 3 demo scenes.
- Views: Dashboard, Scenes (CRUD + search/filter), Scene Editor (details + per-platform links with auto-UTMs + live phone preview), Analytics (platform bars, leaderboard, CSV export), Share Kit (hub link, tracked links, QR PNG, embed code, post templates), Platforms (connect toggles + handles), Settings (brand + default UTMs + reset), Public Hub at `#/s/{slug}` with click tracking.
- `npm run build` passes (tsc + vite). Dev server runs on `0.0.0.0:5173`.

### Your task

1. **Verify the checkout** — run `git status`, `git log --oneline -5`, `ls -la`, and confirm the files above exist (`package.json`, `src/App.tsx`, `src/components/*`, `src/lib/*`, `README.md`, this file).
2. **Verify the build** — run `npm install` (if `node_modules` is missing) then `npm run build`. Fix any errors you find; do not rewrite working code unnecessarily.
3. **Smoke-test the app** — start the dev server (`npm run dev`, bound to `0.0.0.0:5173`) and confirm it serves HTTP 200. Check the Dashboard renders, Scenes list shows the 3 seeded scenes, and `#/s/neon-nights-official-video` opens the public hub.
4. **Push with your own GitHub connection** — commit any fixes, then `git push origin arena/bd793a72-sceneboost`. Use `gh` for any PR operations. Never ask the user for tokens/passwords; if auth fails, report that GitHub needs reconnecting in Arena.
5. **Report back** — summarise: what you verified, any fixes made, the commit hash pushed, and how to run the app locally.

### Constraints

- Stay on branch `arena/bd793a72-sceneboost` — do not create, switch or push to any other branch.
- Keep generated artifacts (`node_modules/`, `dist/`) out of git — they are already in `.gitignore`.
- If something is genuinely missing (e.g. a file was lost), recreate it to match the architecture in `README.md` rather than inventing a new design.

---

## Architecture reference (for the new session)

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
    Sidebar.tsx  Dashboard.tsx  Scenes.tsx  SceneEditor.tsx
    Analytics.tsx  ShareKit.tsx  Platforms.tsx  Settings.tsx
    PublicHub.tsx  ui.tsx
```

Key behaviours to preserve:

- Hash routes: `#/dashboard`, `#/scenes`, `#/scenes/{id}`, `#/analytics`, `#/share`, `#/platforms`, `#/settings`, `#/s/{slug}`.
- UTM builder: `utm_source` = platform, `utm_medium`/`utm_campaign` from Settings, `utm_content` = scene slug.
- Hub clicks increment the link counter, `totalClicks`, and prepend an activity item.
- Seed data lives in `src/lib/store.ts` (`seed()`); reset in Settings restores it.
