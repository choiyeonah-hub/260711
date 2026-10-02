import { useMemo, useState } from 'react'
import { NavCtx, type Nav, type Route, type Tab } from './nav'
import { Home } from './screens/Home'
import { MedicineForm } from './screens/MedicineForm'
import { PhotoRegister } from './screens/PhotoRegister'
import { MedicineDetail, PharmacistList, Preparedness, SafetyCheck } from './screens/Safety'
import { Cabinet, MedicineList, Notifications, Schedule } from './screens/Browse'
import { SessionBar, SessionStart, SessionSummary, SurveyScreen } from './screens/Session'
import { NewHousehold, Settings } from './screens/Settings'

const TABS: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: '홈', icon: '🏠' },
  { tab: 'cabinet', label: '약장', icon: '🗄️' },
  { tab: 'add', label: '약등록', icon: '+' },
  { tab: 'schedule', label: '일정', icon: '📅' },
  { tab: 'settings', label: '설정', icon: '⚙️' },
]

export default function App() {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }])
  const [key, setKey] = useState(0) // 같은 화면 재진입 시 상태 초기화용
  const route = stack[stack.length - 1]

  const nav = useMemo<Nav>(() => {
    const go = (fn: (s: Route[]) => Route[]) => {
      setStack(fn)
      setKey((k) => k + 1)
      window.scrollTo({ top: 0 })
    }
    return {
      push: (r) => go((s) => [...s, r]),
      back: () => go((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      replace: (r) => go((s) => [...s.slice(0, -1), r]),
      tab: (t) => go(() => (t === 'add' ? [{ name: 'home' }, { name: 'add' }] : [{ name: t }])),
    }
  }, [])

  const activeTab: Tab = route.name === 'add' ? 'add' : (stack[0].name as Tab)

  return (
    <NavCtx.Provider value={nav}>
      <SessionBar />
      <main key={key}>{renderRoute(route)}</main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.tab} className={`tab ${t.tab === 'add' ? 'tab-add' : ''} ${activeTab === t.tab ? 'on' : ''}`} onClick={() => nav.tab(t.tab)}>
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </NavCtx.Provider>
  )
}

function renderRoute(r: Route) {
  switch (r.name) {
    case 'home': return <Home />
    case 'cabinet': return <Cabinet />
    case 'schedule': return <Schedule />
    case 'settings': return <Settings />
    case 'add': return <PhotoRegister />
    case 'edit': return <MedicineForm id={r.id} />
    case 'list': return <MedicineList title={r.title} filter={r.filter} />
    case 'notifications': return <Notifications />
    case 'sessionStart': return <SessionStart />
    case 'sessionSummary': return <SessionSummary id={r.id} />
    case 'survey': return <SurveyScreen sessionId={r.sessionId} />
    case 'newHousehold': return <NewHousehold />
    case 'detail': return <MedicineDetail id={r.id} />
    case 'safety': return <SafetyCheck />
    case 'questions': return <PharmacistList />
    case 'prep': return <Preparedness />
  }
}
