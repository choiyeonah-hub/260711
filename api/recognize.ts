import type { IncomingMessage, ServerResponse } from 'node:http'
import { isConfigured, model, recognizeImage } from '../server/recognize.js'

// Vercel 서버리스 함수: GET → 사용 가능 여부, POST {mode, image(base64 jpeg)} → 인식 결과
type Req = IncomingMessage & { body?: unknown }

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method === 'GET') return send(res, 200, { available: isConfigured(), model: isConfigured() ? model() : null })
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
  if (!isConfigured()) return send(res, 503, { error: 'AI 인식이 설정되지 않았습니다 (ANTHROPIC_API_KEY)' })
  try {
    const body = await readBody(req)
    const image = body.image
    const mode = body.mode === 'expiry' ? 'expiry' : 'product'
    if (typeof image !== 'string' || image.length < 100 || image.length > 4_000_000) return send(res, 400, { error: 'invalid image' })
    send(res, 200, await recognizeImage(image, mode))
  } catch (e) {
    console.error('recognize failed', e)
    send(res, 502, { error: 'recognition failed' })
  }
}
