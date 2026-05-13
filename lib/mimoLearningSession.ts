import { getLocalDateString } from './date'

export interface MimoLearningSession {
  date: string
  mode: string
  wordIds: string[]
  currentIndex: number
  completedWordIds: string[]
  updatedAt: string
}

const SESSION_KEY = 'mimoLearningSession_v1'

function todayStr(): string {
  return getLocalDateString()
}

export function getLearningSession(mode: string): MimoLearningSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const sessions: Record<string, MimoLearningSession> = JSON.parse(raw)
    const s = sessions[mode]
    if (!s || s.date !== todayStr()) return null
    return s
  } catch { return null }
}

export function saveLearningSession(session: MimoLearningSession): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const sessions: Record<string, MimoLearningSession> = raw ? JSON.parse(raw) : {}
    sessions[session.mode] = session
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions))
  } catch {}
}

export function clearLearningSession(mode: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return
    const sessions: Record<string, MimoLearningSession> = JSON.parse(raw)
    delete sessions[mode]
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions))
  } catch {}
}

export function updateSessionProgress(
  mode: string,
  currentIndex: number,
  completedWordId: string
): void {
  if (typeof window === 'undefined') return
  try {
    const session = getLearningSession(mode)
    if (!session) return
    const ids = [...session.completedWordIds]
    if (!ids.includes(completedWordId)) ids.push(completedWordId)
    saveLearningSession({
      ...session,
      currentIndex,
      completedWordIds: ids,
      updatedAt: new Date().toISOString(),
    })
  } catch {}
}

/**
 * Clears all today's mimo learning sessions (all modes).
 * Called when regenerating today's plan so stale session data doesn't
 * allow users to "resume" from a position in the old plan.
 */
export function clearTodayLearningSessions(): void {
  if (typeof window === 'undefined') return
  try {
    // Simplest safe approach: remove the entire session key.
    // Sessions from other days aren't stored separately anyway — they expire by date check.
    localStorage.removeItem(SESSION_KEY)
  } catch {}
}
