// 오프라인용 단순 서비스워커: 페이지는 네트워크 우선, 정적 파일은 캐시 우선.
// (데이터는 IndexedDB에 있어 캐시와 무관)
const CACHE = 'yakjang-v3'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
)
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // API 응답(인식 가능 여부 등)은 캐시하지 않는다
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put('/', res.clone())); return res })
        .catch(() => caches.match('/')),
    )
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})
