import type { PlatformSettings, Scene } from '../types'
import { resolveCoverImageUrl } from './platforms'

export type SocialBoostPlatform =
  | 'facebook'
  | 'linkedin'
  | 'tiktok'
  | 'x'
  | 'threads'
  | 'twitch'
  | 'vimeo'
  | 'whatsapp'

export type PostTemplatePlatform = 'youtube' | SocialBoostPlatform

export const SOCIAL_BOOST_PLATFORMS: ReadonlyArray<[SocialBoostPlatform, string]> = [
  ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'],
  ['x', 'X'],
  ['threads', 'Threads'],
  ['twitch', 'Twitch / Kick'],
  ['vimeo', 'Vimeo'],
  ['whatsapp', 'WhatsApp'],
]

export const POST_TEMPLATE_PLATFORMS: ReadonlyArray<[PostTemplatePlatform, string]> = [
  ['youtube', 'YouTube (Step 1)'],
  ...SOCIAL_BOOST_PLATFORMS,
]

export const PLATFORM_COMPOSER_LINKS: Record<
  SocialBoostPlatform,
  { label: string; url: string }
> = {
  facebook: { label: 'Open Facebook', url: 'https://www.facebook.com/profile.php?id=61595379711660' },
  linkedin: { label: 'Open LinkedIn Page', url: 'https://www.linkedin.com/company/145348282' },
  tiktok: { label: 'Open TikTok Upload', url: 'https://www.tiktok.com/tiktokstudio/upload' },
  x: { label: 'Open X Composer', url: 'https://x.com/compose/post' },
  threads: { label: 'Open Threads', url: 'https://www.threads.net/' },
  twitch: { label: 'Open Twitch', url: 'https://dashboard.twitch.tv/' },
  vimeo: { label: 'Open Vimeo', url: 'https://vimeo.com/upload' },
  whatsapp: { label: 'Open WhatsApp Web', url: 'https://web.whatsapp.com/' },
}

export interface SceneringImportResult {
  title: string
  shortDescription: string
  credits: string
  tags: string[]
  videoFileName: string
  videoFile: File | null
  thumbnailDataUrl: string
  thumbnailFileName: string
  sourceSummary: string
}

export interface YoutubeStudioPack {
  title: string
  description: string
  tags: string[]
  tagsCsv: string
  tagsCharCount: number
  hashtags: string[]
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp|avif|bmp)$/i
const TEXT_EXT = /\.(txt|md|json)$/i
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'for', 'from', 'get',
  'got', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'let',
  'like', 'make', 'made', 'more', 'most', 'my', 'new', 'no', 'not', 'now',
  'of', 'off', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over',
  'own', 'put', 'see', 'she', 'should', 'so', 'some', 'such', 'take', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'up', 'us', 'use', 'used', 'using',
  'very', 'video', 'videos', 'watch', 'watching', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'would',
  'you', 'your', 'yours', 'official', 'episode', 'ep', 'part', 'full', 'live',
  'channel', 'subscribe', 'click', 'link', 'links', 'check', 'every', 'created',
  'rendered', 'studio', 'project',
])

function cleanTitleFromName(raw: string): string {
  return raw
    .replace(/_attribution_credits\.txt$/i, '')
    .replace(/_(script|scenes)\.(txt|json)$/i, '')
    .replace(/\.(mp4|webm|mov|m4v|mkv|txt|json|md|png|jpe?g|webp)$/i, '')
    .replace(/_(YouTube|TikTok|Instagram|Master|Landscape|Portrait|Square)_\d+p_\d+fps$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeNarration(text: string, maxLen = 240): string {
  const cleaned = text
    .replace(/---\s*Scene\s*\d+\s*---/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (cleaned.length <= maxLen) return cleaned
  const cut = cleaned.slice(0, maxLen)
  const lastPeriod = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (lastPeriod > 70) return cut.slice(0, lastPeriod + 1).trim()
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

/**
 * Draws an HTMLImageElement or HTMLVideoElement onto a 1280x720 (16:9 YouTube HD)
 * canvas using center-cover cropping so there are never black bars.
 */
function drawSourceToYoutubeCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): string {
  const targetW = 1280
  const targetH = 720
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#070A12'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const safeW = Math.max(1, srcWidth)
  const safeH = Math.max(1, srcHeight)
  const scale = Math.max(targetW / safeW, targetH / safeH)
  const drawW = safeW * scale
  const drawH = safeH * scale
  const dx = (targetW - drawW) / 2
  const dy = (targetH - drawH) / 2

  ctx.drawImage(source, dx, dy, drawW, drawH)
  return canvas.toDataURL('image/jpeg', 0.86)
}

/**
 * Converts an imported thumbnail File (.jpg, .png, .webp, etc.) into a clean
 * 1280x720 16:9 YouTube-ready JPEG data URL.
 */
export function renderImageFileToYoutubeThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const dataUrl = drawSourceToYoutubeCanvas(img, img.naturalWidth || img.width, img.naturalHeight || img.height)
        URL.revokeObjectURL(objectUrl)
        resolve(dataUrl)
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not decode image file'))
    }
    img.src = objectUrl
  })
}

/**
 * Grabs a 1280x720 frame directly from a local Scenering rendered video file
 * (.mp4 / .webm) without uploading or keeping the video in memory.
 */
export function grabVideoFrameToYoutubeThumbnail(
  videoFile: File,
  seekRatio = 0.25
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(videoFile)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
    }

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2
      const targetTime = Math.min(Math.max(0.2, duration * seekRatio), Math.max(0.2, duration - 0.1))
      video.currentTime = targetTime
    }

    video.onseeked = () => {
      try {
        const dataUrl = drawSourceToYoutubeCanvas(
          video,
          video.videoWidth || 1280,
          video.videoHeight || 720
        )
        cleanup()
        resolve(dataUrl)
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('Could not read video frame'))
    }

    video.src = objectUrl
  })
}

/**
 * Downloads any Scene thumbnail (imported image OR Scenering cover theme) as a
 * true 1280x720 YouTube Studio HD `.jpg` file.
 */
export function downloadYoutubeThumbnail(thumbnailValue: string, slug: string): Promise<boolean> {
  const resolvedUrl = resolveCoverImageUrl(thumbnailValue)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const dataUrl = drawSourceToYoutubeCanvas(
          img,
          img.naturalWidth || img.width || 1280,
          img.naturalHeight || img.height || 720
        )
        if (!dataUrl) {
          resolve(false)
          return
        }
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `${slug || 'scenering-video'}-youtube-thumbnail-1280x720.jpg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        resolve(true)
      } catch {
        resolve(false)
      }
    }
    img.onerror = () => resolve(false)
    img.src = resolvedUrl
  })
}

/**
 * Extracts SEO ranking tags (up to YouTube's 500-character tag box limit) from
 * the video title, short description, and Scenering credit-page metadata.
 */
export function generateYoutubeRankingTags(input: {
  title: string
  shortDescription?: string
  credits?: string
  extraKeywords?: string[]
}): string[] {
  const candidates: string[] = []
  const seen = new Set<string>()

  const pushTag = (raw: string) => {
    const cleaned = raw
      .replace(/^#+/, '')
      .replace(/[“”"()[\]{}|/\\]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    if (!cleaned || cleaned.length < 3 || cleaned.length > 48) return
    if (STOP_WORDS.has(cleaned)) return
    if (/^\d+$/.test(cleaned)) return
    if (seen.has(cleaned)) return
    seen.add(cleaned)
    candidates.push(cleaned)
  }

  // 1. Explicit keywords passed in (e.g. from Tags: line or scenes.json imageQuery)
  for (const kw of input.extraKeywords ?? []) {
    pushTag(kw)
  }

  // 2. Full cleaned title & title clauses (highest YouTube search intent)
  const cleanTitle = input.title
    .replace(/\b(official\s+video|music\s+video|4k|hd|1080p)\b/gi, '')
    .trim()
  if (cleanTitle.length >= 4 && cleanTitle.length <= 48) {
    pushTag(cleanTitle)
  }
  const titleParts = input.title
    .split(/\s*(?:—|–|-|:|\||•)\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (const part of titleParts) {
    if (part.split(/\s+/).length <= 5) pushTag(part)
  }

  // 3. Meaningful 2-word phrases & core keywords from title + short description
  const tokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))

  const titleWords = tokenize(input.title)
  for (let i = 0; i < titleWords.length - 1; i++) {
    pushTag(`${titleWords[i]} ${titleWords[i + 1]}`)
  }
  for (const w of titleWords) {
    pushTag(w)
  }

  const descWords = tokenize(input.shortDescription ?? '')
  // Score repeated words in title + description higher
  const freq = new Map<string, number>()
  for (const w of [...titleWords, ...titleWords, ...descWords]) {
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  for (let i = 0; i < Math.min(descWords.length - 1, 18); i++) {
    const a = descWords[i]
    const b = descWords[i + 1]
    if ((freq.get(a) ?? 0) >= 2 || (freq.get(b) ?? 0) >= 2 || i < 5) {
      pushTag(`${a} ${b}`)
    }
  }
  const rankedSingleWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w)
  for (const w of rankedSingleWords) {
    pushTag(w)
  }

  // 4. Contextual clues from Scenering's credit page (music genre, 3D visuals)
  if (input.credits) {
    const genreMatches = input.credits.matchAll(/Genre\s*:\s*([^\n]+)/gi)
    for (const m of genreMatches) {
      for (const g of m[1].split(/[,/&]/)) pushTag(g)
    }
    const hashtagMatches = input.credits.matchAll(/#([a-zA-Z0-9_]{3,30})/g)
    for (const m of hashtagMatches) {
      pushTag(m[1])
    }
  }

  // 5. Channel-clustering tags so YouTube recommends your OTHER videos in "Up Next"
  pushTag('scenering')
  pushTag('scenering video')

  // Cap within YouTube Studio's 500-char comma-separated limit
  return fitTagsWithinBudget(candidates, 490)
}

export function fitTagsWithinBudget(tags: string[], maxChars = 500): string[] {
  const result: string[] = []
  let used = 0
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const addedLen = result.length === 0 ? t.length : t.length + 2 // ", "
    if (used + addedLen > maxChars) continue
    result.push(t)
    used += addedLen
  }
  return result
}

export function formatYoutubeTagsCsv(tags: string[], maxChars = 500): string {
  return fitTagsWithinBudget(tags, maxChars).join(', ')
}

export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of raw.split(/[,\n]+/)) {
    const t = piece.replace(/^#+/, '').replace(/\s+/g, ' ').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return fitTagsWithinBudget(out, 500)
}

/**
 * Parses Scenering's `*_attribution_credits.txt` (or custom credits.txt) to
 * pull Project title, Short description, explicit Tags/Keywords, and the
 * `📢 CREDITS & ATTRIBUTIONS` block.
 */
export function parseSceneringCreditsText(rawText: string): {
  title: string
  shortDescription: string
  credits: string
  explicitTags: string[]
} {
  const text = rawText.replace(/\r\n/g, '\n')
  const lines = text.split('\n')

  let title = ''
  for (const line of lines.slice(0, 25)) {
    const m = line.match(/^\s*(?:Project|Video\s*Title|Title)\s*:\s*(.+?)\s*$/i)
    if (m && m[1]) {
      title = m[1].trim()
      break
    }
  }

  // Explicit Tags / Keywords line if present in credit file
  const explicitTags: string[] = []
  for (const line of lines) {
    const m = line.match(/^\s*(?:🏷️\s*)?(?:Tags|Keywords|YouTube\s*Tags|SEO\s*Tags)\s*:\s*(.+)$/i)
    if (m && m[1]) {
      for (const item of m[1].split(/[,;|]+/)) {
        const cleaned = item.replace(/^#+/, '').trim()
        if (cleaned) explicitTags.push(cleaned)
      }
    }
  }

  let shortDescription = ''

  // 1. Key-value form: `Short Description: ...` / `Description: ...` / `Summary: ...`
  const kvRegex =
    /^\s*(?:📝\s*)?(?:Short\s*Description|Video\s*Description|Post\s*Description|Description|Summary|Caption)\s*:\s*(.*)$/i
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(kvRegex)
    if (!m) continue
    const collected: string[] = []
    if (m[1].trim()) collected.push(m[1].trim())
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (!next) {
        if (collected.length > 0) break
        continue
      }
      if (
        /^[-=]{5,}$/.test(next) ||
        /^(?:Created and rendered with|Website|Date|Voice|Scenes|Tags|Keywords)\s*:/i.test(next) ||
        /^COPY\s*&\s*PASTE/i.test(next) ||
        /^(?:📢|🎙️|🎵|🔊|🎨|📸|🏷️)/.test(next) ||
        /^CREDITS\s*&\s*ATTRIBUTIONS/i.test(next)
      ) {
        break
      }
      collected.push(next)
    }
    if (collected.length > 0) {
      shortDescription = collected.join(' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // 2. Section-heading form: `SHORT DESCRIPTION` / `📝 SHORT DESCRIPTION`
  if (!shortDescription) {
    const headingRegex =
      /^\s*(?:📝|📖|🎬)?\s*(?:SHORT\s+DESCRIPTION|VIDEO\s+DESCRIPTION|POST\s+DESCRIPTION|ABOUT\s+THIS\s+VIDEO|SUMMARY)\s*:?\s*$/i
    for (let i = 0; i < lines.length; i++) {
      if (!headingRegex.test(lines[i])) continue
      const collected: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (/^[-=]{5,}$/.test(next)) {
          if (collected.length === 0) continue
          break
        }
        if (
          /^COPY\s*&\s*PASTE/i.test(next) ||
          /^(?:📢|🎙️|🎵|🔊|🎨|📸|🏷️)/.test(next) ||
          /^CREDITS\s*&\s*ATTRIBUTIONS/i.test(next)
        ) {
          break
        }
        if (!next) {
          if (collected.length > 0) break
          continue
        }
        collected.push(next)
      }
      if (collected.length > 0) {
        shortDescription = collected.join(' ').replace(/\s+/g, ' ').trim()
        break
      }
    }
  }

  // 3. Text placed inside COPY & PASTE block right above `📢 CREDITS & ATTRIBUTIONS`
  if (!shortDescription) {
    const copyBlockMatch = text.match(
      /COPY\s*&\s*PASTE[^\n]*\n[-=]{5,}\n([\s\S]*?)(?:\n\s*📢\s*CREDITS|\n\s*CREDITS\s*&\s*ATTRIBUTIONS)/i
    )
    if (copyBlockMatch?.[1]?.trim()) {
      shortDescription = copyBlockMatch[1].replace(/\s+/g, ' ').trim()
    }
  }

  // 4. Extract `📢 CREDITS & ATTRIBUTIONS` block if present
  let credits = ''
  const creditsIdx = text.search(/📢\s*CREDITS\s*&\s*ATTRIBUTIONS|^CREDITS\s*&\s*ATTRIBUTIONS/im)
  if (creditsIdx >= 0) {
    let block = text.slice(creditsIdx)
    block = block.replace(/\n[-=]{10,}\nReview every asset[\s\S]*$/i, '')
    block = block.replace(/\n={10,}\s*$/, '').trim()
    credits = block
  }

  // 5. Plain text file fallback
  const isAttributionHeader = /VIDEO CREDITS\s*&\s*MEDIA ATTRIBUTIONS/i.test(text)
  if (!shortDescription && !isAttributionHeader && !credits) {
    const bodyLines = lines
      .filter((l) => !/^\s*(?:Project|Title|Voice|Scenes|Date|Website|Tags|Keywords)\s*:/i.test(l))
      .join('\n')
      .trim()
    shortDescription = summarizeNarration(bodyLines, 280)
  }

  return { title, shortDescription, credits, explicitTags }
}

/**
 * Reads a Scenering saved folder (`Videos/Scenering/<Video Name>/`) or selected
 * credits/thumbnail/script/scenes files locally in the browser.
 */
export async function parseSceneringFiles(fileList: FileList | File[]): Promise<SceneringImportResult> {
  const files = Array.from(fileList)
  let videoFile: File | null = null
  let videoFileName = ''
  let folderName = ''

  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    if (!folderName && rel.includes('/')) {
      const parts = rel.split('/').filter(Boolean)
      if (parts.length >= 2) folderName = parts[0] !== 'Scenering' ? parts[0] : parts[1]
    }
    if (!videoFile && VIDEO_EXT.test(f.name)) {
      videoFile = f
      videoFileName = f.name
    }
  }

  // Detect any thumbnail or scene image inside the Scenering folder
  const imageFiles = files.filter((f) => IMAGE_EXT.test(f.name) && f.size <= MAX_IMAGE_BYTES)
  imageFiles.sort((a, b) => {
    const rank = (f: File) => {
      const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).toLowerCase()
      if (/thumb|thumbnail|cover|poster|banner|youtube/i.test(f.name)) return 0
      if (!rel.includes('/images/')) return 1
      if (/scene_0*1\b/i.test(f.name)) return 2
      return 3
    }
    return rank(a) - rank(b)
  })

  let thumbnailDataUrl = ''
  let thumbnailFileName = ''
  if (imageFiles[0]) {
    try {
      thumbnailDataUrl = await renderImageFileToYoutubeThumbnail(imageFiles[0])
      thumbnailFileName = imageFiles[0].name
    } catch {
      // ignore unreadable image; video frame fallback below can still run
    }
  } else if (videoFile) {
    // No separate image file in the folder — grab a 1280x720 frame from the video automatically!
    try {
      thumbnailDataUrl = await grabVideoFrameToYoutubeThumbnail(videoFile, 0.25)
      thumbnailFileName = `${cleanTitleFromName(videoFile.name) || 'video'}-frame.jpg`
    } catch {
      // ignore if browser codec cannot seek this container
    }
  }

  const textFiles = files.filter((f) => TEXT_EXT.test(f.name) && f.size <= MAX_TEXT_BYTES)
  textFiles.sort((a, b) => {
    const rank = (name: string) => {
      if (/credit/i.test(name)) return 0
      if (/description|summary|caption/i.test(name)) return 1
      if (/scenes\.json$/i.test(name)) return 2
      if (/script\.txt$/i.test(name)) return 3
      return 4
    }
    return rank(a.name) - rank(b.name)
  })

  let title = ''
  let shortDescription = ''
  let credits = ''
  const extraKeywords: string[] = []
  const matchedFiles: string[] = []

  for (const file of textFiles) {
    const raw = await file.text()
    if (!raw.trim()) continue

    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const json = JSON.parse(raw) as {
          title?: string
          shortDescription?: string
          description?: string
          summary?: string
          tags?: string[]
          scenes?: Array<{ text?: string; imageQuery?: string }>
        }
        if (!title && json.title) title = String(json.title).trim()
        const jsonDesc = json.shortDescription || json.description || json.summary
        if (!shortDescription && jsonDesc) {
          shortDescription = String(jsonDesc).trim()
        } else if (!shortDescription && Array.isArray(json.scenes)) {
          const narration = json.scenes.map((s) => s.text || '').join(' ')
          shortDescription = summarizeNarration(narration)
        }
        if (Array.isArray(json.tags)) {
          extraKeywords.push(...json.tags.map(String))
        }
        if (Array.isArray(json.scenes)) {
          for (const s of json.scenes) {
            if (s.imageQuery) extraKeywords.push(String(s.imageQuery))
          }
        }
        matchedFiles.push(file.name)
      } catch {
        // ignore malformed json
      }
      continue
    }

    const parsed = parseSceneringCreditsText(raw)
    if (!title && parsed.title) title = parsed.title
    if (!shortDescription && parsed.shortDescription) shortDescription = parsed.shortDescription
    if (!credits && parsed.credits) credits = parsed.credits
    if (parsed.explicitTags.length > 0) extraKeywords.push(...parsed.explicitTags)
    matchedFiles.push(file.name)
  }

  if (!title) {
    if (folderName && folderName.toLowerCase() !== 'scenering') {
      title = cleanTitleFromName(folderName)
    } else if (videoFileName) {
      title = cleanTitleFromName(videoFileName)
    } else if (textFiles[0]) {
      title = cleanTitleFromName(textFiles[0].name)
    }
  }

  const tags = generateYoutubeRankingTags({
    title,
    shortDescription,
    credits,
    extraKeywords,
  })

  if (thumbnailFileName) matchedFiles.unshift(thumbnailFileName)
  if (videoFileName) matchedFiles.unshift(videoFileName)

  return {
    title,
    shortDescription,
    credits,
    tags,
    videoFileName,
    videoFile,
    thumbnailDataUrl,
    thumbnailFileName,
    sourceSummary: matchedFiles.slice(0, 4).join(', ') || 'selected folder',
  }
}

/**
 * Extracts an 11-character YouTube video ID from watch, youtu.be, shorts, or live URLs.
 */
export function extractYoutubeVideoId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/(?:shorts|live|embed)\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = trimmed.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * True when the URL points to a specific published YouTube video/Short/stream
 * rather than a generic channel homepage.
 */
export function isSpecificYoutubeVideoUrl(url: string): boolean {
  if (extractYoutubeVideoId(url)) return true
  const trimmed = url.trim().toLowerCase()
  return (
    (trimmed.includes('youtube.com/') || trimmed.includes('youtu.be/')) &&
    !trimmed.includes('/channel/') &&
    !trimmed.includes('/@') &&
    !trimmed.includes('/c/') &&
    !trimmed.includes('/user/')
  )
}

/**
 * Resolves the primary YouTube destination URL that all social boost posts
 * send viewers straight to (specific published video first, channel fallback second).
 */
export function resolveYoutubeBoostUrl(
  scene: Pick<Scene, 'videoUrl' | 'links'>,
  platforms?: PlatformSettings[]
): { url: string; isSpecificVideo: boolean; channelUrl: string } {
  const ytPlatform = platforms?.find((p) => p.id === 'youtube')
  const channelUrl =
    ytPlatform?.defaultHandle?.trim() ||
    'https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ'

  const candidateVideo = scene.videoUrl?.trim() || ''
  if (candidateVideo && isSpecificYoutubeVideoUrl(candidateVideo)) {
    return { url: candidateVideo, isSpecificVideo: true, channelUrl }
  }

  const ytLink = scene.links.find((l) => l.platform === 'youtube' && l.enabled && l.url.trim())
  if (ytLink && isSpecificYoutubeVideoUrl(ytLink.url)) {
    return { url: ytLink.url.trim(), isSpecificVideo: true, channelUrl }
  }

  if (candidateVideo) {
    return { url: candidateVideo, isSpecificVideo: false, channelUrl }
  }

  return {
    url: ytLink?.url.trim() || channelUrl,
    isSpecificVideo: false,
    channelUrl,
  }
}

function toHashtag(tag: string): string {
  const pascal = tag
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
  return pascal ? `#${pascal}` : ''
}

export function buildHashtagsFromScene(
  scene: Pick<Scene, 'title' | 'slug' | 'tags'>,
  count = 4
): string[] {
  const out: string[] = ['#Scenering']
  const seen = new Set<string>(['#scenering'])

  const pool =
    scene.tags && scene.tags.length > 0
      ? scene.tags
      : generateYoutubeRankingTags({ title: scene.title })

  for (const t of pool) {
    if (out.length >= count) break
    const h = toHashtag(t)
    if (!h || h.length < 4 || h.length > 26) continue
    if (seen.has(h.toLowerCase())) continue
    seen.add(h.toLowerCase())
    out.push(h)
  }
  return out
}

/**
 * STEP 1 — Builds the complete SEO-ranked YouTube Studio upload pack:
 * - Ranked Title (<= 100 chars)
 * - Ranked Description (Short description in lines 1-2 for search snippet,
 *   Subscribe + Watch More channel link for watch-time & monetization,
 *   optional Website link when enabled, full Scenering Credits, and top hashtags)
 * - Comma-separated YouTube Studio Tags (<= 500 chars)
 */
export function buildYoutubeStudioPack(
  scene: Pick<Scene, 'title' | 'slug' | 'description' | 'credits' | 'tags' | 'links'>,
  platforms?: PlatformSettings[]
): YoutubeStudioPack {
  const ytPlatform = platforms?.find((p) => p.id === 'youtube')
  const channelUrl =
    ytPlatform?.defaultHandle?.trim() ||
    'https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ'
  const subscribeUrl = channelUrl.includes('?')
    ? `${channelUrl}&sub_confirmation=1`
    : `${channelUrl}?sub_confirmation=1`

  const websiteLink = scene.links.find((l) => l.platform === 'website' && l.enabled && l.url.trim())

  const rawTitle = scene.title.trim() || 'Untitled Video'
  const title = rawTitle.length <= 100 ? rawTitle : `${rawTitle.slice(0, 97).trim()}…`

  const tags =
    scene.tags && scene.tags.length > 0
      ? fitTagsWithinBudget(scene.tags, 500)
      : generateYoutubeRankingTags({
          title: scene.title,
          shortDescription: scene.description,
          credits: scene.credits,
        })
  const tagsCsv = formatYoutubeTagsCsv(tags, 500)
  const hashtags = buildHashtagsFromScene({ ...scene, tags }, 4)

  const sections: string[] = []

  // First 2 lines: crucial for YouTube Search & Google Video ranking
  const shortDesc = scene.description.trim()
  if (shortDesc) {
    sections.push(`${shortDesc}`)
  } else {
    sections.push(`${title} — watch in full HD and subscribe for new videos every week!`)
  }

  // Channel binge + subscribe block to maximize session watch-time & monetization
  const ctaLines = [
    `🔔 Subscribe & watch more videos on our YouTube channel:`,
    subscribeUrl,
  ]
  if (websiteLink) {
    ctaLines.push('', `🌐 Official website: ${websiteLink.url.trim()}`)
  }
  sections.push(ctaLines.join('\n'))

  // Key search topics line for long-tail YouTube indexing
  const topicKeywords = tags
    .filter((t) => !t.includes('scenering'))
    .slice(0, 6)
  if (topicKeywords.length > 0) {
    sections.push(`📌 Topics in this video: ${topicKeywords.join(' • ')}`)
  }

  // Full Scenering Credit Page (`📢 CREDITS & ATTRIBUTIONS`)
  if (scene.credits?.trim()) {
    sections.push(scene.credits.trim())
  }

  // Bottom search hashtags (YouTube surfaces top 3 above title)
  sections.push(hashtags.join(' '))

  let description = sections.join('\n\n')
  if (description.length > 4950) {
    description = `${description.slice(0, 4945).trim()}…`
  }

  return {
    title,
    description,
    tags,
    tagsCsv,
    tagsCharCount: tagsCsv.length,
    hashtags,
  }
}

function truncateText(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  const cut = clean.slice(0, maxLen - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > maxLen * 0.6 ? cut.slice(0, sp) : cut).trim()}…`
}

/**
 * STEP 2 — Builds social promo posts for every OTHER platform designed to send
 * viewers STRAIGHT to the published YouTube video so views, watch hours,
 * rankings, and subscribers accumulate on YouTube to monetize the channel.
 */
export function buildSocialBoostPost(
  scene: Pick<Scene, 'title' | 'slug' | 'description' | 'credits' | 'tags' | 'videoUrl' | 'links'>,
  platform: SocialBoostPlatform,
  options?: {
    platforms?: PlatformSettings[]
    overrideTargetUrl?: string
    includeCredits?: boolean
  }
): string {
  const { url: resolvedYtUrl } = resolveYoutubeBoostUrl(scene, options?.platforms)
  const watchUrl = options?.overrideTargetUrl?.trim() || resolvedYtUrl
  const desc = scene.description.trim()
  const descBlock = desc ? `\n\n${desc}` : ''
  const hashtags = buildHashtagsFromScene(scene, 4).join(' ')
  const creditsBlock =
    options?.includeCredits && scene.credits?.trim() ? `\n\n${scene.credits.trim()}` : ''

  switch (platform) {
    case 'facebook':
      return `🎬 ${scene.title}${descBlock}\n\n▶️ Watch the full video on YouTube (and check out more videos on our channel) 👇\n${watchUrl}\n\n👍 Like & Subscribe on YouTube if you enjoyed it!\n\n${hashtags}${creditsBlock}`

    case 'linkedin':
      return `🎬 New on our YouTube channel: ${scene.title}${descBlock}\n\n▶️ Watch the full video on YouTube:\n${watchUrl}\n\nSubscribe to the channel for upcoming episodes and full videos.\n\n${hashtags}`

    case 'tiktok':
      return `🎬 ${scene.title}${desc ? `\n\n${truncateText(desc, 180)}` : ''}\n\n▶️ Watch the FULL video + more on our YouTube channel 👇\n${watchUrl}\n\n${hashtags} #YouTube #fyp`

    case 'x': {
      // Keep X post within 280 chars (URLs count as 23 chars on X)
      const shortTags = buildHashtagsFromScene(scene, 2).join(' ')
      const prefix = `🎬 ${truncateText(scene.title, 70)}`
      const cta = `\n\n▶️ Watch on YouTube 👇\n${watchUrl}\n${shortTags}`
      // Budget remaining characters for the short description
      const usedApprox = prefix.length + 26 + shortTags.length + 28
      const remaining = 275 - usedApprox
      const xDesc = desc && remaining > 35 ? `\n\n${truncateText(desc, remaining)}` : ''
      return `${prefix}${xDesc}${cta}`
    }

    case 'threads':
      return `🎬 ${scene.title}${desc ? `\n\n${truncateText(desc, 220)}` : ''}\n\n▶️ Watch the full video straight on YouTube (plus plenty more on the channel) 👇\n${watchUrl}\n\n${hashtags}`

    case 'twitch':
      return `🔴 New YouTube drop: ${scene.title}${descBlock}\n\n▶️ Watch the full video & subscribe on YouTube 👇\n${watchUrl}`

    case 'vimeo':
      return `${scene.title}${descBlock}\n\n▶️ Watch the full release & more videos on our YouTube channel:\n${watchUrl}${creditsBlock}`

    case 'whatsapp':
      return `🎬 *${scene.title}*${descBlock}\n\n▶️ Watch the full video on YouTube (and subscribe for more!) 👇\n${watchUrl}`
  }
}

/**
 * Unified helper for backward compatibility where 'youtube' returns the
 * YouTube Studio description and all other platforms return Direct-to-YouTube boost posts.
 */
export function buildPostWording(
  scene: Pick<Scene, 'title' | 'slug' | 'description' | 'credits' | 'tags' | 'videoUrl' | 'links'>,
  platform: PostTemplatePlatform,
  options?: {
    platforms?: PlatformSettings[]
    overrideTargetUrl?: string
    includeCredits?: boolean
  }
): string {
  if (platform === 'youtube') {
    return buildYoutubeStudioPack(scene, options?.platforms).description
  }
  return buildSocialBoostPost(scene, platform, options)
}
