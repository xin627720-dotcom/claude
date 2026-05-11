import { supabase, isSupabaseConfigured } from './supabaseClient'
import {
  loadStore,
  saveStore,
  mergeRemoteProgress,
  setLastSyncedAt,
} from './localStore'
import type { WordProgress, UserStats, QuizProgress, WrongWord, SyncStatus } from './types'

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function toDbWordProgress(p: WordProgress, userId: string) {
  return {
    user_id: userId,
    word_id: p.wordId,
    status: p.status,
    correct_count: p.correctCount,
    wrong_count: p.wrongCount,
    fuzzy_count: p.fuzzyCount,
    last_reviewed_at: p.lastReviewedAt,
    next_review_at: p.nextReviewAt,
    is_favorite: p.isFavorite,
    is_wrong_word: p.isWrongWord,
    last_quiz_at: p.lastQuizAt,
    quiz_correct_count: p.quizCorrectCount,
    quiz_wrong_count: p.quizWrongCount,
    updated_at: p.updatedAt,
  }
}

function fromDbWordProgress(r: Record<string, unknown>): WordProgress {
  return {
    wordId: r.word_id as string,
    status: r.status as WordProgress['status'],
    correctCount: (r.correct_count as number) ?? 0,
    wrongCount: (r.wrong_count as number) ?? 0,
    fuzzyCount: (r.fuzzy_count as number) ?? 0,
    lastReviewedAt: (r.last_reviewed_at as string | null) ?? null,
    nextReviewAt: (r.next_review_at as string | null) ?? null,
    isFavorite: (r.is_favorite as boolean) ?? false,
    isWrongWord: (r.is_wrong_word as boolean) ?? false,
    lastQuizAt: (r.last_quiz_at as string | null) ?? null,
    quizCorrectCount: (r.quiz_correct_count as number) ?? 0,
    quizWrongCount: (r.quiz_wrong_count as number) ?? 0,
    updatedAt: r.updated_at as string,
  }
}

function fromDbUserStats(r: Record<string, unknown>): UserStats {
  return {
    dailyGoal: (r.daily_goal as number) ?? 20,
    streakDays: (r.streak_days as number) ?? 0,
    points: (r.points as number) ?? 0,
    lastCheckinDate: (r.last_checkin_date as string | null) ?? null,
    totalLearned: (r.total_learned as number) ?? 0,
    totalMastered: (r.total_mastered as number) ?? 0,
    updatedAt: r.updated_at as string,
  }
}

function fromDbWrongWord(r: Record<string, unknown>): WrongWord {
  return {
    wordId: r.word_id as string,
    wrongCount: (r.wrong_count as number) ?? 1,
    lastWrongAt: r.last_wrong_at as string,
    nextReviewAt: r.next_review_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadAll(userId: string): Promise<void> {
  const store = loadStore()

  const progressList = Object.values(store.wordProgress)
  if (progressList.length > 0) {
    const { error } = await supabase
      .from('word_progress')
      .upsert(progressList.map((p) => toDbWordProgress(p, userId)), {
        onConflict: 'user_id,word_id',
      })
    if (error) throw error
  }

  const { error: statsErr } = await supabase.from('user_stats').upsert(
    {
      user_id: userId,
      daily_goal: store.userStats.dailyGoal,
      streak_days: store.userStats.streakDays,
      points: store.userStats.points,
      last_checkin_date: store.userStats.lastCheckinDate,
      total_learned: store.userStats.totalLearned,
      total_mastered: store.userStats.totalMastered,
      updated_at: store.userStats.updatedAt,
    },
    { onConflict: 'user_id' }
  )
  if (statsErr) throw statsErr

  const { error: quizErr } = await supabase.from('quiz_progress').upsert(
    {
      user_id: userId,
      current_quiz_queue: store.quizProgress.currentQuizQueue,
      current_quiz_index: store.quizProgress.currentQuizIndex,
      answered_word_ids: store.quizProgress.answeredWordIds,
      wrong_word_ids: store.quizProgress.wrongWordIds,
      updated_at: store.quizProgress.updatedAt,
    },
    { onConflict: 'user_id' }
  )
  if (quizErr) throw quizErr

  const wwList = Object.values(store.wrongWords)
  if (wwList.length > 0) {
    const { error: wwErr } = await supabase.from('wrong_words').upsert(
      wwList.map((w) => ({
        user_id: userId,
        word_id: w.wordId,
        wrong_count: w.wrongCount,
        last_wrong_at: w.lastWrongAt,
        next_review_at: w.nextReviewAt,
        updated_at: w.updatedAt,
      })),
      { onConflict: 'user_id,word_id' }
    )
    if (wwErr) throw wwErr
  }
}

// ── Download ──────────────────────────────────────────────────────────────────

async function downloadAll(userId: string): Promise<void> {
  const store = loadStore()

  const { data: remoteProgress, error: progressErr } = await supabase
    .from('word_progress')
    .select('*')
    .eq('user_id', userId)
  if (progressErr) throw progressErr

  if (remoteProgress && remoteProgress.length > 0) {
    store.wordProgress = mergeRemoteProgress(
      store.wordProgress,
      remoteProgress.map((r) => fromDbWordProgress(r as Record<string, unknown>))
    )
  }

  const { data: remoteStats } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (remoteStats) {
    const remote = fromDbUserStats(remoteStats as Record<string, unknown>)
    if (new Date(remote.updatedAt) > new Date(store.userStats.updatedAt)) {
      store.userStats = remote
    }
  }

  const { data: remoteQuiz } = await supabase
    .from('quiz_progress')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (remoteQuiz) {
    const r = remoteQuiz as Record<string, unknown>
    const remoteUpdated = r.updated_at as string
    if (new Date(remoteUpdated) > new Date(store.quizProgress.updatedAt)) {
      store.quizProgress = {
        currentQuizQueue: (r.current_quiz_queue as string[]) ?? [],
        currentQuizIndex: (r.current_quiz_index as number) ?? 0,
        answeredWordIds: (r.answered_word_ids as string[]) ?? [],
        wrongWordIds: (r.wrong_word_ids as string[]) ?? [],
        updatedAt: remoteUpdated,
      }
    }
  }

  const { data: remoteWW } = await supabase
    .from('wrong_words')
    .select('*')
    .eq('user_id', userId)
  if (remoteWW) {
    for (const r of remoteWW) {
      const rr = r as Record<string, unknown>
      const ww = fromDbWrongWord(rr)
      const local = store.wrongWords[ww.wordId]
      if (!local || new Date(ww.updatedAt) > new Date(local.updatedAt)) {
        store.wrongWords[ww.wordId] = ww
      }
    }
  }

  saveStore(store)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getSession() {
  if (!isSupabaseConfigured()) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function fullSync(): Promise<SyncStatus> {
  if (!isSupabaseConfigured()) return 'not_logged_in'
  if (!isOnline()) return 'offline'
  const session = await getSession()
  if (!session) return 'not_logged_in'
  try {
    await uploadAll(session.user.id)
    await downloadAll(session.user.id)
    setLastSyncedAt(new Date().toISOString())
    return 'success'
  } catch (e) {
    console.error('[sync]', e)
    return 'error'
  }
}

export async function trySyncInBackground(): Promise<void> {
  if (!isSupabaseConfigured() || !isOnline()) return
  const session = await getSession()
  if (!session) return
  try {
    await uploadAll(session.user.id)
    setLastSyncedAt(new Date().toISOString())
  } catch {
    // background sync failure is silent
  }
}
