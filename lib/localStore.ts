import type { LocalStore, WordProgress, UserStats, QuizProgress, WrongWord } from './types'

const STORE_KEY = 'vocab_store_v1'

function defaultStats(): UserStats {
  return {
    dailyGoal: 20,
    streakDays: 0,
    points: 0,
    lastCheckinDate: null,
    totalLearned: 0,
    totalMastered: 0,
    updatedAt: new Date().toISOString(),
  }
}

function defaultQuizProgress(): QuizProgress {
  return {
    currentQuizQueue: [],
    currentQuizIndex: 0,
    answeredWordIds: [],
    wrongWordIds: [],
    updatedAt: new Date().toISOString(),
  }
}

function defaultStore(): LocalStore {
  return {
    wordProgress: {},
    userStats: defaultStats(),
    quizProgress: defaultQuizProgress(),
    wrongWords: {},
    lastSyncedAt: null,
  }
}

export function loadStore(): LocalStore {
  if (typeof window === 'undefined') return defaultStore()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return defaultStore()
    const parsed = JSON.parse(raw) as Partial<LocalStore>
    return {
      wordProgress: parsed.wordProgress ?? {},
      userStats: parsed.userStats ?? defaultStats(),
      quizProgress: parsed.quizProgress ?? defaultQuizProgress(),
      wrongWords: parsed.wrongWords ?? {},
      lastSyncedAt: parsed.lastSyncedAt ?? null,
    }
  } catch {
    return defaultStore()
  }
}

export function saveStore(store: LocalStore): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

export function getWordProgress(wordId: string): WordProgress {
  const store = loadStore()
  return (
    store.wordProgress[wordId] ?? {
      wordId,
      status: 'unseen',
      correctCount: 0,
      wrongCount: 0,
      fuzzyCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      isFavorite: false,
      isWrongWord: false,
      lastQuizAt: null,
      quizCorrectCount: 0,
      quizWrongCount: 0,
      updatedAt: new Date().toISOString(),
    }
  )
}

export function saveWordProgress(progress: WordProgress): void {
  const store = loadStore()
  store.wordProgress[progress.wordId] = progress
  saveStore(store)
}

export function getUserStats(): UserStats {
  return loadStore().userStats
}

export function saveUserStats(stats: UserStats): void {
  const store = loadStore()
  store.userStats = stats
  saveStore(store)
}

export function getQuizProgress(): QuizProgress {
  return loadStore().quizProgress
}

export function saveQuizProgress(progress: QuizProgress): void {
  const store = loadStore()
  store.quizProgress = progress
  saveStore(store)
}

export function getWrongWords(): Record<string, WrongWord> {
  return loadStore().wrongWords
}

/**
 * Unified wrong-word list — single source of truth for both home page and
 * wrong-words page.  Derives from wordProgress so it always matches the
 * home page count.  A word is "wrong" when any of these are true:
 *   isWrongWord === true  (set by learn page)
 *   wrongCount > 0        (set by learn page)
 *   quizWrongCount > 0    (set by quiz/spelling page)
 * Legacy wrongWords records are merged in for backward compat.
 */
export function getWrongWordsList(): WrongWord[] {
  const store = loadStore()
  const entries = new Map<string, WrongWord>()

  // Primary source: wordProgress
  for (const [wordId, p] of Object.entries(store.wordProgress)) {
    if (!p.isWrongWord && (p.wrongCount ?? 0) === 0 && (p.quizWrongCount ?? 0) === 0) continue
    const ww = store.wrongWords?.[wordId]
    entries.set(wordId, {
      wordId,
      wrongCount: ww ? ww.wrongCount : ((p.wrongCount ?? 0) + (p.quizWrongCount ?? 0)),
      lastWrongAt: ww?.lastWrongAt ?? p.lastReviewedAt ?? p.updatedAt,
      nextReviewAt: ww?.nextReviewAt ?? p.nextReviewAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt,
    })
  }

  // Compat: also include legacy wrongWords entries missing from wordProgress
  const wrongWords = store.wrongWords
  if (wrongWords && typeof wrongWords === 'object' && !Array.isArray(wrongWords)) {
    for (const [wordId, ww] of Object.entries(wrongWords)) {
      if (!entries.has(wordId) && ww && typeof ww === 'object' && ww.wordId) {
        entries.set(wordId, ww as WrongWord)
      }
    }
  }

  return Array.from(entries.values()).sort((a, b) => {
    try {
      return new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime()
    } catch {
      return 0
    }
  })
}

/** Count using same logic as getWrongWordsList(). Use this on the home page. */
export function getWrongWordCount(): number {
  return getWrongWordsList().length
}

export function saveWrongWord(ww: WrongWord): void {
  const store = loadStore()
  store.wrongWords[ww.wordId] = ww
  saveStore(store)
}

export function removeWrongWord(wordId: string): void {
  const store = loadStore()
  delete store.wrongWords[wordId]
  saveStore(store)
}

export function setLastSyncedAt(time: string): void {
  const store = loadStore()
  store.lastSyncedAt = time
  saveStore(store)
}

export function clearStore(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORE_KEY)
}

export function mergeRemoteProgress(
  local: Record<string, WordProgress>,
  remote: WordProgress[]
): Record<string, WordProgress> {
  const merged = { ...local }
  for (const remoteItem of remote) {
    const localItem = merged[remoteItem.wordId]
    if (!localItem) {
      merged[remoteItem.wordId] = remoteItem
    } else {
      const useRemote =
        new Date(remoteItem.updatedAt) > new Date(localItem.updatedAt)
      merged[remoteItem.wordId] = {
        ...(useRemote ? remoteItem : localItem),
        correctCount: Math.max(localItem.correctCount, remoteItem.correctCount),
        wrongCount: Math.max(localItem.wrongCount, remoteItem.wrongCount),
        fuzzyCount: Math.max(localItem.fuzzyCount, remoteItem.fuzzyCount),
        quizCorrectCount: Math.max(
          localItem.quizCorrectCount,
          remoteItem.quizCorrectCount
        ),
        quizWrongCount: Math.max(
          localItem.quizWrongCount,
          remoteItem.quizWrongCount
        ),
      }
    }
  }
  return merged
}
