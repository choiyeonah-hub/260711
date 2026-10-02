import type { Medicine, SafetyFinding, SafetyInformation, SafetyLevel } from '../../types'
import { ingredientsOf, isIdentified, isMedicine } from '../../data/medicineMeta'
import { BY_INGREDIENT, BY_PRODUCT, COMBINATIONS, DUPLICATION_GROUPS } from './mockSafetyData'

// 공식 의약품 안전정보 서비스.
// TODO(식약처 연결): MfdsSafetyInfoService 로 교체
//   - getForMedicine: 의약품 허가정보(주의사항·용법용량) + DUR 품목/성분 정보 조회
//   - checkInventory: DUR 병용금기·효능군중복 API에 가정 전체 성분 목록을 넣어 조회
// 원칙: 출처 데이터에 있는 내용만 반환한다. 앱이 위험도를 판단하거나 문구를 생성하지 않는다.
export interface SafetyInfoService {
  getForMedicine(m: Medicine): SafetyInformation[]
  checkInventory(meds: Medicine[]): { findings: SafetyFinding[]; excluded: Medicine[] }
}

const mk = (id: string, e: Omit<SafetyInformation, 'id' | 'source'> & { source?: SafetyInformation['source'] }): SafetyInformation => ({
  id, ...e, source: e.source ?? { name: '예시 데이터', isMock: true },
})

class MockSafetyInfoService implements SafetyInfoService {
  getForMedicine(m: Medicine) {
    if (!isIdentified(m)) return []
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
