import { nanoid } from 'nanoid'

interface Env {
  SHARES: KVNamespace
  CORS_ORIGIN: string
}

interface SharedBookmark {
  title: string
  url: string
  author?: string
  description?: string
  content?: string
  tags?: string[]
  profileImage?: string
  images?: string[]
  hasVideo?: boolean
}

interface SharedCollection {
  id: string
  name: string
  description?: string
  bookmarks: SharedBookmark[]
  createdAt: string
  expiresAt: string
  maxAccess?: number
  accessCount: number
}

interface CreateShareRequest {
  name: string
  description?: string
  bookmarks: SharedBookmark[]
  expiryDays?: number
  maxAccess?: number
}

const ALLOWED_ORIGINS = [
  'https://bookmarkhub.app',
  'http://localhost:5173',
  'https://localhost:5173',
]

// Helper to resolve allowed origin from request
function resolveOrigin(requestOrigin: string | null, fallback: string): string {
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin
  }
  return fallback
}

// Helper to create CORS headers
function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

// Helper to create JSON response
function jsonResponse(
  data: unknown,
  status: number,
  origin: string
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

// Calculate expiry date
function calculateExpiryDate(expiryDays?: number): string {
  if (!expiryDays) {
    // Default to 30 days if not specified, or 10 years for "never"
    const date = new Date()
    date.setFullYear(date.getFullYear() + 10)
    return date.toISOString()
  }
  const date = new Date()
  date.setDate(date.getDate() + expiryDays)
  return date.toISOString()
}

// Check if share is expired
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

// Sanitize bookmark data to prevent XSS
function sanitizeBookmark(bookmark: SharedBookmark): SharedBookmark {
  return {
    title: String(bookmark.title || '').slice(0, 500),
    url: String(bookmark.url || '').slice(0, 2000),
    author: bookmark.author ? String(bookmark.author).slice(0, 200) : undefined,
    description: bookmark.description
      ? String(bookmark.description).slice(0, 1000)
      : undefined,
    tags: bookmark.tags
      ? bookmark.tags.slice(0, 20).map((t) => String(t).slice(0, 50))
      : undefined,
    profileImage: bookmark.profileImage
      ? String(bookmark.profileImage).slice(0, 500)
      : undefined,
    content: bookmark.content
      ? String(bookmark.content).slice(0, 5000)
      : undefined,
    images: bookmark.images
      ? bookmark.images.slice(0, 10).map((img) => String(img).slice(0, 500))
      : undefined,
    hasVideo: bookmark.hasVideo || undefined,
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = resolveOrigin(request.headers.get('Origin'), env.CORS_ORIGIN || '*')

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      })
    }

    // POST /share - Create new share
    if (request.method === 'POST' && path === '/share') {
      try {
        const body = (await request.json()) as CreateShareRequest

        // Validate request
        if (!body.name || !body.bookmarks || body.bookmarks.length === 0) {
          return jsonResponse(
            { error: 'Name and bookmarks are required', code: 'VALIDATION_ERROR' },
            400,
            origin
          )
        }

        // Limit bookmarks to prevent abuse
        if (body.bookmarks.length > 500) {
          return jsonResponse(
            { error: 'Maximum 500 bookmarks allowed', code: 'VALIDATION_ERROR' },
            400,
            origin
          )
        }

        // Generate unique ID
        const id = nanoid(12)

        // Create shared collection
        const sharedCollection: SharedCollection = {
          id,
          name: String(body.name).slice(0, 200),
          description: body.description
            ? String(body.description).slice(0, 1000)
            : undefined,
          bookmarks: body.bookmarks.map(sanitizeBookmark),
          createdAt: new Date().toISOString(),
          expiresAt: calculateExpiryDate(body.expiryDays),
          maxAccess: body.maxAccess,
          accessCount: 0,
        }

        // Calculate TTL for KV (in seconds)
        const ttlSeconds = body.expiryDays
          ? body.expiryDays * 24 * 60 * 60
          : 10 * 365 * 24 * 60 * 60 // 10 years for "never"

        // Store in KV
        await env.SHARES.put(id, JSON.stringify(sharedCollection), {
          expirationTtl: ttlSeconds,
        })

        return jsonResponse(
          {
            id,
            expiresAt: sharedCollection.expiresAt,
          },
          201,
          origin
        )
      } catch (error) {
        console.error('Error creating share:', error)
        return jsonResponse(
          { error: 'Failed to create share', code: 'SERVER_ERROR' },
          500,
          origin
        )
      }
    }

    // GET /share/:id - Get shared collection
    if (request.method === 'GET' && path.startsWith('/share/')) {
      const id = path.replace('/share/', '')

      if (!id || id.length < 8) {
        return jsonResponse(
          { error: 'Invalid share ID', code: 'VALIDATION_ERROR' },
          400,
          origin
        )
      }

      try {
        const data = await env.SHARES.get(id)

        if (!data) {
          return jsonResponse(
            { error: 'Share not found or expired', code: 'NOT_FOUND' },
            404,
            origin
          )
        }

        const sharedCollection: SharedCollection = JSON.parse(data)

        // Check if expired by date
        if (isExpired(sharedCollection.expiresAt)) {
          await env.SHARES.delete(id)
          return jsonResponse(
            { error: 'Share has expired', code: 'EXPIRED' },
            404,
            origin
          )
        }

        // Check if access limit reached
        if (
          sharedCollection.maxAccess &&
          sharedCollection.accessCount >= sharedCollection.maxAccess
        ) {
          await env.SHARES.delete(id)
          return jsonResponse(
            { error: 'Access limit reached', code: 'ACCESS_LIMIT_REACHED' },
            404,
            origin
          )
        }

        // Increment access count
        sharedCollection.accessCount += 1

        // Check if this access reaches the limit
        if (
          sharedCollection.maxAccess &&
          sharedCollection.accessCount >= sharedCollection.maxAccess
        ) {
          // Delete after returning the data
          await env.SHARES.delete(id)
        } else {
          // Update access count
          const remainingTtl = Math.max(
            0,
            Math.floor(
              (new Date(sharedCollection.expiresAt).getTime() - Date.now()) / 1000
            )
          )
          if (remainingTtl > 0) {
            await env.SHARES.put(id, JSON.stringify(sharedCollection), {
              expirationTtl: remainingTtl,
            })
          }
        }

        return jsonResponse(sharedCollection, 200, origin)
      } catch (error) {
        console.error('Error fetching share:', error)
        return jsonResponse(
          { error: 'Failed to fetch share', code: 'SERVER_ERROR' },
          500,
          origin
        )
      }
    }

    // DELETE /share/:id - Revoke shared collection
    if (request.method === 'DELETE' && path.startsWith('/share/')) {
      const id = path.replace('/share/', '')

      if (!id || id.length < 8) {
        return jsonResponse(
          { error: 'Invalid share ID', code: 'VALIDATION_ERROR' },
          400,
          origin
        )
      }

      try {
        await env.SHARES.delete(id)
        return jsonResponse({ success: true }, 200, origin)
      } catch (error) {
        console.error('Error deleting share:', error)
        return jsonResponse(
          { error: 'Failed to revoke share', code: 'SERVER_ERROR' },
          500,
          origin
        )
      }
    }

    // GET /proxy-video?url=... - Xの動画をサーバー経由で中継する
    // （ブラウザから直接video.twimg.comへアクセスすると403で拒否されるため）
    if (request.method === 'GET' && path === '/proxy-video') {
      const videoUrl = url.searchParams.get('url')

      if (!videoUrl || !videoUrl.startsWith('https://video.twimg.com/')) {
        return jsonResponse({ error: 'Invalid video URL' }, 400, origin)
      }

      try {
        const upstream = await fetch(videoUrl, {
          headers: {
            'Referer': 'https://x.com/',
            'User-Agent': 'Mozilla/5.0 (compatible; BookmarkHubProxy/1.0)',
          },
        })

        if (!upstream.ok) {
          return jsonResponse(
            { error: `Upstream error: ${upstream.status}` },
            upstream.status,
            origin
          )
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type': upstream.headers.get('Content-Type') || 'video/mp4',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': origin,
          },
        })
      } catch (error) {
        console.error('Video proxy error:', error)
        return jsonResponse({ error: 'Failed to proxy video' }, 500, origin)
      }
    }

    // 404 for unknown routes
    return jsonResponse({ error: 'Not found', code: 'NOT_FOUND' }, 404, origin)
  },
}
