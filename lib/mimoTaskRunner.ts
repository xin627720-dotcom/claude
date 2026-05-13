import type { MimoDailyPlan } from './types'
import { getLocalDateString } from './date'

export type MimoTask = 'review' | 'wrong' | 'fuzzy' | 'new' | 'sentence' | 'confusing'

export interface MimoTaskState {
  date: string
  completedTasks: MimoTask[]
  updatedAt: string
}

// Canonical task order: review first (SRS-priority), then new words, then quiz tasks
export const TASK_SEQUENCE: MimoTask[] = ['review', 'wrong', 'fuzzy', 'new', 'sentence', 'confusing']

export const TASK_META: Record<MimoTask, {
  title: string
  mode: string
  page: 'learn' | 'quiz'
  icon: string
}> = {
  review:    { title: '到期复习',     mode: 'mimo-review',    page: 'learn', icon: '🔄' },
  wrong:     { title: '错词重认',     mode: 'mimo-wrong',     page: 'learn', icon: '❌' },
  fuzzy:     { title: '模糊词加强',   mode: 'mimo-fuzzy',     page: 'learn', icon: '🌫️' },
  new:       { title: '高频新词',     mode: 'mimo-new',       page: 'learn', icon: '📖' },
  sentence:  { title: '阅读句中识义', mode: 'mimo-sentence',  page: 'quiz',  icon: '📝' },
  confusing: { title: '易混词辨析',   mode: 'mimo-confusing', page: 'quiz',  icon: '🔀' },
}

const RUNNER_KEY = 'mimoTaskRunner_v1'

function todayStr(): string {
  return getLocalDateString()
}

function getTodayTaskState(): MimoTaskState {
  if (typeof window === 'undefined') {
    return { date: todayStr(), completedTasks: [], updatedAt: '' }
  }
  try {
    const raw = localStorage.getItem(RUNNER_KEY)
    if (!raw) return { date: todayStr(), completedTasks: [], updatedAt: new Date().toISOString() }
    const parsed: MimoTaskState = JSON.parse(raw)
    if (parsed.date !== todayStr()) {
      return { date: todayStr(), completedTasks: [], updatedAt: new Date().toISOString() }
    }
    return parsed
  } catch {
    return { date: todayStr(), completedTasks: [], updatedAt: new Date().toISOString() }
  }
}

type PlanWordCounts = Pick<MimoDailyPlan,
  'reviewWordIds' | 'wrongWordIds' | 'fuzzyWordIds' |
  'newWordIds' | 'sentenceMeaningWordIds' | 'confusingWordIds'
>

export function getDailyTaskSequence(plan: PlanWordCounts): MimoTask[] {
  const hasWords: Record<MimoTask, boolean> = {
    review:    plan.reviewWordIds.length > 0,
    wrong:     plan.wrongWordIds.length > 0,
    fuzzy:     plan.fuzzyWordIds.length > 0,
    new:       plan.newWordIds.length > 0,
    sentence:  plan.sentenceMeaningWordIds.length > 0,
    confusing: plan.confusingWordIds.length > 0,
  }
  return TASK_SEQUENCE.filter(t => hasWords[t])
}

export function getCurrentDailyTask(plan: PlanWordCounts): MimoTask | null {
  const state = getTodayTaskState()
  const seq = getDailyTaskSequence(plan)
  return seq.find(t => !state.completedTasks.includes(t)) ?? null
}

export function markTaskComplete(task: MimoTask): void {
  if (typeof window === 'undefined') return
  try {
    const state = getTodayTaskState()
    if (!state.completedTasks.includes(task)) {
      state.completedTasks.push(task)
      state.updatedAt = new Date().toISOString()
      localStorage.setItem(RUNNER_KEY, JSON.stringify(state))
    }
  } catch {}
}

export function getCompletedTasks(): MimoTask[] {
  return getTodayTaskState().completedTasks
}

export function getDailyPlanCompletionRate(plan: PlanWordCounts): number {
  const seq = getDailyTaskSequence(plan)
  if (seq.length === 0) return 100
  const done = seq.filter(t => getCompletedTasks().includes(t)).length
  return Math.round((done / seq.length) * 100)
}

/**
 * Resets today's task runner state (completed tasks).
 * Called when regenerating today's plan so old completion state doesn't bleed into the new plan.
 * Does not affect other dates' history.
 */
export function resetTodayTaskRunner(): void {
  if (typeof window === 'undefined') return
  try {
    const fresh: MimoTaskState = {
      date: todayStr(),
      completedTasks: [],
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(RUNNER_KEY, JSON.stringify(fresh))
  } catch {}
}
