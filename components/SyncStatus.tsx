'use client'

import { useAuth } from '@/contexts/AuthContext'
import { loadStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

export default function SyncStatus() {
  const { user, syncStatus, triggerSync } = useAuth()
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    setLastSync(loadStore().lastSyncedAt)
  }, [syncStatus])

  if (!isSupabaseConfigured()) return null

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-tertiary px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
        <span>登录后可同步数据</span>
      </div>
    )
  }

  if (syncStatus === 'syncing') {
    return (
      <div className="flex items-center gap-2 text-xs text-accent px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span>同步中…</span>
      </div>
    )
  }

  if (syncStatus === 'error') {
    return (
      <button
        onClick={triggerSync}
        className="flex items-center gap-2 text-xs text-danger px-1 active:opacity-70"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
        <span>同步失败，点击重试</span>
      </button>
    )
  }

  if (syncStatus === 'offline') {
    return (
      <div className="flex items-center gap-2 text-xs text-warning px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        <span>无网络，数据已本地保存</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-text-tertiary px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-success" />
      <span>{lastSync ? `已同步 ${formatTime(lastSync)}` : '云端已同步'}</span>
    </div>
  )
}
