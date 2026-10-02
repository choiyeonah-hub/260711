import { useRef, useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { activeSession, deleteMedicine, saveMedicine } from '../data/actions'
import { EXPIRY_LABEL, expiryStatus, formatExp, parseExpiryInput } from '../lib/dates'
import { compressImage } from '../lib/photo'
import { searchProducts } from '../services/drugDb'
import { useNav } from '../nav'
import { Header } from '../components/ui'

const RX_CATEGORY = 'c06'

// '저장 후 다음 약' 사이에 유지할 값 (앱 실행 중에만 기억)
const last = {
  keepFamily: true, keepLocation: true, keepCategory: false,
  familyMemberId: null as string | null, locationName: '', categoryId: '',
  isPrescription: false, nextAppointmentDate: '',
}

export function MedicineForm({ id }: { id?: string }) {
  const nav = useNav()
  const { data, update } = useStore()
  const { household, members, locations, categories, medicines } = useHousehold()
  const editing = id ? data.medicines.find((m) => m.id === id) : undefined
  const session = activeSession(data, household?.id ?? null)
  const nameRef = useRef<HTMLInputElement>(null)

  const init = () =>
    editing
      ? {
          name: editing.name,
          categoryId: editing.categoryId,
          locationName: locations.find((l) => l.id === editing.storageLocationId)?.name ?? '',
          familyMemberId: editing.familyMemberId,
          expInput: editing.expirationDate ? formatExp(editing.expirationDate) : '',
          quantity: editing.quantity ?? '',
          memo: editing.memo ?? '',
          isPrescription: editing.isPrescription,
          nextAppointmentDate: editing.nextAppointmentDate ?? '',
          photo: editing.photo,
        }
      : {
          name: '',
          categoryId: last.keepCategory ? last.categoryId : '',
          locationName: last.keepLocation ? last.locationName : '',
          familyMemberId: last.keepFamily ? last.familyMemberId : null,
          expInput: '',
          quantity: '',
          memo: '',
          isPrescription: last.keepFamily ? last.isPrescription : false,
          nextAppointmentDate: last.keepFamily ? last.nextAppointmentDate : '',
          photo: null as string | null,
        }

  const [f, setF] = useState(init)
  const [keep, setKeep] = useState({ family: last.keepFamily, location: last.keepLocation, category: last.keepCategory })
  const [errors, setErrors] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [nameFocused, setNameFocused] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  if (!household) return null

  const expParsed = parseExpiryInput(f.expInput)
  const expInvalid = f.expInput.trim() !== '' && !expParsed
  const suggestions = nameFocused && !editing ? searchProducts(data, f.name) : []

  // 자주 쓰는 위치 순으로 칩 표시
  const locCount = (lid: string) => medicines.filter((m) => m.storageLocationId === lid).length
  const locChips = [...locations].sort((a, b) => locCount(b.id) - locCount(a.id)).slice(0, 10)

  function validate(): boolean {
    const e: string[] = []
    if (!f.name.trim()) e.push('name')
    if (!f.categoryId) e.push('category')
    if (!f.locationName.trim()) e.push('location')
    if (expInvalid) e.push('exp')
    setErrors(e)
    if (e.length) document.querySelector(`[data-field="${e[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return e.length === 0
  }

  function save(next: boolean) {
    if (!validate()) return
    update((d) =>
      saveMedicine(
        d,
        household!.id,
        {
          name: f.name.trim(),
          categoryId: f.categoryId,
          locationName: f.locationName,
          familyMemberId: f.familyMemberId,
          expirationDate: expParsed,
          quantity: f.quantity.trim() || null,
          memo: f.memo.trim() || null,
          isPrescription: f.isPrescription,
          nextAppointmentDate: f.isPrescription && f.nextAppointmentDate ? f.nextAppointmentDate : null,
          photo: f.photo,
          product: editing?.product ?? { source: 'manual' },
          sessionId: editing ? (editing.sessionId ?? null) : (session?.id ?? null),
        },
        editing?.id,
      ),
    )
    if (editing) return nav.back()
    Object.assign(last, {
      keepFamily: keep.family, keepLocation: keep.location, keepCategory: keep.category,
      familyMemberId: f.familyMemberId, locationName: f.locationName.trim(), categoryId: f.categoryId,
      isPrescription: f.isPrescription, nextAppointmentDate: f.nextAppointmentDate,
    })
    if (!next) return nav.back()
    const count = session ? data.medicines.filter((m) => m.sessionId === session.id).length + 1 : null
    setToast(`‘${f.name.trim()}’ 저장됨${count ? ` · 이번 정리 ${count}개째` : ''}`)
    setTimeout(() => setToast(''), 2500)
    setF(init())
    setErrors([])
    window.scrollTo({ top: 0 })
    nameRef.current?.focus()
  }

  function remove() {
    if (!editing || !confirm(`‘${editing.name}’을(를) 삭제할까요?`)) return
    update((d) => deleteMedicine(d, editing.id))
    nav.back()
  }

  async function onPhoto(file?: File) {
    if (!file) return
    try { set('photo', await compressImage(file)) } catch (e) { alert(String(e)) }
  }

  const err = (k: string) => errors.includes(k)

  return (
    <div className="screen form-screen">
      <Header title={editing ? '약 정보 수정' : '약 등록'} back />
      {toast && <div className="toast">✓ {toast}</div>}

      <label className={`field ${err('name') ? 'has-error' : ''}`} data-field="name">
        <span className="label">제품명 <em>*</em></span>
        <input
          ref={nameRef}
          className="input-lg"
          value={f.name}
          onChange={(e) => set('name', e.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setTimeout(() => setNameFocused(false), 150)}
          placeholder="약 이름 (포장에 적힌 그대로)"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <div className="suggest">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.name}
                onClick={() => setF((p) => ({ ...p, name: s.name, categoryId: s.categoryId ?? p.categoryId }))}
              >
                {s.name} <span className="muted small">최근 입력</span>
              </button>
            ))}
          </div>
        )}
      </label>

      <div className={`field ${err('category') ? 'has-error' : ''}`} data-field="category">
        <span className="label">
          카테고리 <em>*</em>
          {!editing && <KeepToggle on={keep.category} onChange={(v) => setKeep({ ...keep, category: v })} />}
        </span>
        <div className="cat-grid">
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip cat ${f.categoryId === c.id ? 'on' : ''}`}
              onClick={() =>
                setF((p) => ({ ...p, categoryId: c.id, isPrescription: c.id === RX_CATEGORY ? true : p.isPrescription }))
              }
            >
              <span className="cat-icon">{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className={`field ${err('location') ? 'has-error' : ''}`} data-field="location">
        <span className="label">
          보관 위치 <em>*</em>
          {!editing && <KeepToggle on={keep.location} onChange={(v) => setKeep({ ...keep, location: v })} />}
        </span>
        <input
          value={f.locationName}
          onChange={(e) => set('locationName', e.target.value)}
          placeholder="예: 12칸 약장 3번, 냉장고, 아버지 약 파우치"
        />
        {locChips.length > 0 && (
          <div className="chips">
            {locChips.map((l) => (
              <button type="button" key={l.id} className={`chip ${f.locationName === l.name ? 'on' : ''}`} onClick={() => set('locationName', l.name)}>
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <span className="label">
          가족
          {!editing && <KeepToggle on={keep.family} onChange={(v) => setKeep({ ...keep, family: v })} label="유지 (처방 정보 포함)" />}
        </span>
        <div className="chips">
          {members.map((m) => (
            <button type="button" key={m.id} className={`chip big ${f.familyMemberId === m.id ? 'on' : ''}`} onClick={() => set('familyMemberId', f.familyMemberId === m.id ? null : m.id)}>
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <label className={`field ${err('exp') ? 'has-error' : ''}`} data-field="exp">
        <span className="label">유효기간</span>
        <input
          inputMode="decimal"
          value={f.expInput}
          onChange={(e) => set('expInput', e.target.value)}
          placeholder="예: 2708 → 2027.08 / 20270815"
        />
        {expParsed && (
          <span className={`hint status-${expiryStatus(expParsed)}`}>
            → {formatExp(expParsed)} · {EXPIRY_LABEL[expiryStatus(expParsed)]}
          </span>
        )}
        {expInvalid && <span className="hint error">형식을 확인해 주세요 (예: 2708, 2027.08, 20270815)</span>}
      </label>

      <div className={`rx-box ${f.isPrescription ? 'on' : ''}`}>
        <label className="switch-row">
          <span className="label">처방약</span>
          <input type="checkbox" className="switch" checked={f.isPrescription} onChange={(e) => set('isPrescription', e.target.checked)} />
        </label>
        {f.isPrescription && (
          <>
            <div className="field">
              <span className="label">누구의 처방약인가요?</span>
              <div className="chips">
                {members.filter((m) => !m.isShared).map((m) => (
                  <button type="button" key={m.id} className={`chip big ${f.familyMemberId === m.id ? 'on' : ''}`} onClick={() => set('familyMemberId', m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="label">다음 진료/처방 예정일</span>
              <input type="date" value={f.nextAppointmentDate} onChange={(e) => set('nextAppointmentDate', e.target.value)} />
              <span className="hint muted">약 봉투·처방전 또는 본인이 알려준 날짜만 입력하세요.</span>
            </label>
          </>
        )}
      </div>

      <div className="row-2">
        <label className="field">
          <span className="label">수량</span>
          <input value={f.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="예: 10정, 1병" />
        </label>
        <div className="field">
          <span className="label">사진</span>
          {f.photo ? (
            <div className="photo-prev">
              <img src={f.photo} alt="" />
              <button type="button" className="chip" onClick={() => set('photo', null)}>삭제</button>
            </div>
          ) : (
            <label className="btn btn-outline photo-btn">
              📷 촬영
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>

      <label className="field">
        <span className="label">메모</span>
        <textarea rows={2} value={f.memo} onChange={(e) => set('memo', e.target.value)} placeholder="예: 개봉일 9/1" />
      </label>

      <div className="form-actions">
        {editing ? (
          <>
            <button className="btn btn-danger-outline" onClick={remove}>삭제</button>
            <button className="btn btn-primary grow" onClick={() => save(false)}>저장</button>
          </>
        ) : (
          <>
            <button className="btn btn-outline" onClick={() => save(false)}>저장</button>
            <button className="btn btn-primary grow" onClick={() => save(true)}>저장 후 다음 약 ›</button>
          </>
        )}
      </div>
    </div>
  )
}

function KeepToggle({ on, onChange, label = '다음 약에도 유지' }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`keep ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      {on ? '📌' : '○'} {label}
    </button>
  )
}
