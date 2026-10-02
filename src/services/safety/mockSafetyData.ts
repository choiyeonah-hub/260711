import type { SafetyInformation, SafetySource } from '../../types'

// ⚠️ 예시(MOCK) 데이터: 화면·데이터 흐름 확인용. 실제 서비스 전 식약처 의약품 허가정보·DUR 데이터로 교체한다.
// - 실존 의약품 사이의 병용금기 등은 만들지 않았다 (가상 성분 '예시성분A/B'로만 시연)
// - 문구는 허가사항 성격의 사실 서술만 사용하며 복용 지시를 담지 않는다
// - 특정 약 화면에 하드코딩하지 않고, 성분/제품 키로 연결해 SafetyInfoService가 조회한다

const DUR: SafetySource = { name: '식약처 DUR', isMock: true }
const LABEL: SafetySource = { name: '식약처 의약품 허가정보', isMock: true }

type Entry = Omit<SafetyInformation, 'id' | 'source'> & { source?: SafetySource }

// 성분별 정보
export const BY_INGREDIENT: Record<string, Entry[]> = {
  아세트아미노펜: [
    { level: 'CAUTION', type: 'DOSE_CAUTION', title: '1일 최대 투여량 관련 공식정보',
      body: '허가사항에 1일 최대 투여량이 정해져 있는 성분입니다. 아세트아미노펜이 들어 있는 다른 제품과 함께 쓰는 경우 총량 확인이 안내되어 있습니다.', source: LABEL },
    { level: 'CAUTION', type: 'FOOD_DRINK', title: '음주 관련 주의',
      body: '허가사항에 정기적으로 술을 마시는 경우 사용 전 의사 또는 약사와 상의하도록 하는 문구가 있습니다.', source: LABEL },
  ],
  펙소페나딘염산염: [
    { level: 'CAUTION', type: 'FOOD_DRINK', title: '과일주스 관련 주의',
      body: '허가사항에 자몽·오렌지·사과 주스 등 과일주스와 함께 복용 시 흡수가 감소할 수 있다는 내용이 있습니다.', source: LABEL },
  ],
  세티리진염산염: [
    { level: 'CAUTION', type: 'DAILY_LIFE', title: '졸음·운전 관련 주의',
      body: '허가사항에 졸음이 나타날 수 있어 운전이나 기계 조작 시 주의하도록 하는 문구가 있습니다.', source: LABEL },
  ],
  케토프로펜: [
    { level: 'CAUTION', type: 'DAILY_LIFE', title: '햇빛(자외선) 노출 관련 주의',
      body: '허가사항에 붙인 부위를 햇빛에 노출하지 않도록 하는 주의 문구가 있습니다.', source: LABEL },
  ],
  레보도파: [
    { level: 'INFO', type: 'BODY_CHANGE', title: '소변·땀·침 색 변화',
      body: '허가사항에 소변, 땀, 침 등의 색이 짙어질 수 있다는 내용이 있습니다. 궁금한 점은 처방한 의사나 약사에게 확인하세요.', source: LABEL },
  ],
  예시성분A: [
    { level: 'CRITICAL', type: 'AGE_CONTRAINDICATION', title: '특정 연령대 금기 (예시)',
      body: '예시 데이터입니다. 실제 서비스에서는 DUR 연령금기 정보가 이 자리에 표시됩니다.', source: DUR },
    { level: 'CAUTION', type: 'ELDERLY_CAUTION', title: '노인주의 (예시)',
      body: '예시 데이터입니다. 실제 서비스에서는 DUR 노인주의 정보가 이 자리에 표시됩니다.', source: DUR },
  ],
  예시성분B: [
    { level: 'CRITICAL', type: 'PREGNANCY_CONTRAINDICATION', title: '임부금기 (예시)',
      body: '예시 데이터입니다. 실제 서비스에서는 DUR 임부금기 정보가 이 자리에 표시됩니다.', source: DUR },
    { level: 'CAUTION', type: 'DURATION_CAUTION', title: '투여기간주의 (예시)',
      body: '예시 데이터입니다. 실제 서비스에서는 DUR 투여기간주의 정보가 이 자리에 표시됩니다.', source: DUR },
  ],
}

// 제품(제형)별 정보 — key: 제품 DB id
export const BY_PRODUCT: Record<string, Entry[]> = {
  'mock-2': [
    { level: 'CAUTION', type: 'SPLIT_CAUTION', title: '서방정 분할주의',
      body: '서방형 제제로, 쪼개거나 부수지 않도록 안내되는 제형입니다.', source: DUR },
  ],
}

// 두 성분 조합 (병용금기) — 가상 성분으로만 시연
export const COMBINATIONS: { ingredients: [string, string]; entry: Entry }[] = [
  {
    ingredients: ['예시성분A', '예시성분B'],
    entry: { level: 'CRITICAL', type: 'COMBINATION_CONTRAINDICATION', title: '병용금기 (예시)',
      body: '예시 데이터입니다. 실제 서비스에서는 DUR 병용금기 정보(성분 조합과 공식 사유)가 이 자리에 표시됩니다.', source: DUR },
  },
]

// 효능군 중복 그룹 — 같은 그룹 성분을 가진 약이 2개 이상이면 표시
export const DUPLICATION_GROUPS: { id: string; name: string; ingredients: string[]; entry: Entry }[] = [
  {
    id: 'nsaid', name: '해열진통소염제(비스테로이드성)', ingredients: ['이부프로펜', '나프록센', '덱시부프로펜'],
    entry: { level: 'CAUTION', type: 'THERAPEUTIC_DUPLICATION', title: '효능군 중복 관련 공식정보',
      body: '같은 효능군(해열진통소염제)에 속하는 성분이 들어 있는 의약품이 여러 개 등록되어 있습니다. DUR 효능군 중복주의 대상 여부를 약사에게 확인하세요.', source: DUR },
  },
  {
    id: 'apap', name: '아세트아미노펜 함유 제품', ingredients: ['아세트아미노펜'],
    entry: { level: 'CAUTION', type: 'THERAPEUTIC_DUPLICATION', title: '같은 성분이 들어 있는 제품이 여러 개',
      body: '아세트아미노펜이 들어 있는 의약품이 여러 개 등록되어 있습니다. 허가사항의 총량 관련 정보를 약사에게 확인하세요.', source: LABEL },
  },
]
