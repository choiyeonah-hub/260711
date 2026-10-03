import { useState } from 'react'
import { Check, Printer, Share2 } from 'lucide-react'
import { useHousehold, useStore } from '../data/store'
import { setMemberNote } from '../data/actions'
import { identificationOf, ingredientsOf, isMedicine, productTypeOf } from '../data/medicineMeta'
import { expiryStatus, formatExp, todayStr } from '../lib/dates'
import { PRODUCT_TYPE_SHORT, type Medicine } from '../types'
import { Empty, Header } from '../components/ui'

// 진료 때 의사에게 보여드리는 '우리집 약 리포트' (가족 1명 기준)
// 앱은 판단 문구를 만들지 않는다: 등록된 사실(같은 성분 제품 수, 복용 여부 기록, 만료 등) + 간호사가 쓴 메모만 담는다.

const USE_LABEL = { IN_USE: '복용 중', NOT_IN_USE: '복용 안 함', UNKNOWN: '확인 필요' } as const

function ItemRows({ items, extra }: { items: Medicine[]; extra?: (m: Medicine) => string }) {
  return (
    <ul className="report-list">
      {items.map((m) => (
        <li key={m.id}>
          <b>{m.name}</b>
          <span className="muted">{[ingredientsOf(m).join(', '), m.quantity, extra?.(m)].filter(Boolean).join(' · ')}</span>
        </li>
      ))}
    </ul>
  )
}

export function VisitReport({ memberId }: { memberId: string }) {
  const { data, update } = useStore()
  const { household, members, medicines } = useHousehold()
  const member = members.find((m) => m.id === memberId)
  const [note, setNote] = useState(member?.reportNote ?? '')
  const [saved, setSaved] = useState(false)
  if (!household || !member) return <div className="screen"><Header title="진료용 리포트" back /><Empty>가족 정보를 찾을 수 없습니다.</Empty></div>

  const sharedIds = new Set(members.filter((m) => m.isShared).map((m) => m.id))
  const isShared = (m: Medicine) => !m.familyMemberId || sharedIds.has(m.familyMemberId)
  const own = medicines.filter((m) => m.familyMemberId === memberId)
  const rx = own.filter((m) => isMedicine(m) && m.isPrescription)
  const ownOther = own.filter((m) => !(isMedicine(m) && m.isPrescription) && productTypeOf(m) !== 'MEDICAL_SUPPLY')
  const shared = medicines.filter((m) => isShared(m) && !m.isPrescription && productTypeOf(m) !== 'MEDICAL_SUPPLY')
  const unownedRx = medicines.filter((m) => isShared(m) && isMedicine(m) && m.isPrescription) // 누구 약인지 모르는 처방약
  const pool = [...rx, ...ownOther, ...shared, ...unownedRx] // 이 분이 드실 수 있는 집 안 품목

  // 사실 확인 항목
  const byIng = new Map<string, Medicine[]>()
  for (const m of pool.filter(isMedicine)) for (const ing of ingredientsOf(m)) byIng.set(ing, [...(byIng.get(ing) ?? []), m])
  const dupes = [...byIng.entries()].filter(([, ms]) => ms.length >= 2)
  const facts: string[] = [
    ...dupes.map(([ing, ms]) => `${ing} 성분이 든 제품 ${ms.length}개: ${ms.map((m) => m.name).join(', ')}`),
    ...unownedRx.map((m) => `누구 약인지 확인 필요한 처방약: ${m.name}`),
    ...rx.filter((m) => (m.currentUseStatus ?? 'UNKNOWN') === 'UNKNOWN').map((m) => `복용 여부 확인 필요: ${m.name}`),
    ...rx.filter((m) => m.currentUseStatus === 'NOT_IN_USE').map((m) => `복용 안 함으로 기록된 처방약: ${m.name}`),
    ...pool.filter((m) => expiryStatus(m.expirationDate) === 'expired').map((m) => `유효기간 지남: ${m.name} (${formatExp(m.expirationDate!)})`),
  ]
  const unidentified = pool.filter((m) => isMedicine(m) && identificationOf(m) === 'UNVERIFIED').length
  const questions = data.pharmacistQuestions.filter(
    (q) => q.householdId === household.id && !q.done && (q.medicineIds.length === 0 || q.medicineIds.some((id) => pool.some((m) => m.id === id))),
  )
  const nextAppt = rx.map((m) => m.nextAppointmentDate).filter((d): d is string => !!d && d >= todayStr()).sort()[0]

  const line = (m: Medicine) => {
    const ings = ingredientsOf(m)
    return [m.name, ings.length ? `(${ings.join(', ')})` : '', m.quantity ? `· ${m.quantity}` : ''].filter(Boolean).join(' ')
  }

  function shareText() {
    const sec = (title: string, rows: string[]) => (rows.length ? `\n[${title}]\n${rows.map((r) => `- ${r}`).join('\n')}\n` : '')
    return `${member!.name} 진료용 약 리포트 (${household!.name}, ${formatExp(todayStr())})\n` +
      (nextAppt ? `다음 진료/처방 예정일: ${formatExp(nextAppt)}\n` : '') +
      sec('처방약', rx.map((m) => `${line(m)} · ${USE_LABEL[m.currentUseStatus ?? 'UNKNOWN']}`)) +
      sec('확인이 필요한 사실', facts) +
      (note.trim() ? `\n[간호사 메모]\n${note.trim()}\n` : '') +
      sec('본인 일반약·영양제', ownOther.map((m) => `${line(m)} · ${PRODUCT_TYPE_SHORT[productTypeOf(m)]}`)) +
      sec('집의 공용 상비약', shared.map(line)) +
      sec('의료진에게 확인할 것', questions.map((q) => `${q.title} — ${q.detail}`)) +
      '\n가족이 보관 중인 품목을 정리한 기록입니다. 복용·중단·용량 판단은 진료 의사가 합니다.'
  }

  async function share() {
    const text = shareText()
    try {
      if (navigator.share) await navigator.share({ title: `${member!.name} 진료용 약 리포트`, text })
      else { await navigator.clipboard.writeText(text); alert('복사했습니다. 메신저에 붙여넣기 하세요.') }
    } catch { /* 취소 */ }
  }

  return (
    <div className="screen print-area">
      <Header title={`${member.name} 진료용 약 리포트`} back />
      <p className="muted pad">{household.name} · 작성일 {formatExp(todayStr())}{nextAppt && ` · 다음 진료/처방 예정일 ${formatExp(nextAppt)}`}</p>

      <section className="card">
        <p className="report-h">처방약 {rx.length}개</p>
        {rx.length ? <ItemRows items={rx} extra={(m) => USE_LABEL[m.currentUseStatus ?? 'UNKNOWN']} /> : <p className="muted">등록된 처방약이 없습니다.</p>}
      </section>

      <section className="card">
        <p className="report-h">확인이 필요한 사실</p>
        {facts.length ? <ul className="report-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="muted">해당 없음</p>}
        {unidentified > 0 && <p className="muted small">제품이 확인되지 않은 약 {unidentified}개는 성분 비교에서 빠져 있습니다.</p>}
      </section>

      <section className="card">
        <p className="report-h">간호사 메모</p>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false) }}
          placeholder="예: 아세트아미노펜 함유 제품이 여러 개라 하루 총량 확인을 부탁드립니다."
        />
        <button className="btn btn-outline full no-print" style={{ marginTop: 8 }} onClick={() => { update((d) => setMemberNote(d, member.id, note)); setSaved(true) }}>
          {saved ? <><Check size={18} aria-hidden /> 저장됨</> : '메모 저장'}
        </button>
      </section>

      {ownOther.length > 0 && (
        <section className="card">
          <p className="report-h">본인 일반약·영양제 {ownOther.length}개</p>
          <ItemRows items={ownOther} extra={(m) => PRODUCT_TYPE_SHORT[productTypeOf(m)]} />
        </section>
      )}

      <section className="card">
        <p className="report-h">집의 공용 상비약 {shared.length}개</p>
        {shared.length ? <ItemRows items={shared} /> : <p className="muted">없음</p>}
      </section>

      {questions.length > 0 && (
        <section className="card">
          <p className="report-h">의료진에게 확인할 것</p>
          <ol className="report-facts">{questions.map((q) => <li key={q.id}><b>{q.title}</b> — {q.detail}</li>)}</ol>
        </section>
      )}

      <p className="muted small pad">가족이 보관 중인 품목을 정리한 기록입니다. 복용·중단·용량 판단은 진료 의사가 합니다.</p>
      <div className="row-2 no-print">
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={20} aria-hidden /> 인쇄/PDF</button>
        <button className="btn btn-primary" onClick={share}><Share2 size={20} aria-hidden /> 공유</button>
      </div>
    </div>
  )
}
