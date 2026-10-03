import { MOCK_PRODUCTS, type ProductRecord } from './mockMedicineDb'
import { mfdsAvailable, searchMfds } from './mfds'

// 의약품 제품 검색 서비스.
// 서버에 식약처 키(MFDS_SERVICE_KEY)가 있으면 식약처 DUR 품목정보, 없거나 실패하면 예시 DB(mock)
export interface MedicineSearchService {
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

// 검색어용: 띄어쓰기·함량을 빼고 제품명 부분만 (식약처 검색은 제품명 부분일치)
export function baseQuery(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/\(.*$/, '')
    .replace(/[\d.]+(mg|밀리그램|밀리그람|ml|mL|g|그램|%|정|캡슐|포).*$/i, '')
    .trim()
}

class MfdsMedicineSearchService implements MedicineSearchService {
  async search(query: string, limit = 8) {
    const q = baseQuery(query)
    return q.length < 2 ? [] : (await searchMfds(q)).slice(0, limit)
  }

  async matchFromText(texts: string[], limit = 3) {
    const text = normalize(texts.join(' '))
    const queries = [...new Set(texts.slice(0, 3).map(baseQuery).filter((q) => q.length >= 2))]
    const found = new Map<string, ProductRecord>()
    for (const list of await Promise.all(queries.map((q) => searchMfds(q).catch(() => [])))) {
      for (const p of list) found.set(p.id, p)
    }
    return [...found.values()]
      .map((product) => ({ product, score: scoreProduct(text, product) }))
      .filter((m) => m.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

const mock = new MockMedicineSearchService()
const mfds = new MfdsMedicineSearchService()

// 식약처 연결이 되면 식약처 결과만 쓴다 (예시 DB와 섞지 않음). 호출 실패 시에만 예시 DB
export const medicineSearch: MedicineSearchService = {
  async search(query, limit) {
    if (await mfdsAvailable()) {
      try { return await mfds.search(query, limit) } catch (e) { console.warn('식약처 검색 실패 → 예시 DB', e) }
    }
    return mock.search(query, limit)
  },
  async matchFromText(texts, limit) {
    if (await mfdsAvailable()) {
      try { return await mfds.matchFromText(texts, limit) } catch (e) { console.warn('식약처 검색 실패 → 예시 DB', e) }
    }
    return mock.matchFromText(texts, limit)
  },
}

// 확실한 매칭인지: 1등이 거의 완전 일치이고 2등과 차이가 클 때만
export function isConfident(matches: ProductMatch[]): boolean {
  const [a, b] = matches
  return !!a && a.score >= 0.95 && (!b || a.score - b.score >= 0.07)
}
