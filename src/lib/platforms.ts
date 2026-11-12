import type { CSSProperties } from 'react'
import type { PlatformId } from '../types'

export interface PlatformDef {
  id: PlatformId
  name: string
  short: string
  color: string
  bg: string
  text: string
  placeholder: string
  hint: string
  utmSource: string
  icon: string // emoji-free glyph key used in UI
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    short: 'YT',
    color: '#FF0033',
    bg: 'rgba(255,0,51,0.12)',
    text: '#FF5C7A',
    placeholder: 'https://youtube.com/watch?v=…',
    hint: 'Official video, Shorts or premiere link',
    utmSource: 'youtube',
    icon: '▶',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    short: 'TT',
    color: '#25F4EE',
    bg: 'rgba(37,244,238,0.10)',
    text: '#7DF9FF',
    placeholder: 'https://tiktok.com/@you/video/…',
    hint: 'Clip, duet or LIVE replay',
    utmSource: 'tiktok',
    icon: '♪',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    short: 'FB',
    color: '#1877F2',
    bg: 'rgba(24,119,242,0.12)',
    text: '#6AA8FF',
    placeholder: 'https://facebook.com/…',
    hint: 'Video, Reel, Page post or Group',
    utmSource: 'facebook',
    icon: 'f',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    short: 'IN',
    color: '#0A66C2',
    bg: 'rgba(10,102,194,0.14)',
    text: '#5BA8E8',
    placeholder: 'https://linkedin.com/posts/…',
    hint: 'Company video, page or post',
    utmSource: 'linkedin',
    icon: 'in',
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    short: 'X',
    color: '#E7E9EA',
    bg: 'rgba(231,233,234,0.10)',
    text: '#E7E9EA',
    placeholder: 'https://x.com/you/status/…',
    hint: 'Video post, clip or Space',
    utmSource: 'x',
    icon: '𝕏',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    short: 'TW',
    color: '#9146FF',
    bg: 'rgba(145,70,255,0.14)',
    text: '#B388FF',
    placeholder: 'https://twitch.tv/yourchannel',
    hint: 'Live stream, VOD or clip',
    utmSource: 'twitch',
    icon: '◆',
  },
  {
    id: 'kick',
    name: 'Kick',
    short: 'KK',
    color: '#53FC18',
    bg: 'rgba(83,252,24,0.12)',
    text: '#6DFF3B',
    placeholder: 'https://kick.com/yourchannel',
    hint: 'Live stream, replay or clip',
    utmSource: 'kick',
    icon: '⚡',
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    short: 'VM',
    color: '#1AB7EA',
    bg: 'rgba(26,183,234,0.12)',
    text: '#5FD3F8',
    placeholder: 'https://vimeo.com/…',
    hint: 'HD/4K video, showcase or premiere',
    utmSource: 'vimeo',
    icon: '▶',
  },
  {
    id: 'threads',
    name: 'Threads',
    short: 'TH',
    color: '#F3F5F7',
    bg: 'rgba(243,245,247,0.10)',
    text: '#F3F5F7',
    placeholder: 'https://threads.net/@you/post/…',
    hint: 'Short video, clip or thread post',
    utmSource: 'threads',
    icon: '@',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    short: 'IG',
    color: '#E1306C',
    bg: 'rgba(225,48,108,0.12)',
    text: '#FF7AA8',
    placeholder: 'https://instagram.com/p/…',
    hint: 'Reel, post or profile',
    utmSource: 'instagram',
    icon: '◎',
  },
  {
    id: 'website',
    name: 'Website / Custom',
    short: 'WEB',
    color: '#D4FF3F',
    bg: 'rgba(212,255,63,0.10)',
    text: '#D4FF3F',
    placeholder: 'https://yourstore.com/drop',
    hint: 'Landing page, shop or press kit',
    utmSource: 'website',
    icon: '↗',
  },
]

export const platformById = (id: PlatformId): PlatformDef =>
  PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1]

export interface CoverTheme {
  id: string
  label: string
  image: string
  fallbackGradient: string
}

export const COVER_THEMES: CoverTheme[] = [
  {
    id: 'neon',
    label: 'Scenering Signature',
    image: '/covers/scenering-neon.jpg',
    fallbackGradient: 'linear-gradient(135deg,#0A1538 0%,#1E4ED8 55%,#F59E0B 100%)',
  },
  {
    id: 'ocean',
    label: 'Cobalt Cinema Ring',
    image: '/covers/scenering-ocean.jpg',
    fallbackGradient: 'linear-gradient(135deg,#040B24 0%,#0077FF 60%,#00C9FF 100%)',
  },
  {
    id: 'gold',
    label: 'Golden Premiere',
    image: '/covers/scenering-gold.jpg',
    fallbackGradient: 'linear-gradient(135deg,#120D04 0%,#B45309 55%,#FBBF24 100%)',
  },
  {
    id: 'sunset',
    label: 'Projector Stage',
    image: '/covers/scenering-sunset.jpg',
    fallbackGradient: 'linear-gradient(135deg,#1A0826 0%,#BE185D 55%,#F59E0B 100%)',
  },
  {
    id: 'lime',
    label: 'Broadcast Studio',
    image: '/covers/scenering-lime.jpg',
    fallbackGradient: 'linear-gradient(135deg,#071422 0%,#10B981 55%,#00C9FF 100%)',
  },
  {
    id: 'mono',
    label: 'Platinum Lens',
    image: '/covers/scenering-mono.jpg',
    fallbackGradient: 'linear-gradient(135deg,#0B0E14 0%,#1F2937 55%,#4B5563 100%)',
  },
]

export const GRADIENTS: Record<string, string> = Object.fromEntries(
  COVER_THEMES.map((t) => [t.id, t.fallbackGradient])
)

export function resolveCoverImageUrl(thumbnail: string): string {
  const trimmed = (thumbnail || '').trim()
  const preset = COVER_THEMES.find((t) => t.id === trimmed)
  if (preset) return preset.image
  if (/^(https?:\/\/|\/|data:image\/)/i.test(trimmed)) return trimmed
  return COVER_THEMES[0].image
}

export function coverStyle(
  thumbnail: string,
  variant: 'hero' | 'card' | 'swatch' = 'card'
): CSSProperties {
  const imgUrl = resolveCoverImageUrl(thumbnail)
  const preset = COVER_THEMES.find((t) => t.id === thumbnail) ?? COVER_THEMES[0]
  const scrim =
    variant === 'hero'
      ? 'linear-gradient(180deg, rgba(7,10,18,0.14) 0%, rgba(7,10,18,0.48) 56%, rgba(7,10,18,0.88) 100%)'
      : variant === 'swatch'
        ? 'linear-gradient(180deg, rgba(7,10,18,0.04) 0%, rgba(7,10,18,0.52) 100%)'
        : 'linear-gradient(180deg, rgba(7,10,18,0.18) 0%, rgba(7,10,18,0.78) 100%)'
  return {
    backgroundImage: `${scrim}, url("${imgUrl}"), ${preset.fallbackGradient}`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

export const ACCENTS = ['#D4FF3F', '#7C5CFF', '#FF3D81', '#00C9FF', '#FFB03A', '#00E676']
