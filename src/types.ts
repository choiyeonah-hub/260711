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
  icon: string
  order: number
}

export interface StorageLocation {
  id: string
  householdId: string
  name: string
  createdAt: string
}

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
  product?: { source: 'manual' | 'mfds'; externalId?: string; externalCategory?: string }
  sessionId?: string | null
  createdAt: string
  updatedAt: string
}

export const STORAGE_METHODS = ['12칸 서랍', '4~6칸 수납함', '바구니', '파우치', '기존 서랍', '기타'] as const

export interface OrganizationSession {
  id: string
  householdId: string
  startedAt: string
  endedAt: string | null
  storageMethods: string[]
  discardedExpiredCount: number // 등록하지 않고 바로 폐기한 만료약 수
  // 종료 시 스냅샷 (이후 약이 수정/삭제돼도 사업성 데이터는 유지)
  summary: {
    registeredCount: number
    expiredFound: number
    prescriptionCount: number
    householdTotal: number
    durationMin: number
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
  createdAt: string
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
}
