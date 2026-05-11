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
}

export interface MemoryCurvePoint {
  label: string
  count: number
  percentage: number
}

export interface LocalAnalysisResult {
  totalWords: number
  seenWords: number
  masteredWords: number
  learningWords: number
  fuzzyWords: number
  wrongWords: number
  unseenWords: number
  overdueCount: number
  weakWords: WeakWordItem[]
  memoryCurve: MemoryCurvePoint[]
  streakDays: number
  totalPoints: number
  quizAccuracy: number | null
}

// Sent to the API route (no sensitive data, no full vocab)
export interface AiAnalyzeRequest {
  totalWords: number
  seenWords: number
  masteredWords: number
  learningWords: number
  fuzzyWords: number
  overdueCount: number
  streakDays: number
  quizAccuracy: number | null
  weakWords: Array<{
    word: string
    meaning: string
    weakScore: number
    wrongCount: number
    fuzzyCount: number
    correctCount: number
    exampleEn: string
  }>
}

export interface AiWeakWordAnalysis {
  word: string
  issue: string
  tip: string
}

export interface AiAnalysisResult {
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

export const AI_ANALYSIS_CACHE_KEY = 'ai_analysis_cache_v1'
export const AI_ANALYSIS_VERSION = 1
