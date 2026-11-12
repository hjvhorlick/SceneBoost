import type { PlatformSettings, Scene } from '../types'
import { extractYoutubeVideoId } from './scenering'
import { loadGeminiApiKey } from './gemini'

export const DEFAULT_YOUTUBE_CHANNEL_ID = 'UCV9v30xQPdbhwM5lAZC2MRQ'

export interface YoutubeChannelVideo {
  videoId: string
  title: string
  url: string
  publishedAt: string
  thumbnailUrl?: string
}

export interface AutoYoutubeFetchResult {
  matched: YoutubeChannelVideo | null
  latestOnChannel: YoutubeChannelVideo | null
  channelId: string
  checkedCount: number
  source: string
}

/**
 * Extracts the `UC...` YouTube Channel ID from the connected YouTube platform
 * URL (falling back to the owner's configured Scenering YouTube channel ID).
 */
export function extractYoutubeChannelId(platforms?: PlatformSettings[]): string {
  const ytHandle = platforms?.find((p) => p.id === 'youtube')?.defaultHandle?.trim() || ''
  const match = ytHandle.match(/\b(UC[a-zA-Z0-9_-]{22})\b/)
  return match?.[1] || DEFAULT_YOUTUBE_CHANNEL_ID
}

/**
 * Parses a YouTube Atom XML feed (`https://www.youtube.com/feeds/videos.xml?channel_id=...`)
 * into structured video items using the browser's native DOMParser.
 */
export function parseYoutubeAtomXml(xmlText: string): YoutubeChannelVideo[] {
  if (!xmlText || !xmlText.includes('<entry>')) return []
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
    const entries = Array.from(doc.getElementsByTagName('entry'))
    const videos: YoutubeChannelVideo[] = []

    for (const entry of entries) {
      const ytIdNode =
        entry.getElementsByTagName('yt:videoId')[0] ||
        entry.getElementsByTagNameNS('*', 'videoId')[0]
      let videoId = ytIdNode?.textContent?.trim() || ''

      const linkEl = entry.getElementsByTagName('link')[0]
      const href = linkEl?.getAttribute('href')?.trim() || ''
      if (!videoId && href) {
        videoId = extractYoutubeVideoId(href) || ''
      }
      if (!videoId) continue

      const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() || ''
      const publishedAt =
        entry.getElementsByTagName('published')[0]?.textContent?.trim() ||
        new Date().toISOString()

      videos.push({
        videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      })
    }

    return videos
  } catch {
    return []
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 6000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches the most recently published videos on the owner's YouTube channel
 * automatically using a 4-layer strategy:
 * 1. Official YouTube Data API v3 (`playlistItems` on `UU...` uploads playlist, when Google API key has YouTube Data API enabled)
 * 2. Same-origin `/api/youtube/latest` server proxy (zero-key Atom XML)
 * 3. Browser-direct `rss2json` YouTube Atom feed reader
 * 4. Browser-direct raw Atom XML relays (`allorigins` / `corsproxy`)
 */
export async function fetchChannelRecentVideos(
  channelId: string,
  apiKey?: string
): Promise<{ videos: YoutubeChannelVideo[]; source: string }> {
  const key = (apiKey ?? loadGeminiApiKey()).trim()

  // 1. Official YouTube Data API v3 (instant — zero RSS cache delay)
  if (key && channelId.startsWith('UC')) {
    const uploadsPlaylistId = `UU${channelId.slice(2)}`
    const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
      uploadsPlaylistId
    )}&maxResults=15&key=${encodeURIComponent(key)}`
    try {
      const res = await fetchWithTimeout(apiUrl, 6000)
      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{
            snippet?: {
              title?: string
              publishedAt?: string
              resourceId?: { videoId?: string }
            }
            contentDetails?: { videoId?: string; videoPublishedAt?: string }
          }>
        }
        const videos: YoutubeChannelVideo[] = []
        for (const item of json.items ?? []) {
          const videoId =
            item.contentDetails?.videoId ||
            item.snippet?.resourceId?.videoId ||
            ''
          if (!videoId) continue
          const title = item.snippet?.title?.trim() || ''
          if (title === 'Private video' || title === 'Deleted video') continue
          const publishedAt =
            item.contentDetails?.videoPublishedAt ||
            item.snippet?.publishedAt ||
            new Date().toISOString()
          videos.push({
            videoId,
            title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            publishedAt,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          })
        }
        return { videos, source: 'YouTube Data API v3' }
      }
    } catch {
      // Fall through to zero-key public feed strategies
    }
  }

  // 2. Local / Serverless same-origin `/api/youtube/latest` proxy
  try {
    const res = await fetchWithTimeout(
      `/api/youtube/latest?channelId=${encodeURIComponent(channelId)}&_=${Date.now()}`,
      3000
    )
    if (res.ok) {
      const xml = await res.text()
      if (xml.includes('<feed')) {
        return { videos: parseYoutubeAtomXml(xml), source: 'YouTube Channel Feed' }
      }
    }
  } catch {
    // Fall through to browser-direct strategies
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
    channelId
  )}`

  // 3. Browser-direct RSS-to-JSON bridge
  try {
    const res = await fetchWithTimeout(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
      6500
    )
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string
        items?: Array<{
          title?: string
          link?: string
          guid?: string
          pubDate?: string
        }>
      }
      if (data.status === 'ok' && Array.isArray(data.items)) {
        const videos: YoutubeChannelVideo[] = []
        for (const item of data.items) {
          const guidMatch = item.guid?.match(/yt:video:([a-zA-Z0-9_-]{11})/)
          const videoId =
            guidMatch?.[1] || (item.link ? extractYoutubeVideoId(item.link) : null) || ''
          if (!videoId) continue
          videos.push({
            videoId,
            title: (item.title || '').trim(),
            url: `https://www.youtube.com/watch?v=${videoId}`,
            publishedAt: item.pubDate
              ? new Date(`${item.pubDate.replace(' ', 'T')}Z`).toISOString()
              : new Date().toISOString(),
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          })
        }
        return { videos, source: 'YouTube Channel Feed' }
      }
    }
  } catch {
    // Fall through
  }

  // 4. Browser-direct raw Atom XML relays
  const feedWithBust = `${feedUrl}&_=${Date.now()}`
  const relays = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(feedWithBust)}`,
    `https://corsproxy.io/?${encodeURIComponent(feedWithBust)}`,
  ]
  for (const relayUrl of relays) {
    try {
      const res = await fetchWithTimeout(relayUrl, 6500)
      if (res.ok) {
        const xml = await res.text()
        if (xml.includes('<feed')) {
          return { videos: parseYoutubeAtomXml(xml), source: 'YouTube Channel Feed' }
        }
      }
    } catch {
      // try next relay
    }
  }

  throw new Error('Could not reach YouTube channel feed — check your internet connection')
}

function normalizeForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSignificant(title: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'video', 'official', 'how', 'why', 'what'])
  return normalizeForMatch(title)
    .split(' ')
    .filter((w) => w.length >= 3 && !stop.has(w))
}

function computeTitleMatchScore(postTitle: string, ytTitle: string): number {
  const a = normalizeForMatch(postTitle)
  const b = normalizeForMatch(ytTitle)
  if (!a || !b) return 0
  if (a === b) return 1

  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= 8 && longer.includes(shorter)) {
    return 0.9
  }

  const tokensA = tokenizeSignificant(postTitle)
  const tokensB = new Set(tokenizeSignificant(ytTitle))
  if (tokensA.length === 0 || tokensB.size === 0) return 0

  let hits = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) hits++
  }
  return hits / Math.max(tokensA.length, Math.min(tokensB.size, tokensA.length + 2))
}

/**
 * Automatically locates the published YouTube video for a SceneBoost post:
 * 1. Matches by video title against the channel's published uploads (>= 60% match).
 * 2. If the title was edited in YouTube Studio, matches any brand-new video published
 *    on the channel after this post was created (that isn't already linked to another post).
 */
export async function autoFetchYoutubeVideoForPost(
  post: Pick<Scene, 'id' | 'title' | 'createdAt'>,
  allPosts: ReadonlyArray<Pick<Scene, 'id' | 'videoUrl'>>,
  platforms?: PlatformSettings[]
): Promise<AutoYoutubeFetchResult> {
  const channelId = extractYoutubeChannelId(platforms)
  const { videos, source } = await fetchChannelRecentVideos(channelId)

  const usedVideoIds = new Set<string>()
  for (const other of allPosts) {
    if (other.id === post.id) continue
    const vid = extractYoutubeVideoId(other.videoUrl || '')
    if (vid) usedVideoIds.add(vid)
  }

  // 1. Title match
  let bestVideo: YoutubeChannelVideo | null = null
  let bestScore = 0
  for (const v of videos) {
    const score = computeTitleMatchScore(post.title, v.title)
    if (score > bestScore) {
      bestScore = score
      bestVideo = v
    }
  }
  if (bestVideo && bestScore >= 0.58) {
    return {
      matched: bestVideo,
      latestOnChannel: videos[0] ?? null,
      channelId,
      checkedCount: videos.length,
      source,
    }
  }

  // 2. Fresh upload published on the channel since this post was started
  const createdMs = Date.parse(post.createdAt) || 0
  const cutoffMs = createdMs > 0 ? createdMs - 15 * 60 * 1000 : Date.now() - 60 * 60 * 1000
  const freshUpload = videos.find((v) => {
    if (usedVideoIds.has(v.videoId)) return false
    const pubMs = Date.parse(v.publishedAt) || 0
    return pubMs >= cutoffMs
  })

  return {
    matched: freshUpload ?? null,
    latestOnChannel: videos[0] ?? null,
    channelId,
    checkedCount: videos.length,
    source,
  }
}
