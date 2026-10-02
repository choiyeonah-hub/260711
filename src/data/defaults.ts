import type { AppData, Category, ProductType } from '../types'

// 기본 12분류. 데이터에 저장되므로 이후 이름/순서 수정이 가능하다.
export const DEFAULT_CATEGORIES: Category[] = [
  ['c01', '해열·진통', '🌡️'],
  ['c02', '감기·알레르기', '🤧'],
  ['c03', '호흡기', '🫁'],
  ['c04', '위장·장', '🫃'],
  ['c05', '소아', '🧸'],
  ['c06', '개인 처방약', '💊'],
  ['c07', '상처·드레싱', '🩹'],
  ['c08', '밴드·테이프', '🎗️'],
  ['c09', '안약·귀약', '👁️'],
  ['c10', '관절·근육', '🦵'],
  ['c11', '연고·피부', '🧴'],
  ['c12', '기타', '📦'],
].map(([id, name, icon], i) => ({ id, name, icon, order: i + 1, kind: 'MEDICINE' as const }))

// 영양제·건강기능식품 분류 (의약품 12분류와 별도)
export const SUPPLEMENT_CATEGORIES: Category[] = [
  ['s01', '비타민·미네랄'], ['s02', '오메가3'], ['s03', '유산균'], ['s04', '눈 건강'], ['s05', '관절·뼈'], ['s06', '기타 영양제'],
].map(([id, name], i) => ({ id, name, icon: '', order: 101 + i, kind: 'SUPPLEMENT' as const }))

// 의료용품 분류
export const SUPPLY_CATEGORIES: Category[] = [
  ['m01', '체온계'], ['m02', '밴드'], ['m03', '드레싱'], ['m04', '거즈'], ['m05', '테이프'], ['m06', '기타 용품'],
].map(([id, name], i) => ({ id, name, icon: '', order: 201 + i, kind: 'MEDICAL_SUPPLY' as const }))

export const ALL_DEFAULT_CATEGORIES = [...DEFAULT_CATEGORIES, ...SUPPLEMENT_CATEGORIES, ...SUPPLY_CATEGORIES]

export function emptyData(): AppData {
  return {
    version: 1,
    currentHouseholdId: null,
    households: [],
    familyMembers: [],
    categories: ALL_DEFAULT_CATEGORIES,
    storageLocations: [],
    medicines: [],
    sessions: [],
    surveys: [],
    readReminderIds: [],
    pharmacistQuestions: [],
    preparednessChecks: [],
  }
}

// 이전 버전에서 저장된 데이터에 새 필드 기본값을 채운다
export function normalizeData(d: AppData): AppData {
  // 카테고리: 기존 값(이름 수정 포함) 유지 + 없는 기본 분류 추가
  const cats: Category[] = (d.categories ?? []).map((c) => ({ ...c, kind: c.kind ?? 'MEDICINE' }))
  for (const c of ALL_DEFAULT_CATEGORIES) if (!cats.some((x) => x.id === c.id)) cats.push(c)
  const kindOf = new Map(cats.map((c) => [c.id, c.kind]))
  return {
    ...emptyData(),
    ...d,
    categories: cats,
    // 품목 유형: 기존 의약품은 MEDICINE 으로
    medicines: (d.medicines ?? []).map((m) => ({ ...m, productType: migrateType(m.productType as string | undefined, kindOf.get(m.categoryId)) })),
    pharmacistQuestions: d.pharmacistQuestions ?? [],
    preparednessChecks: d.preparednessChecks ?? [],
  }
}

export function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function makeShareCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const p = Array.from({ length: 3 }, () => A[Math.floor(Math.random() * A.length)]).join('')
  return `${p}-${Math.floor(1000 + Math.random() * 9000)}`
}

function migrateType(t: string | undefined, categoryKind: ProductType | undefined): ProductType {
  if (t === 'SUPPLEMENT' || t === 'HEALTH_SUPPLEMENT') return 'SUPPLEMENT'
  // 유형 값이 없으면 카테고리 종류로 판단
  if (!t && categoryKind && categoryKind !== 'MEDICINE') return categoryKind
  // 이전 버전은 밴드·드레싱(의약품 분류)을 자동으로 MEDICAL_SUPPLY 로 저장했음 → 의료용품 분류일 때만 유지
  if (t === 'MEDICAL_SUPPLY' && categoryKind === 'MEDICAL_SUPPLY') return 'MEDICAL_SUPPLY'
  return 'MEDICINE'
}
