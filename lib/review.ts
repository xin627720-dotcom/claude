import type { WordProgress, WordStatus } from './types'

export function getNextReviewDate(status: WordStatus): string {
  const now = new Date()
  switch (status) {
    case 'learning':
      now.setMinutes(now.getMinutes() + 10)
      break
    case 'fuzzy':
      now.setDate(now.getDate() + 1)
      break
    case 'known':
      now.setDate(now.getDate() + 3)
      break
    case 'mastered':
      now.setDate(now.getDate() + 7)
      break
    default:
      break
  }
  return now.toISOString()
}

export function isDueForReview(progress: WordProgress): boolean {
  if (!progress.nextReviewAt) return true
  return new Date(progress.nextReviewAt) <= new Date()
}

export function updateProgressAfterReview(
  progress: WordProgress,
  result: 'correct' | 'fuzzy' | 'wrong'
): WordProgress {
  const now = new Date().toISOString()
  let newStatus: WordStatus = progress.status
  let correctCount = progress.correctCount
  let wrongCount = progress.wrongCount
  let fuzzyCount = progress.fuzzyCount
  let isWrongWord = progress.isWrongWord

  if (result === 'correct') {
    correctCount++
    // 连续认识 3 次 → 已掌握
    const streak = correctCount - wrongCount
    newStatus = streak >= 3 ? 'mastered' : 'known'
    isWrongWord = false
  } else if (result === 'fuzzy') {
    fuzzyCount++
    newStatus = 'fuzzy'
  } else {
    wrongCount++
    newStatus = 'learning'
    isWrongWord = true
  }

  return {
    ...progress,
    status: newStatus,
    correctCount,
    wrongCount,
    fuzzyCount,
    isWrongWord,
    lastReviewedAt: now,
    nextReviewAt: getNextReviewDate(newStatus),
    updatedAt: now,
  }
}

export function buildReviewQueue(
  wordIds: string[],
  progressMap: Record<string, WordProgress>
): string[] {
  const wrongDue: string[] = []
  const unseen: string[] = []
  const due: string[] = []
  const rest: string[] = []

  for (const id of wordIds) {
    const p = progressMap[id]
    if (!p || p.status === 'unseen') {
      unseen.push(id)
      continue
    }
    if (p.status === 'mastered' && !isDueForReview(p)) continue
    if (p.isWrongWord && isDueForReview(p)) {
      wrongDue.push(id)
    } else if (isDueForReview(p)) {
      due.push(id)
    } else {
      rest.push(id)
    }
  }

  return [...wrongDue, ...unseen, ...due, ...rest]
}
