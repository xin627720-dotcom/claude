'use client'

import { useState, useEffect } from 'react'
import { allWords } from '@/lib/vocab'
import { loadStore } from '@/lib/localStore'
import {
  getMimoPlanSettings,
  saveMimoPlanSettings,
  getDefaultSettings,
  calculateDaysRemaining,
  calculateDailyNewWordTarget,
  getTargetDateFromMode,
  clearTodayMimoPlan,
  todayStr,
  addDays,
  INTENSITY_LIMITS,
} from '@/lib/mimoPlan'
import type { MimoPlanSettings, MimoTargetMode, MimoIntensity } from '@/lib/types'

const REVIEW_LIMIT_OPTIONS = [20, 50, 100, 150] as const
const DAILY_MINUTES_OPTIONS = [10, 20, 30, 45, 60] as const

interface Props {
  onSaved?: () => void
}

export default function MimoPlanSettingsCard({ onSaved }: Props) {
  const [settings, setSettings] = useState<MimoPlanSettings>(getDefaultSettings)
  const [customDateInput, setCustomDateInput] = useState('')
  const [customReviewInput, setCustomReviewInput] = useState('')
  const [customNewWordsInput, setCustomNewWordsInput] = useState('')
  const [saved, setSaved] = useState(false)
  const [targetDaysInput, setTargetDaysInput] = useState('')

  useEffect(() => {
    const ms = getMimoPlanSettings()
    setSettings(ms)
    setCustomDateInput(ms.targetDate ?? '')
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
    setSaved(false)
  }

  const handleTargetMode = (mode: MimoTargetMode) => {
    const targetDate = mode === 'custom'
      ? (customDateInput || addDays(todayStr(), 90))
      : getTargetDateFromMode(mode)
    patch({ targetMode: mode, targetDate })
  }

  const handleCustomDays = (val: string) => {
    setTargetDaysInput(val)
    const days = parseInt(val, 10)
    if (!isNaN(days) && days >= 1 && days <= 730) {
      patch({ targetMode: 'custom', targetDate: addDays(todayStr(), days) })
    }
  }

  const handleSave = () => {
    const finalDate =
      settings.targetMode === 'custom'
        ? (customDateInput || settings.targetDate)
        : getTargetDateFromMode(settings.targetMode)

    const finalNewWords = Math.max(5, Math.min(100, settings.dailyNewWords))
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
    setSaved(true)
    onSaved?.()
    setTimeout(() => setSaved(false), 3000)
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
              <input
                type="number"
                min="1"
                max="730"
                value={targetDaysInput}
                onChange={e => handleCustomDays(e.target.value)}
                placeholder="天数"
                className="w-20 rounded-lg px-2 py-2 text-xs bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
              />
            )}
            {settings.targetMode === 'custom' && (
              <span className="text-xs text-text-tertiary">天后完成</span>
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
                min="5"
                max="100"
                value={customNewWordsInput}
                onChange={e => {
                  setCustomNewWordsInput(e.target.value)
                  const n = parseInt(e.target.value, 10)
                  if (!isNaN(n) && n >= 5 && n <= 100) patch({ dailyNewWords: n })
                }}
                className="w-20 rounded-lg px-2 py-2 text-xs bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
              />
              <span className="text-xs text-text-tertiary">个 / 天（5–100）</span>
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
              { v: 'easy' as MimoIntensity, label: '轻松', sub: `新词≤${INTENSITY_LIMITS.easy.newWords} 复习≤${INTENSITY_LIMITS.easy.reviewWords}` },
              { v: 'normal' as MimoIntensity, label: '标准', sub: `新词≤${INTENSITY_LIMITS.normal.newWords} 复习≤${INTENSITY_LIMITS.normal.reviewWords}` },
              { v: 'sprint' as MimoIntensity, label: '冲刺', sub: `新词≤${INTENSITY_LIMITS.sprint.newWords} 复习≤${INTENSITY_LIMITS.sprint.reviewWords}` },
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
            { key: 'allowAiAdjust' as const, label: '允许 AI 自动调整任务量', sub: '开启后 AI 可在强度上限内灵活调整' },
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

          {/* ── Save button ───────────────────────────────────── */}
          <button
            onClick={handleSave}
            className={`w-full mt-4 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.97] transition-all ${saved ? 'bg-success text-white' : 'bg-accent text-white'}`}
          >
            {saved ? '✓ 已保存，今日计划将重新生成' : '保存计划设置'}
          </button>
        </>
      )}
    </div>
  )
}
