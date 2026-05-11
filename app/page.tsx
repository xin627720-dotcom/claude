'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getUserStats, loadStore } from '@/lib/localStore'
import { allWords } from '@/lib/vocab'
import { isDueForReview } from '@/lib/review'
import { useAuth } from '@/contexts/AuthContext'
import SyncStatus from '@/components/SyncStatus'
import StatCard from '@/components/StatCard'
import type { UserStats } from '@/lib/types'

export default function HomePage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [dueCount, setDueCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [masteredCount, setMasteredCount] = useState(0)

  useEffect(() => {
    const s = getUserStats()
    setStats(s)

    const store = loadStore()
    const pm = store.wordProgress
    let due = 0, wrong = 0, fav = 0, mastered = 0
    for (const p of Object.values(pm)) {
      if (isDueForReview(p) && p.status !== 'unseen') due++
      if (p.isWrongWord) wrong++
      if (p.isFavorite) fav++
      if (p.status === 'mastered') mastered++
    }
    setDueCount(due)
    setWrongCount(wrong)
    setFavoriteCount(fav)
    setMasteredCount(mastered)
  }, [])

  const todayLearned = stats?.totalLearned ?? 0
  const dailyGoal = stats?.dailyGoal ?? 20
  const progress = Math.min(100, Math.round((todayLearned / dailyGoal) * 100))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="px-4 pt-12 pb-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-text-secondary text-sm">{greeting}</p>
          <h1 className="text-2xl font-bold text-text-primary">
            {user ? user.email?.split('@')[0] : '同学'}
          </h1>
        </div>
        <div className="text-right">
          <SyncStatus />
        </div>
      </div>

      {/* Daily progress ring */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-4 flex items-center gap-5">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#E5E5EA" strokeWidth="7" />
            <circle
              cx="40" cy="40" r="32"
              fill="none"
              stroke="#5E5CE6"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 32}`}
              strokeDashoffset={`${2 * Math.PI * 32 * (1 - progress / 100)}`}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-accent">{progress}%</span>
          </div>
        </div>
        <div>
          <p className="text-text-secondary text-sm mb-1">今日目标</p>
          <p className="text-2xl font-bold text-text-primary">{todayLearned} <span className="text-base font-normal text-text-secondary">/ {dailyGoal}</span></p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-warning">🔥 {stats?.streakDays ?? 0} 天连续</span>
            <span className="text-xs text-accent">⭐ {stats?.points ?? 0} 积分</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard label="待复习" value={dueCount} color="warning" />
        <StatCard label="已掌握" value={masteredCount} sub={`共 ${allWords.length} 词`} color="success" />
        <StatCard label="错词本" value={wrongCount} color="danger" />
        <StatCard label="已收藏" value={favoriteCount} color="accent" />
      </div>

      {/* Actions */}
      <h2 className="text-sm font-semibold text-text-secondary mb-3 px-1">快速开始</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Link href="/learn" className="bg-accent text-white rounded-xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.97] transition-all">
          <span className="text-2xl">📖</span>
          <div>
            <p className="font-semibold text-sm">开始学习</p>
            <p className="text-xs opacity-80">翻卡片背单词</p>
          </div>
        </Link>
        <Link href="/quiz" className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-card active:scale-[0.97] transition-all">
          <span className="text-2xl">🧠</span>
          <div>
            <p className="font-semibold text-sm text-text-primary">开始测验</p>
            <p className="text-xs text-text-secondary">选择题测记忆</p>
          </div>
        </Link>
        <Link href="/spelling" className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-card active:scale-[0.97] transition-all">
          <span className="text-2xl">✍️</span>
          <div>
            <p className="font-semibold text-sm text-text-primary">拼写测试</p>
            <p className="text-xs text-text-secondary">看释义拼单词</p>
          </div>
        </Link>
        <Link href="/wrong-words" className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-card active:scale-[0.97] transition-all">
          <span className="text-2xl">❌</span>
          <div>
            <p className="font-semibold text-sm text-text-primary">错词本</p>
            <p className="text-xs text-text-secondary">{wrongCount} 个待复习</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
