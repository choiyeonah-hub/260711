import type { AppData } from '../types'

// 제품명 검색 서비스.
// 1차: 이 기기에 입력했던 제품명 자동완성 (모든 가정 대상)
// 2차(TODO): 식약처 의약품 DB API 연결 → 같은 ProductSuggestion 형태로 반환하도록 searchMfds 구현 후 합치기.
//   외부 DB의 분류는 externalCategory로만 보관하고 우리 12분류(categoryId)와 섞지 않는다.
export interface ProductSuggestion {
  name: string
  categoryId?: string // 최근에 이 이름으로 등록할 때 사용한 우리 분류
  source: 'recent' | 'mfds'
  externalId?: string
  externalCategory?: string
}

export function searchProducts(d: AppData, query: string, limit = 5): ProductSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const seen = new Map<string, ProductSuggestion>()
  const recentFirst = [...d.medicines].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const m of recentFirst) {
    if (m.name.toLowerCase().includes(q) && m.name.toLowerCase() !== q && !seen.has(m.name)) {
      seen.set(m.name, { name: m.name, categoryId: m.categoryId, source: 'recent' })
    }
    if (seen.size >= limit) break
  }
  return [...seen.values()]
}
