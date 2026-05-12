'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { allWords, getWordById } from '@/lib/vocab'
import { getWordProgress, saveWordProgress, getUserStats, saveUserStats } from '@/lib/localStore'
import { updateProgressAfterReview, buildReviewQueue } from '@/lib/review'
import { trySyncInBackground } from '@/lib/sync'
import { canSpeak, getAutoSpeakEnabled, speakTextTracked, stopSpeaking } from '@/lib/speech'
import WordCard from '@/components/WordCard'
import type { VocabWord } from '@/lib/types'

export default function LearnPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [sessionCount, setSessionCount] = useState(0)
  const [currentWord, setCurrentWord] = useState<VocabWord | null>(null)

  // Auto-speak state
  const [autoSpeakOn, setAutoSpeakOn] = useState(false) // loaded in useEffect
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speakBlocked, setSpeakBlocked] = useState(false)
  const lastSpokenId = useRef<string | null>(null)
  // True once the user clicks any interactive element on the page
  const userInteracted = useRef(false)

  // Load settings + build queue
  useEffect(() => {
    setAutoSpeakOn(getAutoSpeakEnabled())

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

    // Stop any ongoing speech on unmount
    return () => stopSpeaking()
  }, [])

  // Auto-speak when current word changes
  useEffect(() => {
    if (!currentWord || !autoSpeakOn) return
    // Prevent re-speaking the same word on unrelated re-renders
    if (lastSpokenId.current === currentWord.id) return
    lastSpokenId.current = currentWord.id

    if (!canSpeak()) return

    // Only auto-speak once user has interacted (browser autoplay policy)
    if (!userInteracted.current) {
      setSpeakBlocked(true)
      return
    }

    setSpeakBlocked(false)
    const cleanup = speakTextTracked(currentWord.word, {
      rate: 0.85,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onBlocked: () => {
        setSpeakBlocked(true)
        setIsSpeaking(false)
      },
    })
    return cleanup
  }, [currentWord, autoSpeakOn])

  // Called by WordCard on any user interaction to unlock autoplay
  const handleInteract = useCallback(() => {
    if (userInteracted.current) return
    userInteracted.current = true
    setSpeakBlocked(false)

    // Trigger speak for the current word if it hasn't been spoken yet
    if (!currentWord || !autoSpeakOn || !canSpeak()) return
    if (lastSpokenId.current === currentWord.id) return
    lastSpokenId.current = currentWord.id
    const cleanup = speakTextTracked(currentWord.word, {
      rate: 0.85,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onBlocked: () => {
        setSpeakBlocked(true)
        setIsSpeaking(false)
      },
    })
    return cleanup
  }, [currentWord, autoSpeakOn])

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

      const next = index + 1
      if (next >= queue.length) {
        setDone(true)
        trySyncInBackground()
        return
      }
      setIndex(next)
      setCurrentWord(getWordById(queue[next]) ?? null)
    },
    [currentWord, index, queue, sessionCount]
  )

  const handleFavorite = useCallback(() => {
    if (!currentWord) return
    const p = getWordProgress(currentWord.id)
    saveWordProgress({ ...p, isFavorite: !p.isFavorite, updatedAt: new Date().toISOString() })
  }, [currentWord])

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
              lastSpokenId.current = null
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

      {/* Auto-speak status indicators */}
      <div className="h-5 mb-2 flex items-center justify-center">
        {autoSpeakOn && speakBlocked && !isSpeaking && (
          <p className="text-xs text-text-tertiary flex items-center gap-1">
            <span>🔇</span>
            <span>点击任意按钮后，将自动开启发音</span>
          </p>
        )}
        {autoSpeakOn && isSpeaking && (
          <p className="text-xs text-text-tertiary flex items-center gap-1 animate-pulse">
            <span>🔊</span>
            <span>正在发音…</span>
          </p>
        )}
        {!canSpeak() && (
          <p className="text-xs text-text-tertiary">当前浏览器不支持朗读</p>
        )}
      </div>

      <WordCard
        word={currentWord}
        onResult={handleResult}
        isFavorite={isFav}
        onToggleFavorite={handleFavorite}
        showProgress={`${index + 1} / ${queue.length}`}
        onInteract={handleInteract}
      />

      {/* tip */}
      <p className="text-center text-xs text-text-tertiary mt-5">
        ✓ 认识 +2分 · ~ 模糊 +1分 · ✗ 不认识 加入错词本
      </p>
    </div>
  )
}
