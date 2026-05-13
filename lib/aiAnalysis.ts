import { loadStore } from './localStore'
import { allWords, getWordById } from './vocab'
import { calculateLearningStats } from './stats'
import { getTodayMimoPlan, getTodayProgress, getMimoPlanSettings } from './mimoPlan'
import type {
  LocalAnalysisResult,
  WeakWordItem,
  MemoryCurvePoint,
  AiAnalyzeRequest,
  CachedAiAnalysis,
  AiAnalysisResult,
  TopReviewWord,
  ConfusingWordPair,
  TomorrowPlan,
} from './aiTypes'
import { AI_ANALYSIS_CACHE_KEY, AI_ANALYSIS_VERSION } from './aiTypes'

function computeOverdueWeight(nextReviewAt: string | null): number {
  if (!nextReviewAt) return 0
  const now = Date.now()
  const due = new Date(nextReviewAt).getTime()
  if (due > now) return 0
  const hoursOverdue = (now - due) / (1000 * 60 * 60)
  return Math.min(5, Math.round(hoursOverdue / 24))
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null
  const ms = Date.now() - new Date(isoDate).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function getWordStatus(status: string): string {
  const map: Record<string, string> = {
    unseen: '未接触',
    learning: '学习中',
    fuzzy: '模糊',
    known: '认识',
    mastered: '已掌握',
  }
  return map[status] ?? status
}

export function computeLocalAnalysis(): LocalAnalysisResult {
  const store = loadStore()
  const pm = store.wordProgress
  const stats = store.userStats
  const wrongWordsMap = store.wrongWords

  // Use unified stats calculation from stats.ts
  const learningStats = calculateLearningStats(allWords.length, pm)

  let overdue = 0
  let totalQuizCorrect = 0
  let totalQuizWrong = 0
  let knownCount = 0

  for (const p of Object.values(pm)) {
    if (p.status === 'known') knownCount++
    if (p.nextReviewAt && new Date(p.nextReviewAt) < new Date()) overdue++
    totalQuizCorrect += p.quizCorrectCount
    totalQuizWrong += p.quizWrongCount
  }

  const totalQuiz = totalQuizCorrect + totalQuizWrong
  const quizAccuracy = totalQuiz > 0 ? Math.round((totalQuizCorrect / totalQuiz) * 100) : null

  const masteryRate =
    learningStats.touchedWords > 0
      ? Math.round((learningStats.masteredWords / learningStats.touchedWords) * 100)
      : 0

  // Build weak word list using consistent weak score
  const weakWords: WeakWordItem[] = []
  for (const p of Object.values(pm)) {
    if (p.status === 'mastered' && p.wrongCount === 0 && p.fuzzyCount === 0) continue
    const overdueWeight = computeOverdueWeight(p.nextReviewAt)
    const weakScore = p.wrongCount * 3 + p.fuzzyCount * 2 - p.correctCount + overdueWeight
    if (weakScore <= 0) continue

    const vocabWord = getWordById(p.wordId)
    if (!vocabWord) continue

    let reason = ''
    if (p.wrongCount > 0 && p.fuzzyCount > 0) {
      reason = `错 ${p.wrongCount} 次，模糊 ${p.fuzzyCount} 次`
    } else if (p.wrongCount > 0) {
      reason = `错 ${p.wrongCount} 次`
    } else if (p.fuzzyCount > 0) {
      reason = `模糊 ${p.fuzzyCount} 次，识别不稳定`
    }
    if (p.status !== 'mastered') {
      reason += reason ? `，尚未掌握` : `尚未掌握`
    }

    weakWords.push({
      wordId: p.wordId,
      word: vocabWord.word,
      meaning: vocabWord.meaning,
      weakScore,
      wrongCount: p.wrongCount,
      fuzzyCount: p.fuzzyCount,
      correctCount: p.correctCount,
      isOverdue: overdueWeight > 0,
      daysSinceReview: daysSince(p.lastReviewedAt),
      exampleEn: vocabWord.examples[0]?.en ?? '',
      status: p.status,
      reason,
    })
  }

  // Include wrong words not yet in wordProgress
  for (const ww of Object.values(wrongWordsMap)) {
    if (pm[ww.wordId]) continue
    const vocabWord = getWordById(ww.wordId)
    if (!vocabWord) continue
    weakWords.push({
      wordId: ww.wordId,
      word: vocabWord.word,
      meaning: vocabWord.meaning,
      weakScore: ww.wrongCount * 3,
      wrongCount: ww.wrongCount,
      fuzzyCount: 0,
      correctCount: 0,
      isOverdue: new Date(ww.nextReviewAt) < new Date(),
      daysSinceReview: daysSince(ww.lastWrongAt),
      exampleEn: vocabWord.examples[0]?.en ?? '',
      status: 'learning',
      reason: `错 ${ww.wrongCount} 次`,
    })
  }

  weakWords.sort((a, b) => b.weakScore - a.weakScore)
  const top30 = weakWords.slice(0, 30)

  // Build high-frequency unmastered words list
  const highFreqUnmasteredWords: WeakWordItem[] = []
  for (const vocabWord of allWords) {
    if (vocabWord.frequencyLevel !== '高频') continue
    const p = pm[vocabWord.id]
    if (p?.status === 'mastered') continue

    const status = p?.status ?? 'unseen'
    const wrongCount = p?.wrongCount ?? 0
    const fuzzyCount = p?.fuzzyCount ?? 0
    const overdueWeight = computeOverdueWeight(p?.nextReviewAt ?? null)
    const weakScore = wrongCount * 3 + fuzzyCount * 2 + overdueWeight + 1

    highFreqUnmasteredWords.push({
      wordId: vocabWord.id,
      word: vocabWord.word,
      meaning: vocabWord.meaning,
      weakScore,
      wrongCount,
      fuzzyCount,
      correctCount: p?.correctCount ?? 0,
      isOverdue: overdueWeight > 0,
      daysSinceReview: p ? daysSince(p.lastReviewedAt) : null,
      exampleEn: vocabWord.examples[0]?.en ?? '',
      status,
      reason: `高频词，${getWordStatus(status)}`,
    })
  }
  highFreqUnmasteredWords.sort((a, b) => b.weakScore - a.weakScore)
  const top10HighFreq = highFreqUnmasteredWords.slice(0, 10)

  const memoryCurve: MemoryCurvePoint[] = [
    {
      label: '未学',
      count: learningStats.remainingUnseenWords,
      percentage: Math.round((learningStats.remainingUnseenWords / allWords.length) * 100),
    },
    {
      label: '学习中',
      count:
        learningStats.touchedWords -
        learningStats.masteredWords -
        knownCount -
        learningStats.fuzzyWords,
      percentage: 0,
    },
    {
      label: '模糊',
      count: learningStats.fuzzyWords,
      percentage: Math.round((learningStats.fuzzyWords / allWords.length) * 100),
    },
    {
      label: '认识',
      count: knownCount,
      percentage: Math.round((knownCount / allWords.length) * 100),
    },
    {
      label: '已掌握',
      count: learningStats.masteredWords,
      percentage: Math.round((learningStats.masteredWords / allWords.length) * 100),
    },
  ]
  const learningOnlyCount = Math.max(
    0,
    learningStats.touchedWords - learningStats.masteredWords - knownCount - learningStats.fuzzyWords
  )
  memoryCurve[1].count = learningOnlyCount
  memoryCurve[1].percentage = Math.round((learningOnlyCount / allWords.length) * 100)

  // Get today's plan and progress
  const todayPlan = getTodayMimoPlan()
  const todayProgress = getTodayProgress()
  const planSettings = getMimoPlanSettings()

  const todayPlanNewWords = todayPlan?.newWordIds?.length ?? 0
  const todayPlanReviewWords = todayPlan?.reviewWordIds?.length ?? 0
  const todayPlanWrongWords = todayPlan?.wrongWordIds?.length ?? 0
  const todayPlanFuzzyWords = todayPlan?.fuzzyWordIds?.length ?? 0
  const todayPlanSentenceMeaning = todayPlan?.sentenceMeaningWordIds?.length ?? 0

  const todayTotalTasks =
    todayPlanNewWords +
    todayPlanReviewWords +
    todayPlanWrongWords +
    todayPlanFuzzyWords +
    todayPlanSentenceMeaning

  const todayCompletedTasks = todayProgress
    ? (todayProgress.newWordsDone ?? 0) +
      (todayProgress.reviewWordsDone ?? 0) +
      (todayProgress.wrongWordsDone ?? 0) +
      (todayProgress.fuzzyWordsDone ?? 0)
    : 0

  const todayCompletionRate =
    todayTotalTasks > 0 ? Math.round((todayCompletedTasks / todayTotalTasks) * 100) : null

  return {
    totalWords: allWords.length,
    seenWords: learningStats.touchedWords,
    masteredWords: learningStats.masteredWords,
    knownWords: knownCount,
    learningWords: learningOnlyCount,
    fuzzyWords: learningStats.fuzzyWords,
    wrongWords: learningStats.wrongWords,
    unseenWords: learningStats.remainingUnseenWords,
    overdueCount: overdue,
    weakWords: top30,
    highFreqUnmasteredWords: top10HighFreq,
    memoryCurve,
    streakDays: stats.streakDays,
    totalPoints: stats.points,
    quizAccuracy,
    masteryRate,
    todayPlanNewWords,
    todayPlanReviewWords,
    todayPlanWrongWords,
    todayPlanFuzzyWords,
    todayPlanSentenceMeaning,
    todayCompletedTasks,
    todayTotalTasks,
    todayCompletionRate,
    dailyNewWordsMode: planSettings.dailyNewWordsMode,
    dailyNewWords: planSettings.dailyNewWords,
    dailyReviewLimit: planSettings.dailyReviewLimit,
    dailyIntensity: planSettings.dailyIntensity,
  }
}

export function buildAiRequest(analysis: LocalAnalysisResult): AiAnalyzeRequest {
  return {
    stats: {
      totalWords: analysis.totalWords,
      touchedWords: analysis.seenWords,
      masteredWords: analysis.masteredWords,
      knownWords: analysis.knownWords,
      fuzzyWords: analysis.fuzzyWords,
      wrongWords: analysis.wrongWords,
      unseenWords: analysis.unseenWords,
      masteryRate: analysis.masteryRate,
      quizAccuracy: analysis.quizAccuracy,
      todayCompletionRate: analysis.todayCompletionRate,
      streakDays: analysis.streakDays,
      overdueCount: analysis.overdueCount,
    },
    weakWords: analysis.weakWords.slice(0, 20).map((w) => ({
      word: w.word,
      meaning: w.meaning,
      weakScore: w.weakScore,
      wrongCount: w.wrongCount,
      fuzzyCount: w.fuzzyCount,
      correctCount: w.correctCount,
      status: w.status ?? 'learning',
      reason: w.reason,
      exampleEn: w.exampleEn,
    })),
    highFreqUnmasteredWords: analysis.highFreqUnmasteredWords.slice(0, 10).map((w) => ({
      word: w.word,
      meaning: w.meaning,
      status: w.status ?? 'unseen',
      wrongCount: w.wrongCount,
      fuzzyCount: w.fuzzyCount,
    })),
    todayPlan: {
      newWords: analysis.todayPlanNewWords,
      reviewWords: analysis.todayPlanReviewWords,
      wrongWords: analysis.todayPlanWrongWords,
      fuzzyWords: analysis.todayPlanFuzzyWords,
      sentenceMeaningWords: analysis.todayPlanSentenceMeaning,
      completedTasks: analysis.todayCompletedTasks,
      totalTasks: analysis.todayTotalTasks,
    },
    planSettings: {
      dailyNewWordsMode: analysis.dailyNewWordsMode,
      dailyNewWords: analysis.dailyNewWords,
      dailyReviewLimit: analysis.dailyReviewLimit,
      intensity: analysis.dailyIntensity,
    },
    // Legacy fields kept for backward compat
    totalWords: analysis.totalWords,
    seenWords: analysis.seenWords,
    masteredWords: analysis.masteredWords,
    learningWords: analysis.learningWords,
    fuzzyWords: analysis.fuzzyWords,
    overdueCount: analysis.overdueCount,
    streakDays: analysis.streakDays,
    quizAccuracy: analysis.quizAccuracy,
  }
}

/**
 * Generate a concrete local fallback diagnosis when AI is unavailable.
 * Uses real data from weak words, high-freq unmastered, and plan stats.
 */
export function generateLocalFallback(analysis: LocalAnalysisResult): AiAnalysisResult {
  const {
    seenWords,
    masteredWords,
    knownWords,
    fuzzyWords,
    wrongWords,
    unseenWords,
    masteryRate,
    quizAccuracy,
    todayCompletionRate,
    streakDays,
    weakWords,
    highFreqUnmasteredWords,
    todayPlanNewWords,
    todayPlanReviewWords,
    todayPlanWrongWords,
    dailyNewWords,
  } = analysis

  // Determine main problem
  let mainProblem = ''
  if (seenWords === 0) {
    mainProblem = '还没有开始学习，先完成一次学习任务，就能看到具体诊断。'
  } else if (wrongWords > 10) {
    mainProblem = `你目前有 ${wrongWords} 个错词积压，错词量偏多，建议今天优先清理错词，而不是继续增加新词。`
  } else if (fuzzyWords > 20) {
    mainProblem = `你目前有 ${fuzzyWords} 个模糊词，说明识别不稳定。建议降低每日新词量，加强已接触词的复习。`
  } else if (masteryRate < 30 && seenWords > 20) {
    mainProblem = `已接触 ${seenWords} 个词，但掌握率只有 ${masteryRate}%，说明新词学得多但巩固不足，建议减少新词，多复习。`
  } else if (masteredWords / Math.max(1, seenWords) < 0.5 && seenWords > 10) {
    mainProblem = `已接触词里掌握率偏低（${masteryRate}%），当前问题不是新词量，而是已学词的掌握不稳定。`
  } else {
    mainProblem = `当前学习状态良好，继续保持复习节奏，重点攻克薄弱词。`
  }

  // Determine today's conclusion
  let todayConclusion = ''
  if (seenWords === 0) {
    todayConclusion = '暂无足够学习数据，完成一次学习或测验后会生成更具体的诊断。'
  } else if (wrongWords > 10 || fuzzyWords > 15) {
    todayConclusion = `今天的主要问题是错词（${wrongWords}个）和模糊词（${fuzzyWords}个）积压，新词量不宜继续增加。`
  } else if (masteryRate < 30) {
    todayConclusion = `今天应以复习为主：已接触 ${seenWords} 词但掌握率仅 ${masteryRate}%，先把基础打牢。`
  } else {
    todayConclusion = `学习进度正常，已掌握 ${masteredWords} 词，当前重点是攻克薄弱词并保持复习节奏。`
  }

  // Top 5 review words from weak words
  const top5Weak = weakWords.slice(0, 5)
  const topReviewWords: TopReviewWord[] = top5Weak.map((w) => ({
    word: w.word,
    meaning: w.meaning,
    reason: w.reason ?? `弱点分 ${w.weakScore}`,
    wrongCount: w.wrongCount,
    fuzzyCount: w.fuzzyCount,
    status: getWordStatus(w.status ?? 'learning'),
  }))

  // Confusing word pairs from high-freq unmastered + weak words vocab data
  const confusingWordsList: ConfusingWordPair[] = []
  const checkedWords = new Set<string>()
  const candidates = [...weakWords.slice(0, 15), ...highFreqUnmasteredWords.slice(0, 5)]
  for (const w of candidates) {
    if (confusingWordsList.length >= 5) break
    if (checkedWords.has(w.wordId)) continue
    checkedWords.add(w.wordId)
    const vocabWord = getWordById(w.wordId)
    if (!vocabWord?.confusingWords?.length) continue
    for (const cw of vocabWord.confusingWords.slice(0, 1)) {
      confusingWordsList.push({
        word: w.word,
        confusingWith: cw.word,
        reason: cw.difference || `"${w.word}" 与 "${cw.word}" 易混淆`,
      })
    }
  }

  // Tomorrow's plan calculation
  const suggestedNewWords = (() => {
    if (wrongWords > 10 || fuzzyWords > 20) return Math.max(0, Math.round(dailyNewWords * 0.5))
    if (masteryRate < 30) return Math.max(0, Math.round(dailyNewWords * 0.7))
    return dailyNewWords
  })()

  const suggestedReview = Math.min(
    analysis.dailyReviewLimit,
    Math.max(10, (analysis.overdueCount > 0 ? analysis.overdueCount : todayPlanReviewWords) + 5)
  )

  const tomorrowPlan: TomorrowPlan = {
    newWords: suggestedNewWords,
    reviewWords: suggestedReview,
    wrongWords: Math.min(wrongWords, 10),
    sentenceMeaningWords: Math.min(suggestedNewWords, 10),
  }

  // Daily new word adjustment recommendation
  let dailyNewWordAdjustment = ''
  if (wrongWords > 10 || fuzzyWords > 20) {
    dailyNewWordAdjustment = `建议把每日新词从 ${dailyNewWords} 降到 ${suggestedNewWords}，因为错词（${wrongWords}个）和模糊词（${fuzzyWords}个）合计偏多，先清理积压再扩展。`
  } else if (masteryRate < 30 && seenWords > 20) {
    dailyNewWordAdjustment = `建议把每日新词从 ${dailyNewWords} 降到 ${suggestedNewWords}，当前掌握率（${masteryRate}%）偏低，需要加强已学词复习。`
  } else {
    dailyNewWordAdjustment = `当前复习压力不高，可以维持每日 ${dailyNewWords} 个新词，继续保持节奏。`
  }

  // Short encouragement
  let encouragement = ''
  if (seenWords === 0) {
    encouragement = '开始第一次学习，诊断会更具体。'
  } else if (wrongWords > 5) {
    encouragement = '先把薄弱词清掉，学习效率会更高。'
  } else {
    encouragement = '保持每天复习，记忆会越来越稳固。'
  }

  // Summary (used by legacy display)
  const summary =
    seenWords === 0
      ? '暂无足够学习数据，完成一次学习或测验后会生成更具体的诊断。'
      : `已接触 ${seenWords} 个词，已掌握 ${masteredWords} 个（${masteryRate}%），模糊词 ${fuzzyWords} 个，错词 ${wrongWords} 个。` +
        (quizAccuracy !== null ? `测验正确率 ${quizAccuracy}%。` : '') +
        (todayCompletionRate !== null ? `今日完成率 ${todayCompletionRate}%。` : '')

  // Legacy todayPlan array
  const todayPlanArr: string[] = []
  if (todayPlanWrongWords > 0) {
    todayPlanArr.push(`先复习 ${todayPlanWrongWords} 个错词`)
  }
  if (todayPlanReviewWords > 0) {
    todayPlanArr.push(`复习 ${todayPlanReviewWords} 个到期词`)
  }
  if (todayPlanNewWords > 0) {
    todayPlanArr.push(`学习 ${todayPlanNewWords} 个新词`)
  }
  if (todayPlanArr.length === 0 && seenWords > 0) {
    todayPlanArr.push('今日暂无计划，可前往今日计划页生成')
  }

  // Legacy practice suggestions
  const practiceSuggestions: string[] = []
  if (weakWords.length > 0) {
    practiceSuggestions.push(`重点复习 ${weakWords.slice(0, 3).map((w) => w.word).join('、')} 等薄弱词`)
  }
  if (highFreqUnmasteredWords.length > 0) {
    practiceSuggestions.push(
      `高频未掌握词包括 ${highFreqUnmasteredWords.slice(0, 3).map((w) => w.word).join('、')}，建议优先攻克`
    )
  }
  if (quizAccuracy !== null && quizAccuracy < 70) {
    practiceSuggestions.push('测验正确率偏低，建议放慢节奏，确保当前词掌握后再学新词')
  }

  // Legacy weak word analysis
  const weakWordAnalysis = top5Weak.map((w) => ({
    word: w.word,
    issue: w.reason ?? `弱点分 ${w.weakScore}`,
    tip: `重点复习，确保能在测验中答对`,
  }))

  // Determine overall level
  let overallLevel: AiAnalysisResult['overallLevel'] = '入门'
  if (masteryRate >= 80) overallLevel = '精通'
  else if (masteryRate >= 60) overallLevel = '熟练'
  else if (masteryRate >= 40) overallLevel = '进阶'
  else if (masteryRate >= 20) overallLevel = '基础'

  const memoryCurveInsight =
    seenWords === 0
      ? '尚无学习数据，开始学习后会生成记忆曲线分析。'
      : `已接触词掌握率 ${masteryRate}%，` +
        (fuzzyWords > 10 ? `模糊词较多（${fuzzyWords}个），说明记忆不稳定。` : '记忆状态良好。')

  return {
    todayConclusion,
    mainProblem,
    topReviewWords,
    confusingWordsList,
    tomorrowPlan,
    dailyNewWordAdjustment,
    summary,
    overallLevel,
    memoryCurveInsight,
    weakWordAnalysis,
    todayPlan: todayPlanArr,
    practiceSuggestions,
    encouragement,
  }
}

export function loadCachedAiAnalysis(): CachedAiAnalysis | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AI_ANALYSIS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedAiAnalysis
    if (parsed.version !== AI_ANALYSIS_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function saveCachedAiAnalysis(result: AiAnalysisResult): void {
  if (typeof window === 'undefined') return
  const cache: CachedAiAnalysis = {
    result,
    cachedAt: new Date().toISOString(),
    version: AI_ANALYSIS_VERSION,
  }
  localStorage.setItem(AI_ANALYSIS_CACHE_KEY, JSON.stringify(cache))
}

export function isCacheStale(cachedAt: string): boolean {
  const cacheDate = new Date(cachedAt)
  const now = new Date()
  return (
    cacheDate.getFullYear() !== now.getFullYear() ||
    cacheDate.getMonth() !== now.getMonth() ||
    cacheDate.getDate() !== now.getDate()
  )
}

export function clearAiAnalysisCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AI_ANALYSIS_CACHE_KEY)
}
