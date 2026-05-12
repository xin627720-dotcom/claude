import { NextRequest, NextResponse } from 'next/server'
import type { AiAnalyzeRequest, AiAnalysisResult } from '@/lib/aiTypes'

// URL, model and key are all read from env so they work with any OpenAI-compatible provider
function getApiConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const baseURL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  const apiUrl = `${baseURL}/chat/completions`
  return { apiKey, model, apiUrl }
}

function buildSystemPrompt(): string {
  return `你是一位专业的英语学习顾问，擅长分析高中生的词汇学习数据并给出个性化建议。
请根据用户提供的学习数据，用中文给出专业的学习诊断报告。
你的分析应该具体、鼓励性、可操作，避免泛泛而谈。

请严格按照以下 JSON 格式返回，不要有任何额外文字：
{
  "summary": "2-3句总体评价",
  "overallLevel": "入门|基础|进阶|熟练|精通",
  "memoryCurveInsight": "1-2句关于记忆曲线的洞察",
  "weakWordAnalysis": [
    {"word": "单词", "issue": "问题描述", "tip": "记忆建议"}
  ],
  "todayPlan": ["今日计划第1条", "今日计划第2条", "今日计划第3条"],
  "practiceSuggestions": ["练习建议1", "练习建议2", "练习建议3"],
  "encouragement": "1句个性化鼓励"
}`
}

function buildUserPrompt(data: AiAnalyzeRequest): string {
  const masteredPct = data.totalWords > 0
    ? Math.round((data.masteredWords / data.totalWords) * 100)
    : 0

  const weakWordsSummary = data.weakWords.slice(0, 20).map((w) =>
    `- ${w.word}（${w.meaning}）: 错${w.wrongCount}次 模糊${w.fuzzyCount}次 正确${w.correctCount}次 弱点分${w.weakScore}` +
    (w.exampleEn ? `\n  例：${w.exampleEn}` : '')
  ).join('\n')

  return `学习数据摘要：
- 词库总词数：${data.totalWords}
- 已学词数：${data.seenWords}（${masteredPct}% 已掌握）
- 已掌握：${data.masteredWords} | 学习中：${data.learningWords} | 模糊：${data.fuzzyWords}
- 逾期待复习：${data.overdueCount}
- 连续学习天数：${data.streakDays}
- 测验正确率：${data.quizAccuracy !== null ? data.quizAccuracy + '%' : '暂无数据'}

薄弱词汇（按弱点分排序，最多20个）：
${weakWordsSummary || '暂无薄弱词汇'}

请给出学习诊断报告。weakWordAnalysis 只分析最弱的5个词，每条 tip 要具体（如词根、谐音、联想等记忆法）。`
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { apiKey, model, apiUrl } = getApiConfig()

  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  let body: AiAnalyzeRequest
  try {
    body = await req.json() as AiAnalyzeRequest
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body || typeof body.totalWords !== 'number') {
    return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(body) },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json(
        { error: 'provider_error', status: response.status, message: errText },
        { status: 502 }
      )
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 502 })
    }

    const result = JSON.parse(content) as AiAnalysisResult
    return NextResponse.json(result)
  } catch (e) {
    console.error('[ai/analyze] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
