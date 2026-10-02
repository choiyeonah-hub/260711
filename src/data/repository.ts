import type { AppData } from '../types'

// 데이터 접근 계층. 지금은 브라우저 IndexedDB에 문서 하나로 저장한다.
// Supabase 등으로 옮길 때는 이 인터페이스를 구현한 RemoteRepository로 교체한다.
export interface Repository {
  load(): Promise<AppData | null>
  save(data: AppData): Promise<void>
}

const DB_NAME = 'home-medicine'
const STORE = 'kv'
const KEY = 'appData'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const localRepository: Repository = {
  async load() {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as AppData) ?? null)
      req.onerror = () => reject(req.error)
    })
  },
  async save(data) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}
