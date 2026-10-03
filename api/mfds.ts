import type { IncomingMessage, ServerResponse } from 'node:http'
import { check, durForItem, isConfigured, MfdsError, searchProducts } from '../server/mfds.js'

// Vercel 서버리스 함수 (GET만)
//   /api/mfds            → { available }
//   /api/mfds?check=1    → 연결 확인 (키 값은 내보내지 않음)
//   /api/mfds?q=타이레놀  → 제품 검색
//   /api/mfds?seq=…&name=… → 해당 품목 DUR 정보
function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
  const p = new URL(req.url ?? '/', 'http://x').searchParams
  try {
    if (p.has('check')) return send(res, 200, await check())
    if (!isConfigured()) return send(res, p.has('q') || p.has('seq') ? 503 : 200, { available: false })
    const q = p.get('q')?.trim()
    if (q) return send(res, 200, await searchProducts(q.slice(0, 50)))
    const seq = p.get('seq')?.trim()
    const name = p.get('name')?.trim()
    if (seq && name) return send(res, 200, await durForItem(seq, name))
    send(res, 200, { available: true })
  } catch (e) {
    console.error('mfds failed', e)
    send(res, 502, { error: e instanceof MfdsError ? e.message : 'mfds request failed' })
  }
}
