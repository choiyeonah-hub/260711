import { useState } from 'react'
import { useHousehold, useStore } from '../data/store'
import { addFamilyMember, createHousehold, deleteFamilyMember, deleteHousehold, renameFamilyMember, updateHousehold } from '../data/actions'
import { addSampleHousehold, removeSampleHouseholds } from '../data/sample'
import type { AppData } from '../types'
import { useNav } from '../nav'
import { Header } from '../components/ui'

export function Settings() {
  const nav = useNav()
  const { data, update, replaceAll } = useStore()
  const { household, members } = useHousehold()
  const [joinCode, setJoinCode] = useState('')
  const hasSample = data.households.some((h) => h.isSample)

  function join() {
    const h = data.households.find((x) => x.shareCode.toUpperCase() === joinCode.trim().toUpperCase())
    if (h) { update((d) => ({ ...d, currentHouseholdId: h.id })); setJoinCode(''); return }
    // TODO: 서버(Supabase 등) 연결 후 코드로 원격 household 조회 + 가족 초대/권한 처리
    alert('다른 기기와의 공유는 아직 준비 중입니다.\n지금은 [데이터 백업 내보내기 → 상대 기기에서 가져오기]로 옮길 수 있습니다.')
  }

  async function exportJson() {
    const name = `약장백업_${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
    // 아이폰: 공유 시트(카톡·에어드롭·파일 저장)로 보내기
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }) } catch { /* 사용자가 취소 */ }
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file?: File) {
    if (!file) return
    try {
      const d = JSON.parse(await file.text()) as AppData
      if (d.version !== 1 || !Array.isArray(d.medicines)) throw new Error('형식이 다릅니다')
      if (confirm('현재 기기의 데이터를 백업 파일 내용으로 바꿀까요?')) replaceAll(d)
    } catch (e) { alert('가져오기 실패: ' + e) }
  }

  return (
    <div className="screen">
      <Header title="설정" />

      <p className="section-title">가정 선택</p>
      {data.households.map((h) => (
        <div key={h.id} className={`card row-card ${h.id === household?.id ? 'selected' : ''}`}>
          <button className="grow left" onClick={() => update((d) => ({ ...d, currentHouseholdId: h.id }))}>
            {h.id === household?.id ? '✅' : '🏠'} {h.name}
          </button>
          {h.id === household?.id && (
            <button className="chip" onClick={() => { const n = prompt('가정 이름', h.name); if (n?.trim()) update((d) => updateHousehold(d, h.id, { name: n.trim() })) }}>이름 변경</button>
          )}
        </div>
      ))}
      <button className="btn btn-outline full" onClick={() => nav.push({ name: 'newHousehold' })}>+ 새 가정 추가</button>

      {household && (
        <>
          <p className="section-title">가족 ({household.name})</p>
          <div className="card">
            {members.map((m) => (
              <div key={m.id} className="member-row">
                <span className="grow">{m.name}{m.isShared && <span className="muted small"> (공용)</span>}</span>
                <button className="chip" onClick={() => { const n = prompt('이름', m.name); if (n?.trim()) update((d) => renameFamilyMember(d, m.id, n.trim())) }}>수정</button>
                <button className="chip" onClick={() => confirm(`‘${m.name}’을(를) 삭제할까요? 연결된 약은 '가족 미지정'이 됩니다.`) && update((d) => deleteFamilyMember(d, m.id))}>삭제</button>
              </div>
            ))}
            <button className="chip" onClick={() => { const n = prompt('추가할 가족 이름 (예: 할머니)'); if (n?.trim()) update((d) => addFamilyMember(d, household.id, n.trim())) }}>+ 가족 추가</button>
          </div>

          <p className="section-title">가족 공유</p>
          <div className="card">
            <div>우리집 코드</div>
            <div className="share-code">{household.shareCode}</div>
            <div className="join">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="코드 입력 (예: MOM-4821)" />
              <button className="btn btn-outline" onClick={join}>참여</button>
            </div>
            <p className="muted small">※ 시험 버전: 여러 기기 실시간 공유는 준비 중입니다.</p>
          </div>

          <p className="section-title">정리 작업 기록 · 설문</p>
          <SessionHistory />
          <button className="btn btn-outline full" onClick={() => nav.push({ name: 'survey', sessionId: null })}>설문 바로 열기</button>
        </>
      )}

      <p className="section-title">데이터</p>
      <div className="card stack">
        <button className="btn btn-outline" onClick={exportJson}>⬇️ 데이터 백업 내보내기 (JSON)</button>
        <label className="btn btn-outline">
          ⬆️ 백업 파일 가져오기
          <input type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </label>
        {hasSample ? (
          <button className="btn btn-danger-outline" onClick={() => confirm('샘플 가정과 샘플 약을 모두 삭제할까요?') && update(removeSampleHouseholds)}>샘플 데이터 전체 삭제</button>
        ) : (
          <button className="btn btn-outline" onClick={() => update(addSampleHousehold)}>샘플 데이터 다시 넣기</button>
        )}
        {household && !household.isSample && (
          <button className="btn btn-danger-outline" onClick={() => confirm(`‘${household.name}’과 모든 약·기록을 삭제할까요? 되돌릴 수 없습니다.`) && update((d) => deleteHousehold(d, household.id))}>현재 가정 삭제</button>
        )}
      </div>

      <p className="muted small pad disclaimer">
        이 앱은 이미 보유한 의약품의 분류·위치·유효기간과 가족이 입력한 진료/처방 예정일을 기록하는 도구입니다.
        질병 진단, 약 추천, 복용 방법·용량 안내를 하지 않습니다. 복용 관련 문의는 의사·약사와 상의하세요.
      </p>
    </div>
  )
}

function SessionHistory() {
  const { data } = useStore()
  const { household } = useHousehold()
  const sessions = data.sessions.filter((s) => s.householdId === household?.id && s.summary).reverse()
  const surveys = data.surveys.filter((s) => s.householdId === household?.id)
  if (!sessions.length && !surveys.length) return <div className="card muted">아직 기록이 없습니다.</div>
  return (
    <div className="card">
      {sessions.map((s) => (
        <div key={s.id} className="history">
          <b>{new Date(s.startedAt).toLocaleDateString('ko-KR')}</b> · {s.summary!.durationMin}분 · 등록 {s.summary!.registeredCount} · 만료 {s.summary!.expiredFound} · 처방 {s.summary!.prescriptionCount}
          <div className="muted small">{s.storageMethods.join(', ') || '수납방식 미기록'}</div>
        </div>
      ))}
      {surveys.map((v) => (
        <div key={v.id} className="history">
          📝 설문 {new Date(v.createdAt).toLocaleDateString('ko-KR')} · 추천 {v.recommendScore ?? '-'}점 · {v.price || '-'} · 재점검 {v.revisitIntent || '-'}
          <div className="muted small">{[v.mostUseful === '기타' ? v.mostUsefulOther : v.mostUseful, v.feedback].filter(Boolean).join(' / ')}</div>
        </div>
      ))}
    </div>
  )
}

export function NewHousehold() {
  const nav = useNav()
  const { update } = useStore()
  const [name, setName] = useState('')
  const [members, setMembers] = useState('엄마, 아빠, 공용')
  return (
    <div className="screen">
      <Header title="새 가정 추가" back />
      <label className="field">
        <span className="label">가정 이름</span>
        <input className="input-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 어머니 집, 시댁" />
      </label>
      <label className="field">
        <span className="label">가족 (쉼표로 구분)</span>
        <input value={members} onChange={(e) => setMembers(e.target.value)} />
        <span className="hint muted">‘공용’은 상비약용입니다.</span>
      </label>
      <div className="form-actions">
        <button
          className="btn btn-primary grow"
          disabled={!name.trim()}
          onClick={() => {
            const list = members.split(',').map((s) => s.trim()).filter(Boolean)
            update((d) => createHousehold(d, name.trim(), list.includes('공용') ? list : [...list, '공용']))
            nav.tab('home')
          }}
        >
          만들기
        </button>
      </div>
    </div>
  )
}
