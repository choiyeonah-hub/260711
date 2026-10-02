import { useEffect, useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { activeSession, addSurvey, bumpDiscarded, endSession, startSession } from '../data/actions'
import { STORAGE_METHODS } from '../types'
import { useNav } from '../nav'
import { Header } from '../components/ui'

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
    if (!confirm('약장 정리를 종료할까요?')) return
    update((d) => endSession(d, s!.id))
    nav.push({ name: 'sessionSummary', id: s!.id })
  }

  return (
    <div className="session-bar">
      <div className="session-info" onClick={() => setEditing(!editing)}>
        🧹 정리 중 · {mins}분 · <b>{count}개</b> 등록 · 폐기 {s.discardedExpiredCount}
      </div>
      <button className="chip small-chip" onClick={() => setEditing(!editing)}>{editing ? '닫기' : '더보기'}</button>
      <button className="chip small-chip end" onClick={finish}>종료</button>
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
          <dt>이번에 등록</dt><dd>{sum.registeredCount}개</dd>
          <dt>만료 발견</dt><dd className={sum.expiredFound ? 'danger-text' : ''}>{sum.expiredFound}개</dd>
          <dt>처방약</dt><dd>{sum.prescriptionCount}개</dd>
          <dt>작업시간</dt><dd>{sum.durationMin}분</dd>
          <dt>수납 방식</dt><dd>{s.storageMethods.join(', ') || '-'}</dd>
        </dl>
        <p className="muted small">만료 발견 = 등록한 약 중 만료 + 바로 폐기한 만료약</p>
      </div>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={() => nav.tab('home')}>홈으로</button>
        {!surveyed && <button className="btn btn-primary grow" onClick={() => nav.push({ name: 'survey', sessionId: id })}>고객 설문하기 ›</button>}
      </div>
    </div>
  )
}

const Q1 = ['약 정리', '유효기간 확인', '필요한 약을 쉽게 찾는 기능', '부모/자녀 약장 공유', '진료·처방 예정일 관리', '기타']
const PRICES = ['19,000원', '29,000원', '39,000원', '49,000원', '이용하지 않음']
const REVISIT = ['예', '가격에 따라', '아니오']

export function SurveyScreen({ sessionId }: { sessionId: string | null }) {
  const nav = useNav()
  const { update } = useStore()
  const { household } = useHousehold()
  const [v, setV] = useState({ mostUseful: '', mostUsefulOther: '', recommendScore: null as number | null, price: '', revisitIntent: '', feedback: '' })
  if (!household) return null
  const choice = (k: 'mostUseful' | 'price' | 'revisitIntent', options: string[]) => (
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
      <div className="field"><span className="label">4. 6개월 후 약장 재점검 서비스가 있다면 이용하시겠습니까?</span>{choice('revisitIntent', REVISIT)}</div>
      <label className="field">
        <span className="label">5. 불편했던 점 또는 추가되었으면 하는 기능</span>
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
