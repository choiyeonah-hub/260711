// '다음 약' 등록 사이에 유지할 값 (앱 실행 중에만 기억)
export const entryMemory = {
  keepFamily: true,
  keepLocation: true,
  keepCategory: false,
  familyMemberId: null as string | null,
  locationName: '',
  categoryId: '',
  isPrescription: false,
  nextAppointmentDate: '',
}
