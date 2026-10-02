import {
  Car, Citrus, Clock, Droplets, Info, OctagonAlert, Repeat, Ruler, Scissors, TriangleAlert, UserRound, type LucideIcon, type LucideProps,
} from 'lucide-react'
import type { SafetyInformation, SafetyLevel } from '../types'

const LEVEL_ICON: Record<SafetyLevel, LucideIcon> = { CRITICAL: OctagonAlert, CAUTION: TriangleAlert, INFO: Info }
const TYPE_ICON: Partial<Record<SafetyInformation['type'], LucideIcon>> = {
  FOOD_DRINK: Citrus, ADMINISTRATION: Clock, DAILY_LIFE: Car, BODY_CHANGE: Droplets, THERAPEUTIC_DUPLICATION: Repeat,
  SPLIT_CAUTION: Scissors, ELDERLY_CAUTION: UserRound, DOSE_CAUTION: Ruler,
}

export function LevelIcon({ level, ...p }: { level: SafetyLevel } & LucideProps) {
  const I = LEVEL_ICON[level]
  return <I aria-hidden className={`lv-icon lv-${level}`} {...p} />
}

export function SafetyTypeIcon({ info, ...p }: { info: SafetyInformation } & LucideProps) {
  const I = TYPE_ICON[info.type] ?? LEVEL_ICON[info.level]
  return <I aria-hidden className={`lv-icon lv-${info.level}`} {...p} />
}
