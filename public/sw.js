const CACHE_NAME = 'vocab-pwa-v1'
const STATIC_ASSETS = [
  '/',
  '/learn',
  '/vocabulary',
  '/quiz',
  '/spelling',
  '/wrong-words',
  '/profile',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Network-first for API and Supabase calls
  if (
    url.hostname.includes('supabase') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    )
    return
  }

  // Cache-first for static assets
  if (
    request.method === 'GET' &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.match(/\.(png|jpg|svg|ico|woff2?)$/))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((r) => {
        const clone = r.clone()
        caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        return r
      }))
    )
    return
  }

  // Network-first with offline fallback for pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((r) => r ?? new Response('离线中，请检查网络连接', { status: 503 }))
      )
    )
    return
  }
})
