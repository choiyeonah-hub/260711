import type { IdentificationStatus, Medicine, ProductType } from '../types'
import { MOCK_PRODUCTS } from '../services/mockMedicineDb'

// 저장된 값이 없을 때(이전 버전 데이터)도 일관되게 쓰기 위한 파생값

export function identificationOf(m: Medicine): IdentificationStatus {
  if (m.identificationStatus) return m.identificationStatus
  if (m.product?.source === 'mfds') return 'OFFICIAL_DB_MATCHED'
  if (m.product?.source === 'mock') return 'USER_CONFIRMED'
  return 'UNVERIFIED'
}

// 안전정보 자동 비교 대상: 사용자가 제품을 확인한 약만
export const isIdentified = (m: Medicine) => isMedicine(m) && identificationOf(m) !== 'UNVERIFIED'

// normalizeData 를 거친 데이터는 항상 값이 있음. 없으면 의약품.
export const productTypeOf = (m: Pick<Medicine, 'productType'>): ProductType => m.productType ?? 'MEDICINE'
export const isMedicine = (m: Pick<Medicine, 'productType'>) => productTypeOf(m) === 'MEDICINE'

export function splitIngredients(s?: string): string[] {
  return s ? s.split('+').map((x) => x.trim()).filter(Boolean) : []
}

export function ingredientsOf(m: Medicine): string[] {
  if (m.product?.ingredients?.length) return m.product.ingredients
  const p = m.product?.externalId ? MOCK_PRODUCTS.find((x) => x.id === m.product!.externalId) : undefined
  return splitIngredients(p?.ingredient)
}

export const IDENTIFICATION_LABEL: Record<IdentificationStatus, string> = {
  UNVERIFIED: '제품 미확인',
  USER_CONFIRMED: '제품 확인됨',
  OFFICIAL_DB_MATCHED: '공식 DB 일치',
}
