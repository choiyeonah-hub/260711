import { useEffect, useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { activeSession, addSurvey, bumpDiscarded, endSession, setPhaseMinutes, startSession } from '../data/actions'
import { STORAGE_METHODS, WORK_PHASES, type WorkPhase } from '../types'
import { useNav } from '../nav'
import { Header } from '../components/ui'

const FLOW_STEPS = [
  '집안에 흩어진 약 모으기', '상비약 / 개인 처방약 구분', '카테고리 분류', '유효기간 확인',
  '실제 수납 및 라벨링', '약 사진 촬영 → 제품 확인 → 앱 등록', '가족 연결 · 다음 진료/처방 예정일 등록',
  '우리집 준비 체크', '약장 안전확인 → 필요한 항목은 약사 확인 목록에 저장', '자녀와 공유',
]

export function SessionStart() {
  const nav = useNav()
  const { update } = useStore()
  const { household } = useHousehold()
  const [methods, setMethods] = useState<string[]>([])
  if (!household) return null
  const toggle = (m: string) => setMethods((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))
  return (
    <div className="screen">
      <Header title="약장 정리 시작" back />
      <div className="card">
        <p><b>{household.name}</b>의 약장 정리를 시작합니다.</p>
        <p className="muted small">시작~종료 시간, 등록한 약 개수, 만료약, 처방약 개수가 자동 기록됩니다.</p>
      </div>
      <details className="card flow-guide">
        <summary><b>방문 정리 순서</b></summary>
        <ol>
          {FLOW_STEPS.map((t) => <li key={t}>{t}</li>)}
        </ol>
      </details>
      <p className="section-title">사용한 수납 방식 (여러 개 선택 가능)</p>
      <div className="chips">
        {STORAGE_METHODS.map((m) => (
          <button key={m} className={`chip big ${methods.includes(m) ? 'on' : ''}`} onClick={() => toggle(m)}>{m}</button>
        ))}
      </div>
      <p className="muted small pad">나중에 종료할 때 다시 바꿀 수 있습니다.</p>
      <div className="form-actions">
        <button
          className="btn btn-primary grow"
          onClick={() => {
            update((d) => startSession(d, household.id, methods))
            nav.replace({ name: 'add' })
          }}
        >
          시작하고 약 등록하기 ›
        </button>
      </div>
    </div>
  )
}

// 정리 중일 때 모든 화면 상단에 고정되는 바
export function SessionBar() {
  const nav = useNav()
  const { data, update } = useStore()
  const { household } = useHousehold()
  const s = activeSession(data, household?.id ?? null)
  const [, tick] = useState(0)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
  if (!s) return null
  const mins = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 60000)
  const count = data.medicines.filter((m) => m.sessionId === s.id).length

  function finish() {
    if (!confirm('약장 정리를 완료할까요?')) return
    update((d) => endSession(d, s!.id))
    nav.push({ name: 'sessionSummary', id: s!.id })
  }

  return (
    <div className="session-bar">
      <div className="session-info" onClick={() => setEditing(!editing)}>
        🧹 정리 중 · {mins}분 · <b>{count}개</b> 등록 · 폐기 {s.discardedExpiredCount}
      </div>
      <button className="chip small-chip" onClick={() => setEditing(!editing)}>{editing ? '닫기' : '더보기'}</button>
      <button className="chip small-chip end" onClick={finish}>정리 완료</button>
      {editing && (
        <div className="session-more">
          <div className="muted small">등록하지 않고 바로 버린 만료약</div>
          <div className="stepper">
            <button className="chip big" onClick={() => update((d) => bumpDiscarded(d, s.id, -1))}>−</button>
            <b>{s.discardedExpiredCount}개</b>
            <button className="chip big on" onClick={() => update((d) => bumpDiscarded(d, s.id, 1))}>만료약 폐기 +1</button>
          </div>
          <div className="muted small">수납 방식</div>
          <div className="chips">
            {STORAGE_METHODS.map((m) => (
              <button
                key={m}
                className={`chip ${s.storageMethods.includes(m) ? 'on' : ''}`}
                onClick={() =>
                  update((d) => ({
                    ...d,
                    sessions: d.sessions.map((x) =>
                      x.id === s.id
                        ? { ...x, storageMethods: x.storageMethods.includes(m) ? x.storageMethods.filter((y) => y !== m) : [...x.storageMethods, m] }
                        : x,
                    ),
                  }))
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// 단계별 작업시간 (선택 입력). 매번 Start/Stop 대신 종료 후 분 단위로 간단히 기록
function PhaseTimes({ sessionId, total, initial }: { sessionId: string; total: number; initial: Partial<Record<WorkPhase, number>> }) {
  const { update } = useStore()
  const [v, setV] = useState<Partial<Record<WorkPhase, number>>>(initial)
  const [saved, setSaved] = useState(false)
  const sum = Object.values(v).reduce<number>((a, b) => a + (b ?? 0), 0)
  return (
    <details className="card phase-card" open={Object.keys(initial).length > 0}>
      <summary><b>단계별 작업시간 입력 (선택)</b> <span className="muted small">사업성 분석용</span></summary>
      <div className="phase-grid">
        {WORK_PHASES.map(([key, label]) => (
          <label key={key} className="phase-row">
            <span>{label}</span>
            <input
              inputMode="numeric"
              value={v[key] ?? ''}
              placeholder="분"
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                setV({ ...v, [key]: Number.isNaN(n) ? undefined : n })
                setSaved(false)
              }}
            />
          </label>
        ))}
      </div>
      <p className={`small ${sum > total ? 'warn-text' : 'muted'}`}>입력 합계 {sum}분 / 총 작업시간 {total}분</p>
      <button className="btn btn-outline full" onClick={() => { update((d) => setPhaseMinutes(d, sessionId, v)); setSaved(true) }}>
        {saved ? '✓ 저장됨' : '단계별 시간 저장'}
      </button>
    </details>
  )
}

export function SessionSummary({ id }: { id: string }) {
  const nav = useNav()
  const { data } = useStore()
  const s = data.sessions.find((x) => x.id === id)
  if (!s?.summary) return null
  const sum = s.summary
  const surveyed = data.surveys.some((v) => v.sessionId === id)
  return (
    <div className="screen">
      <Header title="정리 완료" />
      <div className="card done">
        <div className="done-icon">✅</div>
        <h2>오늘 약장 정리가 완료되었습니다.</h2>
        <dl className="summary">
          <dt>총 의약품</dt><dd>{sum.householdTotal}개</dd>
          <dt>처방약 / 상비약</dt><dd>{sum.prescriptionTotal ?? sum.prescriptionCount}개 / {sum.otcCount ?? '-'}개</dd>
          <dt>만료 발견</dt><dd className={sum.expiredFound ? 'danger-text' : ''}>{sum.expiredFound}개</dd>
          <dt>3개월 이내 만료</dt><dd>{sum.expiringSoonCount ?? '-'}개</dd>
          <dt>확인 필요</dt><dd className={sum.needsReviewCount ? 'warn-text' : ''}>{sum.needsReviewCount ?? '-'}개</dd>
          <dt className="sub">· 제품 식별 불가</dt><dd className="sub">{sum.unidentifiedCount ?? '-'}</dd>
          <dt className="sub">· 누구 약인지 불명확한 처방약</dt><dd className="sub">{sum.rxOwnerUnknownCount ?? '-'}</dd>
          <dt className="sub">· 복용 여부 확인 필요 처방약</dt><dd className="sub">{sum.rxUseUnknownCount ?? '-'}</dd>
          <dt>이번에 등록</dt><dd>{sum.registeredCount}개</dd>
          <dt>사진인식 성공</dt><dd>{sum.recognitionSuccessCount ?? 0}/{sum.registeredCount}{sum.recognitionSuccessRate != null ? ` (사진 중 ${sum.recognitionSuccessRate}%)` : ''}</dd>
          <dt>인식 엔진</dt><dd>{s.recognitionEngines?.join(', ') || '-'}</dd>
          <dt>사진 / 직접 입력</dt><dd>{sum.photoEntryCount ?? 0} / {sum.manualEntryCount ?? 0}</dd>
          <dt>총 작업시간</dt><dd>{sum.durationMin}분</dd>
          <dt>수납 방식</dt><dd>{s.storageMethods.join(', ') || '-'}</dd>
        </dl>
        <p className="muted small">만료 발견 = 등록한 약 중 만료 + 바로 폐기한 만료약<br />인식 성공 = 사진에서 찾은 후보를 그대로 선택한 경우</p>
      </div>
      <PhaseTimes sessionId={s.id} total={sum.durationMin} initial={s.phaseMinutes ?? {}} />
      <div className="form-actions">
        <button className="btn btn-outline" onClick={() => nav.tab('home')}>홈으로</button>
        {!surveyed && <button className="btn btn-primary grow" onClick={() => nav.push({ name: 'survey', sessionId: id })}>고객 설문하기 ›</button>}
      </div>
    </div>
  )
}

const Q1 = ['실물 약 정리', '유효기간 확인', '약 위치 검색', '부모/자녀 공유', '진료/처방 일정', '공식 안전정보', '상비·응급 준비 체크', '기타']
const PRICES = ['19,000원', '29,000원', '39,000원', '49,000원', '59,000원', '이용하지 않음']
const REVISIT = ['이용', '가격에 따라 이용', '이용하지 않음']
const KNEW_APPS = ['알고 사용 중', '알았지만 사용하지 않음', '몰랐음']
const SELF_REGISTER = ['직접 할 수 있음', '귀찮아서 하지 않을 것 같음']
const EXPERT_FIRST = ['이용하겠다', '가격에 따라', '이용하지 않겠다']

export function SurveyScreen({ sessionId }: { sessionId: string | null }) {
  const nav = useNav()
  const { update } = useStore()
  const { household } = useHousehold()
  const [v, setV] = useState({
    mostUseful: '', mostUsefulOther: '', recommendScore: null as number | null, price: '', revisitIntent: '', feedback: '',
    knewApps: '', selfRegister: '', expertFirst: '',
  })
  if (!household) return null
  const choice = (k: 'mostUseful' | 'price' | 'revisitIntent' | 'knewApps' | 'selfRegister' | 'expertFirst', options: string[]) => (
    <div className="chips">
      {options.map((o) => (
        <button key={o} className={`chip big ${v[k] === o ? 'on' : ''}`} onClick={() => setV({ ...v, [k]: o })}>{o}</button>
      ))}
    </div>
  )
  return (
    <div className="screen">
      <Header title="간단한 설문" back />
      <p className="muted pad">더 좋은 서비스를 위해 1분만 응답해 주세요. 모두 선택 사항입니다.</p>
      <div className="field"><span className="label">1. 오늘 가장 유용했던 것은 무엇인가요?</span>{choice('mostUseful', Q1)}
        {v.mostUseful === '기타' && <input value={v.mostUsefulOther} onChange={(e) => setV({ ...v, mostUsefulOther: e.target.value })} placeholder="직접 입력" />}
      </div>
      <div className="field">
        <span className="label">2. 이 서비스를 가족이나 지인에게 추천하고 싶나요?</span>
        <div className="score">
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} className={`chip ${v.recommendScore === i ? 'on' : ''}`} onClick={() => setV({ ...v, recommendScore: i })}>{i}</button>
          ))}
        </div>
        <div className="score-legend muted small"><span>전혀 아니다</span><span>매우 그렇다</span></div>
      </div>
      <div className="field"><span className="label">3. 유료로 이용한다면 어느 정도가 적당한가요?</span>{choice('price', PRICES)}</div>
      <div className="field"><span className="label">4. 6개월 후 약장 재정리 서비스가 있다면?</span>{choice('revisitIntent', REVISIT)}</div>
      <div className="field"><span className="label">5. 기존에 약 관리 앱이 있다는 것을 알고 있었나요?</span>{choice('knewApps', KNEW_APPS)}</div>
      <div className="field"><span className="label">6. 직접 집에 있는 약을 모두 앱에 등록해야 한다면?</span>{choice('selfRegister', SELF_REGISTER)}</div>
      <div className="field"><span className="label">7. 처음 한 번 전문가가 방문해 정리·등록해 준다면 이용하시겠어요?</span>{choice('expertFirst', EXPERT_FIRST)}</div>
      <label className="field">
        <span className="label">8. 불편했던 점 또는 추가되었으면 하는 기능</span>
        <textarea rows={3} value={v.feedback} onChange={(e) => setV({ ...v, feedback: e.target.value })} />
      </label>
      <div className="form-actions">
        <button
          className="btn btn-primary grow"
          onClick={() => {
            update((d) => addSurvey(d, { ...v, householdId: household.id, sessionId }))
            alert('응답해 주셔서 감사합니다.')
            nav.tab('home')
          }}
        >
          제출
        </button>
      </div>
    </div>
  )
}
