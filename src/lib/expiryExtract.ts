import { parseExpiryInput } from './dates'

// OCR 텍스트에서 유효기간(사용기한) 후보를 찾는다. 결과는 반드시 사람이 확인한다.
// 규칙: EXP/사용기한/유효기간/까지 근처 날짜 우선, 제조일자 근처 날짜 제외, 없으면 가장 늦은 날짜.
const DATE_RE = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})(?:\s*[.\-/월]\s*(\d{1,2}))?|(?<!\d)(20\d{2})(\d{2})(\d{2})?(?!\d)|(?<!\d)(\d{2})[.\-/](\d{2})[.\-/](\d{2})(?!\d)/g
const EXP_KEY = /(exp|사용\s*기한|유효\s*기간|사용\s*기간|까지)/i
const MFG_KEY = /(mfg|mfd|제조\s*(일|년|연월))/i

export function extractExpiry(text: string): string | null {
  const found: { value: string; prio: number }[] = []
  for (const m of text.matchAll(DATE_RE)) {
    let raw: string
    if (m[1]) raw = [m[1], m[2], m[3]].filter(Boolean).join('.')
    else if (m[4]) raw = [m[4], m[5], m[6]].filter(Boolean).join('.')
    else raw = [m[7], m[8], m[9]].join('.')
    const value = parseExpiryInput(raw)
    if (!value) continue
    const before = text.slice(Math.max(0, m.index! - 14), m.index!)
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 4)
    if (MFG_KEY.test(before) && !EXP_KEY.test(before.slice(-6))) continue
    found.push({ value, prio: EXP_KEY.test(before) || /까지/.test(after) ? 1 : 0 })
  }
  if (!found.length) return null
  found.sort((a, b) => b.prio - a.prio || b.value.localeCompare(a.value))
  return found[0].value
}
