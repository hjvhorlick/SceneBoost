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
  tags?: string[] // SEO-friendly YouTube tags (comma-separated <= 500 chars)
  credits?: string // media attribution block fetched from Scenering credits file
  videoFileName?: string // rendered video file fetched in Scenering folder
  videoSizeBytes?: number // size of video file fetched in folder
  thumbnailFileName?: string // thumbnail file fetched in folder or uploaded
  thumbnailMissing?: boolean // true when folder import found no thumbnail image yet
  thumbnail: string // Scenering cover preset key or imported 1280x720 image data URL
  videoUrl: string // Verified per-video YouTube URL (`https://youtu.be/<videoId>`)
  youtubeVerified?: boolean // true ONLY after real YouTube upload/verification for THIS post
  youtubeVideoTitle?: string // Exact video title returned from YouTube when verified
  youtubeFetchedAt?: string // ISO timestamp when SceneBoost verified the new YouTube video
  knownChannelVideoIdsAtCreate?: string[] // Channel video IDs that already existed before this post was created
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
