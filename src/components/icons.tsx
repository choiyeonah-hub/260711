import {
  Activity, Bandage, Bone, Box, Droplet, Droplets, Eye, Fish, Flower2, Layers, Package, Pill, Ruler, Soup,
  Sprout, Sun, Thermometer, Wind, Baby, Square, Tablets, HeartPulse, type LucideIcon, type LucideProps,
} from 'lucide-react'
import type { ProductType } from '../types'

// 앱 전체에서 lucide outline 아이콘 한 세트만 사용한다 (이모지 사용 안 함)
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // 의약품 12분류
  c01: Thermometer, c02: Flower2, c03: Wind, c04: Soup, c05: Baby, c06: Pill,
  c07: Droplets, c08: Bandage, c09: Eye, c10: Bone, c11: Droplet, c12: Box,
  // 영양제
  s01: Sun, s02: Fish, s03: Sprout, s04: Eye, s05: Activity, s06: Tablets,
  // 의료용품
  m01: Thermometer, m02: Bandage, m03: Layers, m04: Square, m05: Ruler, m06: Package,
}

export function CategoryIcon({ id, ...props }: { id?: string } & LucideProps) {
  const Icon = (id && CATEGORY_ICONS[id]) || Box
  return <Icon aria-hidden {...props} />
}

export const TYPE_ICONS: Record<ProductType, LucideIcon> = { MEDICINE: Pill, SUPPLEMENT: HeartPulse, MEDICAL_SUPPLY: Bandage }
