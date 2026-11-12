import type { AppData, PlatformSettings, Scene, SceneLink } from '../types'
import { PLATFORMS } from './platforms'
import { uid } from './utils'

const KEY = 'scenboost_data_v1'

// Real profiles/pages provided by the owner (replaces demo @sceneboost handles).
export const YOUTUBE_URL = 'https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ'
export const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61595379711660'
export const LINKEDIN_URL = 'https://www.linkedin.com/company/145348282'
export const TIKTOK_URL = 'https://www.tiktok.com/@scenering.com'
export const WEBSITE_URL = 'https://scenering.com'

// Old demo link URLs -> real profile URLs (used for seed + one-time migration).
const DEMO_URL_MIGRATION: Record<string, string> = {
  'https://youtube.com/watch?v=neon-nights': YOUTUBE_URL,
  'https://youtube.com/watch?v=studio-sessions-04': YOUTUBE_URL,
  'https://facebook.com/sceneboost/videos/studio-04': FACEBOOK_URL,
  'https://linkedin.com/posts/sceneboost-studio-04': LINKEDIN_URL,
  'https://tiktok.com/@sceneboost/video/neon-nights': TIKTOK_URL,
  'https://tiktok.com/@sceneboost/video/studio-04': TIKTOK_URL,
  'https://tiktok.com/@sceneboost/video/summer-drop': TIKTOK_URL,
  'https://shop.sceneboost.co/neon-nights': WEBSITE_URL,
  'https://shop.sceneboost.co/waitlist': WEBSITE_URL,
}

const DEFAULT_PLATFORMS: PlatformSettings[] = [
  { id: 'youtube', connected: true, defaultHandle: YOUTUBE_URL },
  { id: 'tiktok', connected: true, defaultHandle: TIKTOK_URL },
  { id: 'facebook', connected: true, defaultHandle: FACEBOOK_URL },
  { id: 'linkedin', connected: true, defaultHandle: LINKEDIN_URL },
  { id: 'x', connected: true, defaultHandle: '@sceneboost' },
  { id: 'twitch', connected: true, defaultHandle: '' },
  { id: 'kick', connected: true, defaultHandle: '' },
  { id: 'vimeo', connected: true, defaultHandle: '' },
  { id: 'threads', connected: true, defaultHandle: '' },
  { id: 'instagram', connected: false, defaultHandle: '' },
  { id: 'website', connected: true, defaultHandle: WEBSITE_URL },
]

function seed(): AppData {
  const now = new Date()
  const iso = (daysAgo: number, hours = 0) => {
    const d = new Date(now.getTime() - daysAgo * 86400000 - hours * 3600000)
    return d.toISOString()
  }

  const mkLink = (
    platform: SceneLink['platform'],
    label: string,
    url: string,
    clicks: number,
    order: number
  ): SceneLink => ({ id: uid(), platform, label, url, enabled: true, clicks, order })

  const scenes: Scene[] = [
    {
      id: uid(),
      title: 'Neon Nights — Official Music Video',
      slug: 'neon-nights-official-video',
      description:
        'The official video is live. Watch it everywhere, share your favourite scene and tag @sceneboost — best fan edit wins a signed vinyl.',
      thumbnail: 'neon',
      videoUrl: YOUTUBE_URL,
      status: 'live',
      accent: '#FF3D81',
      createdAt: iso(12),
      updatedAt: iso(0, 3),
      links: [
        mkLink('youtube', 'Watch on YouTube', YOUTUBE_URL, 4821, 0),
        mkLink('tiktok', 'Watch on TikTok', TIKTOK_URL, 3104, 1),
        mkLink('x', 'Post the teaser', 'https://x.com/sceneboost/status/neon-nights', 940, 2),
        mkLink('website', 'Visit Scenering', WEBSITE_URL, 612, 3),
      ],
    },
    {
      id: uid(),
      title: 'Studio Sessions — Ep. 04: The Mix',
      slug: 'studio-sessions-ep-04',
      description:
        'Inside the room where Neon Nights was mixed. Full episode on YouTube, highlights on TikTok, Facebook and LinkedIn.',
      thumbnail: 'ocean',
      videoUrl: YOUTUBE_URL,
      status: 'live',
      accent: '#00C9FF',
      createdAt: iso(6),
      updatedAt: iso(1, 5),
      links: [
        mkLink('youtube', 'Watch on YouTube', YOUTUBE_URL, 1980, 0),
        mkLink('tiktok', 'Watch on TikTok', TIKTOK_URL, 1540, 1),
        mkLink('facebook', 'Visit our Facebook', FACEBOOK_URL, 430, 2),
        mkLink('linkedin', 'Visit our LinkedIn', LINKEDIN_URL, 210, 3),
      ],
    },
    {
      id: uid(),
      title: 'Summer Drop — Teaser Campaign',
      slug: 'summer-drop-teaser',
      description:
        'Something is coming. Join the waitlist, follow the countdown and be first to shop the Summer Drop.',
      thumbnail: 'sunset',
      videoUrl: '',
      status: 'draft',
      accent: '#FFB03A',
      createdAt: iso(1),
      updatedAt: iso(0, 1),
      links: [
        mkLink('tiktok', 'Watch on TikTok', TIKTOK_URL, 0, 0),
        mkLink('website', 'Visit Scenering', WEBSITE_URL, 0, 1),
      ],
    },
  ]

  return {
    scenes,
    platforms: DEFAULT_PLATFORMS.map((p) => ({ ...p })),
    settings: {
      brandName: 'SceneBoost',
      handle: '@sceneboost',
      defaultCampaign: 'neon-nights-launch',
      defaultMedium: 'social',
      accent: '#D4FF3F',
    },
    totalClicks: 13637,
    activity: [
      { id: uid(), text: 'YouTube link for “Neon Nights” passed 4,800 clicks', time: iso(0, 2), kind: 'click' },
      { id: uid(), text: 'New scene created: “Summer Drop — Teaser Campaign”', time: iso(1), kind: 'scene' },
      { id: uid(), text: 'TikTok link added to “Studio Sessions — Ep. 04”', time: iso(1, 6), kind: 'link' },
      { id: uid(), text: 'TikTok link for “Neon Nights” passed 3,100 clicks', time: iso(2), kind: 'click' },
    ],
  }
}

/**
 * One-time migration: browsers that already loaded an earlier seed get the
 * owner's real YouTube / TikTok / Facebook / LinkedIn profiles, have Spotify
 * removed and replaced by video platforms (Twitch, Kick, Vimeo, Threads), and
 * keep Instagram disconnected — without losing user-created scenes or clicks.
 */
function migrateDemoProfiles(data: AppData): AppData {
  const validIds = new Set<string>(PLATFORMS.map((p) => p.id))
  const demoHandles: Record<string, string> = {
    youtube: YOUTUBE_URL,
    tiktok: TIKTOK_URL,
    facebook: FACEBOOK_URL,
    linkedin: LINKEDIN_URL,
    website: WEBSITE_URL,
  }
  const demoHandleValues = new Set(['@sceneboost', 'SceneBoost', 'shop.sceneboost.co', ''])

  const existingById = new Map<string, PlatformSettings>()
  for (const p of data.platforms ?? []) {
    if (!validIds.has(p.id as string)) continue // drops removed platforms like spotify
    if (p.id === 'instagram' && demoHandleValues.has(p.defaultHandle)) {
      existingById.set(p.id, { ...p, connected: false, defaultHandle: '' })
      continue
    }
    const replacement = demoHandles[p.id]
    if (!replacement) {
      existingById.set(p.id, p)
      continue
    }
    if (p.id === 'linkedin') {
      existingById.set(
        p.id,
        demoHandleValues.has(p.defaultHandle) || !p.connected
          ? { ...p, connected: true, defaultHandle: replacement }
          : p
      )
      continue
    }
    existingById.set(
      p.id,
      demoHandleValues.has(p.defaultHandle) ? { ...p, defaultHandle: replacement } : p
    )
  }

  // Ensure all current PLATFORMS exist in canonical order (adds Twitch, Kick, Vimeo, Threads).
  const platforms: PlatformSettings[] = DEFAULT_PLATFORMS.map(
    (def) => existingById.get(def.id) ?? { ...def }
  )

  const scenes = data.scenes.map((scene) => ({
    ...scene,
    videoUrl: DEMO_URL_MIGRATION[scene.videoUrl] ?? scene.videoUrl,
    links: scene.links
      .filter((link) => validIds.has(link.platform as string))
      .map((link) => {
        const wasDemoWebsite =
          link.platform === 'website' && link.url in DEMO_URL_MIGRATION
        const url = DEMO_URL_MIGRATION[link.url] ?? link.url
        const label =
          wasDemoWebsite &&
          (link.label === 'Get the vinyl — limited drop' || link.label === 'Join the waitlist')
            ? 'Visit Scenering'
            : link.label
        const isDemoIg =
          link.platform === 'instagram' &&
          (url.toLowerCase().includes('sceneboost') ||
            url === 'https://instagram.com/reel/neon-nights' ||
            url === 'https://instagram.com/p/studio-04' ||
            url === 'https://instagram.com/reel/summer-drop')
        return isDemoIg ? { ...link, url, label, enabled: false } : { ...link, url, label }
      }),
  }))

  const activity = (data.activity ?? []).map((item) =>
    item.text === 'Spotify link for “Neon Nights” passed 1,800 clicks'
      ? { ...item, text: 'TikTok link for “Neon Nights” passed 3,100 clicks' }
      : item
  )

  return { ...data, platforms, scenes, activity }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      const data = seed()
      localStorage.setItem(KEY, JSON.stringify(data))
      return data
    }
    const parsed = JSON.parse(raw) as AppData
    if (!parsed.scenes) return seed()
    const migrated = migrateDemoProfiles(parsed)
    localStorage.setItem(KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return seed()
  }
}

export function saveData(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage full / private mode — ignore
  }
}

export function resetData(): AppData {
  const data = seed()
  saveData(data)
  return data
}
