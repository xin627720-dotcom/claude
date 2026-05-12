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
   * Browsers block speechSynthesis until a user-gesture fires (especially iOS Safari).
   * Persisted in sessionStorage so it survives same-tab navigation.
   */
  const [speechUnlocked, setSpeechUnlocked] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  /** Last word ID spoken — prevents the backup useEffect from double-speaking */
  const lastSpokenWordRef = useRef<string | null>(null)
  /** Next queue index, written by handleResultImmediate, read by handleResult */
  const nextIndexRef = useRef<number>(0)

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSpeechSupported(canUseSpeech())
    setAutoSpeakEnabled(getAutoSpeakEnabled())

    const alreadyUnlocked = getSpeechUnlocked()
    if (alreadyUnlocked) setSpeechUnlocked(true)

    const progressMap = Object.fromEntries(
      allWords.map((w) => [w.id, getWordProgress(w.id)])
    )
    const q = buildReviewQueue(allWords.map((w) => w.id), progressMap).slice(0, 30)
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
  // Primary speech happens synchronously in gesture handlers below.
  // This useEffect catches edge cases (e.g. speech already unlocked, page reload).
  useEffect(() => {
    if (!autoSpeakEnabled || !speechUnlocked || !speechSupported) return
    if (!currentWord?.word) return
    if (lastSpokenWordRef.current === currentWord.id) return

    lastSpokenWordRef.current = currentWord.id
    console.debug('[AutoSpeak] backup useEffect:', currentWord.word)
    speakWord(currentWord.word)
  }, [currentWord?.id, autoSpeakEnabled, speechUnlocked, speechSupported])

  // ── Unlock helper ─────────────────────────────────────────────────────────────
  const unlockSpeech = useCallback(() => {
    if (speechUnlocked) return
    persistSpeechUnlocked()
    setSpeechUnlocked(true)
  }, [speechUnlocked])

  // ── "开始学习并开启发音" button ───────────────────────────────────────────────
  // Called inside a click gesture → speakWord allowed by browser autoplay policy.
  const handleStartWithSpeech = useCallback(() => {
    if (!currentWord) return
    persistSpeechUnlocked()
    setSpeechUnlocked(true)
    lastSpokenWordRef.current = currentWord.id
    console.debug('[Speech] handleStartWithSpeech:', currentWord.word)
    speakWord(currentWord.word)
  }, [currentWord])

  // ── Manual 🔊 button ──────────────────────────────────────────────────────────
  const handleSpeak = useCallback(() => {
    if (!currentWord || !canUseSpeech()) return
    if (!speechUnlocked) {
      persistSpeechUnlocked()
      setSpeechUnlocked(true)
    }
    lastSpokenWordRef.current = currentWord.id
    console.debug('[Speech] handleSpeak:', currentWord.word)
    speakWord(currentWord.word)
  }, [currentWord, speechUnlocked])

  // ── Called synchronously when user taps a result button ───────────────────────
  // WordCard calls this BEFORE its 300ms animation, so we're still inside the
  // browser's user-gesture context — speechSynthesis.speak() is allowed here.
  const handleResultImmediate = useCallback(
    (_result: 'correct' | 'fuzzy' | 'wrong') => {
      // Always update unlock state (even if autoSpeak is off, unlock for manual use)
      if (!speechUnlocked) {
        persistSpeechUnlocked()
        setSpeechUnlocked(true)
      }

      const next = index + 1
      nextIndexRef.current = next

      if (!autoSpeakEnabled || !speechSupported) return
      if (next >= queue.length) return

      const nextWord = getWordById(queue[next])
      if (nextWord) {
        lastSpokenWordRef.current = nextWord.id
        console.debug('[Speech] handleResultImmediate → next word:', nextWord.word)
        speakWord(nextWord.word)
      }
    },
    [autoSpeakEnabled, speechSupported, speechUnlocked, index, queue]
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
      <div className="w-full bg-bg-tertiary rounded-full h-1.5 mb-3">
        <div
          className="bg-accent h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${((index + 1) / Math.max(queue.length, 1)) * 100}%` }}
        />
      </div>

      {/* First-time unlock prompt */}
      {speechSupported && autoSpeakEnabled && !speechUnlocked && (
        <button
          onClick={handleStartWithSpeech}
          className="w-full mb-3 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-sm"
        >
          <span>🔊</span>
          <span>开始学习并开启发音</span>
        </button>
      )}

      {/* Speech status — fixed height to avoid layout shift */}
      <div className="flex justify-center items-center h-6 mb-2">
        {!speechSupported ? (
          <span className="text-xs text-text-tertiary">当前浏览器不支持朗读</span>
        ) : autoSpeakEnabled && speechUnlocked ? (
          <span className="text-xs text-success flex items-center gap-1">
            <span>🔊</span><span>自动发音：已开启</span>
          </span>
        ) : !autoSpeakEnabled ? (
          <span className="text-xs text-text-tertiary flex items-center gap-1">
            <span>🔇</span><span>自动发音：已关闭</span>
          </span>
        ) : null}
      </div>

      <WordCard
        word={currentWord}
        onResult={handleResult}
        onResultImmediate={handleResultImmediate}
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
