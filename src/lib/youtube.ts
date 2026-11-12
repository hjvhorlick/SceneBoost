import type { PlatformSettings, Scene } from '../types'
import { extractYoutubeVideoId, toCanonicalYoutubeVideoUrl } from './scenering'
import { loadGeminiApiKey } from './gemini'

export const DEFAULT_YOUTUBE_CHANNEL_ID = 'UCV9v30xQPdbhwM5lAZC2MRQ'
const GOOGLE_OAUTH_CLIENT_ID_KEY = 'scenboost_google_oauth_client_id'

let cachedAccessToken = ''
let cachedTokenExpiresAt = 0

export function loadGoogleOAuthClientId(): string {
  try {
    return localStorage.getItem(GOOGLE_OAUTH_CLIENT_ID_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function saveGoogleOAuthClientId(clientId: string): void {
  try {
    const trimmed = clientId.trim()
    if (trimmed) {
      localStorage.setItem(GOOGLE_OAUTH_CLIENT_ID_KEY, trimmed)
    } else {
      localStorage.removeItem(GOOGLE_OAUTH_CLIENT_ID_KEY)
    }
  } catch {
    // ignore storage restrictions
  }
}

export interface YoutubeChannelVideo {
  videoId: string
  title: string
  url: string // That specific video's own unique URL: https://youtu.be/<videoId>
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

export function extractYoutubeChannelId(platforms?: PlatformSettings[]): string {
  const ytHandle = platforms?.find((p) => p.id === 'youtube')?.defaultHandle?.trim() || ''
  const match = ytHandle.match(/\b(UC[a-zA-Z0-9_-]{22})\b/)
  return match?.[1] || DEFAULT_YOUTUBE_CHANNEL_ID
}

/**
 * Loads Google Identity Services (`accounts.google.com/gsi/client`) on demand
 * and requests an OAuth 2.0 access token for YouTube Upload & Read.
 */
interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: {
              access_token?: string
              expires_in?: number
              error?: string
              error_description?: string
            }) => void
            error_callback?: (err: { message?: string; type?: string }) => void
          }) => GisTokenClient
        }
      }
    }
  }
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sceneboost-gis="1"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load Google Sign-In script')), {
        once: true,
      })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.sceneboostGis = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google Sign-In script'))
    document.head.appendChild(script)
  })
}

export async function requestYoutubeAccessToken(clientId: string): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedTokenExpiresAt - 30_000) {
    return cachedAccessToken
  }
  const cleanId = clientId.trim()
  if (!cleanId) {
    throw new Error('Add your Google OAuth Client ID in Settings first')
  }
  await loadGisScript()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) {
    throw new Error('Google OAuth client unavailable in this browser')
  }

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: cleanId,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'YouTube authorization cancelled'))
          return
        }
        cachedAccessToken = resp.access_token
        cachedTokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3500) * 1000
        resolve(resp.access_token)
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'Google authorization popup closed'))
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const parts = dataUrl.split(',')
  if (parts.length !== 2) return null
  const mimeMatch = parts[0].match(/:(.*?);/)
  const mime = mimeMatch?.[1] || 'image/jpeg'
  try {
    const bin = atob(parts[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  } catch {
    return null
  }
}

export interface DirectYoutubeUploadInput {
  clientId: string
  videoFile: File
  title: string
  descriptionWithCredits: string
  tags: string[]
  thumbnailDataUrl?: string
  privacyStatus?: 'public' | 'unlisted' | 'private'
  onStage?: (stage: string, percent?: number) => void
}

/**
 * Posts the video + description/credits + SEO tags + thumbnail directly to YouTube
 * via YouTube Data API v3, captures THAT newly created video's unique URL
 * (`https://youtu.be/<videoId>`) the moment YouTube creates it, and returns it
 * to be placed into SceneBoost for all the other social posts.
 */
export async function uploadPostDirectlyToYoutube({
  clientId,
  videoFile,
  title,
  descriptionWithCredits,
  tags,
  thumbnailDataUrl,
  privacyStatus = 'public',
  onStage,
}: DirectYoutubeUploadInput): Promise<YoutubeChannelVideo> {
  onStage?.('Authorizing with YouTube…', 0)
  const accessToken = await requestYoutubeAccessToken(clientId)

  onStage?.('Creating video on YouTube…', 2)
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(videoFile.size),
        'X-Upload-Content-Type': videoFile.type || 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: title.trim().slice(0, 100) || 'Untitled Video',
          description: descriptionWithCredits.slice(0, 4950),
          tags: tags.slice(0, 35),
          categoryId: '22',
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  )

  if (!initRes.ok) {
    let errMsg = `YouTube upload init failed (HTTP ${initRes.status})`
    try {
      const errJson = (await initRes.json()) as { error?: { message?: string } }
      if (errJson?.error?.message) errMsg = errJson.error.message
    } catch {
      // ignore
    }
    throw new Error(errMsg)
  }

  const uploadLocation = initRes.headers.get('Location')
  if (!uploadLocation) {
    throw new Error('YouTube did not return a resumable upload session URL')
  }

  // Stream the video file and capture the newly created video's ID directly from YouTube's response
  const createdVideo = await new Promise<{ id: string; snippet?: { title?: string; publishedAt?: string } }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadLocation, true)
      xhr.setRequestHeader('Content-Type', videoFile.type || 'video/mp4')
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.min(99, Math.max(3, Math.round((ev.loaded / ev.total) * 95)))
          onStage?.(`Uploading video to YouTube (${pct}%)…`, pct)
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText) as {
              id?: string
              snippet?: { title?: string; publishedAt?: string }
            }
            if (!parsed.id) {
              reject(new Error('YouTube finished upload without returning a video ID'))
              return
            }
            resolve({ id: parsed.id, snippet: parsed.snippet })
          } catch {
            reject(new Error('Invalid response from YouTube upload endpoint'))
          }
        } else {
          reject(new Error(`YouTube video upload failed (HTTP ${xhr.status})`))
        }
      }
      xhr.onerror = () => reject(new Error('Network error during YouTube video upload'))
      xhr.send(videoFile)
    }
  )

  // Upload the 1280x720 thumbnail if provided
  if (thumbnailDataUrl && thumbnailDataUrl.startsWith('data:image/')) {
    const thumbBlob = dataUrlToBlob(thumbnailDataUrl)
    if (thumbBlob) {
      onStage?.('Setting 1280×720 thumbnail on YouTube…', 97)
      try {
        await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(
            createdVideo.id
          )}&uploadType=media`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': thumbBlob.type || 'image/jpeg',
            },
            body: thumbBlob,
          }
        )
      } catch {
        // Non-fatal if custom thumbnails aren't verified on the account yet
      }
    }
  }

  onStage?.('Video URL fetched from YouTube ✓', 100)
  return {
    videoId: createdVideo.id,
    title: createdVideo.snippet?.title || title.trim(),
    url: `https://youtu.be/${createdVideo.id}`,
    publishedAt: createdVideo.snippet?.publishedAt || new Date().toISOString(),
    thumbnailUrl: `https://i.ytimg.com/vi/${createdVideo.id}/hqdefault.jpg`,
  }
}

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
        url: `https://youtu.be/${videoId}`,
        publishedAt,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      })
    }

    return videos
  } catch {
    return []
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches recently created videos on the YouTube channel so we can grab THAT
 * specific video's unique URL (`https://youtu.be/<videoId>`) right after posting.
 */
export async function fetchChannelRecentVideos(
  channelId: string,
  apiKey?: string
): Promise<{ videos: YoutubeChannelVideo[]; source: string }> {
  // 0. If user has an active YouTube OAuth token, read `mine=true` uploads (includes unlisted/processing!)
  if (cachedAccessToken && Date.now() < cachedTokenExpiresAt - 15_000) {
    try {
      const chRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
        { headers: { Authorization: `Bearer ${cachedAccessToken}` } }
      )
      if (chRes.ok) {
        const chJson = (await chRes.json()) as {
          items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
        }
        const uploadsId = chJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
        if (uploadsId) {
          const plRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
              uploadsId
            )}&maxResults=15`,
            { headers: { Authorization: `Bearer ${cachedAccessToken}` } }
          )
          if (plRes.ok) {
            const plJson = (await plRes.json()) as {
              items?: Array<{
                snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } }
                contentDetails?: { videoId?: string; videoPublishedAt?: string }
              }>
            }
            const videos: YoutubeChannelVideo[] = []
            for (const item of plJson.items ?? []) {
              const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || ''
              if (!videoId) continue
              videos.push({
                videoId,
                title: item.snippet?.title?.trim() || '',
                url: `https://youtu.be/${videoId}`,
                publishedAt:
                  item.contentDetails?.videoPublishedAt ||
                  item.snippet?.publishedAt ||
                  new Date().toISOString(),
                thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              })
            }
            if (videos.length > 0) return { videos, source: 'YouTube Studio Account' }
          }
        }
      }
    } catch {
      // fall through
    }
  }

  const key = (apiKey ?? loadGeminiApiKey()).trim()

  // 1. Official YouTube Data API v3 (`UU...` uploads playlist)
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
            url: `https://youtu.be/${videoId}`,
            publishedAt,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          })
        }
        return { videos, source: 'YouTube Data API' }
      }
    } catch {
      // Fall through
    }
  }

  // 2. Local / Serverless same-origin `/api/youtube/latest` proxy
  try {
    const res = await fetchWithTimeout(
      `/api/youtube/latest?channelId=${encodeURIComponent(channelId)}&_=${Date.now()}`,
      2500
    )
    if (res.ok) {
      const xml = await res.text()
      if (xml.includes('<feed')) {
        return { videos: parseYoutubeAtomXml(xml), source: 'YouTube Uploads' }
      }
    }
  } catch {
    // Fall through
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
            url: `https://youtu.be/${videoId}`,
            publishedAt: item.pubDate
              ? new Date(`${item.pubDate.replace(' ', 'T')}Z`).toISOString()
              : new Date().toISOString(),
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          })
        }
        return { videos, source: 'YouTube Uploads' }
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
          return { videos: parseYoutubeAtomXml(xml), source: 'YouTube Uploads' }
        }
      }
    } catch {
      // try next relay
    }
  }

  throw new Error('Could not reach YouTube — check your internet connection')
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
 * Checks if the system clipboard currently holds a newly created YouTube video URL
 * (`https://youtu.be/<id>` or `https://www.youtube.com/watch?v=<id>`) copied from
 * YouTube Studio as the video was created.
 */
export async function tryReadYoutubeVideoUrlFromClipboard(
  usedVideoIds: Set<string>
): Promise<YoutubeChannelVideo | null> {
  if (!navigator.clipboard?.readText) return null
  try {
    const clip = (await navigator.clipboard.readText()).trim()
    const videoId = extractYoutubeVideoId(clip)
    if (!videoId || usedVideoIds.has(videoId)) return null
    return {
      videoId,
      title: '',
      url: toCanonicalYoutubeVideoUrl(clip),
      publishedAt: new Date().toISOString(),
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    }
  } catch {
    return null
  }
}

/**
 * Fetches THAT newly posted video's own URL (`https://youtu.be/<videoId>`) right
 * after posting to YouTube so SceneBoost can place it into all the rest of the
 * social pages' posts automatically.
 */
export async function autoFetchYoutubeVideoForPost(
  post: Pick<Scene, 'id' | 'title' | 'createdAt'>,
  allPosts: ReadonlyArray<Pick<Scene, 'id' | 'videoUrl'>>,
  platforms?: PlatformSettings[],
  options?: { checkClipboard?: boolean }
): Promise<AutoYoutubeFetchResult> {
  const channelId = extractYoutubeChannelId(platforms)

  const usedVideoIds = new Set<string>()
  for (const other of allPosts) {
    if (other.id === post.id) continue
    const vid = extractYoutubeVideoId(other.videoUrl || '')
    if (vid) usedVideoIds.add(vid)
  }

  // First: if user clicked "Fetch Video URL" right after YouTube Studio created the video
  // and copied its `https://youtu.be/<id>` link, grab it immediately (even while processing/unlisted!)
  if (options?.checkClipboard) {
    const fromClip = await tryReadYoutubeVideoUrlFromClipboard(usedVideoIds)
    if (fromClip) {
      return {
        matched: { ...fromClip, title: post.title },
        latestOnChannel: fromClip,
        channelId,
        checkedCount: 1,
        source: 'YouTube Video Link',
      }
    }
  }

  const { videos, source } = await fetchChannelRecentVideos(channelId)

  // 1. Match by title against newly created/published videos on the channel
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

  // 2. Match any brand-new video published since this post was created
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
