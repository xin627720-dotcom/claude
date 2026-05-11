'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { allWords, getWordById } from '@/lib/vocab'
import { getWordProgress, saveWordProgress, saveWrongWord, getWrongWords } from '@/lib/localStore'
import { buildReviewQueue, getNextReviewDate, updateProgressAfterReview } from '@/lib/review'
import { trySyncInBackground } from '@/lib/sync'
import type { VocabWord } from '@/lib/types'

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.85
  window.speechSynthesis.speak(u)
}

export default function SpellingPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [word, setWord] = useState<VocabWord | null>(null)
  const [input, setInput] = useState('')
  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [showAnswer, setShowAnswer] = useState(false)
  const [sessionScore, setSessionScore] = useState({ correct: 0, wrong: 0 })
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const pm = Object.fromEntries(allWords.map((w) => [w.id, getWordProgress(w.id)]))
    const q = buildReviewQueue(allWords.map((w) => w.id), pm).slice(0, 20)
    setQueue(q)
    if (q.length > 0) setWord(getWordById(q[0]) ?? null)
    else setDone(true)
  }, [])

  useEffect(() => {
    if (word && result === 'idle') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [word, result])

  const handleSubmit = useCallback(() => {
    if (!word || result !== 'idle') return
    const isRight = input.trim().toLowerCase() === word.word.toLowerCase()
    setResult(isRight ? 'correct' : 'wrong')
    setShowAnswer(true)

    const now = new Date().toISOString()
    if (isRight) {
      setSessionScore((s) => ({ ...s, correct: s.correct + 1 }))
      const p = getWordProgress(word.id)
      const updated = updateProgressAfterReview(p, 'correct')
      saveWordProgress(updated)
      speak(word.word)
    } else {
      setSessionScore((s) => ({ ...s, wrong: s.wrong + 1 }))
      const p = getWordProgress(word.id)
      const updated = updateProgressAfterReview(p, 'wrong')
      saveWordProgress(updated)
      const ww = getWrongWords()[word.id]
      saveWrongWord({
        wordId: word.id,
        wrongCount: (ww?.wrongCount ?? 0) + 1,
        lastWrongAt: now,
        nextReviewAt: getNextReviewDate('learning'),
        updatedAt: now,
      })
    }
  }, [input, result, word])

  const handleNext = useCallback(() => {
    const next = index + 1
    if (next >= queue.length) {
      setDone(true)
      trySyncInBackground()
      return
    }
    setIndex(next)
    setWord(getWordById(queue[next]) ?? null)
    setInput('')
    setResult('idle')
    setShowAnswer(false)
  }, [index, queue])

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center animate-fade-up">
        <div className="text-6xl mb-4">✍️</div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">拼写测试完成！</h2>
        <p className="text-text-secondary mb-6">
          拼对 <strong className="text-success">{sessionScore.correct}</strong> 个 · 拼错 <strong className="text-danger">{sessionScore.wrong}</strong> 个
        </p>
        <button onClick={() => router.push('/')} className="bg-accent text-white rounded-xl py-3 px-8 font-semibold active:scale-[0.97] transition-all">
          返回首页
        </button>
      </div>
    )
  }

  if (!word) return null

  const resultBg = result === 'correct' ? 'bg-green-50 border-success' : result === 'wrong' ? 'bg-red-50 border-danger' : 'bg-white border-transparent'

  return (
    <div className="px-4 pt-12 animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-text-secondary">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-text-primary">拼写测试</h1>
        <span className="text-sm text-text-secondary">{index + 1}/{queue.length}</span>
      </div>

      <div className="w-full bg-bg-tertiary rounded-full h-1.5 mb-6">
        <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
      </div>

      {/* Score */}
      <div className="flex gap-3 mb-4">
        <span className="text-xs text-success font-medium">✓ {sessionScore.correct}</span>
        <span className="text-xs text-danger font-medium">✗ {sessionScore.wrong}</span>
      </div>

      {/* Card */}
      <div className={`rounded-xl border-2 shadow-card p-6 mb-5 transition-all ${resultBg}`}>
        <p className="text-xs text-text-tertiary mb-1">看释义，拼写英文单词</p>
        <p className="text-xl font-bold text-text-primary mb-1">{word.meaning}</p>
        <p className="text-sm text-text-secondary mb-3">{word.definition}</p>

        {showAnswer && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-bold text-text-primary">{word.word}</span>
            <button onClick={() => speak(word.word)} className="text-text-tertiary active:text-accent">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0l-2.53-2.53M12 17.747l2.53-2.53" />
              </svg>
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (result === 'idle' ? handleSubmit() : handleNext())}
          disabled={result !== 'idle'}
          placeholder="输入英文单词…"
          className={`w-full rounded-lg px-4 py-3 text-base outline-none border transition-all ${
            result === 'correct' ? 'border-success text-success bg-green-50' :
            result === 'wrong' ? 'border-danger text-danger bg-red-50' :
            'border-bg-tertiary bg-bg-primary text-text-primary focus:border-accent'
          }`}
        />
      </div>

      <button
        onClick={result === 'idle' ? handleSubmit : handleNext}
        disabled={result === 'idle' && !input.trim()}
        className="w-full bg-accent text-white rounded-xl py-3.5 font-semibold disabled:opacity-40 active:scale-[0.97] transition-all"
      >
        {result === 'idle' ? '确认答案' : '下一个 →'}
      </button>
    </div>
  )
}
