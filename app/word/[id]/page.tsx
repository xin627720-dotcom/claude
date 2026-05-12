'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getWordById } from '@/lib/vocab'
import { getWordProgress, saveWordProgress } from '@/lib/localStore'
import { hasEnhancedData, getEnrichCache, setEnrichCache } from '@/lib/wordDetail'
import WordDetail from '@/components/WordDetail'
import type { VocabWord, WordProgress } from '@/lib/types'

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.85
  window.speechSynthesis.speak(u)
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>{text}</span>
}

export default function WordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [word, setWord] = useState<VocabWord | null>(null)
  const [enrichedData, setEnrichedData] = useState<Partial<VocabWord> | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [progress, setProgress] = useState<WordProgress | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let w: VocabWord | undefined
    try {
      w = getWordById(id)
      setWord(w ?? null)
      if (w) setProgress(getWordProgress(id))
    } catch {
      setWord(null)
    } finally {
      setLoaded(true)
    }

    // Trigger AI enrichment if no enhanced data
    if (w && !hasEnhancedData(w)) {
      const cached = getEnrichCache(w.word)
      if (cached) {
        setEnrichedData(cached)
      } else {
        setEnriching(true)
        fetch('/api/word/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: w.word, meaning: w.meaning, pos: w.pos, level: w.level }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data) {
              setEnrichCache(w!.word, data)
              setEnrichedData(data)
            }
          })
          .catch(() => {})
          .finally(() => setEnriching(false))
      }
    }
  }, [id])

  const toggleFavorite = () => {
    if (!progress || !word) return
    const updated = { ...progress, isFavorite: !progress.isFavorite, updatedAt: new Date().toISOString() }
    saveWordProgress(updated)
    setProgress(updated)
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-text-secondary">加载中…</p>
      </div>
    )
  }

  if (!word) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="font-semibold text-text-primary mb-1">没有找到这个单词</p>
        <p className="text-sm text-text-tertiary mb-6">可能是旧学习记录导致，该词已从词库中移除</p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/vocabulary')}
            className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold active:scale-95 transition-all"
          >
            返回词库
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2.5 rounded-xl bg-bg-tertiary text-text-secondary text-sm font-semibold active:scale-95 transition-all"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  const displayWord = enrichedData ? { ...word, ...enrichedData } : word

  const statusColors: Record<string, string> = {
    unseen: 'bg-bg-tertiary text-text-tertiary',
    learning: 'bg-red-100 text-danger',
    fuzzy: 'bg-orange-100 text-warning',
    known: 'bg-blue-100 text-blue-600',
    mastered: 'bg-green-100 text-success',
  }
  const statusNames: Record<string, string> = {
    unseen: '未学', learning: '学习中', fuzzy: '模糊', known: '认识', mastered: '已掌握',
  }

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-up">
      {/* Nav */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-text-secondary active:text-accent">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={toggleFavorite} className="p-2 active:scale-95 transition-all">
          <svg
            className={`w-6 h-6 ${progress?.isFavorite ? 'text-yellow-400' : 'text-text-tertiary'}`}
            fill={progress?.isFavorite ? 'currentColor' : 'none'}
            viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
      </div>

      {/* Hero */}
      <div className="bg-white rounded-xl shadow-card p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-text-primary">{word.word}</h1>
            <p className="text-text-tertiary text-sm mt-1">{word.pos}</p>
          </div>
          <button
            onClick={() => speak(word.word)}
            className="p-2.5 rounded-full bg-accent/10 text-accent active:scale-90 transition-all ml-4 mt-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0l-2.53-2.53M12 17.747l2.53-2.53M6.343 9.343a8 8 0 000 5.314m10-5.314a8 8 0 010 5.314" />
            </svg>
          </button>
        </div>
        <p className="text-xl font-semibold text-text-primary mt-3">{word.meaning}</p>
        <p className="text-sm text-text-secondary mt-1">{word.definition}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Badge text={word.level === 'basic' ? '基础词' : '核心词'} color="bg-accent/10 text-accent" />
          {progress && (
            <Badge text={statusNames[progress.status] ?? '未学'} color={statusColors[progress.status] ?? statusColors.unseen} />
          )}
        </div>
      </div>

      {/* Detailed sections */}
      <div className="bg-white rounded-xl shadow-card p-4 mb-4">
        <WordDetail word={displayWord} enriching={enriching} />
      </div>

      {/* Progress */}
      {progress && progress.status !== 'unseen' && (
        <div className="bg-white rounded-xl shadow-card p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">我的学习记录</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-success">{progress.correctCount}</p>
              <p className="text-xs text-text-tertiary">答对</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-warning">{progress.fuzzyCount}</p>
              <p className="text-xs text-text-tertiary">模糊</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-danger">{progress.wrongCount}</p>
              <p className="text-xs text-text-tertiary">答错</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
