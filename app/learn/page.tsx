'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { allWords, getWordById } from '@/lib/vocab'
import { getWordProgress, saveWordProgress, getUserStats, saveUserStats } from '@/lib/localStore'
import { updateProgressAfterReview, buildReviewQueue } from '@/lib/review'
import { trySyncInBackground } from '@/lib/sync'
import {
  canUseSpeech,
  speakWordDirect,
  stopSpeech,
  loadVoices,
  getEnglishVoice,
  getAutoSpeakEnabled,
  getSpeechUnlocked,
  persistSpeechUnlocked,
} from '@/lib/speech'
import WordCard from '@/components/WordCard'
import type { VocabWord } from '@/lib/types'

type SpeakStatus = '未开始' | '播放中' | '已结束' | '出错'

interface SpeechDebug {
  voiceCount: number
  voiceName: string
  lastWord: string
  status: SpeakStatus
  error: string
}

export default function LearnPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [sessionCount, setSessionCount] = useState(0)
  const [currentWord, setCurrentWord] = useState<VocabWord | null>(null)

  // ── Speech state ─────────────────────────────────────────────────────────────
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true)
  /**
   * speechUnlocked is set to true only when onstart fires (browser confirmed
   * it is actually playing audio). This is the only reliable signal that the
   * autoplay gate has been satisfied.
   */
  const [speechUnlocked, setSpeechUnlocked] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [speechDebug, setSpeechDebug] = useState<SpeechDebug>({
    voiceCount: 0,
    voiceName: '检测中…',
    lastWord: '',
    status: '未开始',
    error: '',
  })
  /** Last word ID spoken — prevents backup useEffect from double-speaking */
  const lastSpokenWordRef = useRef<string | null>(null)
  /** Next queue index written by handleResultImmediate, read by handleResult */
  const nextIndexRef = useRef<number>(0)

  const patchDebug = useCallback((patch: Partial<SpeechDebug>) => {
    setSpeechDebug(d => ({ ...d, ...patch }))
  }, [])

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supported = canUseSpeech()
    setSpeechSupported(supported)
    setAutoSpeakEnabled(getAutoSpeakEnabled())

    const alreadyUnlocked = getSpeechUnlocked()
    if (alreadyUnlocked) setSpeechUnlocked(true)

    if (supported) {
      loadVoices().then(voices => {
        const ev = getEnglishVoice()
        setSpeechDebug(d => ({
          ...d,
          voiceCount: voices.length,
          voiceName: ev?.name ?? (voices.length > 0 ? `默认(${voices[0].name})` : '无可用音色'),
        }))
      })
    } else {
      setSpeechDebug(d => ({ ...d, voiceCount: 0, voiceName: '不支持' }))
    }

    // Support Mimo daily plan modes via URL param ?mode=mimo-*
    const urlMode = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('mode') ?? ''
      : ''

    let q: string[] = []
    if (urlMode.startsWith('mimo-')) {
      try {
        const raw = localStorage.getItem('mimoDailyPlan_v1')
        if (raw) {
          const plan = JSON.parse(raw)
          const today = new Date().toISOString().slice(0, 10)
          if (plan.date === today) {
            if (urlMode === 'mimo-new') q = plan.newWordIds ?? []
            else if (urlMode === 'mimo-review') q = plan.reviewWordIds ?? []
            else if (urlMode === 'mimo-wrong') q = plan.wrongWordIds ?? []
            else if (urlMode === 'mimo-fuzzy') q = plan.fuzzyWordIds ?? []
          }
        }
      } catch {}
    }

    if (q.length === 0 && !urlMode.startsWith('mimo-')) {
      const progressMap = Object.fromEntries(
        allWords.map((w) => [w.id, getWordProgress(w.id)])
      )
      q = buildReviewQueue(allWords.map((w) => w.id), progressMap).slice(0, 30)
    }

    setQueue(q)
    setIndex(0)
    nextIndexRef.current = 0
    if (q.length > 0) {
      setCurrentWord(getWordById(q[0]) ?? null)
    } else {
      setDone(true)
    }

    return () => stopSpeech()
  }, [])

  // ── Backup auto-speak ─────────────────────────────────────────────────────────
  // Primary speech fires inside gesture handlers below.
  // This fires when speechUnlocked becomes true (after test/manual button),
  // allowing the current word to be spoken if the gesture handlers haven't yet.
  useEffect(() => {
    if (!autoSpeakEnabled || !speechUnlocked || !speechSupported) return
    if (!currentWord?.word) return
    if (lastSpokenWordRef.current === currentWord.id) return

    const word = currentWord.word
    const id = currentWord.id
    lastSpokenWordRef.current = id
    speakWordDirect(word, {
      onStart: () => patchDebug({ status: '播放中', lastWord: word, error: '' }),
      onEnd: () => patchDebug({ status: '已结束' }),
      onError: (msg) => patchDebug({ status: '出错', error: msg }),
    })
  }, [currentWord?.id, autoSpeakEnabled, speechUnlocked, speechSupported, patchDebug])

  // ── Manual 🔊 button ──────────────────────────────────────────────────────────
  // Direct speak in gesture context; unlock only confirmed when onstart fires.
  const handleSpeak = useCallback(() => {
    if (!currentWord || !canUseSpeech()) return
    const word = currentWord.word
    const id = currentWord.id
    lastSpokenWordRef.current = id
    speakWordDirect(word, {
      onStart: () => {
        patchDebug({ status: '播放中', lastWord: word, error: '' })
        persistSpeechUnlocked()
        setSpeechUnlocked(true)
      },
      onEnd: () => patchDebug({ status: '已结束' }),
      onError: (msg) => patchDebug({ status: '出错', error: msg }),
    })
  }, [currentWord, patchDebug])

  // ── Called synchronously when user taps a result button ───────────────────────
  // WordCard calls this BEFORE its 300ms animation — we're still in gesture context.
  // Auto-speak only fires if speechUnlocked is already true (user confirmed audio works).
  const handleResultImmediate = useCallback(
    (_result: 'correct' | 'fuzzy' | 'wrong') => {
      const next = index + 1
      nextIndexRef.current = next

      if (!speechUnlocked || !autoSpeakEnabled || !speechSupported) return
      if (next >= queue.length) return

      const nextWord = getWordById(queue[next])
      if (nextWord) {
        const word = nextWord.word
        const id = nextWord.id
        lastSpokenWordRef.current = id
        speakWordDirect(word, {
          onStart: () => patchDebug({ status: '播放中', lastWord: word, error: '' }),
          onEnd: () => patchDebug({ status: '已结束' }),
          onError: (msg) => patchDebug({ status: '出错', error: msg }),
        })
      }
    },
    [speechUnlocked, autoSpeakEnabled, speechSupported, index, queue, patchDebug]
  )

  // ── Result handler (called after 300ms animation) ─────────────────────────────
  const handleResult = useCallback(
    (result: 'correct' | 'fuzzy' | 'wrong') => {
      if (!currentWord) return

      const prev = getWordProgress(currentWord.id)
      const updated = updateProgressAfterReview(prev, result)
      saveWordProgress(updated)

      const newCount = sessionCount + 1
      setSessionCount(newCount)

      const stats = getUserStats()
      const isNewWord = prev.status === 'unseen'
      saveUserStats({
        ...stats,
        totalLearned: stats.totalLearned + (isNewWord ? 1 : 0),
        totalMastered:
          updated.status === 'mastered' && prev.status !== 'mastered'
            ? stats.totalMastered + 1
            : stats.totalMastered,
        points: stats.points + (result === 'correct' ? 2 : result === 'fuzzy' ? 1 : 0),
        updatedAt: new Date().toISOString(),
      })

      const next = nextIndexRef.current
      if (next >= queue.length) {
        setDone(true)
        trySyncInBackground()
        return
      }
      setIndex(next)
      setCurrentWord(getWordById(queue[next]) ?? null)
    },
    [currentWord, queue, sessionCount]
  )

  const handleFavorite = useCallback(() => {
    if (!currentWord) return
    const p = getWordProgress(currentWord.id)
    saveWordProgress({ ...p, isFavorite: !p.isFavorite, updatedAt: new Date().toISOString() })
  }, [currentWord])

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center animate-fade-up">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">本轮学习完成！</h2>
        <p className="text-text-secondary mb-2">本次学习了 <strong>{sessionCount}</strong> 个单词</p>
        <p className="text-sm text-text-tertiary mb-8">继续保持，明天进步更大！</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => {
              setDone(false)
              setIndex(0)
              setSessionCount(0)
              lastSpokenWordRef.current = null
              nextIndexRef.current = 0
              const progressMap = Object.fromEntries(
                allWords.map((w) => [w.id, getWordProgress(w.id)])
              )
              const q = buildReviewQueue(allWords.map((w) => w.id), progressMap).slice(0, 30)
              setQueue(q)
              if (q.length > 0) setCurrentWord(getWordById(q[0]) ?? null)
              else setDone(true)
            }}
            className="bg-accent text-white rounded-xl py-3 font-semibold active:scale-[0.97] transition-all"
          >
            继续学习
          </button>
          <button
            onClick={() => router.push('/')}
            className="bg-white text-text-primary rounded-xl py-3 font-semibold shadow-card active:scale-[0.97] transition-all"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  if (!currentWord) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-text-secondary">加载中…</p>
      </div>
    )
  }

  const isFav = getWordProgress(currentWord.id).isFavorite

  return (
    <div className="px-4 pt-12 animate-fade-up">
      {/* Back + title */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-text-secondary active:text-accent transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-text-primary">背单词</h1>
        <div className="w-10" />
      </div>

      {/* Progress bar */}
      <div className="w-full bg-bg-tertiary rounded-full h-1.5 mb-4">
        <div
          className="bg-accent h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${((index + 1) / Math.max(queue.length, 1)) * 100}%` }}
        />
      </div>

      {/* Not supported warning */}
      {!speechSupported && (
        <div className="mb-3 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm">
          当前浏览器无法播放系统朗读，请尝试使用 Chrome / Safari，或检查系统文字转语音设置。
        </div>
      )}

      {/* ── 测试发音 button ────────────────────────────────────────────────────── */}
      {/* Executes speechSynthesis.speak() directly in onClick — no setTimeout,   */}
      {/* no setState intermediary. This is the only reliable way to pass         */}
      {/* mobile browsers' autoplay gate on first use.                            */}
      {speechSupported && (
        <button
          onClick={() => {
            if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
              patchDebug({ status: '出错', error: '当前浏览器不支持 speechSynthesis' })
              return
            }
            window.speechSynthesis.cancel()
            window.speechSynthesis.resume()
            const u = new SpeechSynthesisUtterance('hello')
            u.lang = 'en-US'
            u.rate = 0.85
            u.pitch = 1
            u.volume = 1
            u.onstart = () => {
              patchDebug({ status: '播放中', lastWord: 'hello', error: '' })
              persistSpeechUnlocked()
              setSpeechUnlocked(true)
            }
            u.onend = () => patchDebug({ status: '已结束' })
            u.onerror = (e) => {
              patchDebug({ status: '出错', error: String(e.error ?? '未知') })
            }
            window.speechSynthesis.speak(u)
          }}
          className="w-full mb-3 py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-sm"
        >
          🔈 测试发音（hello）
        </button>
      )}

      {/* ── Speech diagnostic panel ────────────────────────────────────────────── */}
      <div className={`mb-3 p-2.5 rounded-lg text-xs space-y-1 ${speechSupported ? 'bg-bg-primary' : 'bg-orange-50'}`}>
        <div className="font-medium text-text-secondary mb-1">朗读诊断</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-text-secondary">
          <span>speechSynthesis: {speechSupported ? '✅ 支持' : '❌ 不支持'}</span>
          <span>voices: {speechDebug.voiceCount} 个</span>
        </div>
        <div className="text-text-tertiary">voice: {speechDebug.voiceName}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-text-secondary">
          <span>最近朗读: {speechDebug.lastWord || '无'}</span>
          <span>状态: {speechDebug.status}</span>
        </div>
        {speechDebug.error && (
          <div className="text-danger font-medium">错误: {speechDebug.error}</div>
        )}
        {speechSupported && speechDebug.voiceCount === 0 && (
          <div className="text-orange-500">⚠ 未检测到英语语音，请检查系统文字转语音设置</div>
        )}
        {speechSupported && !speechUnlocked && speechDebug.status === '未开始' && (
          <div className="text-text-tertiary">→ 点击"测试发音"按钮，确认能听到声音后自动发音将启用</div>
        )}
      </div>

      {/* Auto-speak status */}
      <div className="flex justify-center items-center h-5 mb-2">
        {speechSupported && autoSpeakEnabled && speechUnlocked ? (
          <span className="text-xs text-success">🔊 自动发音：已开启</span>
        ) : speechSupported && autoSpeakEnabled && !speechUnlocked ? (
          <span className="text-xs text-text-tertiary">朗读确认后将自动切词发音</span>
        ) : !autoSpeakEnabled ? (
          <span className="text-xs text-text-tertiary">🔇 自动发音：已关闭（可在"我的"中开启）</span>
        ) : null}
      </div>

      <WordCard
        word={currentWord}
        onResult={handleResult}
        onResultImmediate={handleResultImmediate}
        isFavorite={isFav}
        onToggleFavorite={handleFavorite}
        showProgress={`${index + 1} / ${queue.length}`}
        onSpeak={handleSpeak}
      />

      <p className="text-center text-xs text-text-tertiary mt-5">
        ✓ 认识 +2分 · ~ 模糊 +1分 · ✗ 不认识 加入错词本
      </p>
    </div>
  )
}
