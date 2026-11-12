import { fitTagsWithinBudget } from './scenering'

const GEMINI_KEY_STORAGE = 'scenboost_gemini_api_key'

const NON_SEO_FILLER = new Set([
  'fyp',
  'foryou',
  'foryoupage',
  'viral',
  'viralvideo',
  'trending',
  'trendingvideo',
  'mustwatch',
  'must watch',
  'watchnow',
  'watch now',
  'subscribe',
  'like and subscribe',
  'youtube',
  'youtubevideo',
  'youtube video',
  'video',
  'videos',
  'new video',
  'newvideo',
  'official',
  'official video',
  'shorts',
  'reels',
  'tiktok',
  'scenering',
  'sceneboost',
  'hd',
  '4k',
  '1080p',
])

export function loadGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || ''
  } catch {
    return ''
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) {
      localStorage.setItem(GEMINI_KEY_STORAGE, trimmed)
    } else {
      localStorage.removeItem(GEMINI_KEY_STORAGE)
    }
  } catch {
    // ignore storage restrictions
  }
}

/**
 * Cleans, deduplicates, and filters raw candidate tags so ONLY genuine
 * SEO-friendly search keywords & long-tail phrases remain (<= 500 chars total).
 */
export function sanitizeSeoOnlyTags(rawTags: string[], maxChars = 490): string[] {
  const seen = new Set<string>()
  const cleanedList: string[] = []

  for (const raw of rawTags) {
    const cleaned = raw
      .replace(/^#+/, '')
      .replace(/^\d+[.)\-\s]+/, '')
      .replace(/[“”"()[\]{}|/\\*•]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s'&-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

    if (!cleaned || cleaned.length < 3 || cleaned.length > 48) continue
    if (/^\d+$/.test(cleaned)) continue
    if (NON_SEO_FILLER.has(cleaned)) continue
    if (seen.has(cleaned)) continue

    seen.add(cleaned)
    cleanedList.push(cleaned)
  }

  return fitTagsWithinBudget(cleanedList, maxChars)
}

export interface GeminiSeoTagRequest {
  apiKey: string
  title: string
  topDescription: string
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
]

/**
 * Calls Google Gemini directly from the browser to generate strictly
 * SEO-friendly YouTube search tags (no hashtags, no generic filler/clickbait,
 * fitted cleanly within YouTube Studio's 500-character limit).
 */
export async function generateSeoTagsWithGemini({
  apiKey,
  title,
  topDescription,
}: GeminiSeoTagRequest): Promise<string[]> {
  const key = apiKey.trim()
  if (!key) {
    throw new Error('Missing Gemini API key')
  }
  if (!title.trim() && !topDescription.trim()) {
    throw new Error('Add a video title or description first so Gemini knows the topic')
  }

  const prompt = [
    'You are a YouTube Search SEO specialist.',
    'Generate between 12 and 20 SEO-friendly YouTube tags for the video below.',
    '',
    'STRICT RULES:',
    '1. Use ONLY genuine search-engine-friendly keywords and 2-to-4-word long-tail search phrases that real viewers type into YouTube Search or Google to find this exact topic.',
    '2. DO NOT include generic filler or hype tags (never use: viral, fyp, trending, must watch, subscribe, youtube, new video, 4k, hd, official video, or brand watermarks).',
    '3. DO NOT include "#" hashtag symbols, emojis, numbering, or explanations.',
    '4. Order from highest-intent exact topic phrases first to broader related search queries.',
    '5. Keep total combined comma-separated length under 460 characters (YouTube Studio max is 500 characters).',
    '6. Return valid JSON matching: {"tags": ["tag one", "tag two"]}',
    '',
    `Video Title: ${title.trim() || '(untitled)'}`,
    `Video Description (top summary): ${topDescription.trim() || '(none provided)'}`,
  ].join('\n')

  let lastError = 'Gemini request failed'

  for (const model of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
          },
        }),
      })
    } catch (err) {
      lastError =
        err instanceof Error
          ? `Network error contacting Gemini: ${err.message}`
          : 'Network error contacting Gemini'
      break
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const errJson = (await res.json()) as { error?: { message?: string } }
        if (errJson?.error?.message) detail = errJson.error.message
      } catch {
        // ignore parse error
      }
      lastError = detail
      // If model not found (404), try the next fallback model; if invalid key (400/401/403), stop immediately
      if (res.status === 404) continue
      throw new Error(detail)
    }

    const payload = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const rawText =
      payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('\n')
        .trim() || ''

    if (!rawText) {
      lastError = 'Gemini returned an empty response'
      continue
    }

    let extracted: string[] = []
    try {
      const cleanedJson = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      const parsed = JSON.parse(cleanedJson) as { tags?: unknown } | unknown[]
      if (Array.isArray(parsed)) {
        extracted = parsed.map(String)
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tags?: unknown }).tags)) {
        extracted = ((parsed as { tags: unknown[] }).tags).map(String)
      }
    } catch {
      extracted = rawText.split(/[,\n]+/).map((s) => s.trim())
    }

    const seoTags = sanitizeSeoOnlyTags(extracted, 490)
    if (seoTags.length > 0) {
      return seoTags
    }
    lastError = 'Gemini did not return usable SEO tags'
  }

  throw new Error(lastError)
}
