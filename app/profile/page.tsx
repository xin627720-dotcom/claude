'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { getUserStats, saveUserStats, clearStore, loadStore } from '@/lib/localStore'
import { allWords } from '@/lib/vocab'
import { getAutoSpeakEnabled, setAutoSpeakEnabled } from '@/lib/speech'
import type { UserStats } from '@/lib/types'

export default function ProfilePage() {
  const { user, syncStatus, triggerSync, signInWithEmail, signOut } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [email, setEmail] = useState('')
  const [mailSent, setMailSent] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [autoSpeakOn, setAutoSpeakOn] = useState(true)

  useEffect(() => {
    const s = getUserStats()
    setStats(s)
    setGoalInput(String(s.dailyGoal))
    setLastSync(loadStore().lastSyncedAt)
    setAutoSpeakOn(getAutoSpeakEnabled())
  }, [syncStatus])

  const handleAutoSpeakToggle = () => {
    const next = !autoSpeakOn
    setAutoSpeakEnabled(next)
    setAutoSpeakOn(next)
  }

  const handleLogin = async () => {
    setLoginError('')
    const { error } = await signInWithEmail(email)
    if (error) {
      setLoginError(error)
    } else {
      setMailSent(true)
    }
  }

  const handleSaveGoal = () => {
    if (!stats) return
    const n = parseInt(goalInput, 10)
    if (isNaN(n) || n < 1 || n > 200) return
    const updated = { ...stats, dailyGoal: n, updatedAt: new Date().toISOString() }
    saveUserStats(updated)
    setStats(updated)
  }

  const handleClearLocal = () => {
    clearStore()
    setStats(getUserStats())
    setClearConfirm(false)
  }

  const progressCount = Object.values(loadStore().wordProgress).length
  const masteredCount = Object.values(loadStore().wordProgress).filter((p) => p.status === 'mastered').length

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-up">
      <h1 className="text-2xl font-bold text-text-primary mb-6">我的</h1>

      {/* Account section */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">账号</h2>
        {user ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="font-semibold text-text-primary">{user.email}</p>
                <p className="text-xs text-text-secondary">已登录</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full py-2.5 rounded-lg bg-bg-tertiary text-text-secondary text-sm font-medium active:scale-[0.98] transition-all"
            >
              退出登录
            </button>
          </div>
        ) : isSupabaseConfigured() ? (
          <div>
            {mailSent ? (
              <p className="text-sm text-text-secondary text-center py-2">
                📧 魔法链接已发送到 {email}，请检查邮箱并点击链接登录
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary">输入邮箱，系统发送登录链接，安卓和 iPad 用同一邮箱即可同步</p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg px-4 py-3 text-sm bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
                />
                {loginError && <p className="text-xs text-danger">{loginError}</p>}
                <button
                  onClick={handleLogin}
                  disabled={!email.includes('@')}
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.97] transition-all"
                >
                  发送登录链接
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-text-tertiary text-center py-3">
            <p>未配置 Supabase</p>
            <p className="text-xs mt-1">请查阅 SYNC.md 完成配置后可开启同步</p>
          </div>
        )}
      </div>

      {/* Sync status */}
      {isSupabaseConfigured() && user && (
        <div className="bg-white rounded-xl shadow-card p-5 mb-4">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">同步状态</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">
                {syncStatus === 'syncing' ? '同步中…' :
                 syncStatus === 'success' ? '同步成功' :
                 syncStatus === 'error' ? '同步失败' :
                 syncStatus === 'offline' ? '离线中' : '空闲'}
              </p>
              {lastSync && (
                <p className="text-xs text-text-tertiary mt-0.5">上次同步：{formatTime(lastSync)}</p>
              )}
            </div>
            <button
              onClick={triggerSync}
              disabled={syncStatus === 'syncing'}
              className="px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium disabled:opacity-40 active:scale-95 transition-all"
            >
              {syncStatus === 'syncing' ? '同步中' : '手动同步'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">学习统计</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-text-tertiary">已接触单词</p>
            <p className="text-xl font-bold text-text-primary">{progressCount}</p>
            <p className="text-xs text-text-tertiary">共 {allWords.length} 词</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-text-tertiary">已掌握</p>
            <p className="text-xl font-bold text-success">{masteredCount}</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-text-tertiary">连续天数</p>
            <p className="text-xl font-bold text-warning">{stats?.streakDays ?? 0} 天</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-text-tertiary">积分</p>
            <p className="text-xl font-bold text-accent">{stats?.points ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Learning settings */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">学习设置</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-primary font-medium">学习时自动发音</p>
            <p className="text-xs text-text-tertiary mt-0.5">每换一个单词自动朗读英文</p>
          </div>
          <button
            onClick={handleAutoSpeakToggle}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
              autoSpeakOn ? 'bg-accent' : 'bg-gray-200'
            }`}
            aria-label={autoSpeakOn ? '关闭自动发音' : '开启自动发音'}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${
                autoSpeakOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Daily goal */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">今日目标</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="200"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            className="flex-1 rounded-lg px-4 py-2.5 text-base bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
          />
          <span className="text-sm text-text-secondary">个/天</span>
          <button
            onClick={handleSaveGoal}
            className="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium active:scale-95 transition-all"
          >
            保存
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <h2 className="text-sm font-semibold text-danger mb-3">危险操作</h2>
        {clearConfirm ? (
          <div>
            <p className="text-sm text-text-secondary mb-3">确认清空本设备所有学习记录？此操作不可恢复。</p>
            <div className="flex gap-3">
              <button onClick={handleClearLocal} className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm font-medium active:scale-95">
                确认清空
              </button>
              <button onClick={() => setClearConfirm(false)} className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-secondary text-sm font-medium active:scale-95">
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setClearConfirm(true)}
            className="w-full py-2.5 rounded-lg border border-danger/30 text-danger text-sm font-medium active:scale-[0.98] transition-all"
          >
            清空本地学习数据
          </button>
        )}
      </div>
    </div>
  )
}
