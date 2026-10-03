import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, Check, Pin, ScanLine } from 'lucide-react'
import { CategoryIcon } from '../components/icons'
import { recognize } from '../services/ocr'
import { useHousehold, useStore } from '../data/store'
import { activeSession, deleteMedicine, recordEntry, saveMedicine, type EntryMethod } from '../data/actions'
import { EXPIRY_LABEL, expiryStatus, formatExp, parseExpiryInput } from '../lib/dates'
import { entryMemory as last } from '../lib/entryMemory'
import { compressImage } from '../lib/photo'
import { searchProducts } from '../services/drugDb'
import { medicineSearch } from '../services/medicineSearch'
import { suggestCategory } from '../services/categoryMapper'
import type { ProductRecord } from '../services/mockMedicineDb'
import type { CurrentUseStatus, Medicine, ProductType } from '../types'
import { productTypeOf, splitIngredients } from '../data/medicineMeta'
import { useNav } from '../nav'
import { Header } from '../components/ui'

const RX_CATEGORY = 'c06'
const USE_OPTIONS: [CurrentUseStatus, string][] = [['IN_USE', '복용 중'], ['NOT_IN_USE', '복용 안 함'], ['UNKNOWN', '확인 필요']]

// 사진 인식/DB 선택 결과로 미리 채울 값
export interface Prefill {
  name?: string
  categoryId?: string // 제안된 분류 (사용자가 변경 가능)
  expInput?: string
  photo?: string | null
  product?: Medicine['product']
}

export function productRef(p: ProductRecord, source: 'mock' | 'mfds' = 'mock'): Medicine['product'] {
  return {
    source: p.source ?? source, externalId: p.id, externalCategory: p.externalClass,
    manufacturer: p.manufacturer, strength: p.strength, dosageForm: p.dosageForm,
    ingredients: splitIngredients(p.ingredient),
  }
}

interface Props {
  id?: string
  prefill?: Prefill
  entry?: EntryMethod
  top?: ReactNode // 폼 위에 표시할 내용 (사진 인식 확인 결과 등)
  onSaveNextPhoto?: () => void // 있으면 '저장하고 다음 약 촬영' 버튼
  onBack?: () => void
  productType?: ProductType // 새 품목 등록 시 유형 (기본 의약품)
}

const TEXT: Record<ProductType, { title: string; name: string; exp: string; next: string }> = {
  MEDICINE: { title: '약 등록', name: '약 이름 (포장에 적힌 그대로)', exp: '유효기간', next: '저장 후 다음 약' },
  SUPPLEMENT: { title: '영양제 등록', name: '제품명 (포장에 적힌 그대로)', exp: '소비기한/유통기한', next: '저장 후 다음 품목' },
  MEDICAL_SUPPLY: { title: '의료용품 등록', name: '제품명 (예: 전자체온계, 멸균거즈)', exp: '유효기간 (표시된 경우)', next: '저장 후 다음 품목' },
}

export function MedicineForm({ id, prefill, entry: entryProp = { method: 'manual' }, top, onSaveNextPhoto, onBack, productType }: Props) {
  const nav = useNav()
  const { data, update } = useStore()
  const { household, members, locations, categoriesOf, medicines } = useHousehold()
  const editing = id ? data.medicines.find((m) => m.id === id) : undefined
  const type: ProductType = editing ? productTypeOf(editing) : (productType ?? 'MEDICINE')
  const isMed = type === 'MEDICINE'
  const categories = categoriesOf(type)
  const keptCategory = last.keepCategory && categories.some((c) => c.id === last.categoryId) ? last.categoryId : ''
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
          keywords: editing.keywords ?? '',
          isPrescription: editing.isPrescription,
          nextAppointmentDate: editing.nextAppointmentDate ?? '',
          currentUseStatus: editing.currentUseStatus ?? 'UNKNOWN',
          photo: editing.photo,
          supIngredients: editing.supplement?.ingredients ?? '',
          supIntake: editing.supplement?.intakeLabel ?? '',
        }
      : {
          name: prefill?.name ?? '',
          categoryId: prefill?.categoryId ?? keptCategory,
          locationName: last.keepLocation ? last.locationName : '',
          familyMemberId: last.keepFamily ? last.familyMemberId : null,
          expInput: prefill?.expInput ?? '',
          quantity: '',
          memo: '',
          keywords: '',
          isPrescription: isMed && last.keepFamily ? last.isPrescription : false,
          nextAppointmentDate: isMed && last.keepFamily ? last.nextAppointmentDate : '',
          currentUseStatus: 'UNKNOWN' as CurrentUseStatus,
          photo: (prefill?.photo ?? null) as string | null,
          supIngredients: '',
          supIntake: '',
        }

  const [f, setF] = useState(init)
  const [keep, setKeep] = useState({ family: last.keepFamily, location: last.keepLocation, category: last.keepCategory })
  const [errors, setErrors] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [nameFocused, setNameFocused] = useState(false)
  const [product, setProduct] = useState<Medicine['product']>(editing?.product ?? prefill?.product ?? { source: 'manual' })
  const [dbHits, setDbHits] = useState<ProductRecord[]>([])
  useEffect(() => {
    let alive = true
    if (!isMed || f.name.trim().length < 2) { setDbHits([]); return }
    medicineSearch.search(f.name, 4).then((r) => alive && setDbHits(r.filter((p) => p.name !== f.name)))
    return () => { alive = false }
  }, [f.name, isMed])
  const [ocrUsed, setOcrUsed] = useState<{ nameApplied: boolean; engine?: string } | null>(null)
  const [suggestedCat, setSuggestedCat] = useState(prefill?.categoryId ?? '')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  if (!household) return null

  const expParsed = parseExpiryInput(f.expInput)
  const expInvalid = f.expInput.trim() !== '' && !expParsed
  const suggestions = nameFocused && !editing ? searchProducts(data, f.name) : []
  const dbSuggestions = nameFocused ? dbHits.filter((p) => !suggestions.some((x) => x.name === p.name)) : []

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
          keywords: f.keywords.trim() || null,
          isPrescription: isMed && f.isPrescription,
          nextAppointmentDate: isMed && f.isPrescription && f.nextAppointmentDate ? f.nextAppointmentDate : null,
          currentUseStatus: isMed && f.isPrescription ? f.currentUseStatus : undefined,
          productType: type,
          supplement: type === 'SUPPLEMENT'
            ? { ingredients: f.supIngredients.trim() || undefined, intakeLabel: f.supIntake.trim() || undefined }
            : undefined,
          photo: f.photo,
          product,
          sessionId: editing ? (editing.sessionId ?? null) : (session?.id ?? null),
        },
        editing?.id,
      ),
    )
    if (editing) return (onBack ?? nav.back)()
    // 영양제·의료용품에서 사진 읽기를 썼다면 사진 등록으로 집계
    const entry: EntryMethod = ocrUsed ? { method: 'photo', recognized: ocrUsed.nameApplied, engine: ocrUsed.engine } : entryProp
    if (session) update((d) => recordEntry(d, session.id, entry))
    Object.assign(last, {
      keepFamily: keep.family, keepLocation: keep.location, keepCategory: keep.category,
      familyMemberId: f.familyMemberId, locationName: f.locationName.trim(), categoryId: f.categoryId,
      isPrescription: f.isPrescription, nextAppointmentDate: f.nextAppointmentDate,
    })
    if (!next) return (onBack ?? nav.back)()
    if (onSaveNextPhoto) return onSaveNextPhoto()
    const count = session ? data.medicines.filter((m) => m.sessionId === session.id).length + 1 : null
    setToast(`‘${f.name.trim()}’ 저장됨${count ? ` · 이번 정리 ${count}개째` : ''}`)
    setTimeout(() => setToast(''), 2500)
    setF(init())
    setProduct({ source: 'manual' })
    setOcrUsed(null)
    setErrors([])
    window.scrollTo({ top: 0 })
    nameRef.current?.focus()
  }

  function remove() {
    if (!editing || !confirm(`‘${editing.name}’을(를) 삭제할까요?`)) return
    update((d) => deleteMedicine(d, editing.id))
    ;(onBack ?? nav.back)()
  }

  async function onPhoto(file?: File) {
    if (!file) return
    try { set('photo', await compressImage(file)) } catch (e) { alert(String(e)) }
  }

  const err = (k: string) => errors.includes(k)

  return (
    <div className="screen form-screen">
      {!top && <Header title={editing ? '정보 수정' : TEXT[type].title} back />}
      {toast && <div className="toast"><Check size={18} aria-hidden /> {toast}</div>}
      {top}
      {!isMed && !editing && (
        <OcrAssist
          onPhoto={(p) => set('photo', p)}
          onName={(name, engine) => { set('name', name); setOcrUsed({ nameApplied: true, engine }) }}
          onExpiry={(v, engine) => { set('expInput', formatExp(v)); setOcrUsed((o) => o ?? { nameApplied: false, engine }) }}
          onRead={(engine) => setOcrUsed((o) => o ?? { nameApplied: false, engine })}
        />
      )}

      <label className={`field ${err('name') ? 'has-error' : ''}`} data-field="name">
        <span className="label">제품명 <em>*</em></span>
        <input
          ref={nameRef}
          className="input-lg"
          value={f.name}
          onChange={(e) => {
            set('name', e.target.value)
            if (product?.source !== 'manual') setProduct({ source: 'manual' }) // 이름을 바꾸면 DB 연결 해제
          }}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setTimeout(() => setNameFocused(false), 150)}
          placeholder={TEXT[type].name}
          autoComplete="off"
        />
        {suggestions.length + dbSuggestions.length > 0 && (
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
            {dbSuggestions.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  setF((v) => ({ ...v, name: p.name, categoryId: suggestCategory(p) }))
                  setProduct(productRef(p))
                  setSuggestedCat(suggestCategory(p))
                }}
              >
                {p.name} <span className="muted small">{[p.manufacturer, p.ingredient].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
      </label>

      <div className={`field ${err('category') ? 'has-error' : ''}`} data-field="category">
        <span className="label">
          카테고리 <em>*</em>
          {suggestedCat && f.categoryId === suggestedCat && <span className="muted small">추천 분류 · 바꿀 수 있어요</span>}
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
              <CategoryIcon id={c.id} className="cat-icon" size={22} strokeWidth={1.75} />
              {c.name}
              {suggestedCat === c.id && <span className="rec">추천</span>}
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
          {!editing && <KeepToggle on={keep.family} onChange={(v) => setKeep({ ...keep, family: v })} label={isMed ? '유지 (처방 정보 포함)' : '다음에도 유지'} />}
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
        <span className="label">{TEXT[type].exp}</span>
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

      {type === 'SUPPLEMENT' && (
        <>
          <label className="field">
            <span className="label">주요 성분</span>
            <input value={f.supIngredients} onChange={(e) => set('supIngredients', e.target.value)} placeholder="예: 비타민D, 칼슘 (제품 표시 그대로)" />
          </label>
          <label className="field">
            <span className="label">섭취방법·1일 섭취량 (제품 표시)</span>
            <input value={f.supIntake} onChange={(e) => set('supIntake', e.target.value)} placeholder="포장에 적힌 내용을 그대로 입력" />
            <span className="hint muted">앱이 섭취량을 정하지 않습니다. 제품 표시 내용만 기록하세요.</span>
          </label>
        </>
      )}

      {isMed && <div className={`rx-box ${f.isPrescription ? 'on' : ''}`}>
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
            <div className="field">
              <span className="label">현재 복용 여부 (가족에게 확인)</span>
              <div className="chips">
                {USE_OPTIONS.map(([v, label]) => (
                  <button type="button" key={v} className={`chip ${f.currentUseStatus === v ? 'on' : ''}`} onClick={() => set('currentUseStatus', v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>}

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
              <Camera size={20} aria-hidden /> 촬영
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>

      <label className="field">
        <span className="label">찾기용 단어</span>
        <input value={f.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="예: 기침, 화상, 아들이 사준 약" />
        <span className="hint muted">이 단어로 검색하면 이 품목이 나옵니다. 쉼표로 여러 개 입력할 수 있어요.</span>
      </label>

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
            <button className="btn btn-primary grow" onClick={() => save(true)}>
              {onSaveNextPhoto ? <><Camera size={20} aria-hidden /> 저장하고 다음 약 촬영</> : TEXT[type].next}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function KeepToggle({ on, onChange, label = '다음 약에도 유지' }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`keep ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <Pin size={14} aria-hidden /> {label}
    </button>
  )
}

// 영양제·의료용품용 사진 읽기: 읽은 값은 '적용'/'맞아요'를 눌러야 입력란에 들어간다
function OcrAssist({ onPhoto, onName, onExpiry, onRead }: {
  onPhoto: (dataUrl: string) => void
  onName: (name: string, engine: string) => void
  onExpiry: (v: string, engine: string) => void
  onRead: (engine: string) => void
}) {
  const [state, setState] = useState<'idle' | 'reading' | 'done'>('idle')
  const [read, setRead] = useState<{ name: string | null; expiry: string | null; engine: string } | null>(null)
  const [applied, setApplied] = useState({ name: false, expiry: false })

  async function onFile(file?: File) {
    if (!file) return
    setState('reading'); setApplied({ name: false, expiry: false })
    compressImage(file).then(onPhoto).catch(() => {})
    try {
      const r = await recognize(file, 'product')
      const name = [r.productName, r.strength].filter(Boolean).join(' ') || r.texts[0] || null
      setRead({ name, expiry: r.expiry, engine: r.engineLabel })
      onRead(r.engineLabel)
    } catch {
      setRead({ name: null, expiry: null, engine: '' })
    }
    setState('done')
  }

  return (
    <div className="card ocr-assist">
      <label className="btn btn-outline full">
        <ScanLine size={20} aria-hidden /> {state === 'idle' ? '사진으로 제품명·기한 읽기' : '다시 촬영'}
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {state === 'reading' && <p className="muted center">사진에서 글자를 읽는 중…</p>}
      {state === 'done' && read && (
        <div className="ocr-result">
          <p className="muted small">사진에서 읽은 내용입니다. 확인 후 적용하세요.</p>
          {read.name ? (
            <div className="ocr-row">
              <span className="grow">제품명 <b>{read.name}</b></span>
              <button type="button" className="chip" disabled={applied.name} onClick={() => { onName(read.name!, read.engine); setApplied({ ...applied, name: true }) }}>
                {applied.name ? '적용됨' : '적용'}
              </button>
            </div>
          ) : <p className="small">제품명을 읽지 못했어요. 직접 입력해 주세요.</p>}
          {read.expiry ? (
            <div className="ocr-row">
              <span className="grow"><b>{formatExp(read.expiry)}</b>로 읽었습니다. 맞나요?</span>
              <button type="button" className="chip" disabled={applied.expiry} onClick={() => { onExpiry(read.expiry!, read.engine); setApplied({ ...applied, expiry: true }) }}>
                {applied.expiry ? '적용됨' : '맞아요'}
              </button>
            </div>
          ) : <p className="small">기한을 읽지 못했어요. 직접 입력해 주세요.</p>}
        </div>
      )}
    </div>
  )
}
