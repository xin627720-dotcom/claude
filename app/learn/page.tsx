'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { allWords, getWordById } from '@/lib/vocab'
import { getWordProgress, saveWordProgress, getUserStats, saveUserStats } from '@/lib/localStore'
import { updateProgressAfterReview, buildReviewQueue } from '@/lib/review'
import { trySyncInBackground } from '@/lib/sync'
import {
  canUseSpeech,
  speakWord,
  stopSpeech,
  unlockSpeechEngine,
  getAutoSpeakEnabled,
  getSpeechUnlocked,
  persistSpeechUnlocked,
} from '@/lib/speech'
import WordCard from '@/components/WordCard'
import type { VocabWord } from '@/lib/types'

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
   * speechUnlocked: true once the user has clicked any button this session.
   * Required because browsers (especially iOS Safari) block SpeechSynthesis
   * until a user-gesture has occurred. We persist this in sessionStorage so
   * it survives navigation within the same tab without needing a click every time.
   */
  const [speechUnlocked, setSpeechUnlocked] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  /** Tracks the last word ID we auto-spoke to prevent duplicate calls on re-render */
  const lastSpokenWordRef = useRef<string | null>(null)

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supported = canUseSpeech()
    setSpeechSupported(supported)
    setAutoSpeakEnabled(getAutoSpeakEnabled())

    // Restore speech unlock state from this session (user already clicked before)
    const alreadyUnlocked = getSpeechUnlocked()
    if (alreadyUnlocked) setSpeechUnlocked(true)

    // Build review queue
    const progressMap = Object.fromEntries(
      allWords.map((w) => [w.id, getWordProgress(w.id)])
    )
    const q = buildReviewQueue(allWords.map((w) => w.id), progressMap)
    const limited = q.slice(0, 30)
    setQueue(limited)
    setIndex(0)
    if (limited.length > 0) {
      setCurrentWord(getWordById(limited[0]) ?? null)
    } else {
      setDone(true)
    }

    return () => stopSpeech()
  }, [])

  // ── Auto-speak when word changes ─────────────────────────────────────────────
  useEffect(() => {
    console.debug('[AutoSpeak] effect', {
      wordId: currentWord?.id,
      autoSpeakEnabled,
      speechUnlocked,
      speechSupported,
      lastSpoken: lastSpokenWordRef.current,
    })

    if (!autoSpeakEnabled || !speechUnlocked || !speechSupported) return
    if (!currentWord?.word) return
    // Only speak when the word actually changed — not on unrelated re-renders
    if (lastSpokenWordRef.current === currentWord.id) return

    lastSpokenWordRef.current = currentWord.id
    console.debug('[AutoSpeak] calling speakWord:', currentWord.word)
    speakWord(currentWord.word, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
  }, [currentWord?.id, autoSpeakEnabled, speechUnlocked, speechSupported])
  // NOTE: intentionally depend on currentWord?.id (not the whole object) so
  // toggling isFavorite or other progress changes don't re-trigger speech.

  // ── Unlock speech (must be called inside a user-gesture handler) ─────────────
  const unlockSpeech = useCallback(() => {
    if (speechUnlocked) return
    // iOS Safari warm-up: a zero-volume utterance inside a click handler
    unlockSpeechEngine()
    persistSpeechUnlocked()
    setSpeechUnlocked(true)
    // The auto-speak useEffect will fire automatically because speechUnlocked changed,
    // and lastSpokenWordRef.current won't match the current word (it was never set
    // while unlocked was false), so the word will be spoken.
  }, [speechUnlocked])

  // ── Manual speak button ───────────────────────────────────────────────────────
  const handleSpeak = useCallback(() => {
    if (!currentWord || !canUseSpeech()) return
    // Unlock on first click (synchronous, inside a gesture handler)
    if (!speechUnlocked) {
      unlockSpeechEngine()
      persistSpeechUnlocked()
      setSpeechUnlocked(true)
    }
    // Speak immediately and update ref so useEffect doesn't double-speak
    lastSpokenWordRef.current = currentWord.id
    speakWord(currentWord.word, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
  }, [currentWord, speechUnlocked])

  // ── Result handler ────────────────────────────────────────────────────────────
  const handleResult = useCallback(
    (result: 'correct' | 'fuzzy' | 'wrong') => {
      if (!currentWord) return

      // Unlock speech on first result click (inside user-gesture handler)
      if (!speechUnlocked) {
        unlockSpeechEngine()
        persistSpeechUnlocked()
        setSpeechUnlocked(true)
      }

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

      const next = index + 1
      if (next >= queue.length) {
        setDone(true)
        trySyncInBackground()
        return
      }
      setIndex(next)
      setCurrentWord(getWordById(queue[next]) ?? null)
      // auto-speak useEffect fires automatically when currentWord changes
    },
    [currentWord, index, queue, sessionCount, speechUnlocked]
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

  // ── Speech status badge ───────────────────────────────────────────────────────
  let speakStatusNode: React.ReactNode = null
  if (!speechSupported) {
    speakStatusNode = <span className="text-xs text-text-tertiary">当前浏览器不支持朗读</span>
  } else if (autoSpeakEnabled && speaking) {
    speakStatusNode = (
      <span className="text-xs text-text-tertiary flex items-center gap-1 animate-pulse">
        <span>🔊</span><span>正在发音…</span>
      </span>
    )
  } else if (autoSpeakEnabled && !speechUnlocked) {
    speakStatusNode = (
      <span className="text-xs text-text-tertiary">
        首次使用请点一下🔊或任意学习按钮，之后将自动发音
      </span>
    )
  } else if (autoSpeakEnabled) {
    speakStatusNode = (
      <span className="text-xs text-success flex items-center gap-1">
        <span>🔊</span><span>自动发音：已开启</span>
      </span>
    )
  } else {
    speakStatusNode = (
      <span className="text-xs text-text-tertiary flex items-center gap-1">
        <span>🔇</span><span>自动发音：已关闭</span>
      </span>
    )
  }

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
      <div className="w-full bg-bg-tertiary rounded-full h-1.5 mb-3">
        <div
          className="bg-accent h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${((index + 1) / Math.max(queue.length, 1)) * 100}%` }}
        />
      </div>

      {/* Speech status — fixed height to avoid layout shift */}
      <div className="flex justify-center items-center h-6 mb-2">
        {speakStatusNode}
      </div>

      <WordCard
        word={currentWord}
        onResult={handleResult}
        isFavorite={isFav}
        onToggleFavorite={handleFavorite}
        showProgress={`${index + 1} / ${queue.length}`}
        onInteract={unlockSpeech}
        onSpeak={handleSpeak}
      />

      <p className="text-center text-xs text-text-tertiary mt-5">
        ✓ 认识 +2分 · ~ 模糊 +1分 · ✗ 不认识 加入错词本
      </p>
    </div>
  )
}
