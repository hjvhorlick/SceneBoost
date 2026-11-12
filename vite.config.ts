import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function youtubeFeedProxyPlugin(): Plugin {
  const handler = async (
    req: { url?: string },
    res: {
      statusCode: number
      setHeader: (k: string, v: string) => void
      end: (body?: string) => void
    },
    next: () => void
  ) => {
    if (!req.url?.startsWith('/api/youtube/latest')) {
      next()
      return
    }
    try {
      const parsed = new URL(req.url, 'http://localhost')
      const channelId = parsed.searchParams.get('channelId')?.trim() || ''
      if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
        res.statusCode = 400
        res.end('Invalid channelId')
        return
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1800)
      try {
        const upstream = await fetch(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
            channelId
          )}&_=${Date.now()}`,
          { signal: controller.signal }
        )
        if (!upstream.ok) {
          res.statusCode = 502
          res.end('Upstream error')
          return
        }
        const xml = await upstream.text()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/xml; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(xml)
      } finally {
        clearTimeout(timer)
      }
    } catch {
      res.statusCode = 503
      res.end('Unavailable')
    }
  }

  return {
    name: 'sceneboost-youtube-feed-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), youtubeFeedProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
})
