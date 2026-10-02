import { useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { addQuestion, deleteQuestion, setPreparedness, toggleQuestion } from '../data/actions'
import { IDENTIFICATION_LABEL, identificationOf, ingredientsOf } from '../data/medicineMeta'
import { EXPIRY_LABEL, expiryStatus, formatExp } from '../lib/dates'
import { LEVEL_META, TYPE_ICON, officialLabelUrl, safetyInfo } from '../services/safety'
import { PREPAREDNESS_ITEMS, PREP_LABEL, preparednessStatus } from '../services/preparedness'
import type { Medicine, SafetyFinding, SafetyInformation, SafetyLevel } from '../types'
import { useNav } from '../nav'
import { Empty, ExpiryBadge, Header, MedicineCard } from '../components/ui'

const LEVELS: SafetyLevel[] = ['CRITICAL', 'CAUTION', 'INFO']

const SAFETY_NOTE = '공식 자료의 내용을 옮겨 보여주는 정보입니다. 복용 여부·용량은 앱이 판단하지 않으며, 의사·약사와 상의하세요.'

// ---------------- 약 상세 ----------------
export function MedicineDetail({ id }: { id: string }) {
  const nav = useNav()
  const { data } = useStore()
  const { categories, locations, members } = useHousehold()
  const m = data.medicines.find((x) => x.id === id)
  if (!m) return <div className="screen"><Header title="약 정보" back /><Empty>삭제된 약입니다.</Empty></div>

  const cat = categories.find((c) => c.id === m.categoryId)
  const loc = locations.find((l) => l.id === m.storageLocationId)
  const member = members.find((f) => f.id === m.familyMemberId)
  const st = expiryStatus(m.expirationDate)
  const infos = safetyInfo.getForMedicine(m)
  const idStatus = identificationOf(m)
  const p = m.product

  return (
    <div className="screen">
      <Header title="약 정보" back right={<button className="chip" onClick={() => nav.push({ name: 'edit', id: m.id })}>수정</button>} />
      <div className="card detail-head">
        {m.photo && <img src={m.photo} alt="" className="detail-photo" />}
        <div className="med-name big">{m.name}{m.isPrescription && <span className="tag tag-rx">처방</span>}</div>
        <div className="med-loc">📍 {loc?.name ?? '-'}</div>
        <dl className="kv">
          <dt>분류</dt><dd>{cat?.icon} {cat?.name}</dd>
          <dt>가족</dt><dd>{member?.name ?? '-'}</dd>
          <dt>유효기간</dt><dd>{m.expirationDate ? `${formatExp(m.expirationDate)} · ${EXPIRY_LABEL[st]}` : '미입력'}</dd>
          {m.isPrescription && <><dt>다음 진료/처방 예정일</dt><dd>{m.nextAppointmentDate ? formatExp(m.nextAppointmentDate) : '미입력'}</dd></>}
          {p?.manufacturer && <><dt>제조사</dt><dd>{p.manufacturer}</dd></>}
          {(p?.strength || p?.dosageForm) && <><dt>함량·제형</dt><dd>{[p.strength, p.dosageForm].filter(Boolean).join(' · ')}</dd></>}
          {ingredientsOf(m).length > 0 && <><dt>성분</dt><dd>{ingredientsOf(m).join(', ')}</dd></>}
          <dt>제품 식별</dt><dd className={idStatus === 'UNVERIFIED' ? 'warn-text' : ''}>{IDENTIFICATION_LABEL[idStatus]}</dd>
        </dl>
        <ExpiryBadge status={st} />
      </div>

      <h2 className="section-h">💊 이 약을 드실 때 알아두세요</h2>
      {idStatus === 'UNVERIFIED' ? (
        <div className="card">
          <p>제품이 확인되지 않아 공식 안전정보를 연결할 수 없습니다.</p>
          <p className="muted small">수정 화면에서 제품명을 검색해 정확한 제품을 선택하면 연결됩니다.</p>
          <button className="btn btn-outline full" onClick={() => nav.push({ name: 'edit', id: m.id })}>제품 확인하기</button>
        </div>
      ) : (
        <>
          {infos.length === 0 && <div className="card muted">현재 연결된 공식 안전정보가 없습니다.</div>}
          {LEVELS.map((lv) => {
            const list = infos.filter((i) => i.level === lv)
            if (!list.length) return null
            return (
              <section key={lv} className={`safety-group lv-${lv}`}>
                <p className="safety-group-title">{LEVEL_META[lv].icon} {LEVEL_META[lv].label}</p>
                {list.map((info) => (
                  <SafetyCard key={info.id} info={info} meds={[m]} refKey={`${info.id}|${m.id}`} />
                ))}
              </section>
            )
          })}
          <a className="btn btn-outline full" href={officialLabelUrl(m.name)} target="_blank" rel="noreferrer">
            📄 식약처 공식 허가정보 · 이 제품의 허가된 용법·용량 보기
          </a>
        </>
      )}
      <p className="muted small pad">{SAFETY_NOTE}</p>
    </div>
  )
}

// 안전정보 카드: 공식정보 보기(펼치기) + 약사에게 확인할 목록에 추가
function SafetyCard({ info, meds, refKey, summary }: { info: SafetyInformation; meds: Medicine[]; refKey: string; summary?: string }) {
  const { data, update } = useStore()
  const { household } = useHousehold()
  const [open, setOpen] = useState(!summary)
  const added = data.pharmacistQuestions.some((q) => q.householdId === household?.id && q.refKey === refKey)
  return (
    <div className={`card safety-card lv-${info.level}`}>
      <div className="safety-title">{TYPE_ICON[info.type] ?? LEVEL_META[info.level].icon} {info.title}</div>
      {summary && <p>{summary}</p>}
      {open && (
        <div className="official">
          <p>{info.body}</p>
          <p className="muted small">출처: {info.source.name}{info.source.isMock && <span className="badge mock">예시 데이터</span>}</p>
        </div>
      )}
      <div className="row-2">
        {summary && <button className="btn btn-outline" onClick={() => setOpen(!open)}>{open ? '접기' : '공식정보 보기'}</button>}
        <button
          className="btn btn-outline small-btn"
          disabled={added}
          onClick={() => household && update((d) => addQuestion(d, {
            householdId: household.id,
            title: meds.map((x) => x.name).join(' + '),
            detail: `${info.title} 관련 공식정보 확인`,
            medicineIds: meds.map((x) => x.id),
            refKey,
          }))}
        >
          {added ? '✓ 확인 목록에 있음' : '📝 약사에게 확인할 목록에 추가'}
        </button>
      </div>
    </div>
  )
}

// ---------------- 우리집 약장 안전확인 ----------------
export function SafetyCheck() {
  const nav = useNav()
  const { medicines } = useHousehold()
  const { findings, excluded } = safetyInfo.checkInventory(medicines)
  const [level, setLevel] = useState<SafetyLevel | null>(null)
  const count = (lv: SafetyLevel) => findings.filter((f) => f.info.level === lv).length
  const shown = level ? findings.filter((f) => f.info.level === level) : findings
  const byId = new Map(medicines.map((m) => [m.id, m]))

  return (
    <div className="screen">
      <Header title="우리집 약장 안전확인" back />
      <div className="card">
        <div className="muted">등록 의약품 {medicines.length}개 · 비교 대상 {medicines.length - excluded.length}개</div>
        <div className="level-row">
          {LEVELS.map((lv) => (
            <button key={lv} className={`level-pill lv-${lv} ${level === lv ? 'on' : ''}`} onClick={() => setLevel(level === lv ? null : lv)}>
              {LEVEL_META[lv].icon} {LEVEL_META[lv].short} <b>{count(lv)}건</b>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <Empty>공식 안전정보상 표시할 항목이 없습니다.</Empty>}
      {shown.map((f) => <FindingCard key={f.id} f={f} meds={f.medicineIds.map((id) => byId.get(id)!).filter(Boolean)} />)}
      {excluded.length > 0 && (
        <>
          <p className="section-title">제품 미확인 {excluded.length}개 — 안전정보 비교에서 제외됨</p>
          <p className="muted small pad">약을 눌러 수정 화면에서 제품을 검색·선택하면 비교 대상에 포함됩니다.</p>
          {excluded.map((m) => <MedicineCard key={m.id} m={m} />)}
        </>
      )}
      <button className="btn btn-outline full" onClick={() => nav.push({ name: 'questions' })}>📝 약사에게 확인할 목록 보기</button>
      <p className="muted small pad">{SAFETY_NOTE}</p>
    </div>
  )
}

function FindingCard({ f, meds }: { f: SafetyFinding; meds: Medicine[] }) {
  const nav = useNav()
  const summary = meds.length >= 2
    ? `등록된 ${meds.length === 2 ? '두' : '여러'} 의약품 사이에 공식 안전정보상 확인이 필요한 항목이 있습니다.`
    : '공식 안전정보에 이 의약품 관련 항목이 있습니다.'
  return (
    <div className="finding">
      <p className="safety-group-title">{LEVEL_META[f.info.level].icon} {LEVEL_META[f.info.level].label}</p>
      <div className="finding-meds">
        {meds.map((m) => (
          <button key={m.id} className="chip" onClick={() => nav.push({ name: 'detail', id: m.id })}>{m.name}</button>
        ))}
      </div>
      <SafetyCard info={f.info} meds={meds} refKey={f.id} summary={summary} />
    </div>
  )
}

// ---------------- 약사에게 확인할 목록 ----------------
export function PharmacistList() {
  const { data, update } = useStore()
  const { household } = useHousehold()
  const [text, setText] = useState('')
  if (!household) return null
  const list = data.pharmacistQuestions.filter((q) => q.householdId === household.id)

  async function share() {
    const body = `[${household!.name}] 약사에게 확인할 내용\n\n` +
      list.filter((q) => !q.done).map((q, i) => `${i + 1}. ${q.title}\n   ${q.detail}`).join('\n\n')
    try {
      if (navigator.share) await navigator.share({ title: '약사에게 확인할 내용', text: body })
      else { await navigator.clipboard.writeText(body); alert('복사했습니다. 메신저에 붙여넣기 하세요.') }
    } catch { /* 취소 */ }
  }

  return (
    <div className="screen print-area">
      <Header title="약사에게 확인할 목록" back />
      <p className="muted small pad">약국이나 진료 시 이 화면을 보여주거나 공유하세요.</p>
      {list.length === 0 && <Empty>아직 저장된 항목이 없습니다.<br />안전확인·준비 체크 화면에서 추가할 수 있습니다.</Empty>}
      <ol className="q-list">
        {list.map((q) => (
          <li key={q.id} className={`card q-item ${q.done ? 'done' : ''}`}>
            <div className="grow">
              <b>{q.title}</b>
              <div>{q.detail}</div>
            </div>
            <div className="q-actions no-print">
              <button className="chip" onClick={() => update((d) => toggleQuestion(d, q.id))}>{q.done ? '되돌리기' : '확인함'}</button>
              <button className="chip" onClick={() => update((d) => deleteQuestion(d, q.id))}>삭제</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="join no-print">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="직접 추가 (예: 혈압약 복용시간 문의)" />
        <button className="btn btn-outline" disabled={!text.trim()} onClick={() => {
          update((d) => addQuestion(d, { householdId: household.id, title: text.trim(), detail: '직접 추가한 질문', medicineIds: [] }))
          setText('')
        }}>추가</button>
      </div>
      {list.length > 0 && (
        <div className="row-2 no-print" style={{ marginTop: 12 }}>
          <button className="btn btn-outline" onClick={() => window.print()}>🖨️ 인쇄/PDF</button>
          <button className="btn btn-primary" onClick={share}>📤 공유</button>
        </div>
      )}
    </div>
  )
}

// ---------------- 우리집 준비 체크 ----------------
export function Preparedness() {
  const nav = useNav()
  const { data, update } = useStore()
  const { household, medicines } = useHousehold()
  if (!household) return null
  return (
    <div className="screen">
      <Header title="우리집 준비 체크" back />
      <p className="muted small pad">기본 상비·응급 준비 항목의 보유 여부를 확인합니다. 특정 제품을 추천하지 않습니다.</p>
      {PREPAREDNESS_ITEMS.map((item) => {
        const status = preparednessStatus(data, household.id, medicines, item)
        const refKey = `prep:${item.id}`
        const added = data.pharmacistQuestions.some((q) => q.householdId === household.id && q.refKey === refKey)
        return (
          <div key={item.id} className={`card prep-row st-${status}`}>
            <div className="prep-main">
              <b>{item.name}</b>
              <span className={`prep-status st-${status}`}>{PREP_LABEL[status]}</span>
            </div>
            {item.categoryIds && status !== 'MISSING' && (
              <button className="link-btn" onClick={() => nav.push({ name: 'list', title: item.name, filter: { categoryId: item.categoryIds![0] } })}>등록된 약 보기 ›</button>
            )}
            {!item.categoryIds && (
              <div className="chips">
                {(['AVAILABLE', 'MISSING'] as const).map((v) => (
                  <button key={v} className={`chip ${status === v ? 'on' : ''}`} onClick={() => update((d) => setPreparedness(d, household.id, item.id, status === v ? null : v))}>
                    {v === 'AVAILABLE' ? '있음' : '없음'}
                  </button>
                ))}
              </div>
            )}
            {(status === 'MISSING' || status === 'EXPIRED_ONLY') && (
              <button className="btn btn-outline small-btn" disabled={added} onClick={() => update((d) => addQuestion(d, {
                householdId: household.id,
                title: `집에 ${item.name} ${status === 'MISSING' ? '없음' : '(유효기간 지난 것만 있음)'}`,
                detail: '필요한 제품 상담',
                medicineIds: [],
                refKey,
              }))}>
                {added ? '✓ 상담 목록에 있음' : '📝 약사에게 상담할 목록에 추가'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
