import { useEffect, useState } from 'react'
import type { Medicine } from '../types'
import type { ProductRecord } from './mockMedicineDb'

// 식약처 DUR API 클라이언트 (서버 /api/mfds 경유, 인증키는 서버에만 있음)
// 응답 형태는 server/mfds.ts 의 DurData 와 같다
export interface DurRow { ingr?: string; content?: string }
export interface DurCombo extends DurRow { mixIngr?: string; seqs: string[] }
export interface DurData { elderly: DurRow[]; dose: DurRow[]; split: DurRow[]; combos: DurCombo[]; truncated: boolean }

let available: Promise<boolean> | null = null
export function mfdsAvailable(): Promise<boolean> {
  available ??= fetch('/api/mfds')
    .then((r) => r.json())
    .then((j) => j?.available === true)
    .catch(() => false)
  return available
}

export async function searchMfds(q: string): Promise<ProductRecord[]> {
  const r = await fetch(`/api/mfds?q=${encodeURIComponent(q)}`)
  if (!r.ok) throw new Error(`mfds search ${r.status}`)
  return r.json()
}

// ---- DUR 정보: 품목별로 기기에 30일 보관 ----
const TTL = 30 * 24 * 60 * 60 * 1000
const mem = new Map<string, DurData>()
const cacheKey = (seq: string) => `dur:v1:${seq}`

export const durSeqOf = (m: Medicine) => (m.product?.source === 'mfds' ? m.product.externalId : undefined)

export function durOf(seq: string): DurData | undefined {
  if (mem.has(seq)) return mem.get(seq)
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(seq)) ?? 'null') as { at: number; data: DurData } | null
    if (c && Date.now() - c.at < TTL) {
      mem.set(seq, c.data)
      return c.data
    }
  } catch { /* 저장소 사용 불가 → 다시 받아옴 */ }
  return undefined
}

const inflight = new Map<string, Promise<void>>()
function loadOne(seq: string, name: string): Promise<void> {
  if (!inflight.has(seq)) {
    const p = fetch(`/api/mfds?seq=${encodeURIComponent(seq)}&name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`dur ${r.status}`))))
      .then((data: DurData) => {
        mem.set(seq, data)
        try { localStorage.setItem(cacheKey(seq), JSON.stringify({ at: Date.now(), data })) } catch { /* 용량 초과 등 */ }
      })
      .finally(() => inflight.delete(seq))
    inflight.set(seq, p)
  }
  return inflight.get(seq)!
}

// 화면에서 사용: 공식 DB와 연결된 약의 DUR 정보를 받아오고, 다 받으면 다시 그린다
export function useOfficialSafety(meds: Medicine[]): { loading: boolean; failed: number } {
  const need = meds
    .map((m) => ({ seq: durSeqOf(m), name: m.name }))
    .filter((x): x is { seq: string; name: string } => !!x.seq && !durOf(x.seq))
  const key = need.map((x) => x.seq).join(',')
  const [state, setState] = useState({ key: '', loading: false, failed: 0 })
  useEffect(() => {
    if (!key) return
    let alive = true
    setState({ key, loading: true, failed: 0 })
    Promise.allSettled(need.map((x) => loadOne(x.seq, x.name))).then((rs) => {
      if (alive) setState({ key, loading: false, failed: rs.filter((r) => r.status === 'rejected').length })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? { loading: state.loading, failed: state.failed } : { loading: !!key, failed: 0 }
}
