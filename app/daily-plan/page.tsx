'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getTodayMimoPlan,
  saveTodayMimoPlan,
  clearTodayMimoPlan,
  getMimoPlanSettings,
  calculateDaysRemaining,
  calculateDailyNewWordTarget,
  buildLocalPlanCandidates,
  generateLocalFallbackPlan,
  validateAndCleanAiPlan,
  getEffectiveLimits,
  enforceTargetNewWordCount,
  todayStr,
} from '@/lib/mimoPlan'
import { getWordById } from '@/lib/vocab'
import { allWords } from '@/lib/vocab'
import { loadStore } from '@/lib/localStore'
import { calculateLearningStats } from '@/lib/stats'
import {
  getCurrentDailyTask,
  getCompletedTasks,
  getDailyTaskSequence,
  TASK_META,
  type MimoTask,
} from '@/lib/mimoTaskRunner'
import type { MimoDailyPlan } from '@/lib/types'

interface TaskSection {
  id: MimoTask
  title: string
  icon: string
  wordIds: string[]
  color: string
  bgColor: string
  mode: string
  page: 'learn' | 'quiz'
  description: string
}

function WordChip({ wordId }: { wordId: string }) {
  const word = getWordById(wordId)
  if (!word) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-full text-xs text-text-primary border border-bg-tertiary">
      {word.word}
      <span className="text-text-tertiary">{word.meaning}</span>
    </span>
  )
}

function TaskCard({ section, completed }: { section: TaskSection; completed: boolean }) {
  const [expanded, setExpanded] = useState(false)
  if (section.wordIds.length === 0) return null

  return (
    <div className={`rounded-xl p-4 mb-3 ${section.bgColor} ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{section.icon}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <p className={`text-sm font-semibold ${section.color}`}>{section.title}</p>
              {completed && <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">✓ 已完成</span>}
            </div>
            <p className="text-xs text-text-tertiary">{section.wordIds.length} 个词 · {section.description}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Link
            href={`/${section.page}?mode=${section.mode}`}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-accent active:scale-95 transition-all"
          >
            {completed ? '再练' : '开始'}
          </Link>
          <button
            onClick={() => setExpanded(e => !e)}
            className="px-2 py-1.5 rounded-lg bg-white/60 text-text-secondary text-xs active:scale-95 transition-all"
          >
            {expanded ? '收起' : '词表'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/40">
          {section.wordIds.slice(0, 30).map(id => (
            <WordChip key={id} wordId={id} />
          ))}
          {section.wordIds.length > 30 && (
            <span className="text-xs text-text-tertiary">还有 {section.wordIds.length - 30} 个…</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function DailyPlanPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<MimoDailyPlan | null>(null)
  const [completedTasks, setCompletedTasks] = useState<MimoTask[]>([])
  const [liveStats, setLiveStats] = useState<{ masteredWords: number; remainingWords: number } | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenMsg, setRegenMsg] = useState<string | null>(null)

  useEffect(() => {
    const p = getTodayMimoPlan()
    setPlan(p)
    setCompletedTasks(getCompletedTasks())
    const store = loadStore()
    const s = calculateLearningStats(allWords.length, store.wordProgress)
    setLiveStats({ masteredWords: s.masteredWords, remainingWords: s.remainingWords })
  }, [])

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true)
    setRegenMsg(null)
    clearTodayMimoPlan()
    try {
      const settings = getMimoPlanSettings()
      const store = loadStore()
      const pm = store.wordProgress
      const { learnedWords, masteredWords, remainingWords } = calculateLearningStats(allWords.length, pm)
      const daysRemaining = calculateDaysRemaining(settings.targetDate)
      const { target: dailyNewTarget } = calculateDailyNewWordTarget(
        allWords.length - learnedWords,
        daysRemaining,
        settings.dailyIntensity,
        settings.dailyNewWordsMode,
        settings.dailyNewWords
      )
      const statsObj = {
        totalWords: allWords.length,
        learnedWords,
        masteredWords,
        remainingWords,
        daysRemaining,
        dailyNewTarget,
      }
      const candidates = buildLocalPlanCandidates(pm, allWords, settings, dailyNewTarget)
      const AI_CANDIDATE_CAP = 150
      let resultPlan: MimoDailyPlan | null = null

      if (settings.enabled) {
        try {
          const body = {
            date: todayStr(),
            targetDate: settings.targetDate,
            daysRemaining,
            totalWords: allWords.length,
            learnedWords,
            masteredWords,
            remainingWords,
            dailyNewTarget,
            intensity: settings.dailyIntensity,
            candidateNewWords: candidates.candidateNewWords.slice(0, AI_CANDIDATE_CAP),
            candidateReviewWords: candidates.candidateReviewWords,
            candidateWrongWords: candidates.candidateWrongWords,
            candidateFuzzyWords: candidates.candidateFuzzyWords,
          }
          const resp = await fetch('/api/mimo/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (resp.ok) {
            const raw = await resp.json()
            if (raw && !raw.error) {
              const validIds = new Set(allWords.map(w => w.id))
              const limits = getEffectiveLimits(settings, dailyNewTarget)
              const cleaned = validateAndCleanAiPlan(raw, validIds, limits)
              if (cleaned && ((cleaned.newWordIds?.length ?? 0) + (cleaned.reviewWordIds?.length ?? 0)) > 0) {
                const effectiveTarget = settings.dailyNewWordsMode === 'manual'
                  ? settings.dailyNewWords
                  : dailyNewTarget
                const enforcedNewIds = enforceTargetNewWordCount(
                  cleaned.newWordIds ?? [],
                  effectiveTarget,
                  candidates.candidateNewWords,
                  settings.allowAiAdjust
                )
                resultPlan = {
                  ...generateLocalFallbackPlan(settings, statsObj, candidates),
                  ...cleaned,
                  newWordIds: enforcedNewIds,
                  date: todayStr(),
                  targetDate: settings.targetDate,
                  daysRemaining,
                  totalWords: allWords.length,
                  learnedWords,
                  masteredWords,
                  remainingWords,
                  createdBy: 'mimo_ai',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              }
            }
          }
        } catch { /* fall through to local */ }
      }

      if (!resultPlan) {
        resultPlan = generateLocalFallbackPlan(settings, statsObj, candidates)
      }

      saveTodayMimoPlan(resultPlan)
      setPlan(resultPlan)
      setRegenMsg('计划已根据你的设置重新生成')
      setTimeout(() => setRegenMsg(null), 4000)
    } catch {
      setRegenMsg('重新生成失败，请重试')
    } finally {
      setRegenerating(false)
    }
  }, [])

  const settings = getMimoPlanSettings()

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-4xl mb-4">📋</p>
        <p className="font-semibold text-text-primary mb-2">今日还没有学习计划</p>
        <p className="text-sm text-text-secondary mb-6">请从首页生成 Mimo AI 今日计划</p>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-3 rounded-xl bg-accent text-white font-semibold text-sm active:scale-95 transition-all"
        >
          返回首页
        </button>
      </div>
    )
  }

  const taskSections: TaskSection[] = [
    {
      id: 'new',
      title: '高频新词',
      icon: '📖',
      wordIds: plan.newWordIds,
      color: 'text-accent',
      bgColor: 'bg-accent/5',
      mode: 'mimo-new',
      page: 'learn',
      description: '阅读识义，快速反应中文',
    },
    {
      id: 'review',
      title: '到期复习',
      icon: '🔄',
      wordIds: plan.reviewWordIds,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      mode: 'mimo-review',
      page: 'learn',
      description: '到期词巩固，防止遗忘',
    },
    {
      id: 'wrong',
      title: '错词重认',
      icon: '❌',
      wordIds: plan.wrongWordIds,
      color: 'text-danger',
      bgColor: 'bg-red-50',
      mode: 'mimo-wrong',
      page: 'learn',
      description: '重点攻克，减少失分',
    },
    {
      id: 'fuzzy',
      title: '模糊词加强',
      icon: '🌫️',
      wordIds: plan.fuzzyWordIds,
      color: 'text-warning',
      bgColor: 'bg-amber-50',
      mode: 'mimo-fuzzy',
      page: 'learn',
      description: '提升模糊词确定性',
    },
    {
      id: 'sentence',
      title: '阅读句中识义',
      icon: '📝',
      wordIds: plan.sentenceMeaningWordIds,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      mode: 'mimo-sentence',
      page: 'quiz',
      description: '高考阅读场景练习',
    },
    {
      id: 'confusing',
      title: '易混词辨析',
      icon: '🔀',
      wordIds: plan.confusingWordIds,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      mode: 'mimo-confusing',
      page: 'quiz',
      description: '区分易混词，减少误选',
    },
  ]

  const activeSections = taskSections.filter(s => s.wordIds.length > 0)
  const totalTasks = activeSections.reduce((sum, s) => sum + s.wordIds.length, 0)
  const sequence = getDailyTaskSequence(plan)
  const nextTask = getCurrentDailyTask(plan)
  const allDone = sequence.length > 0 && completedTasks.filter(t => sequence.includes(t)).length === sequence.length

  const intensityLabel =
    settings.dailyIntensity === 'easy' ? '轻松' :
    settings.dailyIntensity === 'normal' ? '标准' : '冲刺'

  const displayMastered = liveStats?.masteredWords ?? plan.masteredWords
  const displayRemaining = liveStats?.remainingWords ?? plan.remainingWords

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-up">
      {/* Nav */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-text-secondary active:text-accent">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-primary">Mimo AI 今日计划</h1>
          <p className="text-xs text-text-secondary">{plan.planTitle}</p>
        </div>
        {plan.createdBy === 'local_fallback' && (
          <span className="text-[10px] bg-bg-tertiary text-text-tertiary px-2 py-1 rounded-full">本地计划</span>
        )}
      </div>

      {/* Adjust / Regenerate toolbar */}
      <div className="flex gap-2 mb-4">
        <Link
          href="/profile#mimo-settings"
          className="flex-1 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-xs font-medium text-center active:scale-95 transition-all"
        >
          ⚙️ 调整计划
        </Link>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex-1 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-xs font-medium active:scale-95 transition-all disabled:opacity-50"
        >
          {regenerating ? '生成中…' : '🔄 重新生成'}
        </button>
      </div>
      {regenMsg && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-success/10 text-success text-xs font-medium text-center">
          ✓ {regenMsg}
        </div>
      )}

      {/* Goal summary with live stats */}
      <div className="bg-gradient-to-r from-accent/10 to-purple-100 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-accent">{plan.daysRemaining}</p>
            <p className="text-xs text-text-secondary">剩余天数</p>
          </div>
          <div>
            <p className="text-xl font-bold text-text-primary">{displayRemaining}</p>
            <p className="text-xs text-text-secondary">剩余词汇</p>
          </div>
          <div>
            <p className="text-xl font-bold text-warning">{plan.estimatedMinutes}</p>
            <p className="text-xs text-text-secondary">预计分钟</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-accent/10 text-xs text-text-secondary">
          <span>{intensityLabel}模式 · 共 {totalTasks} 个词</span>
          <span>{displayMastered} / {plan.totalWords} 已掌握</span>
        </div>
      </div>

      {/* AI summary */}
      <div className="bg-white rounded-xl shadow-card p-4 mb-4">
        <p className="text-xs font-semibold text-text-secondary mb-1">🤖 Mimo 建议</p>
        <p className="text-sm text-text-primary leading-relaxed">{plan.aiSummary}</p>
        {plan.priorityReason && (
          <p className="text-xs text-text-tertiary mt-1.5">{plan.priorityReason}</p>
        )}
      </div>

      {/* Task sections */}
      {activeSections.map(s => (
        <TaskCard key={s.id} section={s} completed={completedTasks.includes(s.id)} />
      ))}

      {/* Sequential start / all done */}
      {allDone ? (
        <div className="mt-4 py-4 rounded-xl bg-success/10 text-center">
          <p className="text-success font-semibold text-sm">🎉 今日计划全部完成！</p>
          <p className="text-xs text-text-tertiary mt-1">{plan.motivationalMessage}</p>
        </div>
      ) : (
        <div className="flex gap-2 mt-4">
          {nextTask && (
            <button
              onClick={() => {
                const meta = TASK_META[nextTask]
                router.push(`/${meta.page}?mode=${meta.mode}`)
              }}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold text-center active:scale-[0.97] transition-all"
            >
              {`继续 · ${TASK_META[nextTask].icon} ${TASK_META[nextTask].title}`}
            </button>
          )}
          <Link
            href="/quiz?mode=mimo-sentence"
            className="flex-1 py-3 rounded-xl bg-white text-text-primary text-sm font-semibold text-center shadow-card active:scale-[0.97] transition-all"
          >
            阅读识义测验
          </Link>
        </div>
      )}

      {!allDone && plan.motivationalMessage && (
        <p className="text-xs text-center text-text-tertiary mt-4">{plan.motivationalMessage}</p>
      )}
    </div>
  )
}
