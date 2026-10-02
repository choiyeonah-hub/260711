import { useEffect, useRef, useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { activeSession } from '../data/actions'
import { EXPIRY_LABEL, expiryStatus, formatExp, parseExpiryInput } from '../lib/dates'
import { entryMemory } from '../lib/entryMemory'
import { compressImage } from '../lib/photo'
import { checkServer, recognize, warmUpDeviceOcr, type OcrResult } from '../services/ocr'
import { isConfident, medicineSearch, type ProductMatch } from '../services/medicineSearch'
import { suggestCategory } from '../services/categoryMapper'
import type { ProductRecord } from '../services/mockMedicineDb'
import { Header } from '../components/ui'
import { MedicineForm, productRef, type Prefill } from './MedicineForm'

// 사진으로 약 등록: 촬영 → 인식(OCR) → 제품 후보 확인 → 유효기간 확인 → 분류·위치 확인 후 저장 → 다음 약 촬영
// 인식 결과는 '후보'일 뿐, 사용자가 고르고 확인한 값만 저장된다.

type Stage = 'start' | 'preview' | 'confirm' | 'manual'

interface Recog {
  status: 'running' | 'done' | 'error'
  ocr?: OcrResult
  matches: ProductMatch[]
}

interface Chosen {
  name: string
  product?: ProductRecord
  recognized: boolean // 사진 인식 후보에서 바로 고른 경우 true
}

type ExpiryState =
  | { kind: 'pending'; value: string } // 읽은 값, 확인 대기
  | { kind: 'editing'; input: string }
  | { kind: 'confirmed'; value: string | null }
  | { kind: 'missing' } // 못 찾음
  | { kind: 'reading' } // 유효기간만 다시 찍어서 읽는 중

export function PhotoRegister() {
  const { data } = useStore()
  const { household, members, categories } = useHousehold()
  const session = activeSession(data, household?.id ?? null)
  const camRef = useRef<HTMLInputElement>(null)
  const expCamRef = useRef<HTMLInputElement>(null)
  const runId = useRef(0)

  const [stage, setStage] = useState<Stage>('start')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null) // 저장용 압축 사진
  const [recog, setRecog] = useState<Recog | null>(null)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [expiry, setExpiry] = useState<ExpiryState>({ kind: 'missing' })
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductRecord[]>([])
  const [engine, setEngine] = useState<'ai' | 'device' | null>(null)
  const [toast, setToast] = useState('')
  const [keep, setKeep] = useState({ family: entryMemory.keepFamily, location: entryMemory.keepLocation, category: entryMemory.keepCategory })

  useEffect(() => {
    checkServer().then((ok) => {
      setEngine(ok ? 'ai' : 'device')
      if (!ok) warmUpDeviceOcr().catch(() => {}) // 기기 OCR 모델 미리 불러오기
    })
  }, [])

  useEffect(() => {
    if (!searching) return
    let alive = true
    medicineSearch.search(query, 8).then((r) => alive && setResults(r))
    return () => { alive = false }
  }, [query, searching])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  if (!household) return null

  function openCamera() {
    camRef.current?.click()
  }

  function reset() {
    runId.current++
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null); setPhoto(null); setRecog(null); setChosen(null)
    setExpiry({ kind: 'missing' }); setSearching(false); setQuery(''); setResults([])
  }

  async function onPhoto(file?: File) {
    if (!file) return
    reset()
    const id = runId.current
    setPreviewUrl(URL.createObjectURL(file))
    setStage('preview')
    compressImage(file).then((p) => id === runId.current && setPhoto(p)).catch(() => {})
    setRecog({ status: 'running', matches: [] })
    try {
      const ocr = await recognize(file, 'product')
      const texts = [ocr.productName, ocr.productName && ocr.strength ? `${ocr.productName} ${ocr.strength}` : null, ...ocr.texts]
        .filter((x): x is string => !!x)
      const matches = await medicineSearch.matchFromText(texts)
      if (id !== runId.current) return
      setRecog({ status: 'done', ocr, matches })
      setExpiry(ocr.expiry ? { kind: 'pending', value: ocr.expiry } : { kind: 'missing' })
    } catch (e) {
      console.warn(e)
      if (id === runId.current) setRecog({ status: 'error', matches: [] })
    }
  }

  async function onExpiryPhoto(file?: File) {
    if (!file) return
    setExpiry({ kind: 'reading' })
    try {
      const ocr = await recognize(file, 'expiry')
      setExpiry(ocr.expiry ? { kind: 'pending', value: ocr.expiry } : { kind: 'editing', input: '' })
      if (!ocr.expiry) setToast('유효기간을 읽지 못했어요. 직접 입력해 주세요.')
    } catch {
      setExpiry({ kind: 'editing', input: '' })
    }
  }

  function choose(c: Chosen) {
    setChosen(c)
    setSearching(false)
  }

  function onSavedNext() {
    const count = session ? data.medicines.filter((m) => m.sessionId === session.id).length + 1 : null
    setToast(`‘${chosen?.name || '약'}’ 저장됨${count ? ` · 이번 정리 ${count}개째` : ''}`)
    reset()
    setStage('start')
    openCamera() // 같은 탭(클릭) 안에서 호출해야 아이폰에서 카메라가 바로 열린다
  }

  const inputs = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={expCamRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { onExpiryPhoto(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )
  const toastEl = toast && <div className="toast">✓ {toast}</div>

  // 카메라 입력은 화면 단계가 바뀌어도 같은 요소로 유지해야 촬영 결과가 전달된다
  return (
    <>
      {inputs}
      {renderBody()}
    </>
  )

  function renderBody() {

  // ---------- 시작 ----------
  if (stage === 'start') {
    const fam = members.find((m) => m.id === entryMemory.familyMemberId)
    return (
      <div className="screen">
        <Header title="약 등록" />
        {toastEl}
        <div className="card context-card">
          <label className="ctx-row">
            <span>현재 등록 대상: <b>{(keep.family && fam?.name) || '선택 안 함'}</b></span>
            <span className="keep-check">
              <input type="checkbox" checked={keep.family}
                onChange={(e) => { entryMemory.keepFamily = e.target.checked; setKeep({ ...keep, family: e.target.checked }) }} />
              같은 가족 유지
            </span>
          </label>
          <label className="ctx-row">
            <span>현재 보관 위치: <b>{(keep.location && entryMemory.locationName) || '미지정'}</b></span>
            <span className="keep-check">
              <input type="checkbox" checked={keep.location}
                onChange={(e) => { entryMemory.keepLocation = e.target.checked; setKeep({ ...keep, location: e.target.checked }) }} />
              같은 보관위치 유지
            </span>
          </label>
          <label className="ctx-row">
            <span>현재 카테고리: <b>{(keep.category && categories.find((c) => c.id === entryMemory.categoryId)?.name) || '사진 인식 후 추천'}</b></span>
            <span className="keep-check">
              <input type="checkbox" checked={keep.category}
                onChange={(e) => { entryMemory.keepCategory = e.target.checked; setKeep({ ...keep, category: e.target.checked }) }} />
              같은 카테고리 유지
            </span>
          </label>
        </div>
        <button className="btn btn-primary big-cta" onClick={openCamera}>
          <span className="cta-icon">📷</span>
          약 사진 찍기
          <span className="cta-sub">약 이름과 유효기간이 보이도록 촬영해주세요.<br />가능하면 약 상자 전체가 들어오게 찍어주세요.</span>
        </button>
        <button className="btn btn-outline big-cta secondary" onClick={() => setStage('manual')}>
          <span className="cta-icon">⌨️</span>
          직접 검색/입력
        </button>
        <p className="muted small pad">
          인식 방식: {engine === 'ai' ? 'AI 글자 인식' : engine === 'device' ? '기기 내 글자 인식 (첫 사용 시 준비에 시간이 걸릴 수 있음)' : '확인 중…'}
          <br />사진 인식은 약 이름·유효기간 입력을 돕는 기능이며, 결과는 반드시 직접 확인합니다.
        </p>
      </div>
    )
  }

  // ---------- 직접 입력 ----------
  if (stage === 'manual') {
    return (
      <MedicineForm
        entry={{ method: 'manual' }}
        top={<Header title="직접 검색/입력" back onBack={() => setStage('start')} />}
      />
    )
  }

  // ---------- 촬영 확인 ----------
  if (stage === 'preview') {
    return (
      <div className="screen">
        <Header title="사진 확인" back onBack={() => { reset(); setStage('start') }} />
        {toastEl}
        {previewUrl && <img className="preview-img" src={previewUrl} alt="촬영한 약 사진" />}
        <p className="muted small pad center">
          {recog?.status === 'running' ? '⏳ 글자를 읽는 중…' : '약 이름과 유효기간이 잘 보이나요?'}
        </p>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={openCamera}>다시 찍기</button>
          <button className="btn btn-primary grow" onClick={() => setStage('confirm')}>이 사진 사용 ›</button>
        </div>
      </div>
    )
  }

  // ---------- 저장(분류·위치 확인): 제품과 유효기간이 모두 확인되면 ----------
  if (stage === 'confirm' && chosen && expiry.kind === 'confirmed') {
    const prefill: Prefill = {
      name: chosen.name,
      // '같은 카테고리 유지'가 켜져 있으면 그 값을, 아니면 DB 분류에서 추천
      categoryId: entryMemory.keepCategory && entryMemory.categoryId
        ? entryMemory.categoryId
        : chosen.product ? suggestCategory(chosen.product) : undefined,
      expInput: expiry.value ? formatExp(expiry.value) : '',
      photo,
      product: chosen.product ? productRef(chosen.product) : { source: 'manual' },
    }
    return (
      <>
        <MedicineForm
          key={chosen.name + (expiry.value ?? '') + (photo ? 'p' : '')}
          prefill={prefill}
          entry={{ method: 'photo', recognized: chosen.recognized }}
          onSaveNextPhoto={onSavedNext}
          top={
            <>
              <Header title="분류·위치 확인 후 저장" back onBack={() => setExpiry(expiry.value ? { kind: 'pending', value: expiry.value } : { kind: 'missing' })} />
              <div className="card picked">
                {previewUrl && <img src={previewUrl} alt="" />}
                <div>
                  <div className="med-name">{chosen.name || '(제품명 직접 입력)'}</div>
                  <div className="muted small">
                    유효기간 {expiry.value ? formatExp(expiry.value) : '미입력'} ✓ 확인됨
                  </div>
                </div>
              </div>
            </>
          }
        />
      </>
    )
  }

  // ---------- 인식 결과 확인 ----------
  const ocr = recog?.ocr
  const matches = recog?.matches ?? []
  const ocrNameOnly = ocr?.productName && !matches.some((m) => m.product.baseName === ocr.productName)
    ? [ocr.productName, ocr.strength].filter(Boolean).join(' ')
    : null
  const found = matches.length > 0 || !!ocrNameOnly
  const confident = isConfident(matches)

  return (
    <div className="screen">
      <Header title="인식 결과 확인" back onBack={() => setStage('preview')} />
      {toastEl}

      {/* 1. 제품 */}
      <section className="card step">
        <div className="step-title">1. 제품 확인</div>
        {recog?.status === 'running' && <p className="center pad">⏳ 사진에서 글자를 읽는 중…</p>}

        {chosen && !searching ? (
          <div className="chosen-row">
            <span>✓ <b>{chosen.name || '제품명 직접 입력'}</b></span>
            <button className="chip" onClick={() => setChosen(null)}>변경</button>
          </div>
        ) : searching ? (
          <div className="search-box">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제품명 검색 (예: 타이레놀)" />
            {results.map((p) => (
              <button key={p.id} className="cand" onClick={() => choose({ name: p.name, product: p, recognized: false })}>
                <b>{p.name}</b>
                <span className="muted small">{[p.ingredient, p.manufacturer].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {query.trim() && (
              <button className="cand" onClick={() => choose({ name: query.trim(), recognized: false })}>
                ‘{query.trim()}’ 이름으로 직접 입력
              </button>
            )}
            <button className="chip" onClick={() => setSearching(false)}>취소</button>
          </div>
        ) : recog && recog.status !== 'running' && found ? (
          <>
            <p className="q">
              인식된 약을 확인해주세요.
              {!confident && <span className="badge badge-d30">확인이 필요합니다</span>}
            </p>
            {matches.map((m) => (
              <button key={m.product.id} className="cand" onClick={() => choose({ name: m.product.name, product: m.product, recognized: true })}>
                <span className="radio" />
                <span className="cand-body">
                  <b>{m.product.name}</b>
                  <span className="muted small">{[m.product.ingredient && `${m.product.ingredient} ${m.product.strength ?? ''}`.trim(), m.product.manufacturer].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            ))}
            {ocrNameOnly && (
              <button className="cand" onClick={() => choose({ name: ocrNameOnly, recognized: true })}>
                <span className="radio" />
                <span className="cand-body">
                  <b>{ocrNameOnly}</b>
                  <span className="muted small">사진에서 읽은 이름 · 제품 DB에 없음 · 확인이 필요합니다</span>
                </span>
              </button>
            )}
            <button className="cand" onClick={() => { setSearching(true); setQuery(ocr?.productName ?? '') }}>
              🔍 직접 검색하기
            </button>
          </>
        ) : recog && recog.status !== 'running' ? (
          <div className="fail">
            <p className="q">제품을 정확하게 찾지 못했어요.</p>
            <div className="stack">
              <button className="btn btn-outline" onClick={openCamera}>📷 다시 촬영</button>
              <button className="btn btn-outline" onClick={() => { setSearching(true); setQuery('') }}>🔍 제품명 검색</button>
              <button className="btn btn-outline" onClick={() => choose({ name: '', recognized: false })}>⌨️ 직접 입력</button>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. 유효기간 */}
      {recog && recog.status !== 'running' && (
        <section className="card step">
          <div className="step-title">2. 유효기간 확인</div>
          <ExpiryStep state={expiry} setState={setExpiry} onReshoot={() => expCamRef.current?.click()} />
        </section>
      )}
    </div>
  )
}
}

function ExpiryStep({ state, setState, onReshoot }: {
  state: ExpiryState
  setState: (s: ExpiryState) => void
  onReshoot: () => void
}) {
  if (state.kind === 'reading') return <p className="center pad">⏳ 유효기간을 읽는 중…</p>
  if (state.kind === 'confirmed') {
    return (
      <div className="chosen-row">
        <span>✓ <b>{state.value ? formatExp(state.value) : '유효기간 없음/나중에'}</b></span>
        <button className="chip" onClick={() => setState({ kind: 'editing', input: state.value ? formatExp(state.value) : '' })}>변경</button>
      </div>
    )
  }
  if (state.kind === 'pending') {
    return (
      <>
        <p className="q"><b className="exp-read">{formatExp(state.value)}</b>로 읽었습니다. 맞나요?</p>
        <p className={`hint status-${expiryStatus(state.value)}`}>{EXPIRY_LABEL[expiryStatus(state.value)]}</p>
        <div className="row-2">
          <button className="btn btn-outline" onClick={() => setState({ kind: 'editing', input: formatExp(state.value) })}>수정</button>
          <button className="btn btn-primary" onClick={() => setState({ kind: 'confirmed', value: state.value })}>맞아요</button>
        </div>
      </>
    )
  }
  if (state.kind === 'editing') {
    const parsed = parseExpiryInput(state.input)
    return (
      <>
        <input autoFocus inputMode="decimal" value={state.input} placeholder="예: 2708 → 2027.08 / 20270831"
          onChange={(e) => setState({ kind: 'editing', input: e.target.value })} />
        {parsed && <p className={`hint status-${expiryStatus(parsed)}`}>→ {formatExp(parsed)} · {EXPIRY_LABEL[expiryStatus(parsed)]}</p>}
        {state.input.trim() && !parsed && <p className="hint error">형식을 확인해 주세요</p>}
        <div className="row-2">
          <button className="btn btn-outline" onClick={onReshoot}>📷 다시 찍기</button>
          <button className="btn btn-primary" disabled={!parsed} onClick={() => setState({ kind: 'confirmed', value: parsed })}>확인</button>
        </div>
      </>
    )
  }
  return (
    <>
      <p className="q">유효기간을 찾지 못했어요.</p>
      <div className="stack">
        <button className="btn btn-primary" onClick={onReshoot}>📷 유효기간 부분만 다시 찍기</button>
        <p className="muted small">상자 옆면·바닥의 EXP, 사용기한, 유효기간이 보이게 찍어주세요.</p>
        <button className="btn btn-outline" onClick={() => setState({ kind: 'editing', input: '' })}>⌨️ 직접 입력</button>
        <button className="btn btn-outline" onClick={() => setState({ kind: 'confirmed', value: null })}>표시가 없어요 / 나중에</button>
      </div>
    </>
  )
}
