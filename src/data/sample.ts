import type { AppData, CurrentUseStatus, Medicine } from '../types'
import { MOCK_PRODUCTS } from '../services/mockMedicineDb'
import { splitIngredients } from './medicineMeta'
import { addDays, addMonthsYm } from '../lib/dates'
import { createHousehold, deleteHousehold, saveMedicine } from './actions'

// 화면 확인용 가상 데이터. 날짜는 오늘 기준 상대값이라 항상 정상/임박/만료가 모두 보인다.
export function addSampleHousehold(d0: AppData): AppData {
  let d = createHousehold(d0, '어머니 집 (샘플)', ['엄마', '아빠', '공용'])
  const hid = d.currentHouseholdId!
  d = { ...d, households: d.households.map((h) => (h.id === hid ? { ...h, isSample: true } : h)) }
  const fm = (n: string) => d.familyMembers.find((m) => m.householdId === hid && m.name === n)!.id
  const mom = fm('엄마'), dad = fm('아빠'), shared = fm('공용')

  type Row = [string, string, string, string | null, string | null, boolean, string | null, string | null, string?, CurrentUseStatus?]
  // 이름, 분류, 위치, 가족, 유효기간, 처방약, 다음 진료/처방 예정일, 수량, 연결할 제품 DB id(있으면 '제품 확인됨'), 복용 여부
  const rows: Row[] = [
    ['샘플 해열진통정', 'c01', '12칸 약장 ①', shared, addMonthsYm(18), false, null, '1통', 'mock-1'],
    ['샘플 어린이 해열시럽', 'c05', '냉장고', shared, addDays(-20), false, null, '1병', 'mock-3'],
    ['샘플 소염진통 캡슐', 'c01', '12칸 약장 ①', shared, addMonthsYm(11), false, null, '6캡슐', 'mock-6'],
    ['샘플 진통 연질캡슐', 'c01', '거실 약바구니', shared, addMonthsYm(7), false, null, '4캡슐', 'mock-7'],
    ['샘플 종합감기 캡슐', 'c02', '12칸 약장 ②', shared, addDays(25), false, null, '반 통'],
    ['샘플 알레르기정', 'c02', '12칸 약장 ②', shared, addMonthsYm(10), false, null, '10정', 'mock-14'],
    ['샘플 기침 시럽', 'c03', '12칸 약장 ③', shared, addDays(5), false, null, '1병'],
    ['샘플 소화정', 'c04', '주방 상부장', shared, addDays(70), false, null, '10정'],
    ['샘플 지사제', 'c04', '주방 상부장', shared, addDays(-90), false, null, null],
    ['샘플 소독약', 'c07', '거실 약바구니', shared, addMonthsYm(24), false, null, null],
    ['샘플 일회용 밴드', 'c08', '거실 약바구니', shared, null, false, null, '20매'],
    ['샘플 인공눈물', 'c09', '안방 첫 번째 서랍', mom, addDays(12), false, null, '5개'],
    ['샘플 파스', 'c10', '거실 약바구니', shared, addMonthsYm(14), false, null, '1팩', 'mock-37'],
    ['샘플 상처 연고', 'c11', '12칸 약장 ⑪', shared, addMonthsYm(8), false, null, null],
    ['샘플 혈압약 (아빠)', 'c06', '아버지 약 파우치', dad, addMonthsYm(12), true, addDays(3), '30일분', 'mock-41', 'IN_USE'],
    ['샘플 당뇨약 (아빠)', 'c06', '아버지 약 파우치', dad, addMonthsYm(12), true, addDays(3), '30일분', 'mock-42', 'IN_USE'],
    ['샘플 파킨슨약 (엄마)', 'c06', '안방 첫 번째 서랍', mom, addMonthsYm(9), true, addDays(14), '4주분', 'mock-43', 'IN_USE'],
    ['샘플 골다공증약 (엄마)', 'c06', '안방 첫 번째 서랍', mom, addMonthsYm(9), true, addDays(14), '4주분', undefined, 'UNKNOWN'],
    ['샘플 남은 처방약 (누구 약?)', 'c06', '주방 상부장', null, addDays(-200), true, null, '5정', undefined, 'UNKNOWN'],
  ]
  for (const [name, categoryId, locationName, familyMemberId, expirationDate, isPrescription, nextAppointmentDate, quantity, productId, currentUseStatus] of rows) {
    const product = MOCK_PRODUCTS.find((p) => p.id === productId)
    const input: Omit<Medicine, 'id' | 'householdId' | 'storageLocationId' | 'createdAt' | 'updatedAt'> = {
      name, categoryId, familyMemberId, expirationDate, isPrescription, nextAppointmentDate, quantity,
      photo: null, memo: null, sessionId: null,
      product: product
        ? { source: 'mock', externalId: product.id, externalCategory: product.externalClass, manufacturer: product.manufacturer,
            strength: product.strength, dosageForm: product.dosageForm, ingredients: splitIngredients(product.ingredient) }
        : { source: 'manual' },
      currentUseStatus: isPrescription ? currentUseStatus : undefined,
    }
    d = saveMedicine(d, hid, { ...input, locationName })
  }
  // 수납 방식 예시
  d = { ...d, storageLocations: d.storageLocations.map((l) => (l.householdId === hid && l.name.startsWith('12칸') ? { ...l, storageType: '12칸 서랍' as const } : l)) }
  return d
}

export function removeSampleHouseholds(d: AppData): AppData {
  return d.households.filter((h) => h.isSample).reduce((acc, h) => deleteHousehold(acc, h.id), d)
}
