import type { ProductRecord } from './mockMedicineDb'

// 외부 DB 분류/제품명 → 우리 12분류 "제안". 확정은 항상 사용자가 한다.
// 순서가 중요: 위에 있는 규칙이 우선 (예: 어린이 해열시럽 → 소아)
const RULES: [RegExp, string][] = [
  [/점안|안약|안과|점이|귀약/, 'c09'],
  [/어린이|소아|유아|키즈/, 'c05'],
  [/파스|플라스타|패취|패치|첩부|관절|근육/, 'c10'],
  [/밴드|반창고|테이프/, 'c08'],
  [/드레싱|소독|포비돈|창상|거즈/, 'c07'],
  [/연고|크림|피부|외용 피부/, 'c11'],
  [/진해|거담|기침|가래|호흡/, 'c03'],
  [/항히스타민|알레르기|비염|감기/, 'c02'],
  [/해열|진통|소염/, 'c01'],
  [/소화|제산|정장|지사|하제|위장|위염|변비/, 'c04'],
]

export function suggestCategory(p: Pick<ProductRecord, 'name' | 'externalClass' | 'dosageForm'>): string {
  const text = [p.name, p.externalClass, p.dosageForm].filter(Boolean).join(' ')
  return RULES.find(([re]) => re.test(text))?.[1] ?? 'c12'
}
