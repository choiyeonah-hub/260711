// 식약처 DUR 품목정보 API (공공데이터포털 15059486) 호출.
// 키: 서버 환경변수 MFDS_SERVICE_KEY (일반 인증키 Decoding. 클라이언트에 노출하지 않음)
// 응답 필드명은 공공데이터포털 명세 기준. 실제 응답과 다르면 /api/mfds?check=1 의 fields 로 확인해 맞춘다.
const BASE = 'https://apis.data.go.kr/1471000/DURPrdlstInfoService03'

export const OPS = {
  product: 'getDurPrdlstInfoList03', // DUR 품목정보
  combo: 'getUsjntTabooInfoList03', // 병용금기
  elderly: 'getOdsnAtentInfoList03', // 노인주의
  dose: 'getCpctyAtentInfoList03', // 용량주의
  split: 'getSeobangjeongPartitnAtentInfoList03', // 서방정 분할주의
} as const
type Op = keyof typeof OPS
type Row = Record<string, unknown>

export const isConfigured = () => !!process.env.MFDS_SERVICE_KEY

export class MfdsError extends Error {}

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const pick = (r: Row, ...keys: string[]) => keys.map((k) => str(r[k])).find(Boolean) ?? ''

async function call(op: Op, params: Record<string, string | number>): Promise<{ total: number; rows: Row[] }> {
  const key = process.env.MFDS_SERVICE_KEY ?? ''
  // Encoding 키를 넣은 경우(%가 있음) 그대로, Decoding 키면 인코딩해서 붙인다
  const qs = new URLSearchParams({ type: 'json', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  const url = `${BASE}/${OPS[op]}?serviceKey=${key.includes('%') ? key : encodeURIComponent(key)}&${qs}`
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) })
  const text = await res.text()
  let json: Row
  try {
    json = JSON.parse(text)
  } catch {
    // 키 오류·미승인 등은 JSON 요청에도 XML로 온다
    const msg = text.match(/<returnAuthMsg>([^<]*)</)?.[1] ?? text.match(/<resultMsg>([^<]*)</)?.[1] ?? `HTTP ${res.status}`
    throw new MfdsError(msg)
  }
  const root = (json.response as Row | undefined) ?? json
  const header = (root.header ?? {}) as Row
  if (header.resultCode && str(header.resultCode) !== '00') throw new MfdsError(str(header.resultMsg) || str(header.resultCode))
  const body = (root.body ?? {}) as Row
  const items = body.items as unknown
  const list = Array.isArray(items) ? items : (items as Row | undefined)?.item ?? []
  return { total: Number(body.totalCount) || 0, rows: (Array.isArray(list) ? list : [list]) as Row[] }
}

// 여러 페이지 조회 (병용금기처럼 행이 많은 경우). 상한을 넘으면 truncated
async function callAll(op: Op, params: Record<string, string>, maxPages = 20) {
  const first = await call(op, { ...params, numOfRows: 100, pageNo: 1 })
  const pages = Math.min(Math.ceil(first.total / 100), maxPages)
  const rest = await Promise.all(
    Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => call(op, { ...params, numOfRows: 100, pageNo: i + 2 })),
  )
  return { rows: [first, ...rest].flatMap((r) => r.rows), truncated: first.total > maxPages * 100 }
}

// 성분: MATERIAL_NAME 의 "성분명 : X" 를 우선, 없으면 제품명 괄호 안
function ingredientsFrom(r: Row): string {
  const mat = pick(r, 'MATERIAL_NAME', 'MAIN_INGR', 'INGR_NAME')
  const named = [...mat.matchAll(/성분명\s*:\s*([^|;]+)/g)].map((m) => m[1].trim()).filter(Boolean)
  if (named.length) return [...new Set(named)].join('+')
  if (mat && !mat.includes(':')) return mat.replace(/\s*[,/]\s*/g, '+')
  return pick(r, 'ITEM_NAME').match(/\(([^()]+)\)\s*$/)?.[1] ?? ''
}

export interface MfdsProduct {
  id: string // 품목기준코드 ITEM_SEQ
  name: string
  baseName: string
  strength?: string
  ingredient?: string
  manufacturer?: string
  externalClass?: string
  source: 'mfds'
}

export async function searchProducts(q: string, limit = 20): Promise<MfdsProduct[]> {
  const { rows } = await call('product', { itemName: q, numOfRows: limit, pageNo: 1 })
  const out = new Map<string, MfdsProduct>()
  for (const r of rows) {
    const id = pick(r, 'ITEM_SEQ')
    const name = pick(r, 'ITEM_NAME')
    if (!id || !name || out.has(id)) continue
    const noParen = name.replace(/\([^()]*\)\s*$/, '').trim()
    const strength = noParen.match(/[\d.]+\s*(밀리그람|밀리그램|mg|그램|g|마이크로그램|㎍|mcg|밀리리터|mL|ml|%)/i)?.[0]
    out.set(id, {
      id, name, source: 'mfds',
      baseName: strength ? noParen.slice(0, noParen.indexOf(strength)).trim() || noParen : noParen,
      strength,
      ingredient: ingredientsFrom(r) || undefined,
      manufacturer: pick(r, 'ENTP_NAME') || undefined,
      externalClass: pick(r, 'CLASS_NAME', 'CLASS_NO') || undefined,
    })
  }
  return [...out.values()]
}

export interface DurRow { ingr?: string; content?: string }
export interface DurCombo extends DurRow { mixIngr?: string; seqs: string[] }
export interface DurData { elderly: DurRow[]; dose: DurRow[]; split: DurRow[]; combos: DurCombo[]; truncated: boolean }

// 해당 품목(ITEM_SEQ)의 DUR 정보. API가 제품명으로 검색하므로 이름으로 조회 후 ITEM_SEQ 로 거른다.
export async function durForItem(seq: string, name: string): Promise<DurData> {
  const mine = (rows: Row[]) => rows.filter((r) => pick(r, 'ITEM_SEQ') === seq)
  const simple = (rows: Row[]): DurRow[] => {
    const seen = new Set<string>()
    return mine(rows)
      .map((r) => ({ ingr: pick(r, 'INGR_KOR_NAME', 'INGR_NAME') || undefined, content: pick(r, 'PROHBT_CONTENT', 'REMARK') || undefined }))
      .filter((d) => { const k = `${d.ingr}|${d.content}`; return !seen.has(k) && !!seen.add(k) })
  }
  const [elderly, dose, split, combo] = await Promise.all([
    callAll('elderly', { itemName: name }),
    callAll('dose', { itemName: name }),
    callAll('split', { itemName: name }),
    callAll('combo', { itemName: name }),
  ])
  // 병용금기: 상대 제품(MIXTURE_ITEM_SEQ)을 성분·사유별로 묶어 크기를 줄인다
  const combos = new Map<string, DurCombo>()
  for (const r of mine(combo.rows)) {
    const c = {
      ingr: pick(r, 'INGR_KOR_NAME', 'INGR_NAME') || undefined,
      mixIngr: pick(r, 'MIXTURE_INGR_KOR_NAME', 'MIXTURE_INGR_NAME') || undefined,
      content: pick(r, 'PROHBT_CONTENT') || undefined,
    }
    const k = `${c.ingr}|${c.mixIngr}|${c.content}`
    const g = combos.get(k) ?? { ...c, seqs: [] }
    const s = pick(r, 'MIXTURE_ITEM_SEQ')
    if (s && !g.seqs.includes(s)) g.seqs.push(s)
    combos.set(k, g)
  }
  return {
    elderly: simple(elderly.rows), dose: simple(dose.rows), split: simple(split.rows),
    combos: [...combos.values()],
    truncated: [elderly, dose, split, combo].some((x) => x.truncated),
  }
}

// 연결 확인: 키 설정 여부와 각 오퍼레이션 응답 (필드명만, 키 값은 내보내지 않음)
export async function check() {
  if (!isConfigured()) return { configured: false, ok: false, message: 'MFDS_SERVICE_KEY 가 설정되지 않았습니다' }
  const ops = await Promise.all(
    (Object.keys(OPS) as Op[]).map(async (op) => {
      try {
        const r = await call(op, { numOfRows: 1, pageNo: 1 })
        return { op, ok: true, total: r.total, fields: Object.keys(r.rows[0] ?? {}) }
      } catch (e) {
        return { op, ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
  const ok = ops.every((o) => o.ok)
  return {
    configured: true, ok,
    message: ok ? '식약처 DUR 연결 정상' : '일부 또는 전체 실패 — 신청 직후라면 1~2시간 뒤 다시 확인',
    ops,
  }
}
