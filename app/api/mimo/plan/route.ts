import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY
  const baseURL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  const apiUrl = `${baseURL}/chat/completions`

  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 503 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const systemPrompt = `你是一个高考英语阅读词汇学习规划师。
目标不是让学生拼写所有单词，而是让学生在高考阅读中看到英文能快速反应中文意思。
根据学生的剩余词量、错词、模糊词、到期复习词、高频词优先级和目标日期，生成今天最合适的阅读词汇计划。
重点安排：识别、复习、错词重认、句中识义、易混词辨析。
不要安排大量拼写任务，不要安排强制作文输出。
只返回 JSON，不要返回 Markdown 或代码块。`

  const userPrompt = buildUserPrompt(body)

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return NextResponse.json(
        { error: 'provider_error', status: resp.status, message: errText },
        { status: 502 }
      )
    }

    const data = await resp.json()
    let content = data.choices?.[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'empty_response' }, { status: 500 })

    // Strip markdown code blocks if AI wrapped them despite instructions
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

    const result = JSON.parse(content)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

function buildUserPrompt(body: Record<string, unknown>): string {
  const {
    date, targetDate, daysRemaining, totalWords, learnedWords, masteredWords,
    remainingUnseenWords, remainingUnmasteredWords,
    remainingWords,  // legacy field — kept for backward compat
    dailyNewTarget, intensity,
    candidateNewWords, candidateReviewWords, candidateWrongWords, candidateFuzzyWords,
  } = body

  // Prefer the explicit fields; fall back to legacy remainingWords if not provided
  const unseenDisplay = remainingUnseenWords ?? remainingWords ?? '?'
  const unmasteredDisplay = remainingUnmasteredWords ?? remainingWords ?? '?'

  const fmt = (words: unknown) =>
    Array.isArray(words)
      ? words.map((w: Record<string, unknown>) =>
          `${w.id}|${w.word}|${w.meaning}|${w.frequencyLevel ?? '?'}|${w.status}|错${w.wrongCount}模糊${w.fuzzyCount}`
        ).join('\n')
      : '无'

  return `今日日期：${date}
目标完成日期：${targetDate ?? '未设定'}
剩余天数：${daysRemaining}
词库总数：${totalWords} | 已接触：${learnedWords} | 已掌握：${masteredWords}
剩余未接触（从未学过）：${unseenDisplay}
剩余未掌握（含学习中/模糊）：${unmasteredDisplay}
每日新词建议（按未接触词 / 剩余天数计算）：${dailyNewTarget}
学习强度：${intensity}

【重要】新词候选是"从未接触过"的词，newWordIds 必须从候选新词 id 里选，数量尽量接近 dailyNewTarget。

候选新词（未接触，高频优先，格式 id|单词|意思|考频|状态|错误/模糊次数）：
${fmt(candidateNewWords)}

候选复习词（到期，格式同上）：
${fmt(candidateReviewWords)}

候选错词（错误次数多）：
${fmt(candidateWrongWords)}

候选模糊词：
${fmt(candidateFuzzyWords)}

请返回如下 JSON（wordIds 必须来自上面候选词的 id 字段，不能自造）：
{
  "planTitle": "今日计划标题（15字以内）",
  "aiSummary": "1-2句给学生的建议，聚焦阅读识义，口语化",
  "newWordIds": ["id1", "id2"],
  "reviewWordIds": ["id1"],
  "wrongWordIds": ["id1"],
  "fuzzyWordIds": ["id1"],
  "sentenceMeaningWordIds": ["id1"],
  "confusingWordIds": ["id1"],
  "estimatedMinutes": 25,
  "priorityReason": "本次计划优先级说明",
  "motivationalMessage": "1句鼓励语"
}`
}
