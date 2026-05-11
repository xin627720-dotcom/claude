import { loadStore } from './localStore'
import { allWords, getWordById } from './vocab'
import type {
  LocalAnalysisResult,
  WeakWordItem,
  MemoryCurvePoint,
  AiAnalyzeRequest,
  CachedAiAnalysis,
  AiAnalysisResult,
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

export function computeLocalAnalysis(): LocalAnalysisResult {
  const store = loadStore()
  const pm = store.wordProgress
  const stats = store.userStats
  const wrongWordsMap = store.wrongWords

  let mastered = 0, learning = 0, fuzzy = 0, wrong = 0, unseen = 0, seen = 0, overdue = 0
  let totalQuizCorrect = 0, totalQuizWrong = 0

  for (const p of Object.values(pm)) {
    seen++
    if (p.status === 'mastered') mastered++
    else if (p.status === 'learning') learning++
    else if (p.status === 'fuzzy') fuzzy++
    if (p.isWrongWord) wrong++
    if (p.nextReviewAt && new Date(p.nextReviewAt) < new Date()) overdue++
    totalQuizCorrect += p.quizCorrectCount
    totalQuizWrong += p.quizWrongCount
  }
  unseen = allWords.length - seen

  const totalQuiz = totalQuizCorrect + totalQuizWrong
  const quizAccuracy = totalQuiz > 0 ? Math.round((totalQuizCorrect / totalQuiz) * 100) : null

  // Build weak word list
  const weakWords: WeakWordItem[] = []
  for (const p of Object.values(pm)) {
    if (p.status === 'mastered' && p.wrongCount === 0 && p.fuzzyCount === 0) continue
    const overdueWeight = computeOverdueWeight(p.nextReviewAt)
    const weakScore = p.wrongCount * 3 + p.fuzzyCount * 2 - p.correctCount + overdueWeight
    if (weakScore <= 0) continue

    const vocabWord = getWordById(p.wordId)
    if (!vocabWord) continue

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
    })
  }

  // Also include wrong words not yet in wordProgress
  for (const ww of Object.values(wrongWordsMap)) {
    if (pm[ww.wordId]) continue // already included
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
    })
  }

  weakWords.sort((a, b) => b.weakScore - a.weakScore)
  const top30 = weakWords.slice(0, 30)

  const memoryCurve: MemoryCurvePoint[] = [
    { label: '未学', count: unseen, percentage: Math.round((unseen / allWords.length) * 100) },
    { label: '学习中', count: learning, percentage: Math.round((learning / allWords.length) * 100) },
    { label: '模糊', count: fuzzy, percentage: Math.round((fuzzy / allWords.length) * 100) },
    { label: '认识', count: seen - mastered - learning - fuzzy, percentage: 0 },
    { label: '已掌握', count: mastered, percentage: Math.round((mastered / allWords.length) * 100) },
  ]
  const known = Math.max(0, seen - mastered - learning - fuzzy)
  memoryCurve[3].count = known
  memoryCurve[3].percentage = Math.round((known / allWords.length) * 100)

  return {
    totalWords: allWords.length,
    seenWords: seen,
    masteredWords: mastered,
    learningWords: learning,
    fuzzyWords: fuzzy,
    wrongWords: wrong,
    unseenWords: unseen,
    overdueCount: overdue,
    weakWords: top30,
    memoryCurve,
    streakDays: stats.streakDays,
    totalPoints: stats.points,
    quizAccuracy,
  }
}

export function buildAiRequest(analysis: LocalAnalysisResult): AiAnalyzeRequest {
  return {
    totalWords: analysis.totalWords,
    seenWords: analysis.seenWords,
    masteredWords: analysis.masteredWords,
    learningWords: analysis.learningWords,
    fuzzyWords: analysis.fuzzyWords,
    overdueCount: analysis.overdueCount,
    streakDays: analysis.streakDays,
    quizAccuracy: analysis.quizAccuracy,
    weakWords: analysis.weakWords.slice(0, 30).map((w) => ({
      word: w.word,
      meaning: w.meaning,
      weakScore: w.weakScore,
      wrongCount: w.wrongCount,
      fuzzyCount: w.fuzzyCount,
      correctCount: w.correctCount,
      exampleEn: w.exampleEn,
    })),
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
  // Stale if not from today
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
