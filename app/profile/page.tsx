'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { getUserStats, saveUserStats, clearStore, loadStore } from '@/lib/localStore'
import { allWords } from '@/lib/vocab'
import { getAutoSpeakEnabled, setAutoSpeakEnabled } from '@/lib/speech'
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
import type { UserStats, MimoPlanSettings, MimoTargetMode, MimoIntensity } from '@/lib/types'

export default function ProfilePage() {
  const { user, syncStatus, triggerSync, signInWithEmail, verifyOtp, signOut } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [email, setEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [autoSpeakOn, setAutoSpeakOn] = useState(true)
  const [mimoSettings, setMimoSettings] = useState<MimoPlanSettings>(getDefaultSettings)
  const [customDateInput, setCustomDateInput] = useState('')
  const [mimoSaved, setMimoSaved] = useState(false)

  useEffect(() => {
    const s = getUserStats()
    setStats(s)
    setGoalInput(String(s.dailyGoal))
    setLastSync(loadStore().lastSyncedAt)
    setAutoSpeakOn(getAutoSpeakEnabled())
    const ms = getMimoPlanSettings()
    setMimoSettings(ms)
    setCustomDateInput(ms.targetDate ?? '')
  }, [syncStatus])

  const handleAutoSpeakToggle = () => {
    const next = !autoSpeakOn
    setAutoSpeakEnabled(next)
    setAutoSpeakOn(next)
  }

  const handleSendCode = async () => {
    setLoginError('')
    setSending(true)
    const { error } = await signInWithEmail(email)
    setSending(false)
    if (error) {
      setLoginError(error)
    } else {
      setCodeSent(true)
      setOtp('')
    }
  }

  const handleVerifyOtp = async () => {
    if (!/^[0-9]{6,10}$/.test(otp)) return
    setLoginError('')
    setVerifying(true)
    const { error } = await verifyOtp(email, otp.trim())
    setVerifying(false)
    if (error) {
      setLoginError(error)
    }
    // on success AuthContext's onAuthStateChange fires and sets user
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

  const handleMimoChange = (patch: Partial<MimoPlanSettings>) => {
    setMimoSettings(prev => ({ ...prev, ...patch }))
    setMimoSaved(false)
  }

  const handleMimoTargetMode = (mode: MimoTargetMode) => {
    const targetDate = mode === 'custom' ? customDateInput || null : getTargetDateFromMode(mode)
    handleMimoChange({ targetMode: mode, targetDate })
  }

  const handleSaveMimo = () => {
    const updated: MimoPlanSettings = {
      ...mimoSettings,
      targetDate:
        mimoSettings.targetMode === 'custom'
          ? customDateInput || null
          : getTargetDateFromMode(mimoSettings.targetMode),
      updatedAt: new Date().toISOString(),
    }
    saveMimoPlanSettings(updated)
    clearTodayMimoPlan()  // force regeneration with new settings
    setMimoSettings(updated)
    setMimoSaved(true)
    setTimeout(() => setMimoSaved(false), 2000)
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
          <div className="space-y-3">
            {!codeSent ? (
              <>
                <p className="text-xs text-text-secondary">输入邮箱，发送验证码，安卓和 iPad 用同一邮箱即可同步</p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && handleSendCode()}
                  placeholder="your@email.com"
                  className="w-full rounded-lg px-4 py-3 text-sm bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary"
                />
                {loginError && <p className="text-xs text-danger">{loginError}</p>}
                <button
                  onClick={handleSendCode}
                  disabled={!email.includes('@') || sending}
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.97] transition-all"
                >
                  {sending ? '发送中…' : '发送验证码'}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-text-secondary">
                  验证码已发送至 <strong>{email}</strong>，请输入收到的验证码
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={(e) => e.key === 'Enter' && /^[0-9]{6,10}$/.test(otp) && handleVerifyOtp()}
                  placeholder="验证码"
                  className="w-full rounded-lg px-4 py-3 text-sm bg-bg-primary border border-bg-tertiary outline-none focus:border-accent text-text-primary tracking-widest text-center text-xl font-bold"
                />
                {loginError && <p className="text-xs text-danger">{loginError}</p>}
                <button
                  onClick={handleVerifyOtp}
                  disabled={!/^[0-9]{6,10}$/.test(otp) || verifying}
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.97] transition-all"
                >
                  {verifying ? '验证中…' : '验证登录'}
                </button>
                <button
                  onClick={() => { setCodeSent(false); setOtp(''); setLoginError('') }}
                  className="w-full text-xs text-text-tertiary text-center active:opacity-70"
                >
                  重新输入邮箱
                </button>
              </>
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

      {/* Mimo AI Plan Settings */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary">Mimo AI 学习目标</h2>
          <button
            onClick={() => handleMimoChange({ enabled: !mimoSettings.enabled })}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${mimoSettings.enabled ? 'bg-accent' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${mimoSettings.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {mimoSettings.enabled && (
          <>
            {/* Target mode */}
            <p className="text-xs text-text-tertiary mb-2">计划完成时间</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {(['30_days', '60_days', '90_days', '120_days'] as MimoTargetMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => handleMimoTargetMode(m)}
                  className={`py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${mimoSettings.targetMode === m ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
                >
                  {m.replace('_days', '天')}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleMimoTargetMode('custom')}
              className={`w-full py-2 rounded-lg text-xs font-medium mb-2 transition-all active:scale-95 ${mimoSettings.targetMode === 'custom' ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
            >
              自定义日期
            </button>
            {mimoSettings.targetMode === 'custom' && (
              <input
                type="date"
                value={customDateInput}
                min={addDays(todayStr(), 1)}
                onChange={e => { setCustomDateInput(e.target.value); setMimoSaved(false) }}
                className="w-full rounded-lg px-3 py-2 text-sm bg-bg-primary border border-bg-tertiary outline-none focus:border-accent mb-3 text-text-primary"
              />
            )}

            {/* Daily intensity */}
            <p className="text-xs text-text-tertiary mb-2">每日学习强度</p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {([
                { v: 'easy' as MimoIntensity, label: '轻松', sub: '约10-15分钟' },
                { v: 'normal' as MimoIntensity, label: '标准', sub: '约20-30分钟' },
                { v: 'sprint' as MimoIntensity, label: '冲刺', sub: '约40-60分钟' },
              ]).map(({ v, label, sub }) => (
                <button
                  key={v}
                  onClick={() => handleMimoChange({ dailyIntensity: v })}
                  className={`py-2 px-1 rounded-lg text-center transition-all active:scale-95 ${mimoSettings.dailyIntensity === v ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'}`}
                >
                  <p className="text-xs font-medium">{label}</p>
                  <p className={`text-[10px] mt-0.5 ${mimoSettings.dailyIntensity === v ? 'text-white/70' : 'text-text-tertiary'}`}>{sub}</p>
                </button>
              ))}
            </div>

            {/* Toggle options */}
            {([
              { key: 'preferHighFrequency', label: '高频词优先', sub: '优先安排高频考点词' },
              { key: 'preferWrongWords', label: '错词优先', sub: '优先复习错词和模糊词' },
              { key: 'autoGenerateDailyPlan', label: '每天自动生成计划', sub: '每天首次打开时自动生成' },
            ] as { key: keyof MimoPlanSettings; label: string; sub: string }[]).map(({ key, label, sub }) => (
              <div key={key as string} className="flex items-center justify-between py-2.5 border-t border-bg-tertiary">
                <div>
                  <p className="text-sm text-text-primary">{label}</p>
                  <p className="text-xs text-text-tertiary">{sub}</p>
                </div>
                <button
                  onClick={() => handleMimoChange({ [key]: !(mimoSettings[key] as boolean) })}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${mimoSettings[key] ? 'bg-accent' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${mimoSettings[key] ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}

            {/* Summary */}
            {mimoSettings.targetDate && (
              <div className="mt-3 bg-accent/5 rounded-lg px-3 py-2 text-xs text-text-secondary">
                {(() => {
                  const days = calculateDaysRemaining(mimoSettings.targetDate)
                  const mastered = Object.values(loadStore().wordProgress).filter(p => p.status === 'mastered').length
                  const remaining = allWords.length - mastered
                  const { target, warning } = calculateDailyNewWordTarget(remaining, days, mimoSettings.dailyIntensity)
                  return (
                    <>
                      <p>距目标 <strong>{days}</strong> 天 · 每天建议新学 <strong>{target}</strong> 个词</p>
                      {warning && <p className="text-warning mt-1">{warning}</p>}
                    </>
                  )
                })()}
              </div>
            )}

            <button
              onClick={handleSaveMimo}
              className={`w-full mt-3 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.97] transition-all ${mimoSaved ? 'bg-success text-white' : 'bg-accent text-white'}`}
            >
              {mimoSaved ? '已保存 ✓' : '保存计划设置'}
            </button>
          </>
        )}
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
