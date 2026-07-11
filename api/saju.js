const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.4-mini';
const ELEMENTS = ['목', '화', '토', '금', '수'];

function fallbackNumbers(exclude) {
  const excluded = new Set(exclude || []);
  const pool = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !excluded.has(n));
  const picked = [];
  while (picked.length < 6 && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return !Number.isNaN(t);
}

const VALID_GENDERS = new Set(['male', 'female', 'unspecified']);

async function saveDraw(record) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/rest/v1/saju_draws', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: 'Bearer ' + key,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
    });
    if (!resp.ok) {
      console.error('Supabase insert failed', resp.status, await resp.text());
    }
  } catch (err) {
    console.error('Supabase insert error', err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다.' });
  }

  const body = req.body || {};
  const birthDate = body.birthDate;
  const birthTime = body.birthTime;
  const gender = VALID_GENDERS.has(body.gender) ? body.gender : 'unspecified';

  if (!isValidDate(birthDate)) {
    return res.status(400).json({ error: '생년월일(YYYY-MM-DD)을 올바르게 입력해주세요.' });
  }

  const timeText = birthTime && birthTime !== 'unknown' ? birthTime + ' 무렵' : '모름 (시간 미상)';

  const systemPrompt = [
    '너는 한국 전통 명리학(사주팔자)에 정통한 다정한 사주 상담가야.',
    '입력된 양력 생년월일과 태어난 시간을 바탕으로 만세력 기준 년주/월주/일주/시주(간지 2글자씩)를 계산해.',
    '시간이 "모름"이면 시주는 null로 남겨두고 년주/월주/일주 세 기둥만으로 분석해.',
    '계산된 간지(시간을 알면 8글자, 모르면 6글자)에서 오행(목/화/토/금/수) 개수를 세어 어떤 기운이 강한지 파악해.',
    '그 분석을 바탕으로 로또 번호 6개(1~45, 중복 없이, 오름차순)를 추천해.',
    '번호 추천 원칙: 끝자리 1·6은 수, 2·7은 화, 3·8은 목, 4·9는 금, 5·10(0)은 토와 연결돼.',
    '사주에서 강하게 나타나는 오행과 연결된 숫자를 우선적으로, 나머지는 다양하게 섞어서 추천해.',
    '반드시 아래 JSON 스키마로만 응답하고 다른 설명은 절대 포함하지 마:',
    '{"pillars":{"year":"간지2글자","month":"간지2글자","day":"간지2글자","hour":"간지2글자 또는 null"},',
    '"elementCounts":{"목":0,"화":0,"토":0,"금":0,"수":0},',
    '"dominantElement":"목|화|토|금|수",',
    '"blurb":"두세 문장의 다정하고 구체적인 사주 해설(한국어, 존댓말)",',
    '"numbers":[6개의 서로 다른 1~45 정수, 오름차순]}',
  ].join(' ');

  const userPrompt = '생년월일: ' + birthDate + ' (양력)\n태어난 시간: ' + timeText;

  let completion;
  try {
    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('OpenAI API error', upstream.status, errText);
      return res.status(502).json({ error: '사주 분석 서버 호출에 실패했습니다.' });
    }

    const data = await upstream.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    completion = JSON.parse(content);
  } catch (err) {
    console.error('saju handler error', err);
    return res.status(502).json({ error: '사주 분석 중 오류가 발생했습니다.' });
  }

  let numbers = Array.isArray(completion.numbers)
    ? completion.numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
    : [];
  numbers = Array.from(new Set(numbers)).slice(0, 6);
  if (numbers.length < 6) {
    numbers = numbers.concat(fallbackNumbers(numbers)).slice(0, 6);
  }
  numbers.sort((a, b) => a - b);

  const elementCounts = {};
  ELEMENTS.forEach((el) => {
    const raw = completion.elementCounts && completion.elementCounts[el];
    elementCounts[el] = Number.isInteger(raw) ? raw : 0;
  });

  const dominantElement = ELEMENTS.includes(completion.dominantElement)
    ? completion.dominantElement
    : ELEMENTS.reduce((a, b) => (elementCounts[b] > elementCounts[a] ? b : a), ELEMENTS[0]);

  const pillars = completion.pillars || null;
  const blurb = completion.blurb || '오늘도 좋은 기운이 함께하길 바라요.';

  await saveDraw({
    birth_date: birthDate,
    birth_time: birthTime && birthTime !== 'unknown' ? birthTime : null,
    gender,
    pillars,
    element_counts: elementCounts,
    dominant_element: dominantElement,
    blurb,
    numbers,
  });

  return res.status(200).json({
    pillars,
    elementCounts,
    dominantElement,
    blurb,
    numbers,
  });
};
