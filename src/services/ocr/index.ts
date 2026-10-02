import { extractExpiry } from '../../lib/expiryExtract'
import { parseExpiryInput } from '../../lib/dates'

// 사진 인식(OCR) 서비스.
// 1순위: 서버 AI 인식 (/api/recognize, Claude 비전 · API 키는 서버 환경변수)
// 2순위: 기기 내 OCR (Tesseract.js, 무료·오프라인, 정확도 낮음)
// 어떤 경우에도 결과는 '후보'일 뿐이며 화면에서 사람이 확인한다.

export type RecognizeMode = 'product' | 'expiry'

export interface OcrResult {
  engine: 'ai' | 'device'
  engineLabel: string // 예: 'AI(claude-opus-5-5)', '기기 OCR' — 세션 비교용
  productName: string | null
  manufacturer: string | null
  strength: string | null
  dosageForm: string | null
  expiry: string | null // 'YYYY-MM' | 'YYYY-MM-DD'
  texts: string[] // 매칭용 원문 텍스트 조각
}

let serverAvailable: Promise<boolean> | null = null
let serverModel = 'unknown'

// 서버 AI 인식 사용 가능 여부 (키 미설정/로컬 실행이면 false → 기기 OCR)
export function checkServer(): Promise<boolean> {
  serverAvailable ??= fetch('/api/recognize', { method: 'GET' })
    .then((r) => r.json())
    .then((j) => {
      if (j?.model) serverModel = j.model
      return j?.available === true
    })
    .catch(() => false)
  return serverAvailable
}

export async function recognize(image: Blob, mode: RecognizeMode): Promise<OcrResult> {
  if (await checkServer()) {
    try {
      return await recognizeOnServer(image, mode)
    } catch (e) {
      console.warn('AI 인식 실패 → 기기 OCR로 대체', e)
    }
  }
  return recognizeOnDevice(image)
}

async function recognizeOnServer(image: Blob, mode: RecognizeMode): Promise<OcrResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch('/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, image: await blobToBase64(image) }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return {
      engine: 'ai',
      engineLabel: `AI(${serverModel})`,
      productName: s(j.product_name),
      manufacturer: s(j.manufacturer),
      strength: s(j.strength),
      dosageForm: s(j.dosage_form),
      expiry: s(j.expiry_date) ? parseExpiryInput(j.expiry_date) : null,
      texts: [s(j.product_name), ...(Array.isArray(j.other_text) ? j.other_text : [])].filter((x): x is string => typeof x === 'string'),
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---- 기기 내 OCR (Tesseract) ----
type TWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>
let workerP: Promise<TWorker> | null = null

export function warmUpDeviceOcr(): Promise<TWorker> {
  workerP ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker(['kor', 'eng'], 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/',
      langPath: '/ocr/lang',
      workerBlobURL: false,
    }),
  )
  workerP.catch(() => { workerP = null })
  return workerP
}

async function recognizeOnDevice(image: Blob): Promise<OcrResult> {
  const worker = await warmUpDeviceOcr()
  const { data } = await worker.recognize(await downscale(image, 1600))
  const lines = data.text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 2)
  return {
    engine: 'device',
    engineLabel: '기기 OCR',
    productName: null,
    manufacturer: null,
    strength: null,
    dosageForm: null,
    expiry: extractExpiry(data.text),
    texts: lines,
  }
}

// ---- 이미지 유틸 ----
export async function downscale(image: Blob, maxSize: number, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(image)
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 변환 실패'))), 'image/jpeg', quality))
}

async function blobToBase64(b: Blob): Promise<string> {
  const small = await downscale(b, 1280)
  const buf = new Uint8Array(await small.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}
