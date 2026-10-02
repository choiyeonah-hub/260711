import type { AppData, Medicine, PreparednessStatus } from '../types'
import { expiryStatus } from '../lib/dates'

// 기본 상비·응급 준비 체크: '카테고리 보유 여부' 확인용 (제품 추천 아님)
// categoryIds 가 있으면 등록된 약으로 자동 판단, 없으면(체온계 등) 직접 체크
export interface PreparednessItem {
  id: string
  name: string
  categoryIds?: string[]
}

export const PREPAREDNESS_ITEMS: PreparednessItem[] = [
  { id: 'fever', name: '해열·진통', categoryIds: ['c01'] },
  { id: 'cold', name: '감기·알레르기', categoryIds: ['c02'] },
  { id: 'gi', name: '위장·장', categoryIds: ['c04'] },
  { id: 'wound', name: '상처관리 (소독·연고)', categoryIds: ['c07', 'c11'] },
  { id: 'dressing', name: '일반 드레싱', categoryIds: ['c07'] },
  { id: 'bandage', name: '밴드·테이프', categoryIds: ['c08'] },
  { id: 'burn', name: '화상 대응용품' },
  { id: 'thermometer', name: '체온계' },
]

export const PREP_LABEL: Record<PreparednessStatus, string> = {
  AVAILABLE: '있음',
  MISSING: '준비되어 있지 않습니다',
  EXPIRED_ONLY: '유효기간 지난 것만 있음',
  UNKNOWN: '확인 전',
}

export function preparednessStatus(d: AppData, householdId: string, meds: Medicine[], item: PreparednessItem): PreparednessStatus {
  if (!item.categoryIds) {
    return d.preparednessChecks.find((c) => c.householdId === householdId && c.itemId === item.id)?.status ?? 'UNKNOWN'
  }
  const inCat = meds.filter((m) => item.categoryIds!.includes(m.categoryId))
  if (!inCat.length) return 'MISSING'
  return inCat.some((m) => expiryStatus(m.expirationDate) !== 'expired') ? 'AVAILABLE' : 'EXPIRED_ONLY'
}
