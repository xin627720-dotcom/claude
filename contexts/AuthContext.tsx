'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient'
import { fullSync } from '@/lib/sync'
import type { SyncStatus } from '@/lib/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  syncStatus: SyncStatus
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  triggerSync: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  const triggerSync = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setSyncStatus('syncing')
    const status = await fullSync()
    setSyncStatus(status)
    if (status === 'success') {
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
      if (data.session) {
        triggerSync()
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession) {
        triggerSync()
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [triggerSync])

  const signInWithEmail = async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { error: '未配置 Supabase，请先完成配置' }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    if (!isSupabaseConfigured()) return
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setSyncStatus('idle')
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, syncStatus, signInWithEmail, signOut, triggerSync }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
