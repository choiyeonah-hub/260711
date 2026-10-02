import { useEffect, useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { markRemindersRead, setLocationType } from '../data/actions'
import { PRODUCT_TYPES, PRODUCT_TYPE_LABEL, STORAGE_TYPES, type ProductType, type StorageType } from '../types'
import { productTypeOf } from '../data/medicineMeta'
import { CategoryIcon } from '../components/icons'
import { CalendarClock, Hourglass, MapPin } from 'lucide-react'
import { dday, expiryStatus, formatMD, isSoon } from '../lib/dates'
import { computeReminders, upcomingAppointments } from '../lib/reminders'
import { useNav, type ListFilter } from '../nav'
import { Empty, Header, MedicineCard, sortMedicines } from '../components/ui'

type CabinetFilter = 'ALL' | ProductType
const FILTERS: [CabinetFilter, string][] = [['ALL', '전체'], ['MEDICINE', '의약품'], ['SUPPLEMENT', '영양제'], ['MEDICAL_SUPPLY', '의료용품']]
let lastFilter: CabinetFilter = 'ALL' // 상세 화면에서 돌아와도 선택 유지

export function Cabinet() {
  const nav = useNav()
  const { update } = useStore()
  const { categoriesOf, medicines: all, locations } = useHousehold()
  const [filter, setFilterState] = useState<CabinetFilter>(lastFilter)
  const setFilter = (f: CabinetFilter) => { lastFilter = f; setFilterState(f) }
  const medicines = filter === 'ALL' ? all : all.filter((m) => productTypeOf(m) === filter)
  const usedLocs = locations
    .map((l) => ({ l, n: medicines.filter((m) => m.storageLocationId === l.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.l.name.localeCompare(b.l.name, 'ko'))

  const section = (kind: ProductType, withTitle: boolean) => {
    const cats = categoriesOf(kind)
    const items = all.filter((m) => productTypeOf(m) === kind)
    if (filter === 'ALL' && kind !== 'MEDICINE' && items.length === 0) return null
    return (
      <section key={kind}>
        {withTitle && <p className="section-title">{PRODUCT_TYPE_LABEL[kind]} <span className="count">{items.length}</span></p>}
        <div className="cat-cards">
          {cats.map((c) => {
            const ms = items.filter((m) => m.categoryId === c.id)
            const alert = ms.some((m) => expiryStatus(m.expirationDate) === 'expired')
            return (
              <button key={c.id} className={`card cat-card ${ms.length ? '' : 'zero'}`} onClick={() => nav.push({ name: 'list', title: c.name, filter: { categoryId: c.id } })}>
                <CategoryIcon id={c.id} className="cat-icon" size={22} strokeWidth={1.75} />
                <span className="cat-name">{c.name}</span>
                <b className="cat-count">{ms.length}</b>
                {alert && <span className="badge badge-expired">만료 있음</span>}
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="screen">
      <Header title="약장 보기" />
      <div className="segmented" role="tablist">
        {FILTERS.map(([f, label]) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>
      {filter === 'ALL' ? PRODUCT_TYPES.map((k) => section(k, true)) : section(filter, false)}
      {usedLocs.length > 0 && (
        <>
          <p className="section-title">보관 위치별</p>
          {usedLocs.map(({ l, n }) => (
            <div key={l.id} className="card row-card">
              <button className="grow left with-icon" onClick={() => nav.push({ name: 'list', title: l.name, filter: { locationId: l.id } })}>
                <MapPin size={18} className="muted" aria-hidden />{l.name} <b className="loc-count">{n}</b>
              </button>
              <select
                className="type-select"
                aria-label="수납 방식"
                value={l.storageType ?? ''}
                onChange={(e) => update((d) => setLocationType(d, l.id, (e.target.value || undefined) as StorageType | undefined))}
              >
                <option value="">수납 방식</option>
                {STORAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export function MedicineList({ title, filter }: { title: string; filter: ListFilter }) {
  const { medicines, members } = useHousehold()
  const sharedIds = new Set(members.filter((m) => m.isShared).map((m) => m.id))
  const list = sortMedicines(
    medicines.filter((m) => {
      const st = expiryStatus(m.expirationDate)
      if (filter.categoryId && m.categoryId !== filter.categoryId) return false
      if (filter.memberId && m.familyMemberId !== filter.memberId) return false
      if (filter.shared && m.familyMemberId && !sharedIds.has(m.familyMemberId)) return false
      if (filter.locationId && m.storageLocationId !== filter.locationId) return false
      if (filter.expiry === 'soon' && !isSoon(st)) return false
      if (filter.expiry === 'expired' && st !== 'expired') return false
      if (filter.expiry === 'attention' && !(isSoon(st) || st === 'expired')) return false
      return true
    }),
  )
  return (
    <div className="screen">
      <Header title={title} back />
      <p className="section-title">{list.length}개</p>
      {list.length ? list.map((m) => <MedicineCard key={m.id} m={m} />) : <Empty>해당하는 약이 없습니다.</Empty>}
    </div>
  )
}

export function Schedule() {
  const nav = useNav()
  const { data } = useStore()
  const { household, medicines } = useHousehold()
  if (!household) return null
  const appts = upcomingAppointments(data, household.id)
  const future = appts.filter((a) => a.daysLeft >= 0)
  const past = appts.filter((a) => a.daysLeft < 0)
  const rxNoDate = medicines.filter((m) => m.isPrescription && !m.nextAppointmentDate)
  const attention = medicines.filter((m) => { const s = expiryStatus(m.expirationDate); return isSoon(s) || s === 'expired' }).length

  const Item = ({ a }: { a: (typeof appts)[number] }) => (
    <button className="card appt" onClick={() => nav.push({ name: 'list', title: `${a.memberName} 약`, filter: { memberId: a.memberId } })}>
      <div>
        <div className="appt-who">{a.memberName}</div>
        <div>{formatMD(a.date)}</div>
        <div className="muted small">다음 진료/처방 예정 · {a.medicines.join(', ')}</div>
      </div>
      <div className={`dday ${a.daysLeft >= 0 && a.daysLeft <= 3 ? 'urgent' : ''} ${a.daysLeft < 0 ? 'past' : ''}`}>{dday(a.daysLeft)}</div>
    </button>
  )

  return (
    <div className="screen">
      <Header title="일정" />
      <p className="section-title">다음 진료/처방 예정일</p>
      {future.length ? future.map((a) => <Item key={a.memberId + a.date} a={a} />) : <Empty>예정된 일정이 없습니다.</Empty>}
      {past.length > 0 && (
        <>
          <p className="section-title">지난 예정일 — 새 날짜로 수정 필요</p>
          {past.map((a) => <Item key={a.memberId + a.date} a={a} />)}
        </>
      )}
      {rxNoDate.length > 0 && <p className="muted small pad">예정일이 입력되지 않은 처방약 {rxNoDate.length}개</p>}
      <p className="section-title">유효기간</p>
      <button className="card row-card" onClick={() => nav.push({ name: 'list', title: '유효기간 확인 필요', filter: { expiry: 'attention' } })}>
        <span className="with-icon"><Hourglass size={20} className="muted" aria-hidden />유효기간 임박·만료 품목</span><b className={attention ? 'warn-text' : ''}>{attention}</b>
      </button>
    </div>
  )
}

export function Notifications() {
  const nav = useNav()
  const { data, update } = useStore()
  const { household } = useHousehold()
  const reminders = household ? computeReminders(data, household.id) : []
  const [readSnapshot] = useState(data.readReminderIds)
  // 열어본 시점에 모두 읽음 처리 (표시는 이번 화면에서는 새 알림 강조 유지)
  useEffect(() => {
    const ids = reminders.map((r) => r.id).filter((id) => !readSnapshot.includes(id))
    if (ids.length) update((d) => markRemindersRead(d, ids))
  }, [])
  return (
    <div className="screen">
      <Header title="알림" back />
      {reminders.length === 0 && <Empty>새 알림이 없습니다.</Empty>}
      {reminders.map((r) => (
        <button
          key={r.id}
          className={`card notice ${r.urgent ? 'urgent' : ''} ${readSnapshot.includes(r.id) ? '' : 'unread'}`}
          onClick={() => (r.type === 'expiry' ? nav.push({ name: 'detail', id: r.targetId }) : nav.tab('schedule'))}
        >
          {r.type === 'expiry' ? <Hourglass size={20} aria-hidden className={r.urgent ? 'amber' : 'muted'} /> : <CalendarClock size={20} aria-hidden className="muted" />}
          <span className="grow">{r.message}</span>
        </button>
      ))}
      <p className="muted small pad">현재는 앱 안에서만 알림을 보여줍니다. (휴대폰 푸시 알림은 추후 지원)</p>
    </div>
  )
}
