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
  return `你是一位专业的英语词汇学习顾问，擅长基于真实学习数据给出具体、可操作的诊断建议。

重要要求：
1. 诊断必须基于用户提供的真实数据，不能泛泛而谈
2. 必须列出真实的具体单词，不能只说"薄弱词汇"
3. 给出的数量建议必须基于数据计算，不能随意写
4. 鼓励话只能放最后，且必须简短（一句话）
5. 不要说"你已迈出扎实第一步"、"建议加强复习"、"继续保持"等空话

请严格按照以下 JSON 格式返回，不要有任何额外文字：
{
  "todayConclusion": "一句话直接说今天最主要的问题，例如：今天主要问题是错词和模糊词积压，不宜继续增加新词",
  "mainProblem": "2-3句分析当前最大问题，必须提到具体数字",
  "topReviewWords": [
    {
      "word": "具体单词（从weakWords里取）",
      "meaning": "中文释义",
      "reason": "具体原因，如：错3次，最近一次仍答错",
      "wrongCount": 3,
      "fuzzyCount": 1,
      "status": "模糊"
    }
  ],
  "confusingWordsList": [
    {
      "word": "单词A",
      "confusingWith": "单词B",
      "reason": "两者容易混淆的具体原因"
    }
  ],
  "tomorrowPlan": {
    "newWords": 20,
    "reviewWords": 30,
    "wrongWords": 5,
    "sentenceMeaningWords": 10
  },
  "dailyNewWordAdjustment": "基于数据给出是否调整每日新词量的建议，必须说明理由和具体数字",
  "summary": "2-3句基于数据的总体评价，必须包含具体数字",
  "overallLevel": "入门|基础|进阶|熟练|精通",
  "memoryCurveInsight": "1-2句关于记忆状态的具体洞察",
  "weakWordAnalysis": [
    {"word": "具体单词", "issue": "具体问题描述，如：错了3次，模糊2次", "tip": "具体记忆方法"}
  ],
  "todayPlan": ["今日计划第1条（含具体数字）", "今日计划第2条"],
  "practiceSuggestions": ["具体练习建议，含单词名", "具体练习建议2"],
  "encouragement": "一句简短鼓励，不超过20字"
}

topReviewWords 必须从 weakWords 数据中取最弱的5个真实单词。
confusingWordsList 如果数据中有confusing words则列出，否则返回空数组 []。
tomorrowPlan 中的数字必须根据用户数据合理计算：
  - 如果 wrongWords > 10，newWords 不超过当前 dailyNewWords 的50%
  - 如果 fuzzyWords > 20，newWords 不超过当前 dailyNewWords 的70%
  - reviewWords 不超过 dailyReviewLimit
weakWordAnalysis 分析最弱的5个词，每条 tip 要具体（词根、联想、谐音等）。`
}

function buildUserPrompt(data: AiAnalyzeRequest): string {
  const s = data.stats
  const masteredPct = s.touchedWords > 0
    ? Math.round((s.masteredWords / s.touchedWords) * 100)
    : 0

  const weakWordsSummary = data.weakWords.slice(0, 20).map((w) =>
    `- ${w.word}（${w.meaning}）[${w.status}]: 错${w.wrongCount}次 模糊${w.fuzzyCount}次 正确${w.correctCount}次 弱点分${w.weakScore}` +
    (w.reason ? ` | ${w.reason}` : '')
  ).join('\n')

  const highFreqSummary = data.highFreqUnmasteredWords.slice(0, 10).map((w) =>
    `- ${w.word}（${w.meaning}）[${w.status}]: 错${w.wrongCount}次 模糊${w.fuzzyCount}次`
  ).join('\n')

  return `===== 学习统计数据 =====
- 词库总词数：${s.totalWords}
- 已接触词数：${s.touchedWords}（有学习记录）
- 已掌握：${s.masteredWords} 个（已接触中掌握率 ${masteredPct}%）
- 认识：${s.knownWords} 个
- 模糊：${s.fuzzyWords} 个
- 错词：${s.wrongWords} 个
- 未接触：${s.unseenWords} 个
- 逾期待复习：${s.overdueCount} 个
- 测验正确率：${s.quizAccuracy !== null ? s.quizAccuracy + '%' : '暂无数据'}
- 今日完成率：${s.todayCompletionRate !== null ? s.todayCompletionRate + '%' : '暂无数据'}
- 连续学习天数：${s.streakDays} 天

===== 今日计划 =====
- 新词：${data.todayPlan.newWords} 个
- 复习：${data.todayPlan.reviewWords} 个
- 错词：${data.todayPlan.wrongWords} 个
- 模糊词：${data.todayPlan.fuzzyWords} 个
- 句中识义：${data.todayPlan.sentenceMeaningWords} 题
- 今日已完成任务：${data.todayPlan.completedTasks} / ${data.todayPlan.totalTasks}

===== 当前计划设置 =====
- 每日新词模式：${data.planSettings.dailyNewWordsMode === 'auto' ? '自动' : '手动'}
- 每日新词目标：${data.planSettings.dailyNewWords} 个
- 每日复习上限：${data.planSettings.dailyReviewLimit} 个
- 学习强度：${data.planSettings.intensity}

===== 薄弱词汇（按弱点分排序，最多20个）=====
${weakWordsSummary || '暂无薄弱词汇'}

===== 高频未掌握词（最多10个）=====
${highFreqSummary || '暂无高频未掌握词，或高频词已全部掌握'}

===== 诊断要求 =====
1. topReviewWords 必须从上面"薄弱词汇"列表里取真实单词（最多5个），不能编造
2. tomorrowPlan 数字必须基于上面数据合理计算
3. 如果已接触词数为0，todayConclusion 写"暂无足够学习数据，完成一次学习或测验后会生成更具体的诊断"
4. 不要说空话，每条建议都要有依据`
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
        temperature: 0.4,
        max_tokens: 2000,
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
