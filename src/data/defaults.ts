import type { AppData, Category } from '../types'

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
].map(([id, name, icon], i) => ({ id, name, icon, order: i + 1 }))

export function emptyData(): AppData {
  return {
    version: 1,
    currentHouseholdId: null,
    households: [],
    familyMembers: [],
    categories: DEFAULT_CATEGORIES,
    storageLocations: [],
    medicines: [],
    sessions: [],
    surveys: [],
    readReminderIds: [],
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
