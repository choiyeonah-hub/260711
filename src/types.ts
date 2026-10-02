// 데이터 모델. 백엔드(Supabase 등)로 옮길 때 테이블 단위가 되도록 엔티티를 분리해 둔다.

export interface Household {
  id: string
  name: string
  shareCode: string // 예: MOM-4821. 다기기 공유는 TODO(백엔드 필요)
  isSample?: boolean
  createdAt: string
}

export interface FamilyMember {
  id: string
  householdId: string
  name: string
  isShared: boolean // '공용' 여부
  order: number
}

export interface Category {
  id: string
  name: string
  icon: string // 이전 버전 호환용(화면 아이콘은 src/components/icons.tsx 에서 id로 매핑)
  order: number
  kind?: ProductType // 없으면 MEDICINE (의약품 12분류)
}

// 실제 수납 방식. 앱은 특정 수납함(예: 12칸 약장)에 종속되지 않는다.
export const STORAGE_TYPES = ['12칸 서랍', '4~6칸 수납함', '바구니', '파우치', '기존 서랍', '기타'] as const
export type StorageType = (typeof STORAGE_TYPES)[number]

export interface StorageLocation {
  id: string
  householdId: string
  name: string
  storageType?: StorageType
  createdAt: string
}

// 제품 식별 상태. 안전정보 자동 비교는 USER_CONFIRMED 이상만 대상으로 한다.
export type IdentificationStatus = 'UNVERIFIED' | 'USER_CONFIRMED' | 'OFFICIAL_DB_MATCHED'

// 품목 유형. 처방약/일반약 구분은 isPrescription 으로 한다.
// (이전 버전 값 PRESCRIPTION_MEDICINE·OTC_MEDICINE·HEALTH_SUPPLEMENT 는 normalizeData 에서 변환)
export type ProductType = 'MEDICINE' | 'SUPPLEMENT' | 'MEDICAL_SUPPLY'
export const PRODUCT_TYPES: ProductType[] = ['MEDICINE', 'SUPPLEMENT', 'MEDICAL_SUPPLY']
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  MEDICINE: '의약품', SUPPLEMENT: '영양제·건강기능식품', MEDICAL_SUPPLY: '의료용품',
}
export const PRODUCT_TYPE_SHORT: Record<ProductType, string> = { MEDICINE: '의약품', SUPPLEMENT: '영양제', MEDICAL_SUPPLY: '의료용품' }

// 처방약의 현재 복용 여부 (가족이 알려준 사실 기록용, 앱이 판단하지 않음)
export type CurrentUseStatus = 'IN_USE' | 'NOT_IN_USE' | 'UNKNOWN'

export interface Medicine {
  id: string
  householdId: string
  familyMemberId: string | null
  name: string
  categoryId: string
  storageLocationId: string
  expirationDate: string | null // 'YYYY-MM' 또는 'YYYY-MM-DD'
  quantity: string | null
  isPrescription: boolean
  nextAppointmentDate: string | null // 'YYYY-MM-DD'. 사용자가 입력한 값만 저장(추정 금지)
  photo: string | null // 압축된 JPEG dataURL
  memo: string | null
  // 외부 의약품 DB(식약처 등) 연결용. 우리 12분류(categoryId)와 별개로 보관.
  product?: {
    source: 'manual' | 'mock' | 'mfds'
    externalId?: string
    externalCategory?: string
    manufacturer?: string
    strength?: string
    dosageForm?: string
    ingredients?: string[] // 성분 비교(공식 안전정보 연결)용
  }
  identificationStatus?: IdentificationStatus // 없으면 normalize 단계에서 product.source 로 결정
  productType?: ProductType
  currentUseStatus?: CurrentUseStatus // 처방약일 때만 의미
  // 영양제·건강기능식품: 제품 표시 내용을 사용자가 확인해 기록 (앱이 섭취량을 정하지 않음)
  supplement?: { ingredients?: string; intakeLabel?: string }
  sessionId?: string | null
  createdAt: string
  updatedAt: string
}

export const STORAGE_METHODS = STORAGE_TYPES

// 작업시간 세부 측정 단계 (세션 종료 시 분 단위 입력)
export const WORK_PHASES = [
  ['collect', '약 수집'], ['sort', '분류'], ['expiry', '유효기간 확인'], ['register', '앱 등록'],
  ['space', '수납공간 정리'], ['store', '실제 수납'], ['label', '라벨링'], ['schedule', '처방 일정 등록'], ['explain', '설명/마무리'],
] as const
export type WorkPhase = (typeof WORK_PHASES)[number][0]

export interface OrganizationSession {
  id: string
  householdId: string
  startedAt: string
  endedAt: string | null
  storageMethods: string[]
  discardedExpiredCount: number // 등록하지 않고 바로 폐기한 만료약 수
  // 사진 등록 효과 측정 (이전 버전 데이터에는 없을 수 있음 → ?? 0)
  manualEntryCount?: number
  photoEntryCount?: number
  recognitionSuccessCount?: number // 사진에서 찾은 후보를 그대로 선택
  recognitionFailureCount?: number // 사진을 찍었지만 검색/직접입력으로 등록
  phaseMinutes?: Partial<Record<WorkPhase, number>>
  recognitionEngines?: string[] // 사용한 사진 인식 엔진/모델 (Opus·Haiku 비교용)
  // 종료 시 스냅샷 (이후 약이 수정/삭제돼도 사업성 데이터는 유지)
  summary: {
    registeredCount: number
    expiredFound: number
    prescriptionCount: number
    householdTotal: number
    durationMin: number
    photoEntryCount?: number
    manualEntryCount?: number
    recognitionSuccessRate?: number | null // 0~100
    recognitionSuccessCount?: number
    // 종료 시점 가정 전체 약 기준
    prescriptionTotal?: number
    otcCount?: number
    expiringSoonCount?: number // 90일 이내
    unidentifiedCount?: number // 제품 미확인
    rxOwnerUnknownCount?: number // 누구 약인지 불명확한 처방약
    rxUseUnknownCount?: number // 현재 복용 여부 확인 필요한 처방약
    needsReviewCount?: number // 위 세 항목에 해당하는 약 수(중복 제외)
  } | null
}

export interface Survey {
  id: string
  householdId: string
  sessionId: string | null
  mostUseful: string
  mostUsefulOther: string
  recommendScore: number | null
  price: string
  revisitIntent: string
  feedback: string
  knewApps?: string // 기존 약 관리 앱 인지
  selfRegister?: string // 직접 모두 등록해야 한다면
  expertFirst?: string // 처음 한 번 전문가 정리 후
  createdAt: string
}

// 공식 의약품 안전정보 (식약처 허가정보/DUR 등). 앱이 생성하지 않고 출처 데이터를 그대로 보여준다.
export type SafetyLevel = 'CRITICAL' | 'CAUTION' | 'INFO'
export type SafetyInfoType =
  | 'COMBINATION_CONTRAINDICATION' // 병용금기
  | 'AGE_CONTRAINDICATION' // 특정 연령대 금기
  | 'PREGNANCY_CONTRAINDICATION' // 임부금기
  | 'ELDERLY_CAUTION' // 노인주의
  | 'DOSE_CAUTION' // 용량주의
  | 'DURATION_CAUTION' // 투여기간주의
  | 'THERAPEUTIC_DUPLICATION' // 효능군 중복주의
  | 'SPLIT_CAUTION' // 서방정 분할주의
  | 'FOOD_DRINK' // 음식·음료 관련
  | 'ADMINISTRATION' // 복용 관련 공식정보(식전/식후, 간격)
  | 'DAILY_LIFE' // 졸림·운전 등 일상생활
  | 'BODY_CHANGE' // 소변·땀 색 변화 등 알아두면 좋은 변화
  | 'OTHER_OFFICIAL'

export interface SafetySource {
  name: string // 예: '식약처 DUR', '식약처 의약품 허가정보'
  url?: string
  isMock: boolean // true면 화면에 '예시 데이터' 표시
}

export interface SafetyInformation {
  id: string
  // 적용 대상. 현재는 MEDICINE 만 사용.
  // 영양제·의약품 상호작용(MEDICINE_SUPPLEMENT)은 검증된 공식 데이터 확보 후에만 추가한다 (AI 생성 금지)
  scope?: 'MEDICINE' | 'SUPPLEMENT' | 'MEDICINE_SUPPLEMENT'
  level: SafetyLevel
  type: SafetyInfoType
  title: string
  body: string // 출처 문구를 옮긴 내용 (앱이 새로 만들지 않음)
  source: SafetySource
}

// 가정 전체 약장에서 찾은 확인 필요 항목 (단일 약 또는 약 조합)
export interface SafetyFinding {
  id: string // 정보 id + 관련 약 id 조합 (중복 저장 방지 키)
  info: SafetyInformation
  medicineIds: string[]
}

export interface PharmacistQuestion {
  id: string
  householdId: string
  title: string // 예: 'OO정 + XX정'
  detail: string // 예: '병용 관련 공식정보 확인'
  medicineIds: string[]
  refKey?: string // 같은 항목 중복 추가 방지
  done: boolean
  createdAt: string
}

export type PreparednessStatus = 'AVAILABLE' | 'MISSING' | 'EXPIRED_ONLY' | 'UNKNOWN'

// 카테고리로 판단할 수 없는 항목(체온계 등)은 직접 체크한 값을 저장
export interface PreparednessCheck {
  householdId: string
  itemId: string
  status: 'AVAILABLE' | 'MISSING'
  updatedAt: string
}

// 알림. 지금은 데이터로부터 계산해 앱 내부 알림센터에만 표시한다.
// 추후 Push 연동 시 같은 계산 결과를 서버/스케줄러에서 발송하면 된다.
export interface Reminder {
  id: string // 대상+단계 조합이라 같은 알림은 같은 id
  householdId: string
  type: 'expiry' | 'appointment'
  targetId: string // medicineId 또는 familyMemberId
  dueDate: string
  daysLeft: number
  message: string
  urgent: boolean
}

export interface AppData {
  version: 1
  currentHouseholdId: string | null
  households: Household[]
  familyMembers: FamilyMember[]
  categories: Category[]
  storageLocations: StorageLocation[]
  medicines: Medicine[]
  sessions: OrganizationSession[]
  surveys: Survey[]
  readReminderIds: string[]
  pharmacistQuestions: PharmacistQuestion[]
  preparednessChecks: PreparednessCheck[]
}
