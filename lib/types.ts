export type WordStatus = 'unseen' | 'learning' | 'fuzzy' | 'known' | 'mastered'
export type WordLevel = 'basic' | 'core'

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
  examTips: string
  level: WordLevel
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
