import type { AppData, Reminder } from '../types'
import { daysUntil, formatMD } from './dates'

// 알림 계산 규칙 (Push 연동 시에도 이 함수를 그대로 재사용)
// - 유효기간: 30일 이내 / 7일 이내 / 만료 단계별 1회
// - 진료/처방 예정일: 7일 이내 / 당일
export function computeReminders(d: AppData, householdId: string): Reminder[] {
  const out: Reminder[] = []
  for (const m of d.medicines) {
    if (m.householdId !== householdId || !m.expirationDate) continue
    const n = daysUntil(m.expirationDate)
    const stage = n < 0 ? 'expired' : n <= 7 ? 'd7' : n <= 30 ? 'd30' : null
    if (!stage) continue
    out.push({
      id: `exp:${m.id}:${m.expirationDate}:${stage}`,
      householdId, type: 'expiry', targetId: m.id, dueDate: m.expirationDate, daysLeft: n, urgent: n <= 7,
      message: n < 0 ? `${m.name}의 유효기간이 지났습니다.` : `${m.name}의 유효기간이 ${n}일 남았습니다.`,
    })
  }
  for (const a of upcomingAppointments(d, householdId)) {
    if (a.daysLeft < 0 || a.daysLeft > 7) continue
    out.push({
      id: `appt:${a.memberId}:${a.date}:${a.daysLeft === 0 ? 'd0' : 'd7'}`,
      householdId, type: 'appointment', targetId: a.memberId, dueDate: a.date, daysLeft: a.daysLeft, urgent: a.daysLeft <= 3,
      message: a.daysLeft === 0
        ? `오늘은 ${a.memberName}의 다음 진료/처방 예정일입니다.`
        : `${a.memberName}의 다음 진료/처방 예정일(${formatMD(a.date)})이 ${a.daysLeft}일 남았습니다.`,
    })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export interface Appointment {
  memberId: string
  memberName: string
  date: string
  daysLeft: number
  medicines: string[]
}

// 처방약에 입력된 '다음 진료/처방 예정일'을 가족+날짜로 묶는다
export function upcomingAppointments(d: AppData, householdId: string): Appointment[] {
  const map = new Map<string, Appointment>()
  for (const m of d.medicines) {
    if (m.householdId !== householdId || !m.isPrescription || !m.nextAppointmentDate) continue
    const member = d.familyMembers.find((f) => f.id === m.familyMemberId)
    const memberId = member?.id ?? 'none'
    const key = `${memberId}|${m.nextAppointmentDate}`
    const a = map.get(key) ?? {
      memberId, memberName: member?.name ?? '가족 미지정', date: m.nextAppointmentDate,
      daysLeft: daysUntil(m.nextAppointmentDate), medicines: [],
    }
    a.medicines.push(m.name)
    map.set(key, a)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}
