export type PlatformId =
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'twitch'
  | 'kick'
  | 'vimeo'
  | 'threads'
  | 'instagram'
  | 'website'

export type SceneStatus = 'live' | 'draft' | 'paused'

export interface SceneLink {
  id: string
  platform: PlatformId
  label: string
  url: string
  enabled: boolean
  clicks: number
  order: number
}

export interface Scene {
  id: string
  title: string
  slug: string
  description: string
  tags?: string[] // YouTube SEO ranking tags (comma-separated <= 500 chars)
  credits?: string // optional media attribution block from Scenering credits.txt
  videoFileName?: string // optional rendered video file detected in Scenering folder
  thumbnailFileName?: string // optional custom imported thumbnail filename
  thumbnail: string // Scenering cover preset key or imported 1280x720 image data URL
  videoUrl: string // Published YouTube video URL (primary boost destination)
  status: SceneStatus
  accent: string // hex
  createdAt: string
  updatedAt: string
  links: SceneLink[]
}

export interface PlatformSettings {
  id: PlatformId
  connected: boolean
  defaultHandle: string
}

export interface AppSettings {
  brandName: string
  handle: string
  defaultCampaign: string
  defaultMedium: string
  accent: string
}

export interface AppData {
  scenes: Scene[]
  platforms: PlatformSettings[]
  settings: AppSettings
  totalClicks: number
  activity: ActivityItem[]
}

export interface ActivityItem {
  id: string
  text: string
  time: string
  kind: 'click' | 'scene' | 'link' | 'system'
}
