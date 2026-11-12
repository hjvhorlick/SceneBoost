import type { Scene } from '../types'

export type PostTemplatePlatform =
  | 'youtube'
  | 'tiktok'
  | 'x'
  | 'threads'
  | 'facebook'
  | 'linkedin'
  | 'twitch'
  | 'vimeo'
  | 'whatsapp'

export const POST_TEMPLATE_PLATFORMS: ReadonlyArray<[PostTemplatePlatform, string]> = [
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['x', 'X'],
  ['threads', 'Threads'],
  ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'],
  ['twitch', 'Twitch / Kick'],
  ['vimeo', 'Vimeo'],
  ['whatsapp', 'WhatsApp'],
]

export interface SceneringImportResult {
  title: string
  shortDescription: string
  credits: string
  videoFileName: string
  sourceSummary: string
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i
const TEXT_EXT = /\.(txt|md|json)$/i
const MAX_TEXT_BYTES = 2 * 1024 * 1024

function cleanTitleFromName(raw: string): string {
  return raw
    .replace(/_attribution_credits\.txt$/i, '')
    .replace(/_(script|scenes)\.(txt|json)$/i, '')
    .replace(/\.(mp4|webm|mov|m4v|mkv|txt|json|md)$/i, '')
    .replace(/_(YouTube|TikTok|Instagram|Master|Landscape|Portrait|Square)_\d+p_\d+fps$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeNarration(text: string, maxLen = 220): string {
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
 * Parses Scenering's `*_attribution_credits.txt` (or custom credits.txt) to
 * pull Project title, Short description, and the `📢 CREDITS & ATTRIBUTIONS` block.
 */
export function parseSceneringCreditsText(rawText: string): {
  title: string
  shortDescription: string
  credits: string
} {
  const text = rawText.replace(/\r\n/g, '\n')
  const lines = text.split('\n')

  let title = ''
  for (const line of lines.slice(0, 20)) {
    const m = line.match(/^\s*(?:Project|Video\s*Title|Title)\s*:\s*(.+?)\s*$/i)
    if (m && m[1]) {
      title = m[1].trim()
      break
    }
  }

  let shortDescription = ''

  // 1. Key-value form: `Short Description: ...` / `Description: ...` / `Summary: ...` (supports wrapped continuation lines)
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
        /^(?:Created and rendered with|Website|Date|Voice|Scenes)\s*:/i.test(next) ||
        /^COPY\s*&\s*PASTE/i.test(next) ||
        /^(?:📢|🎙️|🎵|🔊|🎨|📸)/.test(next) ||
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

  // 2. Section-heading form: `SHORT DESCRIPTION` / `📝 SHORT DESCRIPTION` followed by body lines
  if (!shortDescription) {
    const headingRegex =
      /^\s*(?:📝|📖|🎬)?\s*(?:SHORT\s+DESCRIPTION|VIDEO\s+DESCRIPTION|POST\s+DESCRIPTION|ABOUT\s+THIS\s+VIDEO|SUMMARY)\s*:?\s*$/i
    for (let i = 0; i < lines.length; i++) {
      if (!headingRegex.test(lines[i])) continue
      const collected: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (/^[-=]{5,}$/.test(next)) {
          if (collected.length === 0) continue // underline right under the heading
          break
        }
        if (
          /^COPY\s*&\s*PASTE/i.test(next) ||
          /^(?:📢|🎙️|🎵|🔊|🎨|📸)/.test(next) ||
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

  // 3. Text placed inside the COPY & PASTE block right above `📢 CREDITS & ATTRIBUTIONS`
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
    block = block.replace(
      /\n[-=]{10,}\nReview every asset[\s\S]*$/i,
      ''
    )
    block = block.replace(/\n={10,}\s*$/, '').trim()
    credits = block
  }

  // 5. Plain text file fallback (user saved a custom short description .txt in the folder)
  const isAttributionHeader = /VIDEO CREDITS\s*&\s*MEDIA ATTRIBUTIONS/i.test(text)
  if (!shortDescription && !isAttributionHeader && !credits) {
    const bodyLines = lines
      .filter((l) => !/^\s*(?:Project|Title|Voice|Scenes|Date|Website)\s*:/i.test(l))
      .join('\n')
      .trim()
    shortDescription = summarizeNarration(bodyLines, 280)
  }

  return { title, shortDescription, credits }
}

/**
 * Reads a Scenering saved folder (`Videos/Scenering/<Video Name>/`) or selected
 * credits/script/scenes files locally in the browser. Video blobs are never
 * loaded into memory — only their filename is recorded.
 */
export async function parseSceneringFiles(fileList: FileList | File[]): Promise<SceneringImportResult> {
  const files = Array.from(fileList)
  let videoFileName = ''
  let folderName = ''

  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    if (!folderName && rel.includes('/')) {
      const parts = rel.split('/').filter(Boolean)
      if (parts.length >= 2) folderName = parts[parts.length - 2]
    }
    if (!videoFileName && VIDEO_EXT.test(f.name)) {
      videoFileName = f.name
    }
  }

  const textFiles = files.filter((f) => TEXT_EXT.test(f.name) && f.size <= MAX_TEXT_BYTES)

  // Sort so *credits*.txt comes first, then *scenes*.json, then *script*.txt, then other text files
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
          scenes?: Array<{ text?: string }>
        }
        if (!title && json.title) title = String(json.title).trim()
        const jsonDesc = json.shortDescription || json.description || json.summary
        if (!shortDescription && jsonDesc) {
          shortDescription = String(jsonDesc).trim()
        } else if (!shortDescription && Array.isArray(json.scenes)) {
          const narration = json.scenes.map((s) => s.text || '').join(' ')
          shortDescription = summarizeNarration(narration)
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
    matchedFiles.push(file.name)
  }

  if (!title) {
    if (folderName && folderName.toLowerCase() !== 'scenering') {
      title = folderName
    } else if (videoFileName) {
      title = cleanTitleFromName(videoFileName)
    } else if (textFiles[0]) {
      title = cleanTitleFromName(textFiles[0].name)
    }
  }

  if (videoFileName) matchedFiles.unshift(videoFileName)

  return {
    title,
    shortDescription,
    credits,
    videoFileName,
    sourceSummary: matchedFiles.slice(0, 3).join(', ') || 'selected folder',
  }
}

/**
 * Builds ready-to-paste post wording for each platform, always weaving in the
 * scene's short description (`scene.description`) and optionally appending
 * Scenering's `📢 CREDITS & ATTRIBUTIONS` block for long-form descriptions.
 */
export function buildPostWording(
  scene: Pick<Scene, 'title' | 'slug' | 'description' | 'credits'>,
  hub: string,
  platform: PostTemplatePlatform,
  includeCredits = false
): string {
  const desc = scene.description.trim()
  const descBlock = desc ? `\n\n${desc}` : ''
  const slugTag = scene.slug ? `#${scene.slug.replace(/-/g, '')}` : ''
  const tags = ['#Scenering', slugTag].filter(Boolean).join(' ')
  const creditsBlock =
    includeCredits && scene.credits?.trim() ? `\n\n${scene.credits.trim()}` : ''

  switch (platform) {
    case 'youtube':
      return `${scene.title}${descBlock}\n\nWatch & follow everywhere 👇\n${hub}\n\n${tags}${creditsBlock}`
    case 'tiktok':
      return `${scene.title}${descBlock}\n\nFull links 👇 ${hub}\n\n${tags} #fyp #video`
    case 'vimeo':
      return `${scene.title}${descBlock}\n\nAll links & platforms: ${hub}${creditsBlock}`
    case 'twitch':
      return `🔴 ${scene.title}${descBlock}\n\nWatch & catch every clip here 👇\n${hub}`
    case 'x':
      return `🎬 ${scene.title}${descBlock}\n\nWatch everywhere 👇\n${hub}\n\n${tags}`
    case 'threads':
      return `🎬 ${scene.title}${descBlock}\n\nWatch / stream / share everywhere 👇\n${hub}\n\nDrop your favourite moment in the replies 👇`
    case 'facebook':
      return `🎬 ${scene.title}${descBlock}\n\nWatch & share everywhere 👇\n${hub}\n\nTap your favourite platform and let us know which scene stood out!${creditsBlock}`
    case 'linkedin':
      return `${scene.title}${descBlock}\n\nWatch across our channels: ${hub}`
    case 'whatsapp':
      return `🎬 *${scene.title}*${descBlock}\n\nWatch here 👇\n${hub}`
  }
}
