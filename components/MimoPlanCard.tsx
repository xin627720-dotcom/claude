'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { allWords } from '@/lib/vocab'
import { loadStore } from '@/lib/localStore'
import { calculateLearningStats } from '@/lib/stats'
import {
  getMimoPlanSettings,
  getTodayMimoPlan,
  saveTodayMimoPlan,
  clearTodayMimoPlan,
  calculateDaysRemaining,
  calculateDailyNewWordTarget,
  buildLocalPlanCandidates,
  generateLocalFallbackPlan,
  validateAndCleanAiPlan,
  getEffectiveLimits,
  enforceTargetNewWordCount,
  enforceWrongFuzzyWordIds,
  enforceSentenceMeaningWordIds,
  getSentenceMeaningTargetCount,
  todayStr,
} from '@/lib/mimoPlan'
import { resetTodayTaskRunner, getCompletedTasks, getDailyTaskSequence } from '@/lib/mimoTaskRunner'
import { clearTodayLearningSessions } from '@/lib/mimoLearningSession'
import type { MimoDailyPlan } from '@/lib/types'

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-text-tertiary">{label}</p>
    </div>
  )
}

export default function MimoPlanCard() {
  const [plan, setPlan] = useState<MimoDailyPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [totalTaskCount, setTotalTaskCount] = useState(0)

  const buildAndSavePlan = useCallback(async (clearState = false): Promise<void> => {
    setError(null)
    setGenerating(true)
    if (clearState) {
      resetTodayTaskRunner()
      clearTodayLearningSessions()
      setCompletedCount(0)
    }
    try {
      const settings = getMimoPlanSettings()
      const store = loadStore()
      const pm = store.wordProgress

      const { learnedWords, masteredWords, remainingWords, remainingUnseenWords } = calculateLearningStats(allWords.length, pm)
      const daysRemaining = calculateDaysRemaining(settings.targetDate)
      const { target: dailyNewTarget, warning } = calculateDailyNewWordTarget(
        remainingUnseenWords,
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
      const validIds = new Set(allWords.map(w => w.id))

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
            candidateWrongWords: candidates.candidateWrongWords.slice(0, 50),
            candidateFuzzyWords: candidates.candidateFuzzyWords.slice(0, 50),
          }
          const resp = await fetch('/api/mimo/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (resp.ok) {
            const raw = await resp.json()
            if (raw && !raw.error) {
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

                const { wrongWordIds, fuzzyWordIds } = enforceWrongFuzzyWordIds(
                  cleaned.wrongWordIds ?? [],
                  cleaned.fuzzyWordIds ?? [],
                  candidates.candidateWrongWords,
                  candidates.candidateFuzzyWords,
                  settings.dailyReviewLimit,
                  validIds
                )

                const sentenceTarget = getSentenceMeaningTargetCount(enforcedNewIds.length)
                const sentenceMeaningWordIds = enforceSentenceMeaningWordIds(
                  cleaned.sentenceMeaningWordIds ?? [],
                  sentenceTarget,
                  candidates.candidateNewWords,
                  candidates.candidateWrongWords,
                  validIds,
                  allWords
                )

                const fallback = generateLocalFallbackPlan(settings, statsObj, candidates, allWords)
                const realEstimatedMin = Math.max(
                  fallback.estimatedMinutes,
                  Math.round(
                    enforcedNewIds.length * 1.5 +
                    (cleaned.reviewWordIds?.length ?? fallback.reviewWordIds.length) * 0.5 +
                    wrongWordIds.length * 1.0 +
                    sentenceMeaningWordIds.length * 0.3
                  )
                )
                resultPlan = {
                  ...fallback,
                  ...cleaned,
                  newWordIds: enforcedNewIds,
                  wrongWordIds,
                  fuzzyWordIds,
                  sentenceMeaningWordIds,
                  estimatedMinutes: realEstimatedMin,
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
        resultPlan = generateLocalFallbackPlan(settings, statsObj, candidates, allWords)
      }

      saveTodayMimoPlan(resultPlan)
      setPlan(resultPlan)

      // Update task completion counts
      const seq = getDailyTaskSequence(resultPlan)
      const completed = getCompletedTasks()
      setCompletedCount(completed.filter(t => seq.includes(t)).length)
      setTotalTaskCount(seq.length)

      if (warning) setError(warning)
    } catch (e) {
      setError(e instanceof Error ? e.message : '计划生成失败')
    } finally {
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    const settings = getMimoPlanSettings()
    if (!settings.enabled) return

    const existing = getTodayMimoPlan()
    if (existing) {
      setPlan(existing)
      const seq = getDailyTaskSequence(existing)
      const completed = getCompletedTasks()
      setCompletedCount(completed.filter(t => seq.includes(t)).length)
      setTotalTaskCount(seq.length)
      return
    }

    if (settings.autoGenerateDailyPlan) {
      buildAndSavePlan(false)
    }
  }, [buildAndSavePlan])

  const handleRegenerate = () => {
    clearTodayMimoPlan()
    buildAndSavePlan(true)
  }

  const settings = getMimoPlanSettings()
  if (!settings.enabled) {
    return (
      <div className="bg-gradient-to-r from-accent/10 to-purple-100 rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">Mimo AI 学习计划</p>
          <p className="text-xs text-text-secondary mt-0.5">开启后每天自动生成阅读词汇计划</p>
        </div>
        <Link href="/profile" className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium active:scale-95 transition-all">
          去开启
        </Link>
      </div>
    )
  }

  if (generating) {
    return (
      <div className="bg-gradient-to-r from-accent to-purple-500 text-white rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin flex-shrink-0" />
          <p className="text-sm font-semibold">Mimo AI 正在生成今日阅读词汇计划…</p>
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="bg-white rounded-xl shadow-card p-4 mb-4">
        <p className="text-sm font-semibold text-text-primary mb-2">Mimo AI 今日阅读词汇计划</p>
        <p className="text-xs text-text-secondary mb-3">今天还没有计划，点击生成</p>
        <button
          onClick={() => buildAndSavePlan(false)}
          className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium active:scale-[0.97] transition-all"
        >
          生成今日计划
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-4 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <p className="text-sm font-bold text-text-primary">Mimo AI 今日阅读词汇计划</p>
          </div>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{plan.planTitle}</p>
        </div>
        {plan.createdBy === 'local_fallback' && (
          <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded ml-2 flex-shrink-0">本地计划</span>
        )}
      </div>

      {/* AI summary */}
      <p className="text-xs text-text-secondary leading-relaxed mb-3 bg-accent/5 rounded-lg px-3 py-2">
        {plan.aiSummary}
      </p>

      {/* Task completion progress (by task count, not word count) */}
      {totalTaskCount > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-text-tertiary mb-1">
            <span>今日任务完成</span>
            <span>{completedCount} / {totalTaskCount} 个任务</span>
          </div>
          <div className="w-full bg-bg-tertiary rounded-full h-1.5">
            <div
              className="bg-accent h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${totalTaskCount > 0 ? Math.round((completedCount / totalTaskCount) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats — all 6 task types */}
      <div className="grid grid-cols-6 gap-0.5 mb-3 bg-bg-primary rounded-xl p-2">
        <StatPill label="新词" value={plan.newWordIds.length} color="text-accent" />
        <StatPill label="复习" value={plan.reviewWordIds.length} color="text-blue-500" />
        <StatPill label="错词" value={plan.wrongWordIds.length} color="text-danger" />
        <StatPill label="模糊" value={plan.fuzzyWordIds.length} color="text-warning" />
        <StatPill label="句中识义" value={plan.sentenceMeaningWordIds.length} color="text-purple-600" />
        <StatPill label="易混词" value={plan.confusingWordIds.length} color="text-green-600" />
      </div>

      {/* Distance to goal */}
      <div className="flex items-center justify-between text-xs text-text-tertiary mb-3">
        <span>距目标 <strong className="text-text-primary">{plan.daysRemaining}</strong> 天</span>
        <span>未接触 <strong className="text-text-primary">{plan.totalWords - plan.learnedWords}</strong> 词</span>
        <span>约 <strong className="text-text-primary">{plan.estimatedMinutes}</strong> 分钟参考</span>
      </div>

      {error && <p className="text-[10px] text-warning mb-2">⚠ {error}</p>}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Link
          href="/daily-plan"
          className="flex-1 py-2.5 rounded-lg bg-accent text-white text-xs font-semibold text-center active:scale-[0.97] transition-all"
        >
          开始今日计划
        </Link>
        <button
          onClick={handleRegenerate}
          className="px-3 py-2.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs font-medium active:scale-95 transition-all"
        >
          重新生成
        </button>
        <Link
          href="/profile#mimo-settings"
          className="px-3 py-2.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs font-medium active:scale-95 transition-all"
        >
          调整计划
        </Link>
      </div>
    </div>
  )
}

