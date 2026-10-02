import { createContext, useContext } from 'react'

export interface ListFilter {
  categoryId?: string
  memberId?: string
  shared?: boolean // 공용 + 가족 미지정
  locationId?: string
  expiry?: 'soon' | 'expired' | 'attention'
}

export type Route =
  | { name: 'home' }
  | { name: 'cabinet' }
  | { name: 'schedule' }
  | { name: 'settings' }
  | { name: 'add' }
  | { name: 'edit'; id: string }
  | { name: 'list'; title: string; filter: ListFilter }
  | { name: 'notifications' }
  | { name: 'sessionStart' }
  | { name: 'sessionSummary'; id: string }
  | { name: 'survey'; sessionId: string | null }
  | { name: 'newHousehold' }
  | { name: 'detail'; id: string }
  | { name: 'safety' }
  | { name: 'questions' }
  | { name: 'prep' }

export type Tab = 'home' | 'cabinet' | 'add' | 'schedule' | 'settings'

export interface Nav {
  push: (r: Route) => void
  back: () => void
  replace: (r: Route) => void
  tab: (t: Tab) => void
}

export const NavCtx = createContext<Nav | null>(null)
export const useNav = () => useContext(NavCtx)!
