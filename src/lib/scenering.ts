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
  ['youtube', 'YouTube'],
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
  videoSizeBytes: number
  videoFile: File | null
  thumbnailFoundInFolder: boolean
  thumbnailDataUrl: string
  thumbnailFileName: string
  sourceSummary: string
}

export interface YoutubeStudioPack {
  title: string
  topDescription: string
  descriptionWithCredits: string
  tags: string[]
  tagsCsv: string
  tagsCharCount: number
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
  'rendered', 'studio', 'project', 'viral', 'fyp', 'trending', 'scenering',
  'sceneboost', '4k', 'hd', '1080p', 'shorts',
])

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

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

export const SCENERING_WEBSITE_URL = 'https://scenering.com'

/**
 * Removes any standalone / trailing `scenering.com` line from a script block so
 * platform formatters can truncate the script cleanly and then always place
 * `https://scenering.com` explicitly without ever duplicating or cutting it off.
 */
export function stripTrailingSceneringWebsite(text: string): string {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(
      /(?:\n+|\s+)(?:(?:Created\s+(?:and\s+rendered\s+)?with\s+Scenering(?:\s+Video\s+Studio)?|Website|Scenering)\s*:\s*)?https?:\/\/(?:www\.)?scenering\.com\/?\s*$/i,
      ''
    )
    .trim()
}

/**
 * Ensures `https://scenering.com` appears at the end of the script section
 * (used in YouTube's description right before the complete credit document).
 */
export function ensureSceneringAtEndOfScript(
  scriptText: string,
  siteUrl = SCENERING_WEBSITE_URL
): string {
  const clean = scriptText.trim()
  const cleanSite = siteUrl.trim() || SCENERING_WEBSITE_URL
  if (!clean) return `Created with Scenering: ${cleanSite}`
  if (/scenering\.com/i.test(clean)) return clean
  return `${clean}\n\nCreated with Scenering: ${cleanSite}`
}

/**
 * Extracts the short description (the script opening) and strips any credit
 * document sections so social posts NEVER include the credit wall.
 */
export function extractTopDescription(rawText: string, maxLen = 600): string {
  if (!rawText) return ''
  const normalized = rawText.replace(/\r\n/g, '\n')

  // Strip any credit/attribution sections (`📢 CREDITS`, `🎙️`, `🎵`, `🔊`, `🎨`, `📸`, etc.)
  const withoutCredits = normalized
    .split(
      /\n\s*(?:📢\s*CREDITS|CREDITS\s*&\s*ATTRIBUTIONS|COPY\s*&\s*PASTE|(?:🎙️|🎵|🔊|🎨|📸)\s*[A-Z0-9]|[-=]{6,})/i
    )[0]
    .replace(/---\s*Scene\s*\d+\s*---/gi, ' ')
    .trim()

  if (!withoutCredits) return ''

  // Join spoken script paragraphs cleanly up to maxLen on a sentence boundary
  const joined = withoutCredits
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  if (!joined) return ''
  if (joined.length <= maxLen) return joined

  const cut = joined.slice(0, maxLen)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (lastStop > maxLen * 0.4) return cut.slice(0, lastStop + 1).trim()
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

/**
 * Draws an HTMLImageElement onto a 1280x720 (16:9 YouTube HD) canvas using
 * center-cover cropping so there are never black bars.
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
 * Converts an uploaded or folder-fetched thumbnail File (.jpg, .png, .webp)
 * into a clean 1280x720 16:9 YouTube-ready JPEG data URL.
 */
export function renderImageFileToYoutubeThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const dataUrl = drawSourceToYoutubeCanvas(
          img,
          img.naturalWidth || img.width,
          img.naturalHeight || img.height
        )
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
 * Downloads any Scene thumbnail as a true 1280x720 YouTube Studio HD `.jpg` file.
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
        a.download = `${slug || 'video'}-youtube-thumbnail-1280x720.jpg`
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

export function fitTagsWithinBudget(tags: string[], maxChars = 500): string[] {
  const result: string[] = []
  let used = 0
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const addedLen = result.length === 0 ? t.length : t.length + 2
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
    const t = piece.replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (!t || t.length < 2) continue
    if (STOP_WORDS.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return fitTagsWithinBudget(out, 500)
}

/**
 * Local fallback SEO tag extractor — generates ONLY genuine topic keywords and
 * 2-3 word search phrases from the title & top description (zero spam/filler).
 */
export function generateYoutubeRankingTags(input: {
  title: string
  shortDescription?: string
  extraKeywords?: string[]
}): string[] {
  const candidates: string[] = []
  const seen = new Set<string>()

  const pushTag = (raw: string) => {
    const cleaned = raw
      .replace(/^#+/, '')
      .replace(/[“”"()[\]{}|/\\]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s'&-]/gu, ' ')
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

  for (const kw of input.extraKeywords ?? []) {
    pushTag(kw)
  }

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

  const topDesc = extractTopDescription(input.shortDescription ?? '', 300)
  const descWords = tokenize(topDesc)
  const freq = new Map<string, number>()
  for (const w of [...titleWords, ...titleWords, ...descWords]) {
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  for (let i = 0; i < Math.min(descWords.length - 1, 16); i++) {
    const a = descWords[i]
    const b = descWords[i + 1]
    if ((freq.get(a) ?? 0) >= 2 || (freq.get(b) ?? 0) >= 2 || i < 4) {
      pushTag(`${a} ${b}`)
    }
  }
  const rankedSingleWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
  for (const w of rankedSingleWords) {
    pushTag(w)
  }

  return fitTagsWithinBudget(candidates, 480)
}

/**
 * Parses Scenering's `*_attribution_credits.txt` (or description + credits file):
 * - Fetches the `📢 CREDITS & ATTRIBUTIONS` block
 * - Uses ONLY the top part of the description
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

  let rawDescription = ''

  // 1. Key-value form (`Description: ...`, `Short Description: ...`, `Summary: ...`)
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
        if (collected.length > 0) break // stop at end of top paragraph!
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
      rawDescription = collected.join(' ')
      break
    }
  }

  // 2. Section-heading form (`DESCRIPTION` / `SHORT DESCRIPTION` / `SUMMARY`)
  if (!rawDescription) {
    const headingRegex =
      /^\s*(?:📝|📖|🎬)?\s*(?:SHORT\s+DESCRIPTION|VIDEO\s+DESCRIPTION|POST\s+DESCRIPTION|DESCRIPTION|ABOUT\s+THIS\s+VIDEO|SUMMARY)\s*:?\s*$/i
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
          if (collected.length > 0) break // only take the top paragraph!
          continue
        }
        collected.push(next)
      }
      if (collected.length > 0) {
        rawDescription = collected.join(' ')
        break
      }
    }
  }

  // 3. Text placed at the top of COPY & PASTE right above `📢 CREDITS & ATTRIBUTIONS`
  if (!rawDescription) {
    const copyBlockMatch = text.match(
      /COPY\s*&\s*PASTE[^\n]*\n[-=]{5,}\n([\s\S]*?)(?:\n\s*📢\s*CREDITS|\n\s*CREDITS\s*&\s*ATTRIBUTIONS)/i
    )
    if (copyBlockMatch?.[1]?.trim()) {
      rawDescription = copyBlockMatch[1].trim()
    }
  }

  // 4. Extract `📢 CREDITS & ATTRIBUTIONS` complete credit document (for YouTube ONLY)
  //    AND extract the script opening placed right below `📢 CREDITS & ATTRIBUTIONS`
  //    before the first asset licence section (`🎙️`, `🎵`, `🔊`, `🎨`, `📸`)
  let credits = ''
  const creditsHeadingMatch = text.match(/^(?:📢\s*)?CREDITS\s*&\s*ATTRIBUTIONS[^\n]*$/im)
  if (creditsHeadingMatch && creditsHeadingMatch.index !== undefined) {
    const headingLine = creditsHeadingMatch[0].trim()
    const afterHeading = text
      .slice(creditsHeadingMatch.index + creditsHeadingMatch[0].length)
      .replace(/\n={10,}\s*$/, '')
      .trim()

    const assetStartMatch = afterHeading.match(
      /^(?:🎙️|🎵|🔊|🎨|📸|🎬|🖼️)|^(?:VOICEOVER|BACKGROUND\s+MUSIC|SOUND\s+EFFECTS|OTHER\s+AUDIO|3D\s+GRAPHICS|STOCK\s+IMAGES)\b|^-{10,}\nReview every asset|^This older render was saved/im
    )

    if (assetStartMatch && assetStartMatch.index !== undefined) {
      const openingScript = afterHeading.slice(0, assetStartMatch.index).trim()
      const assetCreditsBody = afterHeading.slice(assetStartMatch.index).trim()
      if (!rawDescription && openingScript) {
        rawDescription = openingScript
      }
      credits = `${headingLine}\n\n${assetCreditsBody}`.trim()
    } else {
      credits = `${headingLine}\n\n${afterHeading}`.trim()
    }
  }

  // 5. Plain script / description file fallback (`*_script.txt`, etc.)
  const isAttributionHeader = /VIDEO CREDITS\s*&\s*MEDIA ATTRIBUTIONS/i.test(text)
  if (!rawDescription && !isAttributionHeader && !credits) {
    const bodyLines = lines
      .filter((l) => !/^\s*(?:Project|Title|Voice|Scenes|Date|Website|Tags|Keywords)\s*:/i.test(l))
      .join('\n')
      .trim()
    rawDescription = bodyLines
  }

  return {
    title,
    shortDescription: extractTopDescription(rawDescription, 600),
    credits,
    explicitTags,
  }
}

/**
 * Fetches the 3 folder assets from `Videos/Scenering/<Video Name>/`:
 * 1. Video file in the folder (`videoFile` / `videoFileName`)
 * 2. Credits + ONLY the top part of the description
 * 3. Thumbnail image in the SAME folder (`thumbnailFoundInFolder` — if false, UI prompts to upload!)
 */
export async function parseSceneringFiles(fileList: FileList | File[]): Promise<SceneringImportResult> {
  const files = Array.from(fileList)
  let videoFile: File | null = null
  let videoFileName = ''
  let videoSizeBytes = 0
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
      videoSizeBytes = f.size
    }
  }

  // Check if a thumbnail image exists in the SAME folder (do NOT auto-fake from video!)
  const imageFiles = files.filter((f) => {
    if (!IMAGE_EXT.test(f.name) || f.size > MAX_IMAGE_BYTES) return false
    const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).toLowerCase()
    // Ignore sub-scene asset dumps like /images/scene_04.jpg unless named thumb/cover
    if (rel.includes('/images/') && !/thumb|cover|poster|banner/i.test(f.name)) return false
    return true
  })

  imageFiles.sort((a, b) => {
    const rank = (f: File) =>
      /thumb|thumbnail|cover|poster|banner|youtube/i.test(f.name) ? 0 : 1
    return rank(a) - rank(b)
  })

  let thumbnailFoundInFolder = false
  let thumbnailDataUrl = ''
  let thumbnailFileName = ''
  if (imageFiles[0]) {
    try {
      thumbnailDataUrl = await renderImageFileToYoutubeThumbnail(imageFiles[0])
      if (thumbnailDataUrl) {
        thumbnailFoundInFolder = true
        thumbnailFileName = imageFiles[0].name
      }
    } catch {
      // unreadable image — leave thumbnailFoundInFolder = false so upload option is shown
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
          shortDescription = extractTopDescription(String(jsonDesc), 600)
        } else if (!shortDescription && Array.isArray(json.scenes) && json.scenes.length > 0) {
          // Build the short description from the spoken script scenes (matching Scenering's scriptOpening)
          const spokenScript = json.scenes
            .map((s) => String(s?.text || '').trim())
            .filter(Boolean)
            .join(' ')
          if (spokenScript) {
            shortDescription = extractTopDescription(spokenScript, 600)
          }
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
    videoSizeBytes,
    videoFile,
    thumbnailFoundInFolder,
    thumbnailDataUrl,
    thumbnailFileName,
    sourceSummary: matchedFiles.slice(0, 4).join(', ') || 'selected folder',
  }
}

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

export function isSpecificYoutubeVideoUrl(url: string): boolean {
  return Boolean(extractYoutubeVideoId(url))
}

export function toCanonicalYoutubeVideoUrl(url: string): string {
  const id = extractYoutubeVideoId(url)
  return id ? `https://youtu.be/${id}` : ''
}

export function resolveYoutubeBoostUrl(
  scene: Pick<Scene, 'videoUrl' | 'youtubeVerified' | 'links'>,
  platforms?: PlatformSettings[]
): { url: string; isSpecificVideo: boolean; channelUrl: string } {
  const ytPlatform = platforms?.find((p) => p.id === 'youtube')
  const channelUrl =
    ytPlatform?.defaultHandle?.trim() ||
    'https://www.youtube.com/channel/UCV9v30xQPdbhwM5lAZC2MRQ'

  // Strictly require BOTH a valid 11-character YouTube video ID AND `youtubeVerified === true`
  // so SceneBoost NEVER pretends a video was posted when it hasn't been uploaded/verified.
  const candidateVideo = scene.videoUrl?.trim() || ''
  if (scene.youtubeVerified && candidateVideo && isSpecificYoutubeVideoUrl(candidateVideo)) {
    return {
      url: toCanonicalYoutubeVideoUrl(candidateVideo),
      isSpecificVideo: true,
      channelUrl,
    }
  }

  return {
    url: '',
    isSpecificVideo: false,
    channelUrl,
  }
}

function toSeoHashtag(tag: string): string {
  const pascal = tag
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
  return pascal ? `#${pascal}` : ''
}

export function buildSeoHashtags(
  scene: Pick<Scene, 'title' | 'description' | 'tags'>,
  count = 3
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const pool =
    scene.tags && scene.tags.length > 0
      ? scene.tags
      : generateYoutubeRankingTags({
          title: scene.title,
          shortDescription: scene.description,
        })

  for (const t of pool) {
    if (out.length >= count) break
    const h = toSeoHashtag(t)
    if (!h || h.length < 4 || h.length > 26) continue
    if (seen.has(h.toLowerCase())) continue
    seen.add(h.toLowerCase())
    out.push(h)
  }
  return out
}

/**
 * Builds the YouTube Studio upload pack.
 * YouTube is the ONE platform that plays and stores the video, so ONLY YouTube
 * receives the complete credit document:
 * - Title
 * - Short description (the script) with `https://scenering.com` at the end of the script section
 *   + the COMPLETE Credit Document (`📢 CREDITS & ATTRIBUTIONS` and all licence details)
 * - SEO-Friendly Tags (<= 500 chars)
 */
export function buildYoutubeStudioPack(
  scene: Pick<Scene, 'title' | 'description' | 'credits' | 'tags'>
): YoutubeStudioPack {
  const rawTitle = scene.title.trim() || 'Untitled Video'
  const title = rawTitle.length <= 100 ? rawTitle : `${rawTitle.slice(0, 97).trim()}…`

  const cleanScript = stripTrailingSceneringWebsite(extractTopDescription(scene.description, 600))
  const topDescription = ensureSceneringAtEndOfScript(cleanScript, SCENERING_WEBSITE_URL)
  const credits = scene.credits?.trim() || ''

  const parts: string[] = [topDescription]
  if (credits) parts.push(credits)
  const descriptionWithCredits = parts.join('\n\n')

  const tags =
    scene.tags && scene.tags.length > 0
      ? fitTagsWithinBudget(scene.tags, 500)
      : generateYoutubeRankingTags({
          title: scene.title,
          shortDescription: cleanScript,
        })
  const tagsCsv = formatYoutubeTagsCsv(tags, 500)

  return {
    title,
    topDescription,
    descriptionWithCredits,
    tags,
    tagsCsv,
    tagsCharCount: tagsCsv.length,
  }
}

function truncateText(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  const cut = clean.slice(0, maxLen - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > maxLen * 0.6 ? cut.slice(0, sp) : cut).trim()}…`
}

export function resolveSceneringWebsiteUrl(platforms?: PlatformSettings[]): string {
  const configured = platforms?.find((p) => p.id === 'website')?.defaultHandle?.trim()
  if (configured && /^https?:\/\//i.test(configured)) return configured
  return SCENERING_WEBSITE_URL
}

/**
 * Formats each of the OTHER social posts in SceneBoost:
 * - NO credit document (the complete credit document is ONLY in YouTube, which plays & stores the video)
 * - Uses ONLY the short description (that is the script)
 * - ALWAYS includes the Scenering website (`https://scenering.com`) in every description
 *   (because in YouTube's description it only sits at the end of the script section)
 * - Includes that video's fetched YouTube URL (`https://youtu.be/<id>`) to play the video in YouTube
 */
export function buildSocialBoostPost(
  scene: Pick<Scene, 'title' | 'slug' | 'description' | 'tags' | 'videoUrl' | 'youtubeVerified' | 'links'>,
  platform: SocialBoostPlatform,
  options?: {
    platforms?: PlatformSettings[]
    overrideTargetUrl?: string
  }
): string {
  const { url: resolvedYtUrl } = resolveYoutubeBoostUrl(scene, options?.platforms)
  const watchUrl = options?.overrideTargetUrl?.trim() || resolvedYtUrl
  const sceneringUrl = resolveSceneringWebsiteUrl(options?.platforms)

  // Clean script text without any credit wall and without trailing scenering.com
  // so we can fit each platform's length and ALWAYS include scenering.com explicitly.
  const scriptDesc = stripTrailingSceneringWebsite(extractTopDescription(scene.description, 600))
  const descBlock = scriptDesc ? `\n\n${scriptDesc}` : ''
  const seoHashtags3 = buildSeoHashtags(scene, 3).join(' ')
  const seoHashtags2 = buildSeoHashtags(scene, 2).join(' ')
  const seoHashtag1 = buildSeoHashtags(scene, 1)[0] || ''

  switch (platform) {
    case 'facebook':
      // Facebook: Title + short description (script) + YouTube watch URL + Scenering website
      return `${scene.title}${descBlock}\n\nWatch the full video on YouTube:\n${watchUrl}\n\nCreated with Scenering: ${sceneringUrl}${seoHashtags3 ? `\n\n${seoHashtags3}` : ''}`

    case 'linkedin':
      // LinkedIn: Title + short description (script) + YouTube watch URL + Scenering website
      return `${scene.title}${descBlock}\n\nWatch the video on YouTube: ${watchUrl}\nCreated with Scenering: ${sceneringUrl}${seoHashtags3 ? `\n\n${seoHashtags3}` : ''}`

    case 'tiktok': {
      // TikTok: Title + script teaser + YouTube watch URL + Scenering website
      const shortScript = scriptDesc ? `\n\n${truncateText(scriptDesc, 220)}` : ''
      return `${scene.title}${shortScript}\n\nFull video on YouTube: ${watchUrl}\nCreated with Scenering: ${sceneringUrl}${seoHashtags3 ? `\n\n${seoHashtags3}` : ''}`
    }

    case 'x': {
      // X / Twitter: strict <= 280 chars (each URL counts as 23 chars on X) — BOTH YouTube URL & Scenering website ALWAYS included
      const head = truncateText(scene.title, 66)
      const tail = `\n\n▶️ ${watchUrl}\n🌐 ${sceneringUrl}${seoHashtags2 ? `\n${seoHashtags2}` : ''}`
      const usedApprox = head.length + 54 + seoHashtags2.length + 8
      const budget = 274 - usedApprox
      const mid = scriptDesc && budget > 30 ? `\n\n${truncateText(scriptDesc, budget)}` : ''
      return `${head}${mid}${tail}`
    }

    case 'threads': {
      // Threads: <= 500 chars — script + YouTube watch URL + Scenering website ALWAYS included
      const shortScript = scriptDesc ? `\n\n${truncateText(scriptDesc, 210)}` : ''
      return `${scene.title}${shortScript}\n\nWatch on YouTube: ${watchUrl}\nCreated with Scenering: ${sceneringUrl}${seoHashtag1 ? `\n\n${seoHashtag1}` : ''}`
    }

    case 'twitch':
      // Twitch / Kick: Title + short description (script) + YouTube watch URL + Scenering website
      return `New video on YouTube: ${scene.title}${descBlock}\n\nWatch on YouTube: ${watchUrl}\nCreated with Scenering: ${sceneringUrl}`

    case 'vimeo':
      // Vimeo: Title + short description (script) + YouTube watch URL + Scenering website
      return `${scene.title}${descBlock}\n\nWatch on YouTube: ${watchUrl}\nCreated with Scenering: ${sceneringUrl}`

    case 'whatsapp':
      // WhatsApp: Bold title + short description (script) + YouTube watch URL + Scenering website
      return `*${scene.title}*${descBlock}\n\nWatch on YouTube: ${watchUrl}\nCreated with Scenering: ${sceneringUrl}`
  }
}

export function buildPostWording(
  scene: Pick<Scene, 'title' | 'slug' | 'description' | 'credits' | 'tags' | 'videoUrl' | 'youtubeVerified' | 'links'>,
  platform: PostTemplatePlatform,
  options?: {
    platforms?: PlatformSettings[]
    overrideTargetUrl?: string
  }
): string {
  if (platform === 'youtube') {
    return buildYoutubeStudioPack(scene).descriptionWithCredits
  }
  return buildSocialBoostPost(scene, platform, options)
}
