import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppData } from '../types'
import { emptyData } from './defaults'
import { localRepository as repo } from './repository'
import { addSampleHousehold } from './sample'

interface Store {
  data: AppData
  update: (fn: (d: AppData) => AppData) => void
  replaceAll: (d: AppData) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef<AppData | null>(null)

  useEffect(() => {
    repo.load()
      .then((loaded) => {
        // 첫 실행에는 화면 확인용 샘플 가정을 넣는다 (설정에서 삭제 가능)
        const d = loaded ?? addSampleHousehold(emptyData())
        latest.current = d
        setData(d)
        if (!loaded) repo.save(d)
      })
      .catch((e) => setError(String(e)))
    // 저장공간 자동 정리(특히 iOS Safari) 가능성을 줄이기 위해 영구 저장 요청
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  const commit = useCallback((next: AppData) => {
    latest.current = next
    setData(next)
    repo.save(next).catch((e) => alert('저장 실패: ' + e))
  }, [])

  const update = useCallback((fn: (d: AppData) => AppData) => commit(fn(latest.current!)), [commit])

  if (error) return <div className="center-msg">데이터를 불러오지 못했습니다.<br />{error}</div>
  if (!data) return <div className="center-msg">불러오는 중…</div>
  return <Ctx.Provider value={{ data, update, replaceAll: commit }}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

// 현재 가정 기준 조회 헬퍼
export function useHousehold() {
  const { data } = useStore()
  const hid = data.currentHouseholdId
  const household = data.households.find((h) => h.id === hid) ?? null
  return {
    household,
    members: data.familyMembers.filter((m) => m.householdId === hid).sort((a, b) => a.order - b.order),
    medicines: data.medicines.filter((m) => m.householdId === hid),
    locations: data.storageLocations.filter((l) => l.householdId === hid),
    categories: [...data.categories].sort((a, b) => a.order - b.order),
  }
}
