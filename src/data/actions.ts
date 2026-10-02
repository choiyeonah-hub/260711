import type { AppData, FamilyMember, Household, Medicine, OrganizationSession, Survey } from '../types'
import { expiryStatus } from '../lib/dates'
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
  const { locationName, ...rest } = input
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

export function endSession(d: AppData, sessionId: string): AppData {
  const end = new Date()
  return {
    ...d,
    sessions: d.sessions.map((s) => {
      if (s.id !== sessionId) return s
      const regs = d.medicines.filter((m) => m.sessionId === s.id)
      return {
        ...s,
        endedAt: end.toISOString(),
        summary: {
          registeredCount: regs.length,
          expiredFound: regs.filter((m) => expiryStatus(m.expirationDate) === 'expired').length + s.discardedExpiredCount,
          prescriptionCount: regs.filter((m) => m.isPrescription).length,
          householdTotal: d.medicines.filter((m) => m.householdId === s.householdId).length,
          durationMin: Math.max(1, Math.round((end.getTime() - new Date(s.startedAt).getTime()) / 60000)),
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
