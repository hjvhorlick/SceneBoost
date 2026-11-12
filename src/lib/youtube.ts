import type { PlatformSettings, Scene } from '../types'
import { extractYoutubeVideoId, makeUniqueVideoTitle } from './scenering'
import { loadGeminiApiKey } from './gemini'

export const DEFAULT_YOUTUBE_CHANNEL_ID = 'UCV9v30xQPdbhwM5lAZC2MRQ'
const GOOGLE_OAUTH_CLIENT_ID_KEY = 'scenboost_google_oauth_client_id'
const CONNECTED_CHANNEL_TITLE_KEY = 'scenboost_yt_channel_title'

let cachedAccessToken = ''
let cachedTokenExpiresAt = 0

export function loadGoogleOAuthClientId(): string {
  try {
    const stored = localStorage.getItem(GOOGLE_OAUTH_CLIENT_ID_KEY)?.trim()
    if (stored) return stored
  } catch {
    // ignore storage restrictions
  }
  const envId = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_GOOGLE_CLIENT_ID?.trim()
  return envId || ''
}

export function saveGoogleOAuthClientId(clientId: string): void {
  try {
    const trimmed = clientId.trim()
    if (trimmed) {
      localStorage.setItem(GOOGLE_OAUTH_CLIENT_ID_KEY, trimmed)
    } else {
      localStorage.removeItem(GOOGLE_OAUTH_CLIENT_ID_KEY)
      sessionStorage.removeItem(CONNECTED_CHANNEL_TITLE_KEY)
      cachedAccessToken = ''
      cachedTokenExpiresAt = 0
    }
  } catch {
    // ignore storage restrictions
  }
}

export function getConnectedYoutubeChannelLabel(): string {
  try {
    return sessionStorage.getItem(CONNECTED_CHANNEL_TITLE_KEY) || ''
  } catch {
    return ''
  }
}

export function hasActiveYoutubeUploadSession(): boolean {
  return Boolean(cachedAccessToken && Date.now() < cachedTokenExpiresAt - 30_000)
}

export interface YoutubeChannelVideo {
  videoId: string
  title: string
  url: string // Strictly `https://youtu.be/<videoId>`
  publishedAt: string
  thumbnailUrl?: string
}

export interface AutoYoutubeFetchResult {
  matched: YoutubeChannelVideo | null
  latestOnChannel: YoutubeChannelVideo | null
  channelId: string
  checkedCount: number
  source: string
  reason?: string
}

export function extractYoutubeChannelId(platforms?: PlatformSettings[]): string {
  const ytHandle = platforms?.find((p) => p.id === 'youtube')?.defaultHandle?.trim() || ''
  const match = ytHandle.match(/\b(UC[a-zA-Z0-9_-]{22})\b/)
  return match?.[1] || DEFAULT_YOUTUBE_CHANNEL_ID
}

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

export async function requestYoutubeAccessToken(
  clientId: string,
  forceConsent = false
): Promise<string> {
  if (!forceConsent && cachedAccessToken && Date.now() < cachedTokenExpiresAt - 30_000) {
    return cachedAccessToken
  }
  const cleanId = clientId.trim()
  if (!cleanId) {
    throw new Error('Google OAuth Client ID is required to upload directly to YouTube')
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
        reject(new Error(err?.message || 'Google authorization popup closed before completing sign-in'))
      },
    })
    tokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '' })
  })
}

/**
 * Connects and verifies the user's YouTube channel via Google OAuth 2.0 so
 * SceneBoost can upload videos directly to YouTube.
 */
export async function connectYoutubeAccount(
  clientId: string
): Promise<{ channelId: string; channelTitle: string }> {
  const token = await requestYoutubeAccessToken(clientId, false)
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    throw new Error(`Could not verify YouTube channel (HTTP ${res.status})`)
  }
  const json = (await res.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>
  }
  const ch = json.items?.[0]
  if (!ch?.id) {
    throw new Error('No YouTube channel found on the selected Google account')
  }
  const label = `${ch.snippet?.title || 'YouTube Channel'} (${ch.id})`
  try {
    sessionStorage.setItem(CONNECTED_CHANNEL_TITLE_KEY, label)
  } catch {
    // ignore
  }
  return { channelId: ch.id, channelTitle: ch.snippet?.title || 'YouTube Channel' }
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
  existingTitles?: string[]
  descriptionWithCredits: string
  tags: string[]
  thumbnailDataUrl?: string
  privacyStatus?: 'public' | 'unlisted' | 'private'
  onStage?: (stage: string, percent: number) => void
}

async function fetchAuthenticatedChannelTitles(accessToken: string): Promise<string[]> {
  try {
    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!chRes.ok) return []
    const chJson = (await chRes.json()) as {
      items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
    }
    const uploadsId = chJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsId) return []

    const plRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(
        uploadsId
      )}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!plRes.ok) return []
    const plJson = (await plRes.json()) as {
      items?: Array<{ snippet?: { title?: string } }>
    }
    return (plJson.items ?? [])
      .map((it) => it.snippet?.title?.trim() || '')
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Uploads the actual video file + title + script/complete credit document + SEO tags +
 * 1280x720 thumbnail to YouTube via YouTube Data API v3, automatically appending `1` or `2`
 * if a video with the same name already exists on the channel, then VERIFIES on YouTube's
 * servers that the video (`videos?id=<newId>`) genuinely exists before returning its
 * `https://youtu.be/<videoId>` URL.
 */
export async function uploadPostDirectlyToYoutube({
  clientId,
  videoFile,
  title,
  existingTitles = [],
  descriptionWithCredits,
  tags,
  thumbnailDataUrl,
  privacyStatus = 'public',
  onStage,
}: DirectYoutubeUploadInput): Promise<YoutubeChannelVideo> {
  if (!videoFile || videoFile.size === 0) {
    throw new Error('No video file is attached — select your Scenering folder or .mp4/.webm video first')
  }

  onStage?.('Signing in to YouTube…', 2)
  const accessToken = await requestYoutubeAccessToken(clientId)

  onStage?.('Checking channel for duplicate video names…', 4)
  const channelTitles = await fetchAuthenticatedChannelTitles(accessToken)
  const uniqueTitle = makeUniqueVideoTitle(title, [...existingTitles, ...channelTitles], 100)

  onStage?.(`Creating “${uniqueTitle}” on YouTube…`, 5)
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
          title: uniqueTitle,
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
    let errMsg = `YouTube rejected upload start (HTTP ${initRes.status})`
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

  // Stream the real video bytes to YouTube
  const createdVideo = await new Promise<{
    id: string
    snippet?: { title?: string; publishedAt?: string }
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadLocation, true)
    xhr.setRequestHeader('Content-Type', videoFile.type || 'video/mp4')
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.min(92, Math.max(6, Math.round((ev.loaded / ev.total) * 90)))
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
          if (!parsed.id || !/^[a-zA-Z0-9_-]{11}$/.test(parsed.id)) {
            reject(new Error('YouTube did not return a valid 11-character video ID'))
            return
          }
          resolve({ id: parsed.id, snippet: parsed.snippet })
        } catch {
          reject(new Error('Invalid JSON response from YouTube upload endpoint'))
        }
      } else {
        reject(new Error(`YouTube video upload failed (HTTP ${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error while uploading video bytes to YouTube'))
    xhr.send(videoFile)
  })

  // Upload 1280x720 custom thumbnail if available
  if (thumbnailDataUrl && thumbnailDataUrl.startsWith('data:image/')) {
    const thumbBlob = dataUrlToBlob(thumbnailDataUrl)
    if (thumbBlob) {
      onStage?.('Uploading 1280×720 HD thumbnail to YouTube…', 95)
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
        // Non-fatal if custom thumbnails require phone verification on the YouTube account
      }
    }
  }

  // Strictly verify on YouTube's servers that the newly created video ID actually exists!
  onStage?.('Verifying newly created video on YouTube…', 98)
  const verifyRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(
      createdVideo.id
    )}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!verifyRes.ok) {
    throw new Error(`Upload finished, but verification check failed (HTTP ${verifyRes.status})`)
  }
  const verifyJson = (await verifyRes.json()) as {
    items?: Array<{
      id?: string
      snippet?: { title?: string; publishedAt?: string }
      status?: { uploadStatus?: string }
    }>
  }
  const verifiedItem = verifyJson.items?.[0]
  if (!verifiedItem || verifiedItem.id !== createdVideo.id) {
    throw new Error('YouTube verification failed — video was not found on YouTube after upload')
  }
  if (verifiedItem.status?.uploadStatus === 'rejected' || verifiedItem.status?.uploadStatus === 'failed') {
    throw new Error(`YouTube rejected the uploaded video (${verifiedItem.status.uploadStatus})`)
  }

  onStage?.('Verified on YouTube! Placing video URL into all social posts…', 100)
  return {
    videoId: createdVideo.id,
    title: verifiedItem.snippet?.title || createdVideo.snippet?.title || uniqueTitle,
    url: `https://youtu.be/${createdVideo.id}`,
    publishedAt:
      verifiedItem.snippet?.publishedAt ||
      createdVideo.snippet?.publishedAt ||
      new Date().toISOString(),
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
        entry.getElementsByTagName('published')[0]?.textContent?.trim() || ''
      if (!publishedAt) continue

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

export async function fetchChannelRecentVideos(
  channelId: string,
  apiKey?: string
): Promise<{ videos: YoutubeChannelVideo[]; source: string }> {
  // 0. Authenticated YouTube Studio account (`mine=true`) if OAuth session is active
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
              const publishedAt =
                item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || ''
              if (!videoId || !publishedAt) continue
              videos.push({
                videoId,
                title: item.snippet?.title?.trim() || '',
                url: `https://youtu.be/${videoId}`,
                publishedAt,
                thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              })
            }
            return { videos, source: 'YouTube Studio Account' }
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
          const title = item.snippet?.title?.trim() || ''
          if (!videoId || title === 'Private video' || title === 'Deleted video') continue
          const publishedAt =
            item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || ''
          if (!publishedAt) continue
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
      3500
    )
    if (res.ok) {
      const xml = await res.text()
      if (xml.includes('<feed')) {
        return { videos: parseYoutubeAtomXml(xml), source: 'YouTube Channel Feed' }
      }
    }
  } catch {
    // Fall through
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
    channelId
  )}`

  // 3. Browser-direct Atom XML relays
  const feedWithBust = `${feedUrl}&_=${Date.now()}`
  const relays = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(feedWithBust)}`,
    `https://corsproxy.io/?${encodeURIComponent(feedWithBust)}`,
  ]
  for (const relayUrl of relays) {
    try {
      const res = await fetchWithTimeout(relayUrl, 6000)
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

  throw new Error('Could not reach YouTube — check your internet connection')
}

/**
 * Snapshots the video IDs that ALREADY exist on the YouTube channel BEFORE a new
 * post is uploaded, so SceneBoost can NEVER mistake an old channel video for a
 * newly posted video.
 */
export async function snapshotExistingChannelVideos(
  platforms?: PlatformSettings[]
): Promise<{ ids: string[]; titles: string[] }> {
  try {
    const channelId = extractYoutubeChannelId(platforms)
    const { videos } = await fetchChannelRecentVideos(channelId)
    return {
      ids: videos.map((v) => v.videoId).filter(Boolean),
      titles: videos.map((v) => v.title).filter(Boolean),
    }
  } catch {
    return { ids: [], titles: [] }
  }
}

export async function snapshotExistingChannelVideoIds(
  platforms?: PlatformSettings[]
): Promise<string[]> {
  const snap = await snapshotExistingChannelVideos(platforms)
  return snap.ids
}

/**
 * Verifies via YouTube oEmbed / API that a specific 11-character `videoId`
 * genuinely exists on YouTube right now.
 */
export async function verifyYoutubeVideoIdExists(
  videoId: string
): Promise<{ exists: boolean; title: string }> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return { exists: false, title: '' }
  }

  // 1. Authenticated YouTube Data API v3 check (verifies Public, Unlisted, and Private uploads)
  if (cachedAccessToken && Date.now() < cachedTokenExpiresAt - 15_000) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
          {
            headers: { Authorization: `Bearer ${cachedAccessToken}` },
            signal: controller.signal,
            cache: 'no-store',
          }
        )
        if (res.ok) {
          const json = (await res.json()) as {
            items?: Array<{ id?: string; snippet?: { title?: string } }>
          }
          if (json.items && json.items.length > 0 && json.items[0].id === videoId) {
            return { exists: true, title: json.items[0].snippet?.title || '' }
          }
          return { exists: false, title: '' }
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // fall through
    }
  }

  // 2. YouTube Data API v3 key check (verifies Public & Unlisted videos instantaneously)
  const key = loadGeminiApiKey().trim()
  if (key) {
    try {
      const res = await fetchWithTimeout(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(
          videoId
        )}&key=${encodeURIComponent(key)}`,
        4000
      )
      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{ id?: string; snippet?: { title?: string } }>
        }
        if (json.items && json.items.length > 0 && json.items[0].id === videoId) {
          return { exists: true, title: json.items[0].snippet?.title || '' }
        }
        return { exists: false, title: '' }
      }
    } catch {
      // fall through
    }
  }

  // 3. Browser-direct YouTube oEmbed check (CORS-enabled by YouTube directly in the user's browser)
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const res = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      4500
    )
    if (res.ok) {
      const meta = (await res.json()) as { title?: string }
      return { exists: true, title: meta.title || '' }
    }
    if (res.status === 404 || res.status === 401 || res.status === 400) {
      return { exists: false, title: '' }
    }
  } catch {
    // fall through
  }

  // 4. Same-origin server verification fallback (`/api/youtube/verify`)
  try {
    const res = await fetchWithTimeout(
      `/api/youtube/verify?videoId=${encodeURIComponent(videoId)}`,
      2500
    )
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; title?: string }
      if (data.ok) {
        return { exists: true, title: data.title || '' }
      }
    }
  } catch {
    // ignore
  }

  return { exists: false, title: '' }
}

function normalizeForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeTitleMatchScore(postTitle: string, ytTitle: string): number {
  const a = normalizeForMatch(postTitle)
  const b = normalizeForMatch(ytTitle)
  if (!a || !b) return 0
  if (a === b) return 1

  const wordsA = a.split(' ').filter((w) => w.length >= 3)
  const wordsB = new Set(b.split(' ').filter((w) => w.length >= 3))
  if (wordsA.length === 0 || wordsB.size === 0) return 0

  let hits = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) hits++
  }
  return hits / Math.max(wordsA.length, wordsB.size)
}

/**
 * STRICT verification for when the user uploaded manually in YouTube Studio and
 * clicks "Verify & Fetch Newly Uploaded Video":
 * - Rejects EVERY video that already existed on the channel before this post was created
 *   (`knownChannelVideoIdsAtCreate` + `publishedAt < post.createdAt`).
 * - Rejects EVERY video already attached to another post in SceneBoost.
 * - Confirms the newly uploaded video genuinely exists on YouTube before returning it.
 * - NEVER fakes or guesses an old video!
 */
export async function autoFetchYoutubeVideoForPost(
  post: Pick<Scene, 'id' | 'title' | 'createdAt' | 'knownChannelVideoIdsAtCreate'>,
  allPosts: ReadonlyArray<Pick<Scene, 'id' | 'videoUrl' | 'youtubeVerified'>>,
  platforms?: PlatformSettings[]
): Promise<AutoYoutubeFetchResult> {
  const channelId = extractYoutubeChannelId(platforms)
  const { videos, source } = await fetchChannelRecentVideos(channelId)

  const excludedVideoIds = new Set<string>(post.knownChannelVideoIdsAtCreate ?? [])
  for (const other of allPosts) {
    if (other.id === post.id) continue
    const vid = extractYoutubeVideoId(other.videoUrl || '')
    if (vid) excludedVideoIds.add(vid)
  }

  const createdMs = Date.parse(post.createdAt) || Date.now()
  // Only accept videos published AFTER this SceneBoost post was created (90s clock-skew tolerance)
  const minPublishedMs = createdMs - 90 * 1000

  const genuinelyNewVideos = videos.filter((v) => {
    if (excludedVideoIds.has(v.videoId)) return false
    const pubMs = Date.parse(v.publishedAt)
    if (!Number.isFinite(pubMs)) return false
    return pubMs >= minPublishedMs
  })

  if (genuinelyNewVideos.length === 0) {
    return {
      matched: null,
      latestOnChannel: videos[0] ?? null,
      channelId,
      checkedCount: videos.length,
      source,
      reason:
        'No new video has been posted to your YouTube channel since this post was created. Upload the video first (via Direct Upload to YouTube or in YouTube Studio).',
    }
  }

  // Pick the best matching genuinely-new upload
  let chosen = genuinelyNewVideos[0]
  let bestScore = -1
  for (const v of genuinelyNewVideos) {
    const score = computeTitleMatchScore(post.title, v.title)
    if (score > bestScore) {
      bestScore = score
      chosen = v
    }
  }

  // Confirm on YouTube that this video ID actually exists
  const check = await verifyYoutubeVideoIdExists(chosen.videoId)
  if (!check.exists && source !== 'YouTube Studio Account') {
    return {
      matched: null,
      latestOnChannel: videos[0] ?? null,
      channelId,
      checkedCount: videos.length,
      source,
      reason: 'Could not verify the new video on YouTube yet — wait a few seconds for YouTube processing and try again.',
    }
  }

  return {
    matched: {
      ...chosen,
      title: check.title || chosen.title,
    },
    latestOnChannel: videos[0] ?? null,
    channelId,
    checkedCount: videos.length,
    source,
  }
}

/**
 * Verifies an explicit YouTube video URL (`https://youtu.be/<id>`) pasted from
 * YouTube Studio (for example when a newly uploaded video is Unlisted or still
 * indexing on the public RSS feed). Strictly verifies on YouTube that the video
 * exists and was NOT one of the pre-existing videos from before this post!
 */
export async function verifyStudioVideoUrlForPost(
  rawUrl: string,
  post: Pick<Scene, 'id' | 'title' | 'knownChannelVideoIdsAtCreate'>,
  allPosts: ReadonlyArray<Pick<Scene, 'id' | 'videoUrl'>>
): Promise<YoutubeChannelVideo> {
  const videoId = extractYoutubeVideoId(rawUrl)
  if (!videoId) {
    throw new Error(
      'That is not a specific YouTube video URL — paste a real video link like https://youtu.be/XXXXXXXXXXX'
    )
  }

  if (post.knownChannelVideoIdsAtCreate?.includes(videoId)) {
    throw new Error(
      'That video was already on your YouTube channel before this post was created — upload your new video first'
    )
  }

  for (const other of allPosts) {
    if (other.id === post.id) continue
    if (extractYoutubeVideoId(other.videoUrl || '') === videoId) {
      throw new Error('That YouTube video URL is already linked to another post in SceneBoost')
    }
  }

  const check = await verifyYoutubeVideoIdExists(videoId)
  if (!check.exists) {
    throw new Error(
      'Could not verify that video on YouTube (it may still be private/uncreated or the link is invalid)'
    )
  }

  return {
    videoId,
    title: check.title || post.title,
    url: `https://youtu.be/${videoId}`,
    publishedAt: new Date().toISOString(),
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}
