'use client'

import { useState, useEffect } from 'react'
import { allWords } from '@/lib/vocab'
import { loadStore } from '@/lib/localStore'
import { calculateLearningStats } from '@/lib/stats'
import {
  getMimoPlanSettings,
  saveMimoPlanSettings,
  getDefaultSettings,
  calculateDaysRemaining,
  calculateDailyNewWordTarget,
  getTargetDateFromMode,
  saveTodayMimoPlan,
  clearTodayMimoPlan,
  buildLocalPlanCandidates,
  generateLocalFallbackPlan,
  validateAndCleanAiPlan,
  getEffectiveLimits,
  enforceUserNewWordCount,
  todayStr,
  addDays,
} from '@/lib/mimoPlan'
import type { MimoPlanSettings, MimoDailyPlan, MimoTargetMode, MimoIntensity } from '@/lib/types'

const REVIEW_LIMIT_OPTIONS = [20, 50, 100, 150] as const
const DAILY_MINUTES_OPTIONS = [10, 20, 30, 45, 60] as const

interface Props {
  onSaved?: () => void
}

export default function MimoPlanSettingsCard({ onSaved }: Props) {
  const [settings, setSettings] = useState<MimoPlanSettings>(getDefaultSettings)
  const [customReviewInput, setCustomReviewInput] = useState('')
  const [customNewWordsInput, setCustomNewWordsInput] = useState('')
  // targetDaysInput is the only source of truth for the custom-days text field
  const [targetDaysInput, setTargetDaysInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    const ms = getMimoPlanSettings()
    setSettings(ms)
    setCustomReviewInput(String(ms.dailyReviewLimit))
    setCustomNewWordsInput(String(ms.dailyNewWords))
    setTargetDaysInput(
      ms.targetMode === 'custom'
        ? String(calculateDaysRemaining(ms.targetDate))
        : ms.targetMode.replace('_days', '')
    )
  }, [])

  const patch = (p: Partial<MimoPlanSettings>) => {
    setSettings(prev => ({ ...prev, ...p }))
    setSavedMsg(null)
  }

  const handleTargetMode = (mode: MimoTargetMode) => {
    if (mode === 'custom') {
      // Keep the targetDate already set, or default to 90 days from now
      const days = parseInt(targetDaysInput, 10)
      const resolvedDate = (!isNaN(days) && days >= 1)
        ? addDays(todayStr(), days)
        : settings.targetDate ?? addDays(todayStr(), 90)
      patch({ targetMode: 'custom', targetDate: resolvedDate })
    } else {
      patch({ targetMode: mode, targetDate: getTargetDateFromMode(mode) })
    }
  }

  // Updating the custom-days number input: directly update targetDate in state
  const handleCustomDays = (val: string) => {
    setTargetDaysInput(val)
    const days = parseInt(val, 10)
    if (!isNaN(days) && days >= 1 && days <= 730) {
      patch({ targetMode: 'custom', targetDate: addDays(todayStr(), days) })
    }
  }

  const handleSave = async () => {
    const finalDate =
      settings.targetMode === 'custom'
        ? settings.targetDate
        : getTargetDateFromMode(settings.targetMode)

    const finalNewWords = Math.max(1, settings.dailyNewWords)
    const finalReviewLimit = Math.max(10, Math.min(300, settings.dailyReviewLimit))

    const updated: MimoPlanSettings = {
      ...settings,
      targetDate: finalDate,
      dailyNewWords: finalNewWords,
      dailyReviewLimit: finalReviewLimit,
      updatedAt: new Date().toISOString(),
    }
    saveMimoPlanSettings(updated)
    clearTodayMimoPlan()
    setSettings(updated)
    onSaved?.()

    // If Mimo is disabled, just save and clear — no plan generation
    if (!updated.enabled) {
      setSavedMsg('Mimo AI 今日计划已关闭')
      return
    }

    // Enabled: regenerate today's plan with new settings
    setGenerating(true)
    setSavedMsg(null)
    try {
      const store = loadStore()
      const pm = store.wordProgress
      const { learnedWords, masteredWords, remainingWords } = calculateLearningStats(allWords.length, pm)
      const daysRemaining = calculateDaysRemaining(updated.targetDate)
      const { target: dailyNewTarget } = calculateDailyNewWordTarget(
        allWords.length - learnedWords,
        daysRemaining,
        updated.dailyIntensity,
        updated.dailyNewWordsMode,
        updated.dailyNewWords
      )
      const statsObj = {
        totalWords: allWords.length,
        learnedWords,
        masteredWords,
        remainingWords,
        daysRemaining,
        dailyNewTarget,
      }
      const candidates = buildLocalPlanCandidates(pm, allWords, updated, dailyNewTarget)
      const AI_CANDIDATE_CAP = 150
      let resultPlan: MimoDailyPlan | null = null

      try {
        const body = {
          date: todayStr(),
          targetDate: updated.targetDate,
          daysRemaining,
          totalWords: allWords.length,
          learnedWords,
          masteredWords,
          remainingWords,
          dailyNewTarget,
          intensity: updated.dailyIntensity,
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
              const limits = getEffectiveLimits(updated, dailyNewTarget)
              const cleaned = validateAndCleanAiPlan(raw, validIds, limits)
            if (cleaned && ((cleaned.newWordIds?.length ?? 0) + (cleaned.reviewWordIds?.length ?? 0)) > 0) {
              const enforcedNewIds = enforceUserNewWordCount(
                cleaned.newWordIds ?? [],
                updated,
                candidates.candidateNewWords
              )
              resultPlan = {
                ...generateLocalFallbackPlan(updated, statsObj, candidates),
                ...cleaned,
                newWordIds: enforcedNewIds,
                date: todayStr(),
                targetDate: updated.targetDate,
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

      if (!resultPlan) {
        resultPlan = generateLocalFallbackPlan(updated, statsObj, candidates)
      }

      saveTodayMimoPlan(resultPlan)
      setSavedMsg('计划已根据你的设置重新生成')
    } catch {
      setSavedMsg('设置已保存，请回到首页重新生成计划')
    } finally {
      setGenerating(false)
    }
  }

  // Warning calculation
  const warningInfo = (() => {
    if (!settings.targetDate) return null
    const days = calculateDaysRemaining(settings.targetDate)
    const store = loadStore()
    const mastered = Object.values(store.wordProgress).filter(p => p.status === 'mastered').length
    const remaining = allWords.length - mastered
    const { target, warning } = calculateDailyNewWordTarget(
      remaining,
      days,
      settings.dailyIntensity,
      settings.dailyNewWordsMode,
      settings.dailyNewWords
    )
    return { days, remaining, target, warning }
  })()

  const toggleProps = (active: boolean) =>
    `relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${active ? 'bg-accent' : 'bg-gray-200'}`
  const thumbProps = (active: boolean) =>
    `absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${active ? 'left-[22px]' : 'left-0.5'}`

  return (
    <div id="mimo-settings" className="bg-white rounded-xl shadow-card p-5 mb-4">
      {/* Header with enable toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-secondary">Mimo AI 学习计划设置</h2>
          <p className="text-xs text-text-tertiary mt-0.5">自定义每日目标和学习节奏</p>
        </div>
        <button
          onClick={() => patch({ enabled: !settings.enabled })}
          className={toggleProps(settings.enabled)}
          aria-label={settings.enabled ? '关闭 Mimo' : '开启 Mimo'}
        >
          <span className={thumbProps(settings.enabled)} />
        </button>
      </div>

      {settings.enabled && (
        <>
          {/* ── 目标完成时间 ─────────────────────────────────── */}
          <p className="text-xs font-medium text-text-primary mb-2">目标完成时间</p>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {(['30_days', '60_days', '90_days', '120_days'] as MimoTargetMode[]).map(m => (
              <button
                key={m}
                onClick={() => handleTargetMode(m)}
                className={`py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${settings.targetMode === m ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
              >
                {m.replace('_days', '天')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => handleTargetMode('custom')}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${settings.targetMode === 'custom' ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
            >
              自定义
            </button>
            {settings.targetMode === 'custom' && (
              <>
                <input
                  type="number"
                  min="1"
                  max="730"
                  value={targetDaysInput}
                  onChange={e => handleCustomDays(e.target.value)}
                  placeholder="天数"
                  className="w-20 rounded-lg px-2 py-2 text-xs bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
                />
                <span className="text-xs text-text-tertiary">天后完成</span>
              </>
            )}
          </div>

          {/* ── 每日新词数量 ─────────────────────────────────── */}
          <p className="text-xs font-medium text-text-primary mb-2">每日新词数量</p>
          <div className="flex gap-2 mb-1">
            <button
              onClick={() => patch({ dailyNewWordsMode: 'auto' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${settings.dailyNewWordsMode === 'auto' ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
            >
              自动计算
            </button>
            <button
              onClick={() => patch({ dailyNewWordsMode: 'manual' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${settings.dailyNewWordsMode === 'manual' ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
            >
              手动设置
            </button>
          </div>
          {settings.dailyNewWordsMode === 'manual' && (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                min="1"
                value={customNewWordsInput}
                onChange={e => {
                  setCustomNewWordsInput(e.target.value)
                  const n = parseInt(e.target.value, 10)
                  if (!isNaN(n) && n >= 1) patch({ dailyNewWords: n })
                }}
                className="w-24 rounded-lg px-2 py-2 text-xs bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
              />
              <span className="text-xs text-text-tertiary">个 / 天（最少 1 个）</span>
            </div>
          )}
          {settings.dailyNewWordsMode === 'auto' && warningInfo && (
            <p className="text-xs text-text-tertiary mb-2">
              按当前目标，建议每天新学约 <strong className="text-text-primary">{warningInfo.target}</strong> 个词
            </p>
          )}

          {/* ── 每日复习上限 ─────────────────────────────────── */}
          <p className="text-xs font-medium text-text-primary mb-2 mt-3">每日复习上限</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {REVIEW_LIMIT_OPTIONS.map(v => (
              <button
                key={v}
                onClick={() => { patch({ dailyReviewLimit: v }); setCustomReviewInput(String(v)) }}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${settings.dailyReviewLimit === v ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
              >
                {v} 词
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="10"
                max="300"
                value={customReviewInput}
                onChange={e => {
                  setCustomReviewInput(e.target.value)
                  const n = parseInt(e.target.value, 10)
                  if (!isNaN(n) && n >= 10 && n <= 300) patch({ dailyReviewLimit: n })
                }}
                className="w-16 rounded-lg px-2 py-1.5 text-xs bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
                placeholder="自定义"
              />
              <span className="text-xs text-text-tertiary">词</span>
            </div>
          </div>

          {/* ── 每日预计学习时长 ─────────────────────────────── */}
          <p className="text-xs font-medium text-text-primary mb-2 mt-3">每日预计学习时长</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DAILY_MINUTES_OPTIONS.map(v => (
              <button
                key={v}
                onClick={() => patch({ dailyMinutes: v })}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${settings.dailyMinutes === v ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
              >
                {v} 分钟
              </button>
            ))}
          </div>

          {/* ── 学习强度 ─────────────────────────────────────── */}
          <p className="text-xs font-medium text-text-primary mb-2">学习强度</p>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {([
              { v: 'easy' as MimoIntensity, label: '轻松', sub: '复习较少，节奏轻' },
              { v: 'normal' as MimoIntensity, label: '标准', sub: '复习适中，平衡推进' },
              { v: 'sprint' as MimoIntensity, label: '冲刺', sub: '复习更多，适合短期完成' },
            ]).map(({ v, label, sub }) => (
              <button
                key={v}
                onClick={() => patch({ dailyIntensity: v })}
                className={`py-2 px-1 rounded-lg text-center transition-all active:scale-95 ${settings.dailyIntensity === v ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
              >
                <p className="text-xs font-medium">{label}</p>
                <p className={`text-[10px] mt-0.5 ${settings.dailyIntensity === v ? 'text-white/70' : 'text-text-tertiary'}`}>{sub}</p>
              </button>
            ))}
          </div>

          {/* ── Toggle options ────────────────────────────────── */}
          {([
            { key: 'preferHighFrequency' as const, label: '高频词优先', sub: '优先安排高频考点词' },
            { key: 'preferWrongWords' as const, label: '错词优先', sub: '优先复习错词和模糊词' },
            { key: 'allowAiAdjust' as const, label: '允许 AI 自动调整任务量', sub: '关闭后严格按手动新词数生成计划' },
            { key: 'autoGenerateDailyPlan' as const, label: '每天自动生成计划', sub: '首次打开时自动生成今日计划' },
          ]).map(({ key, label, sub }) => (
            <div key={key} className="flex items-center justify-between py-2.5 border-t border-bg-tertiary">
              <div>
                <p className="text-sm text-text-primary">{label}</p>
                <p className="text-xs text-text-tertiary">{sub}</p>
              </div>
              <button
                onClick={() => patch({ [key]: !(settings[key] as boolean) })}
                className={toggleProps(settings[key] as boolean)}
              >
                <span className={thumbProps(settings[key] as boolean)} />
              </button>
            </div>
          ))}

          {/* ── 目标摘要 & 警告 ───────────────────────────────── */}
          {warningInfo && (
            <div className="mt-3 bg-accent/5 rounded-lg px-3 py-2 text-xs text-text-secondary">
              <p>
                距目标 <strong className="text-text-primary">{warningInfo.days}</strong> 天 ·
                剩余 <strong className="text-text-primary">{warningInfo.remaining}</strong> 词 ·
                建议每天新学 <strong className="text-text-primary">{warningInfo.target}</strong> 词
              </p>
              {warningInfo.warning && (
                <p className="text-warning mt-1">⚠ {warningInfo.warning}</p>
              )}
            </div>
          )}

        </>
      )}

      {/* ── 保存状态提示（始终可见）────────────────────────── */}
      {savedMsg && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-success/10 text-success text-xs font-medium text-center">
          ✓ {savedMsg}
        </div>
      )}

      {/* ── Save button（始终可见，关闭 Mimo 后仍可保存）──── */}
      <button
        onClick={handleSave}
        disabled={generating}
        className={`w-full mt-3 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.97] transition-all disabled:opacity-70 ${
          generating ? 'bg-accent/70 text-white' : 'bg-accent text-white'
        }`}
      >
        {generating ? '正在生成新计划…' : settings.enabled ? '保存并重新生成计划' : '保存设置'}
      </button>
    </div>
  )
}
