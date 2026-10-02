// 날짜 계산은 모두 로컬 날짜(자정 기준)로 한다.

export function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  // 'YYYY-MM'(월까지만 표기된 유효기간)은 그 달의 말일로 본다
  return d ? new Date(y, m - 1, d) : new Date(y, m, 0)
}

export function daysUntil(s: string, today = todayStr()): number {
  return Math.round((toDate(s).getTime() - toDate(today).getTime()) / 86400000)
}

export function addDays(n: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
  return todayStr(d)
}

export function addMonthsYm(n: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export type ExpiryStatus = 'none' | 'ok' | 'd90' | 'd30' | 'd7' | 'expired'

export function expiryStatus(exp: string | null, today = todayStr()): ExpiryStatus {
  if (!exp) return 'none'
  const n = daysUntil(exp, today)
  if (n < 0) return 'expired'
  if (n <= 7) return 'd7'
  if (n <= 30) return 'd30'
  if (n <= 90) return 'd90'
  return 'ok'
}

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  none: '유효기간 미입력',
  ok: '정상',
  d90: '90일 이내',
  d30: '30일 이내',
  d7: '7일 이내',
  expired: '만료',
}

export const isSoon = (s: ExpiryStatus) => s === 'd90' || s === 'd30' || s === 'd7'

export function formatExp(exp: string): string {
  return exp.replaceAll('-', '.')
}

export function formatMD(s: string): string {
  const d = toDate(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`
}

export function dday(n: number): string {
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`
}

// 현장 입력용: '2708', '202708', '2027.08', '20270815', '270815' 등을 받아 'YYYY-MM(-DD)'로
export function parseExpiryInput(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const parts = t.split(/[.\-/\s]+/).filter(Boolean)
  let y: number, m: number, d: number | undefined
  if (parts.length >= 2) {
    y = Number(parts[0]); m = Number(parts[1]); d = parts[2] ? Number(parts[2]) : undefined
  } else {
    const s = t.replace(/\D/g, '')
    if (s.length === 4) { y = Number(s.slice(0, 2)); m = Number(s.slice(2)) }
    else if (s.length === 6 && s.startsWith('20')) { y = Number(s.slice(0, 4)); m = Number(s.slice(4)) }
    else if (s.length === 6) { y = Number(s.slice(0, 2)); m = Number(s.slice(2, 4)); d = Number(s.slice(4)) }
    else if (s.length === 8) { y = Number(s.slice(0, 4)); m = Number(s.slice(4, 6)); d = Number(s.slice(6)) }
    else return null
  }
  if (y < 100) y += 2000
  if (!(y >= 2000 && y <= 2099 && m >= 1 && m <= 12)) return null
  if (d !== undefined) {
    if (!(d >= 1 && d <= new Date(y, m, 0).getDate())) return null
    return `${y}-${pad(m)}-${pad(d)}`
  }
  return `${y}-${pad(m)}`
}
