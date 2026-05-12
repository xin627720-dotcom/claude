import type { WordProgress } from './types'

export interface LearningStats {
  totalWords: number
  touchedWords: number
  knownWords: number
  masteredWords: number
  wrongWords: number
  fuzzyWords: number
  learnedWords: number
  remainingWords: number
}

export function calculateLearningStats(
  totalCount: number,
  wordProgress: Record<string, WordProgress>
): LearningStats {
  let touchedWords = 0
  let masteredWords = 0
  let wrongWords = 0
  let fuzzyWords = 0

  for (const p of Object.values(wordProgress)) {
    if (p.status !== 'unseen') touchedWords++
    if (p.status === 'mastered') masteredWords++
    if (p.isWrongWord || (p.wrongCount ?? 0) > 0 || (p.quizWrongCount ?? 0) > 0) wrongWords++
    if (p.status === 'fuzzy' || (p.fuzzyCount ?? 0) > 0) fuzzyWords++
  }

  return {
    totalWords: totalCount,
    touchedWords,
    knownWords: touchedWords,
    masteredWords,
    wrongWords,
    fuzzyWords,
    learnedWords: touchedWords,
    remainingWords: totalCount - masteredWords,
  }
}
