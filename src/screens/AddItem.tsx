import { ChevronRight } from 'lucide-react'
import { PRODUCT_TYPES, PRODUCT_TYPE_LABEL, type ProductType } from '../types'
import { TYPE_ICONS } from '../components/icons'
import { Header } from '../components/ui'
import { useNav } from '../nav'
import { MedicineForm } from './MedicineForm'

const DESC: Record<ProductType, string> = {
  MEDICINE: '상비약·처방약 · 사진으로 빠르게 등록',
  SUPPLEMENT: '비타민·오메가3·유산균 등',
  MEDICAL_SUPPLY: '체온계·밴드·드레싱·거즈 등',
}

// 등록 첫 단계: 무엇을 등록할까요?
export function AddChooser() {
  const nav = useNav()
  return (
    <div className="screen">
      <Header title="품목 등록" />
      <p className="lead">무엇을 등록할까요?</p>
      <div className="stack">
        {PRODUCT_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t]
          return (
            <button
              key={t}
              className={`card choice ${t === 'MEDICINE' ? 'primary' : ''}`}
              onClick={() => nav.replace(t === 'MEDICINE' ? { name: 'addMedicine' } : { name: 'addItem', productType: t })}
            >
              <span className="choice-icon"><Icon size={26} strokeWidth={1.75} aria-hidden /></span>
              <span className="grow">
                <span className="choice-title">{PRODUCT_TYPE_LABEL[t]}</span>
                <span className="choice-desc">{DESC[t]}</span>
              </span>
              <ChevronRight size={22} aria-hidden className="muted" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 영양제·의료용품 등록 (같은 폼 + 사진 읽기 보조)
export function ItemRegister({ productType }: { productType: 'SUPPLEMENT' | 'MEDICAL_SUPPLY' }) {
  return <MedicineForm productType={productType} />
}
