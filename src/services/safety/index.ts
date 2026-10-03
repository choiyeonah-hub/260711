import type { Medicine, SafetyFinding, SafetyInformation, SafetyLevel } from '../../types'
import { ingredientsOf, isIdentified, isMedicine } from '../../data/medicineMeta'
import { BY_INGREDIENT, BY_PRODUCT, COMBINATIONS, DUPLICATION_GROUPS } from './mockSafetyData'
import { durOf, durSeqOf, type DurRow } from '../mfds'

// 공식 의약품 안전정보 서비스.
// - 식약처 DB와 연결된 약(product.source 'mfds'): DUR 노인주의·용량주의·서방정분할주의·병용금기 (useOfficialSafety 로 미리 받아둔 값)
// - 그 외 확인된 약: 예시(mock) 데이터
// 원칙: 출처 데이터에 있는 내용만 반환한다. 앱이 위험도를 판단하거나 문구를 생성하지 않는다.
export interface SafetyInfoService {
  getForMedicine(m: Medicine): SafetyInformation[]
  checkInventory(meds: Medicine[]): { findings: SafetyFinding[]; excluded: Medicine[] }
}

const mk = (id: string, e: Omit<SafetyInformation, 'id' | 'source'> & { source?: SafetyInformation['source'] }): SafetyInformation => ({
  id, ...e, source: e.source ?? { name: '예시 데이터', isMock: true },
})

const DUR_SOURCE = { name: '식약처 DUR 품목정보', url: 'https://www.data.go.kr/data/15059486/openapi.do', isMock: false }

const durBody = (r: DurRow, fallback: string) => [r.ingr && `성분: ${r.ingr}`, r.content || fallback].filter(Boolean).join('\n')

function durInfos(seq: string): SafetyInformation[] {
  const d = durOf(seq)
  if (!d) return []
  const out: SafetyInformation[] = []
  d.elderly.forEach((r, i) => out.push({ id: `dur:elderly:${seq}:${i}`, level: 'CAUTION', type: 'ELDERLY_CAUTION', title: '노인주의 (DUR)',
    body: durBody(r, 'DUR 노인주의 대상 의약품입니다.'), source: DUR_SOURCE }))
  d.dose.forEach((r, i) => out.push({ id: `dur:dose:${seq}:${i}`, level: 'CAUTION', type: 'DOSE_CAUTION', title: '용량주의 (DUR)',
    body: durBody(r, 'DUR 용량주의 대상 의약품입니다.'), source: DUR_SOURCE }))
  d.split.forEach((r, i) => out.push({ id: `dur:split:${seq}:${i}`, level: 'CAUTION', type: 'SPLIT_CAUTION', title: '서방정 분할주의 (DUR)',
    body: durBody(r, 'DUR 서방정 분할주의 대상 의약품입니다.'), source: DUR_SOURCE }))
  return out
}

class MockSafetyInfoService implements SafetyInfoService {
  getForMedicine(m: Medicine) {
    if (!isIdentified(m)) return []
    const seq = durSeqOf(m)
    if (seq) return durInfos(seq)
    const out: SafetyInformation[] = []
    for (const ing of ingredientsOf(m)) {
      ;(BY_INGREDIENT[ing] ?? []).forEach((e, i) => out.push(mk(`ing:${ing}:${i}`, e)))
    }
    const pid = m.product?.externalId
    if (pid) (BY_PRODUCT[pid] ?? []).forEach((e, i) => out.push(mk(`prod:${pid}:${i}`, e)))
    return out
  }

  checkInventory(meds: Medicine[]) {
    // 의약품만 대상. 영양제·의료용품은 공식 안전정보 비교 대상이 아님
    const included = meds.filter(isIdentified)
    const excluded = meds.filter((m) => isMedicine(m) && !isIdentified(m))
    const findings: SafetyFinding[] = []

    // 1) 약별 정보
    for (const m of included) {
      for (const info of this.getForMedicine(m)) findings.push({ id: `${info.id}|${m.id}`, info, medicineIds: [m.id] })
    }
    // 2) 등록된 약 사이의 조합 (병용금기)
    const ing = new Map(included.map((m) => [m.id, ingredientsOf(m)]))
    for (const [ci, c] of COMBINATIONS.entries()) {
      const a = included.filter((m) => ing.get(m.id)!.includes(c.ingredients[0]))
      const b = included.filter((m) => ing.get(m.id)!.includes(c.ingredients[1]))
      for (const x of a) for (const y of b) {
        if (x.id === y.id) continue
        const info = mk(`combo:${ci}`, c.entry)
        findings.push({ id: `${info.id}|${x.id}|${y.id}`, info, medicineIds: [x.id, y.id] })
      }
    }
    // 2-1) 식약처 DUR 병용금기: 약 A의 금기 상대 품목 목록에 가정 내 약 B가 있으면
    const bySeq = new Map(included.flatMap((m) => { const s = durSeqOf(m); return s ? [[s, m] as const] : [] }))
    const seen = new Set<string>()
    for (const x of included) {
      const sx = durSeqOf(x)
      const d = sx ? durOf(sx) : undefined
      for (const [ci, c] of (d?.combos ?? []).entries()) {
        for (const s of c.seqs) {
          const y = bySeq.get(s)
          if (!y || y.id === x.id) continue
          const pair = [x.id, y.id].sort().join('|')
          if (seen.has(pair)) continue // 양쪽 약에 같은 금기가 실려 있으므로 한 번만
          seen.add(pair)
          const info: SafetyInformation = {
            id: `dur:combo:${sx}:${ci}`, level: 'CRITICAL', type: 'COMBINATION_CONTRAINDICATION', title: '병용금기 (DUR)',
            body: [c.ingr && c.mixIngr && `성분: ${c.ingr} + ${c.mixIngr}`, c.content || 'DUR 병용금기 대상 조합입니다.'].filter(Boolean).join('\n'),
            source: DUR_SOURCE,
          }
          findings.push({ id: `${info.id}|${pair}`, info, medicineIds: [x.id, y.id] })
        }
      }
    }
    // 3) 효능군/성분 중복
    for (const g of DUPLICATION_GROUPS) {
      const hit = included.filter((m) => ing.get(m.id)!.some((i) => g.ingredients.includes(i)))
      if (hit.length >= 2) {
        const info = mk(`dup:${g.id}`, g.entry)
        findings.push({ id: `${info.id}|${hit.map((m) => m.id).sort().join('|')}`, info, medicineIds: hit.map((m) => m.id) })
      }
    }
    return { findings, excluded }
  }
}

export const safetyInfo: SafetyInfoService = new MockSafetyInfoService()

export const LEVEL_META: Record<SafetyLevel, { label: string; short: string }> = {
  CRITICAL: { label: '중요 안전정보', short: '꼭 확인' },
  CAUTION: { label: '생활 속 주의사항', short: '주의정보' },
  INFO: { label: '알아두면 좋은 정보', short: '알아두면 좋은 정보' },
}

// 공식 허가정보 확인 링크 (용법·용량은 앱이 해석하지 않고 원문으로 안내)
export function officialLabelUrl(name: string): string {
  return `https://nedrug.mfds.go.kr/searchDrug?itemName=${encodeURIComponent(name.replace(/\(예시\)\s*/, '').split(' ')[0])}`
}
