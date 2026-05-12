'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getTodayMimoPlan, getMimoPlanSettings } from '@/lib/mimoPlan'
import { getWordById } from '@/lib/vocab'
import type { MimoDailyPlan } from '@/lib/types'

interface TaskSection {
  id: string
  title: string
  icon: string
  wordIds: string[]
  color: string
  bgColor: string
  mode: string
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

function TaskCard({ section }: { section: TaskSection }) {
  const [expanded, setExpanded] = useState(false)
  if (section.wordIds.length === 0) return null

  return (
    <div className={`rounded-xl p-4 mb-3 ${section.bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{section.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${section.color}`}>{section.title}</p>
            <p className="text-xs text-text-tertiary">{section.wordIds.length} 个词 · {section.description}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Link
            href={`/learn?mode=${section.mode}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white active:scale-95 transition-all`}
            style={{ backgroundColor: section.color.replace('text-', '') }}
          >
            开始
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

  useEffect(() => {
    setPlan(getTodayMimoPlan())
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
      description: '区分易混词，减少误选',
    },
  ]

  const activeSections = taskSections.filter(s => s.wordIds.length > 0)
  const totalTasks = activeSections.reduce((sum, s) => sum + s.wordIds.length, 0)

  const intensityLabel =
    settings.dailyIntensity === 'easy' ? '轻松' :
    settings.dailyIntensity === 'normal' ? '标准' : '冲刺'

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-up">
      {/* Nav */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-text-secondary active:text-accent">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Mimo AI 今日计划</h1>
          <p className="text-xs text-text-secondary">{plan.planTitle}</p>
        </div>
        {plan.createdBy === 'local_fallback' && (
          <span className="ml-auto text-[10px] bg-bg-tertiary text-text-tertiary px-2 py-1 rounded-full">本地计划</span>
        )}
      </div>

      {/* Goal summary */}
      <div className="bg-gradient-to-r from-accent/10 to-purple-100 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-accent">{plan.daysRemaining}</p>
            <p className="text-xs text-text-secondary">剩余天数</p>
          </div>
          <div>
            <p className="text-xl font-bold text-text-primary">{plan.remainingWords}</p>
            <p className="text-xs text-text-secondary">剩余词汇</p>
          </div>
          <div>
            <p className="text-xl font-bold text-warning">{plan.estimatedMinutes}</p>
            <p className="text-xs text-text-secondary">预计分钟</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-accent/10 text-xs text-text-secondary">
          <span>{intensityLabel}模式 · 共 {totalTasks} 个词</span>
          <span>{plan.masteredWords} / {plan.totalWords} 已掌握</span>
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
        <TaskCard key={s.id} section={s} />
      ))}

      {/* Quick start all */}
      <div className="flex gap-2 mt-4">
        <Link
          href={`/learn?mode=mimo-new`}
          className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold text-center active:scale-[0.97] transition-all"
        >
          开始新词学习
        </Link>
        <Link
          href={`/quiz?mode=mimo-sentence`}
          className="flex-1 py-3 rounded-xl bg-white text-text-primary text-sm font-semibold text-center shadow-card active:scale-[0.97] transition-all"
        >
          阅读识义测验
        </Link>
      </div>

      {/* Motivational message */}
      {plan.motivationalMessage && (
        <p className="text-xs text-center text-text-tertiary mt-4">{plan.motivationalMessage}</p>
      )}
    </div>
  )
}
