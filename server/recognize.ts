import Anthropic from '@anthropic-ai/sdk'

// 약 포장 사진 → 글자 추출 (Claude 비전).
// 키: 서버 환경변수 ANTHROPIC_API_KEY (코드/클라이언트에 넣지 않음)
// 모델: RECOGNIZE_MODEL 로 변경 가능 (기본 claude-opus-5-5)
export const model = () => process.env.RECOGNIZE_MODEL || 'claude-opus-5-5'

export const isConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

const SCHEMA = {
  type: 'object',
  properties: {
    product_name: { type: ['string', 'null'] },
    manufacturer: { type: ['string', 'null'] },
    strength: { type: ['string', 'null'] },
    dosage_form: { type: ['string', 'null'] },
    expiry_date: { type: ['string', 'null'] },
    other_text: { type: 'array', items: { type: 'string' } },
  },
  required: ['product_name', 'manufacturer', 'strength', 'dosage_form', 'expiry_date', 'other_text'],
  additionalProperties: false,
}

const SYSTEM = `당신은 한국 의약품 포장(상자·병·튜브·약봉투) 사진에서 인쇄된 글자를 그대로 옮겨 적는 OCR 보조 도구입니다.
사진에 실제로 보이는 글자만 적고, 보이지 않거나 확실히 읽을 수 없는 항목은 null로 둡니다. 추측해서 채우지 않습니다.
- product_name: 포장에 가장 크게 인쇄된 제품명 (예: "알레그라정 180mg"이면 "알레그라정")
- manufacturer: 제조사/판매사 이름
- strength: 함량 (예: "180mg", "500밀리그램")
- dosage_form: 제형 (정, 캡슐, 시럽, 연고, 점안액 등)
- expiry_date: 사용기한/유효기간/EXP 로 표시된 날짜만, 가능한 경우 YYYY.MM.DD 또는 YYYY.MM 형식. 제조일자는 넣지 않음.
- other_text: 그 밖에 포장에서 읽힌 주요 글자 조각 최대 15개
복용 방법, 효능, 권고 등 사진에 없는 내용은 절대 덧붙이지 않습니다.`

export async function recognizeImage(imageBase64: string, mode: 'product' | 'expiry') {
  const client = new Anthropic()
  const MODEL = model()
  const isHaiku = MODEL.startsWith('claude-haiku')
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Haiku 4.5 는 effort/서버 fallback 미지원 → 해당 모델에서는 생략
    ...(isHaiku
      ? { output_config: { format: { type: 'json_schema' as const, schema: SCHEMA } } }
      : {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
          output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: SCHEMA } },
        }),
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          {
            type: 'text',
            text: mode === 'expiry'
              ? '이 사진은 포장의 사용기한 부분입니다. expiry_date 를 중심으로 읽어주세요.'
              : '이 의약품 포장 사진의 글자를 읽어주세요.',
          },
        ],
      },
    ],
  })
  if (response.stop_reason === 'refusal') throw new Error('refusal')
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('no text output')
  return JSON.parse(text.text) as Record<string, unknown>
}
