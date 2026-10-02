import type { AppData, FamilyMember, Household, Medicine, OrganizationSession, PharmacistQuestion, StorageType, Survey, WorkPhase } from '../types'
import { identificationOf, isIdentified, productTypeOf } from './medicineMeta'
import { expiryStatus, isSoon } from '../lib/dates'
import { makeShareCode, uid } from './defaults'

// 모든 변경은 (data) => newData 순수 함수로. 저장은 store가 담당한다.
const now = () => new Date().toISOString()

export function createHousehold(d: AppData, name: string, members: string[]): AppData {
  const h: Household = { id: uid(), name, shareCode: makeShareCode(), createdAt: now() }
  const fm: FamilyMember[] = members.map((n, i) => ({
    id: uid(), householdId: h.id, name: n, isShared: n === '공용', order: i,
  }))
  return { ...d, currentHouseholdId: h.id, households: [...d.households, h], familyMembers: [...d.familyMembers, ...fm] }
}

export function updateHousehold(d: AppData, id: string, patch: Partial<Household>): AppData {
  return { ...d, households: d.households.map((h) => (h.id === id ? { ...h, ...patch } : h)) }
}

export function deleteHousehold(d: AppData, id: string): AppData {
  const households = d.households.filter((h) => h.id !== id)
  const keep = <T extends { householdId: string }>(xs: T[]) => xs.filter((x) => x.householdId !== id)
  return {
    ...d,
    households,
    currentHouseholdId: d.currentHouseholdId === id ? (households[0]?.id ?? null) : d.currentHouseholdId,
    familyMembers: keep(d.familyMembers),
    storageLocations: keep(d.storageLocations),
    medicines: keep(d.medicines),
    sessions: keep(d.sessions),
    surveys: keep(d.surveys),
    pharmacistQuestions: keep(d.pharmacistQuestions),
    preparednessChecks: keep(d.preparednessChecks),
  }
}

export function addFamilyMember(d: AppData, householdId: string, name: string): AppData {
  const order = d.familyMembers.filter((m) => m.householdId === householdId).length
  const m: FamilyMember = { id: uid(), householdId, name, isShared: name === '공용', order }
  return { ...d, familyMembers: [...d.familyMembers, m] }
}

export function renameFamilyMember(d: AppData, id: string, name: string): AppData {
  return { ...d, familyMembers: d.familyMembers.map((m) => (m.id === id ? { ...m, name } : m)) }
}

export function deleteFamilyMember(d: AppData, id: string): AppData {
  return {
    ...d,
    familyMembers: d.familyMembers.filter((m) => m.id !== id),
    medicines: d.medicines.map((x) => (x.familyMemberId === id ? { ...x, familyMemberId: null } : x)),
  }
}

// 보관 위치는 이름으로 찾고 없으면 만든다
export function ensureLocation(d: AppData, householdId: string, name: string): [AppData, string] {
  const n = name.trim()
  const found = d.storageLocations.find((l) => l.householdId === householdId && l.name === n)
  if (found) return [d, found.id]
  const loc = { id: uid(), householdId, name: n, createdAt: now() }
  return [{ ...d, storageLocations: [...d.storageLocations, loc] }, loc.id]
}

export type MedicineInput = Omit<Medicine, 'id' | 'householdId' | 'storageLocationId' | 'createdAt' | 'updatedAt'> & {
  locationName: string
}

export function saveMedicine(d: AppData, householdId: string, input: MedicineInput, id?: string): AppData {
  const { locationName, ...fields } = input
  // 식별 상태·제품 유형은 입력값에서 결정 (DB 제품을 고르면 확인됨, 이름만 입력하면 미확인)
  const rest = {
    ...fields,
    identificationStatus: identificationOf({ ...fields, identificationStatus: undefined } as Medicine),
    productType: productTypeOf({ ...fields, productType: undefined }),
  }
  const [d2, storageLocationId] = ensureLocation(d, householdId, locationName)
  if (id) {
    return {
      ...d2,
      medicines: d2.medicines.map((m) => (m.id === id ? { ...m, ...rest, storageLocationId, updatedAt: now() } : m)),
    }
  }
  const m: Medicine = { ...rest, id: uid(), householdId, storageLocationId, createdAt: now(), updatedAt: now() }
  return { ...d2, medicines: [...d2.medicines, m] }
}

export function deleteMedicine(d: AppData, id: string): AppData {
  return { ...d, medicines: d.medicines.filter((m) => m.id !== id) }
}

export const activeSession = (d: AppData, householdId: string | null) =>
  d.sessions.find((s) => s.householdId === householdId && !s.endedAt) ?? null

export function startSession(d: AppData, householdId: string, storageMethods: string[]): AppData {
  const s: OrganizationSession = {
    id: uid(), householdId, startedAt: now(), endedAt: null, storageMethods, discardedExpiredCount: 0, summary: null,
    manualEntryCount: 0, photoEntryCount: 0, recognitionSuccessCount: 0, recognitionFailureCount: 0,
  }
  return { ...d, sessions: [...d.sessions, s] }
}

export function bumpDiscarded(d: AppData, sessionId: string, delta: number): AppData {
  return {
    ...d,
    sessions: d.sessions.map((s) =>
      s.id === sessionId ? { ...s, discardedExpiredCount: Math.max(0, s.discardedExpiredCount + delta) } : s,
    ),
  }
}

export type EntryMethod = { method: 'manual' } | { method: 'photo'; recognized: boolean; engine?: string }

// 새 약 등록 1건을 정리 세션 통계에 반영
export function recordEntry(d: AppData, sessionId: string, e: EntryMethod): AppData {
  return {
    ...d,
    sessions: d.sessions.map((s) => {
      if (s.id !== sessionId) return s
      if (e.method === 'manual') return { ...s, manualEntryCount: (s.manualEntryCount ?? 0) + 1 }
      return {
        ...s,
        photoEntryCount: (s.photoEntryCount ?? 0) + 1,
        recognitionSuccessCount: (s.recognitionSuccessCount ?? 0) + (e.recognized ? 1 : 0),
        recognitionFailureCount: (s.recognitionFailureCount ?? 0) + (e.recognized ? 0 : 1),
        recognitionEngines: e.engine && !(s.recognitionEngines ?? []).includes(e.engine)
          ? [...(s.recognitionEngines ?? []), e.engine]
          : s.recognitionEngines,
      }
    }),
  }
}

export function endSession(d: AppData, sessionId: string): AppData {
  const end = new Date()
  return {
    ...d,
    sessions: d.sessions.map((s) => {
      if (s.id !== sessionId) return s
      const regs = d.medicines.filter((m) => m.sessionId === s.id)
      const all = d.medicines.filter((m) => m.householdId === s.householdId)
      const persons = new Set(d.familyMembers.filter((f) => f.householdId === s.householdId && !f.isShared).map((f) => f.id))
      const rx = all.filter((m) => m.isPrescription)
      const unidentified = all.filter((m) => !isIdentified(m))
      const ownerUnknown = rx.filter((m) => !m.familyMemberId || !persons.has(m.familyMemberId))
      const useUnknown = rx.filter((m) => (m.currentUseStatus ?? 'UNKNOWN') === 'UNKNOWN')
      const review = new Set([...unidentified, ...ownerUnknown, ...useUnknown].map((m) => m.id))
      return {
        ...s,
        endedAt: end.toISOString(),
        summary: {
          registeredCount: regs.length,
          expiredFound: regs.filter((m) => expiryStatus(m.expirationDate) === 'expired').length + s.discardedExpiredCount,
          prescriptionCount: regs.filter((m) => m.isPrescription).length,
          householdTotal: d.medicines.filter((m) => m.householdId === s.householdId).length,
          durationMin: Math.max(1, Math.round((end.getTime() - new Date(s.startedAt).getTime()) / 60000)),
          photoEntryCount: s.photoEntryCount ?? 0,
          manualEntryCount: s.manualEntryCount ?? 0,
          recognitionSuccessRate: s.photoEntryCount ? Math.round(((s.recognitionSuccessCount ?? 0) / s.photoEntryCount) * 100) : null,
          recognitionSuccessCount: s.recognitionSuccessCount ?? 0,
          prescriptionTotal: rx.length,
          otcCount: all.length - rx.length,
          expiringSoonCount: all.filter((m) => isSoon(expiryStatus(m.expirationDate))).length,
          unidentifiedCount: unidentified.length,
          rxOwnerUnknownCount: ownerUnknown.length,
          rxUseUnknownCount: useUnknown.length,
          needsReviewCount: review.size,
        },
      }
    }),
  }
}

export function addSurvey(d: AppData, s: Omit<Survey, 'id' | 'createdAt'>): AppData {
  return { ...d, surveys: [...d.surveys, { ...s, id: uid(), createdAt: now() }] }
}

export function markRemindersRead(d: AppData, ids: string[]): AppData {
  return { ...d, readReminderIds: Array.from(new Set([...d.readReminderIds, ...ids])) }
}

export function setLocationType(d: AppData, locationId: string, storageType: StorageType | undefined): AppData {
  return { ...d, storageLocations: d.storageLocations.map((l) => (l.id === locationId ? { ...l, storageType } : l)) }
}

export function setPhaseMinutes(d: AppData, sessionId: string, phaseMinutes: Partial<Record<WorkPhase, number>>): AppData {
  return { ...d, sessions: d.sessions.map((s) => (s.id === sessionId ? { ...s, phaseMinutes } : s)) }
}

// 약사에게 확인할 목록 (refKey 가 같으면 중복 추가하지 않음)
export function addQuestion(d: AppData, q: Omit<PharmacistQuestion, 'id' | 'createdAt' | 'done'>): AppData {
  if (q.refKey && d.pharmacistQuestions.some((x) => x.householdId === q.householdId && x.refKey === q.refKey)) return d
  return { ...d, pharmacistQuestions: [...d.pharmacistQuestions, { ...q, id: uid(), done: false, createdAt: now() }] }
}

export function toggleQuestion(d: AppData, id: string): AppData {
  return { ...d, pharmacistQuestions: d.pharmacistQuestions.map((q) => (q.id === id ? { ...q, done: !q.done } : q)) }
}

export function deleteQuestion(d: AppData, id: string): AppData {
  return { ...d, pharmacistQuestions: d.pharmacistQuestions.filter((q) => q.id !== id) }
}

export function setPreparedness(d: AppData, householdId: string, itemId: string, status: 'AVAILABLE' | 'MISSING' | null): AppData {
  const rest = d.preparednessChecks.filter((c) => !(c.householdId === householdId && c.itemId === itemId))
  return { ...d, preparednessChecks: status ? [...rest, { householdId, itemId, status, updatedAt: now() }] : rest }
}
