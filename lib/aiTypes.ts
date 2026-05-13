// Types for AI learning analysis feature

export interface WeakWordItem {
  wordId: string
  word: string
  meaning: string
  weakScore: number
  wrongCount: number
  fuzzyCount: number
  correctCount: number
  isOverdue: boolean
  daysSinceReview: number | null
  exampleEn: string
  status?: string
  reason?: string
}

export interface MemoryCurvePoint {
  label: string
  count: number
  percentage: number
}

/** A specific word that needs priority review, with reason */
export interface TopReviewWord {
  word: string
  meaning: string
  reason: string
  wrongCount: number
  fuzzyCount: number
  status: string
}

/** A confusing word pair that a learner mixes up */
export interface ConfusingWordPair {
  word: string
  confusingWith: string
  reason: string
}

/** Tomorrow's concrete study plan with quantities */
export interface TomorrowPlan {
  newWords: number
  reviewWords: number
  wrongWords: number
  sentenceMeaningWords: number
}

export interface LocalAnalysisResult {
  totalWords: number
  seenWords: number
  masteredWords: number
  knownWords: number
  learningWords: number
  fuzzyWords: number
  wrongWords: number
  unseenWords: number
  overdueCount: number
  weakWords: WeakWordItem[]
  highFreqUnmasteredWords: WeakWordItem[]
  memoryCurve: MemoryCurvePoint[]
  streakDays: number
  totalPoints: number
  quizAccuracy: number | null
  masteryRate: number
  // Today's plan completion
  todayPlanNewWords: number
  todayPlanReviewWords: number
  todayPlanWrongWords: number
  todayPlanFuzzyWords: number
  todayPlanSentenceMeaning: number
  todayPlanConfusingWords: number
  /** Task-level: number of distinct tasks (out of 6 possible) that exist in today's plan */
  todayTotalTasks: number
  /** Task-level: number of those tasks already marked complete in mimoTaskRunner */
  todayCompletedTasks: number
  todayCompletionRate: number | null
  // Plan settings
  dailyNewWordsMode: string
  dailyNewWords: number
  dailyReviewLimit: number
  dailyIntensity: string
}

// Sent to the API route (no sensitive data, no full vocab)
export interface AiAnalyzeRequest {
  stats: {
    totalWords: number
    touchedWords: number
    masteredWords: number
    knownWords: number
    fuzzyWords: number
    wrongWords: number
    unseenWords: number
    masteryRate: number
    quizAccuracy: number | null
    todayCompletionRate: number | null
    streakDays: number
    overdueCount: number
  }
  weakWords: Array<{
    word: string
    meaning: string
    weakScore: number
    wrongCount: number
    fuzzyCount: number
    correctCount: number
    status: string
    reason?: string
    exampleEn: string
  }>
  highFreqUnmasteredWords: Array<{
    word: string
    meaning: string
    status: string
    wrongCount: number
    fuzzyCount: number
  }>
  todayPlan: {
    newWords: number
    reviewWords: number
    wrongWords: number
    fuzzyWords: number
    sentenceMeaningWords: number
    confusingWords: number
    completedTasks: number
    totalTasks: number
  }
  confusingWordPairs: Array<{
    word: string
    confusingWith: string
    reason: string
  }>
  planSettings: {
    dailyNewWordsMode: string
    dailyNewWords: number
    dailyReviewLimit: number
    intensity: string
  }
  // Legacy fields kept for backward compat
  totalWords: number
  seenWords: number
  masteredWords: number
  learningWords: number
  fuzzyWords: number
  overdueCount: number
  streakDays: number
  quizAccuracy: number | null
}

export interface AiWeakWordAnalysis {
  word: string
  issue: string
  tip: string
}

export interface AiAnalysisResult {
  // Structured concrete diagnosis (new fields)
  todayConclusion: string
  mainProblem: string
  topReviewWords: TopReviewWord[]
  confusingWordsList: ConfusingWordPair[]
  tomorrowPlan: TomorrowPlan
  dailyNewWordAdjustment: string
  // Legacy fields (kept for backward compat)
  summary: string
  overallLevel: '入门' | '基础' | '进阶' | '熟练' | '精通'
  memoryCurveInsight: string
  weakWordAnalysis: AiWeakWordAnalysis[]
  todayPlan: string[]
  practiceSuggestions: string[]
  encouragement: string
}

// Cached in localStorage
export interface CachedAiAnalysis {
  result: AiAnalysisResult
  cachedAt: string
  version: number
}

export const AI_ANALYSIS_CACHE_KEY = 'ai_analysis_cache_v2'
export const AI_ANALYSIS_VERSION = 2
