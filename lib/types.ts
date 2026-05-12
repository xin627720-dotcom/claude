export type WordStatus = 'unseen' | 'learning' | 'fuzzy' | 'known' | 'mastered'
export type WordLevel = 'basic' | 'core'
export type FrequencyLevel = '高频' | '中频' | '低频' | '超纲拓展'

export interface GaokaoExample {
  en: string
  zh: string
  source: string      // "高考风格例句" or e.g. "2021新高考I卷"
  isRealExam: boolean
}

export interface WordFamilyMember {
  word: string
  pos: string
  meaning: string
  relation: string  // noun / adjective / verb / adverb / antonym / related
}

export interface CollocationItem {
  phrase: string
  meaning: string
  example?: string
}

export interface ConfusingWord {
  word: string
  meaning: string
  difference: string
}

export interface VocabWord {
  id: string
  word: string
  meaning: string
  pos: string
  definition: string
  collocations: string[]
  examples: Array<{ en: string; zh: string }>
  synonyms: string[]
  antonyms: string[]
  root: string
  examTips: string[]
  level: WordLevel
  // ── Enhanced fields (optional — populated via vocab-enhanced-details.json) ──
  pronunciation?: string
  frequencyLevel?: FrequencyLevel
  appearedYears?: string[]
  examScenes?: string[]
  commonMeaningsInExam?: string[]
  commonTraps?: string[]
  gaokaoExamples?: GaokaoExample[]
  wordFamily?: WordFamilyMember[]
  collocationItems?: CollocationItem[]
  confusingWords?: ConfusingWord[]
  memoryTip?: string
  usageNote?: string
}

export interface WordProgress {
  wordId: string
  status: WordStatus
  correctCount: number
  wrongCount: number
  fuzzyCount: number
  lastReviewedAt: string | null
  nextReviewAt: string | null
  isFavorite: boolean
  isWrongWord: boolean
  lastQuizAt: string | null
  quizCorrectCount: number
  quizWrongCount: number
  updatedAt: string
}

export interface UserStats {
  dailyGoal: number
  streakDays: number
  points: number
  lastCheckinDate: string | null
  totalLearned: number
  totalMastered: number
  updatedAt: string
}

export interface QuizProgress {
  currentQuizQueue: string[]
  currentQuizIndex: number
  answeredWordIds: string[]
  wrongWordIds: string[]
  updatedAt: string
}

export interface WrongWord {
  wordId: string
  wrongCount: number
  lastWrongAt: string
  nextReviewAt: string
  updatedAt: string
}

export interface LocalStore {
  wordProgress: Record<string, WordProgress>
  userStats: UserStats
  quizProgress: QuizProgress
  wrongWords: Record<string, WrongWord>
  lastSyncedAt: string | null
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline' | 'not_logged_in'
