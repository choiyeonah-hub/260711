import { MOCK_PRODUCTS, type ProductRecord } from './mockMedicineDb'

// 의약품 제품 검색 서비스.
// TODO(식약처 연결): MfdsMedicineSearchService 를 만들어 같은 인터페이스를 구현하고 아래 export 만 교체한다.
//   - search: 식약처 의약품 제품 허가정보/e약은요 API를 서버(api/)에서 호출 (serviceKey 노출 방지)
//   - matchFromText: OCR 후보 문자열로 search 를 여러 번 호출해 점수화
export interface MedicineSearchService {
  source: 'mock' | 'mfds'
  search(query: string, limit?: number): Promise<ProductRecord[]>
  matchFromText(texts: string[], limit?: number): Promise<ProductMatch[]>
}

export interface ProductMatch {
  product: ProductRecord
  score: number // 0~1
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/밀리그램|밀리그람/g, 'mg')
    .replace(/[\s()[\]\-·.,_/:'"]/g, '')
}

function bigrams(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a), B = bigrams(b)
  if (!A.length || !B.length) return 0
  const pool = [...B]
  let hit = 0
  for (const g of A) {
    const i = pool.indexOf(g)
    if (i >= 0) { hit++; pool.splice(i, 1) }
  }
  return (2 * hit) / (A.length + B.length)
}

function editSimilarity(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return 1 - dp[b.length] / Math.max(a.length, b.length)
}

// key가 text 안에 비슷하게 들어있는 정도. OCR 오탈자(한 글자 오인식 등)는 5글자 이상 이름에서만 허용
function containsScore(text: string, key: string): number {
  if (!key) return 0
  if (text.includes(key)) return 1
  if (key.length < 5) return 0
  let best = 0
  for (const len of [key.length - 1, key.length, key.length + 1]) {
    for (let i = 0; i + len <= text.length; i++) best = Math.max(best, editSimilarity(text.slice(i, i + len), key))
  }
  return best
}

export function scoreProduct(text: string, p: ProductRecord): number {
  let s = containsScore(text, normalize(p.baseName))
  if (p.strength) {
    const digits = p.strength.replace(/[^\d.]/g, '')
    if (digits && text.includes(digits)) s += 0.08
  }
  return s // 함량까지 일치하면 1을 약간 넘을 수 있음 (동명 제품 구분용)
}

class MockMedicineSearchService implements MedicineSearchService {
  source = 'mock' as const

  async search(query: string, limit = 8) {
    const q = normalize(query)
    if (!q) return []
    return MOCK_PRODUCTS
      .map((p) => {
        const hay = normalize([p.name, p.ingredient, p.manufacturer].filter(Boolean).join(' '))
        return { p, s: hay.includes(q) ? 1 : dice(q, normalize(p.baseName)) }
      })
      .filter((x) => x.s >= 0.4)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.p)
  }

  async matchFromText(texts: string[], limit = 3) {
    const text = normalize(texts.join(' '))
    if (!text) return []
    return MOCK_PRODUCTS
      .map((product) => ({ product, score: scoreProduct(text, product) }))
      .filter((m) => m.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

export const medicineSearch: MedicineSearchService = new MockMedicineSearchService()

// 확실한 매칭인지: 1등이 거의 완전 일치이고 2등과 차이가 클 때만
export function isConfident(matches: ProductMatch[]): boolean {
  const [a, b] = matches
  return !!a && a.score >= 0.95 && (!b || a.score - b.score >= 0.07)
}
