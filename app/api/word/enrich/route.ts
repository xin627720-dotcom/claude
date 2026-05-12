import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 503 })

  let body: { word?: string; meaning?: string; pos?: string; level?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { word, meaning, pos = '', level = '' } = body
  if (!word || !meaning) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const prompt = `You are an expert on Chinese gaokao (college entrance exam) English vocabulary.
Generate study content for the English word "${word}" (${pos} ${meaning}, level: ${level}).

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "frequencyLevel": "高频 or 中频 or 低频 or 超纲拓展",
  "examScenes": ["阅读理解场景1", "完形填空场景2"],
  "commonMeaningsInExam": ["高考常考含义1", "含义2"],
  "commonTraps": ["易错点1"],
  "examTips": ["考试提示1"],
  "gaokaoExamples": [
    {"en": "A natural English sentence using '${word}'.", "zh": "中文翻译", "source": "高考风格例句", "isRealExam": false},
    {"en": "Another example sentence with '${word}'.", "zh": "中文翻译", "source": "高考风格例句", "isRealExam": false}
  ],
  "wordFamily": [
    {"word": "relatedWord", "pos": "n./v./adj./adv.", "meaning": "中文含义", "relation": "noun"}
  ],
  "collocationItems": [
    {"phrase": "${word} + collocate", "meaning": "含义", "example": "example sentence"}
  ],
  "confusingWords": [
    {"word": "similar_word", "meaning": "含义", "difference": "区别：..."}
  ],
  "memoryTip": "记忆技巧（中文）",
  "usageNote": "用法说明（中文）"
}

CRITICAL: Every gaokaoExamples entry MUST have isRealExam: false and source: "高考风格例句". Never write a real exam paper as source (no "2023全国卷" etc.).
Include: 2 examples, 2-4 wordFamily members, 2-3 collocationItems, 1-2 confusingWords.`

  try {
    const resp = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) return NextResponse.json({ error: 'openai_error' }, { status: 502 })

    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'empty_response' }, { status: 500 })

    const enriched = JSON.parse(content)

    // Safety guard: force all examples to non-real-exam regardless of what AI returned
    if (Array.isArray(enriched.gaokaoExamples)) {
      enriched.gaokaoExamples = enriched.gaokaoExamples.map((ex: Record<string, unknown>) => ({
        ...ex,
        isRealExam: false,
        source: '高考风格例句',
      }))
    }

    return NextResponse.json(enriched)
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
