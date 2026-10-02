import { useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { activeSession } from '../data/actions'
import { dday, expiryStatus, formatMD, isSoon } from '../lib/dates'
import { computeReminders, upcomingAppointments } from '../lib/reminders'
import { useNav } from '../nav'
import { Bell, BriefcaseMedical, ChevronDown, ClipboardList, House, ListChecks, Search, ShieldCheck, X } from 'lucide-react'
import { PRODUCT_TYPES, PRODUCT_TYPE_SHORT } from '../types'
import { isMedicine, productTypeOf } from '../data/medicineMeta'
import { safetyInfo } from '../services/safety'
import { PREPAREDNESS_ITEMS, preparednessStatus } from '../services/preparedness'
import { Empty, MedicineCard, sortMedicines } from '../components/ui'

export function Home() {
  const nav = useNav()
  const { data } = useStore()
  const { household, members, medicines, categories, locations } = useHousehold()
  const [q, setQ] = useState('')

  if (!household) {
    return (
      <div className="screen">
        <Empty>
          등록된 가정이 없습니다.
          <button className="btn btn-primary" onClick={() => nav.push({ name: 'newHousehold' })}>가정 만들기</button>
        </Empty>
      </div>
    )
  }

  const unread = computeReminders(data, household.id).filter((r) => !data.readReminderIds.includes(r.id)).length
  const statuses = medicines.map((m) => expiryStatus(m.expirationDate))
  const soon = statuses.filter(isSoon).length
  const expired = statuses.filter((s) => s === 'expired').length
  const appts = upcomingAppointments(data, household.id).filter((a) => a.daysLeft >= 0)
  const session = activeSession(data, household.id)
  const critical = safetyInfo.checkInventory(medicines).findings.filter((f) => f.info.level === 'CRITICAL').length
  const missing = PREPAREDNESS_ITEMS.filter((i) => preparednessStatus(data, household.id, medicines, i) === 'MISSING').length
  const openQs = data.pharmacistQuestions.filter((q) => q.householdId === household.id && !q.done).length

  // 검색: 제품명 / 분류명 / 보관 위치 / 가족 이름
  const query = q.trim().toLowerCase()
  const results = query
    ? sortMedicines(
        medicines.filter((m) => {
          const cat = categories.find((c) => c.id === m.categoryId)?.name ?? ''
          const loc = locations.find((l) => l.id === m.storageLocationId)?.name ?? ''
          const mem = members.find((f) => f.id === m.familyMemberId)?.name ?? ''
          return [m.name, cat, loc, mem].some((s) => s.toLowerCase().includes(query))
        }),
      )
    : []

  const people = members.filter((m) => !m.isShared)
  const sharedIds = new Set(members.filter((m) => m.isShared).map((m) => m.id))
  const sharedMeds = medicines.filter((m) => isMedicine(m) && (!m.familyMemberId || sharedIds.has(m.familyMemberId)))
  const typeCounts = PRODUCT_TYPES.map((t) => [t, medicines.filter((m) => productTypeOf(m) === t).length] as const)
  const multiType = typeCounts.filter(([, n]) => n > 0).length > 1

  return (
    <div className="screen">
      <header className="home-head">
        <button className="household-btn" onClick={() => nav.tab('settings')}>
          <House size={22} strokeWidth={1.9} aria-hidden /> {household.name} <ChevronDown size={18} className="muted" aria-hidden />
        </button>
        <button className="icon-btn bell" onClick={() => nav.push({ name: 'notifications' })} aria-label="알림">
          <Bell size={24} strokeWidth={1.9} />{unread > 0 && <span className="dot">{unread}</span>}
        </button>
      </header>

      <div className="search">
        <Search size={20} className="muted" aria-hidden />
        <input
          type="search"
          placeholder="이름 · 분류 · 위치 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        {q && <button className="clear" onClick={() => setQ('')} aria-label="지우기"><X size={20} /></button>}
      </div>

      {query ? (
        <section>
          <p className="section-title">검색 결과 {results.length}개</p>
          {results.length ? results.map((m) => <MedicineCard key={m.id} m={m} />) : <Empty>‘{q}’와 일치하는 품목이 없습니다.</Empty>}
        </section>
      ) : (
        <>
          <div className="stats">
            <button className="stat" onClick={() => nav.push({ name: 'list', title: multiType ? '등록 품목 전체' : '전체 의약품', filter: {} })}>
              <b>{medicines.length}</b><span>{multiType ? '등록 품목' : '총 의약품'}</span>
            </button>
            <button className={`stat ${soon ? 'warn' : ''}`} onClick={() => nav.push({ name: 'list', title: '유효기간 임박 (90일 이내)', filter: { expiry: 'soon' } })}>
              <b>{soon}</b><span>유효기간 임박</span>
            </button>
            <button className={`stat ${expired ? 'danger' : ''}`} onClick={() => nav.push({ name: 'list', title: '유효기간 만료', filter: { expiry: 'expired' } })}>
              <b>{expired}</b><span>만료</span>
            </button>
          </div>
          {multiType && (
            <p className="type-breakdown">
              {typeCounts.filter(([, n]) => n > 0).map(([t, n]) => `${PRODUCT_TYPE_SHORT[t]} ${n}`).join(' · ')}
            </p>
          )}

          <div className="tool-grid">
            <button className="card tool" onClick={() => nav.push({ name: 'safety' })}>
              <ShieldCheck className="tool-icon" size={26} strokeWidth={1.75} aria-hidden />
              <span>약장 안전확인</span>
              {critical > 0 ? <span className="pill danger">확인 {critical}</span> : <span className="pill">이상 없음</span>}
            </button>
            <button className="card tool" onClick={() => nav.push({ name: 'prep' })}>
              <BriefcaseMedical className="tool-icon" size={26} strokeWidth={1.75} aria-hidden />
              <span>우리집 준비 체크</span>
              {missing > 0 ? <span className="pill warn">없음 {missing}</span> : <span className="pill">보기</span>}
            </button>
            <button className="card tool" onClick={() => nav.push({ name: 'questions' })}>
              <ClipboardList className="tool-icon" size={26} strokeWidth={1.75} aria-hidden />
              <span>약사 확인 목록</span>
              <span className="pill">{openQs}건</span>
            </button>
          </div>

          {session ? (
            <button className="card session-cta active" onClick={() => nav.push({ name: 'add' })}>
              <ListChecks size={22} aria-hidden /> 약장 정리 진행 중 · 등록 계속하기
            </button>
          ) : (
            <button className="card session-cta" onClick={() => nav.push({ name: 'sessionStart' })}>
              <ListChecks size={22} aria-hidden /> 약장 정리 시작
            </button>
          )}

          <p className="section-title">다가오는 진료/처방 일정</p>
          {appts.length ? (
            appts.slice(0, 2).map((a) => (
              <button key={a.memberId + a.date} className="card appt" onClick={() => nav.tab('schedule')}>
                <div>
                  <div className="appt-who">{a.memberName}</div>
                  <div>{formatMD(a.date)}</div>
                  <div className="muted small">다음 진료/처방 예정</div>
                </div>
                <div className={`dday ${a.daysLeft <= 3 ? 'urgent' : ''}`}>{dday(a.daysLeft)}</div>
              </button>
            ))
          ) : (
            <div className="card muted">입력된 다음 진료/처방 예정일이 없습니다.</div>
          )}

          <p className="section-title">우리 가족 약장</p>
          <div className="family-grid">
            {people.map((p) => {
              const rx = medicines.filter((m) => m.familyMemberId === p.id && m.isPrescription)
              const next = appts.find((a) => a.memberId === p.id)
              return (
                <button key={p.id} className="card family" onClick={() => nav.push({ name: 'list', title: `${p.name} 약`, filter: { memberId: p.id } })}>
                  <div className="family-name">{p.name}</div>
                  <div>처방약 {rx.length}개</div>
                  <div className={next && next.daysLeft <= 3 ? 'warn-text small' : 'muted small'}>{next ? `다음 진료/처방 ${dday(next.daysLeft)}` : '예정일 미입력'}</div>
                </button>
              )
            })}
            <button className="card family" onClick={() => nav.push({ name: 'list', title: '공용 상비약', filter: { shared: true } })}>
              <div className="family-name">공용 상비약</div>
              <div>{sharedMeds.length}개</div>
              {(() => {
                const n = sharedMeds.filter((m) => isSoon(expiryStatus(m.expirationDate))).length
                return <div className={n ? 'warn-text small' : 'muted small'}>유효기간 임박 {n}개</div>
              })()}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
