import type { ReactNode } from 'react'
import { ChevronLeft, MapPin } from 'lucide-react'
import { PRODUCT_TYPE_SHORT, type Medicine } from '../types'
import { productTypeOf } from '../data/medicineMeta'
import { CategoryIcon } from './icons'
import { useHousehold } from '../data/store'
import { EXPIRY_LABEL, expiryStatus, formatExp, type ExpiryStatus } from '../lib/dates'
import { useNav } from '../nav'

export function Header({ title, back, right, onBack }: { title: ReactNode; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  const nav = useNav()
  return (
    <header className="header">
      {back && <button className="icon-btn back" onClick={onBack ?? nav.back} aria-label="뒤로"><ChevronLeft size={28} strokeWidth={2} /></button>}
      <h1>{title}</h1>
      <div className="header-right">{right}</div>
    </header>
  )
}

export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  if (status === 'ok' || status === 'none') return null
  return <span className={`badge badge-${status}`}>{EXPIRY_LABEL[status]}</span>
}

export function MedicineCard({ m }: { m: Medicine }) {
  const nav = useNav()
  const { categories, locations, members } = useHousehold()
  const cat = categories.find((c) => c.id === m.categoryId)
  const loc = locations.find((l) => l.id === m.storageLocationId)
  const member = members.find((f) => f.id === m.familyMemberId)
  const st = expiryStatus(m.expirationDate)
  const type = productTypeOf(m)
  return (
    <button className={`card med-card ${st === 'expired' ? 'is-expired' : ''}`} onClick={() => nav.push({ name: 'detail', id: m.id })}>
      {m.photo ? <img className="thumb" src={m.photo} alt="" /> : <div className="thumb thumb-icon"><CategoryIcon id={cat?.id} size={24} strokeWidth={1.75} /></div>}
      <div className="med-body">
        <div className="med-name">
          {m.name}
          {m.isPrescription && <span className="tag">처방</span>}
          {type !== 'MEDICINE' && <span className="tag">{PRODUCT_TYPE_SHORT[type]}</span>}
        </div>
        <div className="med-loc"><MapPin size={16} aria-hidden />{loc?.name ?? '-'}</div>
        <div className="med-meta">
          {cat?.name}
          {member && ` · ${member.name}`}
          {m.expirationDate && ` · ~${formatExp(m.expirationDate)}`}
        </div>
        <ExpiryBadge status={st} />
      </div>
    </button>
  )
}

const SEVERITY: Record<ExpiryStatus, number> = { expired: 0, d7: 1, d30: 2, d90: 3, ok: 4, none: 5 }

export function sortMedicines(ms: Medicine[]): Medicine[] {
  return [...ms].sort(
    (a, b) =>
      SEVERITY[expiryStatus(a.expirationDate)] - SEVERITY[expiryStatus(b.expirationDate)] || a.name.localeCompare(b.name, 'ko'),
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
