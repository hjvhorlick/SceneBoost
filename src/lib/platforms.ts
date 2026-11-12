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

export const GRADIENTS: Record<string, string> = {
  neon: 'linear-gradient(135deg,#7C5CFF 0%,#FF3D81 55%,#FFB03A 100%)',
  ocean: 'linear-gradient(135deg,#00C9FF 0%,#0077FF 60%,#7C5CFF 100%)',
  lime: 'linear-gradient(135deg,#D4FF3F 0%,#00E676 60%,#00B0FF 100%)',
  sunset: 'linear-gradient(135deg,#FF512F 0%,#DD2476 60%,#7C5CFF 100%)',
  mono: 'linear-gradient(135deg,#232A3D 0%,#0F1626 60%,#1A2238 100%)',
  gold: 'linear-gradient(135deg,#F7971E 0%,#FFD200 55%,#FF512F 100%)',
}

export const ACCENTS = ['#D4FF3F', '#7C5CFF', '#FF3D81', '#00C9FF', '#FFB03A', '#00E676']
