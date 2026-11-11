export type PlatformId =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'spotify'
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
  thumbnail: string // gradient key or image url
  videoUrl: string
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
