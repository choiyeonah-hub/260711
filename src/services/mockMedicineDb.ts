// 프로토타입용 mock 의약품 DB (흐름 테스트용, 약 40개).
// 정확한 성분·제조사·분류는 식약처 의약품 DB 연결 후 그 값으로 대체한다. 여기 값을 의료정보로 쓰지 않는다.
// externalClass: 식약처 효능군 성격의 분류 (우리 12분류와 별개)
export interface ProductRecord {
  id: string
  name: string // 표시용 전체 이름
  baseName: string // 함량을 뺀 제품명 (매칭용)
  strength?: string
  ingredient?: string
  manufacturer?: string
  dosageForm?: string
  externalClass?: string
}

type Row = [string, string, string | undefined, string | undefined, string | undefined, string | undefined, string | undefined]
// baseName, 표시명 접미(함량), 함량, 성분, 제조사, 제형, 분류
const ROWS: Row[] = [
  ['타이레놀정', '500mg', '500mg', '아세트아미노펜', '한국존슨앤드존슨', '정제', '해열.진통.소염제'],
  ['타이레놀8시간이알서방정', '650mg', '650mg', '아세트아미노펜', '한국존슨앤드존슨', '서방정', '해열.진통.소염제'],
  ['어린이타이레놀현탁액', '', undefined, '아세트아미노펜', '한국존슨앤드존슨', '현탁액', '해열.진통.소염제'],
  ['게보린정', '', undefined, undefined, '삼진제약', '정제', '해열.진통.소염제'],
  ['펜잘큐정', '', undefined, undefined, '종근당', '정제', '해열.진통.소염제'],
  ['탁센연질캡슐', '', undefined, '나프록센', '녹십자', '연질캡슐', '해열.진통.소염제'],
  ['이지엔6애니연질캡슐', '', undefined, '이부프로펜', '대웅제약', '연질캡슐', '해열.진통.소염제'],
  ['애드빌리퀴겔', '', undefined, '이부프로펜', undefined, '연질캡슐', '해열.진통.소염제'],
  ['어린이부루펜시럽', '', undefined, '이부프로펜', '삼일제약', '시럽', '해열.진통.소염제'],
  ['챔프시럽', '', undefined, '아세트아미노펜', '동아제약', '시럽', '해열.진통.소염제'],
  ['판콜에이내복액', '', undefined, undefined, '동화약품', '내복액', '종합감기약'],
  ['판피린큐액', '', undefined, undefined, '동아제약', '내복액', '종합감기약'],
  ['콜대원코프시럽', '', undefined, undefined, '대원제약', '시럽', '진해거담제'],
  ['알레그라정', '180mg', '180mg', '펙소페나딘염산염', '한독', '정제', '항히스타민제'],
  ['알레그라정', '120mg', '120mg', '펙소페나딘염산염', '한독', '정제', '항히스타민제'],
  ['지르텍정', '', '10mg', '세티리진염산염', undefined, '정제', '항히스타민제'],
  ['용각산', '', undefined, undefined, '보령', '산제', '진해거담제'],
  ['베아제정', '', undefined, undefined, '대웅제약', '정제', '건위소화제'],
  ['닥터베아제정', '', undefined, undefined, '대웅제약', '정제', '건위소화제'],
  ['훼스탈플러스정', '', undefined, undefined, '한독', '정제', '건위소화제'],
  ['까스활명수큐액', '', undefined, undefined, '동화약품', '내복액', '건위소화제'],
  ['겔포스엠현탁액', '', undefined, undefined, '보령', '현탁액', '제산제'],
  ['개비스콘더블액션현탁액', '', undefined, undefined, undefined, '현탁액', '제산제'],
  ['스멕타현탁액', '', undefined, '디오스멕타이트', '대웅제약', '현탁액', '정장제(지사)'],
  ['정로환', '', undefined, undefined, '동성제약', '환제', '정장제(지사)'],
  ['둘코락스에스장용정', '', undefined, undefined, undefined, '장용정', '하제'],
  ['후시딘연고', '', undefined, '퓨시드산나트륨', '동화약품', '연고', '외용 피부질환용제'],
  ['마데카솔케어연고', '', undefined, undefined, '동국제약', '연고', '외용 피부질환용제'],
  ['비판텐연고', '', undefined, '덱스판테놀', '바이엘코리아', '연고', '외용 피부질환용제'],
  ['베타딘액', '', undefined, '포비돈요오드', undefined, '외용액', '외용 소독제'],
  ['메디폼', '', undefined, undefined, undefined, '드레싱', '창상 드레싱'],
  ['듀오덤엑스트라씬', '', undefined, undefined, undefined, '드레싱', '창상 드레싱'],
  ['대일밴드', '', undefined, undefined, undefined, '반창고', '반창고·밴드'],
  ['종이반창고', '', undefined, undefined, undefined, '테이프', '반창고·밴드'],
  ['리프레쉬플러스점안액', '', undefined, '카르복시메틸셀룰로오스나트륨', undefined, '점안액', '안과용제'],
  ['히알루론산나트륨점안액', '0.1%', '0.1%', '히알루론산나트륨', undefined, '점안액', '안과용제'],
  ['케토톱플라스타', '', undefined, '케토프로펜', '한독', '첩부제', '외용 진통소염제(관절·근육)'],
  ['신신파스아렉스', '', undefined, undefined, '신신제약', '첩부제', '외용 진통소염제(관절·근육)'],
  ['트라스트패취', '', undefined, '피록시캄', 'SK케미칼', '첩부제', '외용 진통소염제(관절·근육)'],
  ['우루사정', '100mg', '100mg', '우르소데옥시콜산', '대웅제약', '정제', '간장질환용제'],
  // 안전정보 화면 시연용 가상 제품 (실존 제품 아님)
  ['(예시) 가상약A정', '', undefined, '예시성분A', undefined, '정제', '예시 처방약'],
  ['(예시) 가상약B정', '', undefined, '예시성분B', undefined, '정제', '예시 처방약'],
  ['(예시) 레보도파·카르비도파정', '', undefined, '레보도파+카르비도파', undefined, '정제', '항파킨슨제'],
]

export const MOCK_PRODUCTS: ProductRecord[] = ROWS.map(([baseName, suffix, strength, ingredient, manufacturer, dosageForm, externalClass], i) => ({
  id: `mock-${i + 1}`,
  name: suffix ? `${baseName} ${suffix}` : baseName,
  baseName,
  strength,
  ingredient,
  manufacturer,
  dosageForm,
  externalClass,
}))
