'use client'

import { useEffect, useState, useCallback } from 'react'
import { getWordById } from '@/lib/vocab'
import {
  getWrongWordsList,
  saveWordProgress,
  getWordProgress,
  removeWrongWord,
} from '@/lib/localStore'
import { hasEnhancedData, getEnrichCache, setEnrichCache } from '@/lib/wordDetail'
import WordDetail from '@/components/WordDetail'
import type { WrongWord, VocabWord } from '@/lib/types'

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '未知'
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return '未知'
  }
}

export default function WrongWordsPage() {
  const [list, setList] = useState<WrongWord[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [enrichedData, setEnrichedData] = useState<Record<string, Partial<VocabWord>>>({})
  const [enrichingId, setEnrichingId] = useState<string | null>(null)

  const reload = useCallback(() => {
    const arr = getWrongWordsList()
    setList(arr)
  }, [])

  useEffect(() => { reload() }, [reload])

  const triggerEnrich = useCallback(async (wordId: string, word: VocabWord) => {
    if (hasEnhancedData(word)) return

    // Check localStorage cache first
    const cached = getEnrichCache(word.word)
    if (cached) {
      setEnrichedData(prev => ({ ...prev, [wordId]: cached }))
      return
    }

    setEnrichingId(wordId)
    try {
      const resp = await fetch('/api/word/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.word, meaning: word.meaning, pos: word.pos, level: word.level }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setEnrichCache(word.word, data)
        setEnrichedData(prev => ({ ...prev, [wordId]: data }))
      }
    } catch {
      // fail silently — WordDetail shows fallback placeholders
    } finally {
      setEnrichingId(null)
    }
  }, [])

  const handleExpand = useCallback((wordId: string, word: VocabWord) => {
    const alreadyExpanded = expandedId === wordId
    setExpandedId(alreadyExpanded ? null : wordId)
    if (!alreadyExpanded) {
      triggerEnrich(wordId, word)
    }
  }, [expandedId, triggerEnrich])

  const handleMastered = (wordId: string) => {
    const p = getWordProgress(wordId)
    saveWordProgress({
      ...p,
      status: 'mastered',
      isWrongWord: false,
      updatedAt: new Date().toISOString(),
    })
    removeWrongWord(wordId)
    if (expandedId === wordId) setExpandedId(null)
    reload()
  }

  const handleRemove = (wordId: string) => {
    const p = getWordProgress(wordId)
    saveWordProgress({
      ...p,
      isWrongWord: false,
      wrongCount: 0,
      quizWrongCount: 0,
      updatedAt: new Date().toISOString(),
    })
    removeWrongWord(wordId)
    if (expandedId === wordId) setExpandedId(null)
    reload()
  }

  // Count only entries with a valid vocab word
  const validCount = list.filter(ww => ww?.wordId && !!getWordById(ww.wordId)).length

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-up">
      <h1 className="text-2xl font-bold text-text-primary mb-2">错词本</h1>
      <p className="text-sm text-text-secondary mb-5">共 {validCount} 个单词</p>

      {validCount === 0 ? (
        <div className="flex flex-col items-center py-20 text-text-tertiary">
          <p className="text-5xl mb-4">🎉</p>
          <p className="font-semibold text-text-secondary">错词本是空的</p>
          <p className="text-sm mt-1">继续加油，保持零错误！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((ww) => {
            if (!ww?.wordId) return null
            const word: VocabWord | undefined = getWordById(ww.wordId)
            const isExpanded = expandedId === ww.wordId
            const isEnriching = enrichingId === ww.wordId
            const enriched = enrichedData[ww.wordId]
            const displayWord = word && enriched ? { ...word, ...enriched } : word

            return (
              <div key={ww.wordId} className="bg-white rounded-xl shadow-card p-4">
                {/* Header row */}
                <div>
                  {word ? (
                    <>
                      <p className="font-bold text-lg text-text-primary">{word.word}</p>
                      <p className="text-sm text-text-secondary">{word.meaning}</p>
                    </>
                  ) : (
                    <p className="text-sm text-text-tertiary">该错词记录已失效，可移出错词本。</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-danger">错误 {ww.wrongCount ?? 0} 次</span>
                    {ww.lastWrongAt && (
                      <span className="text-xs text-text-tertiary">最近 {formatDate(ww.lastWrongAt)}</span>
                    )}
                    {ww.nextReviewAt && (
                      <span className="text-xs text-text-tertiary">复习 {formatDate(ww.nextReviewAt)}</span>
                    )}
                  </div>
                </div>

                {/* Inline detail */}
                {displayWord && isExpanded && (
                  <div className="mt-3 pt-3 border-t border-bg-tertiary">
                    <WordDetail word={displayWord} compact enriching={isEnriching} />
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleMastered(ww.wordId)}
                    className="flex-1 py-2 rounded-lg bg-green-50 text-success text-xs font-medium active:scale-95 transition-all"
                  >
                    已掌握
                  </button>
                  <button
                    onClick={() => handleRemove(ww.wordId)}
                    className="flex-1 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-xs font-medium active:scale-95 transition-all"
                  >
                    移出
                  </button>
                  {word && (
                    <button
                      onClick={() => handleExpand(ww.wordId, word)}
                      className="flex-1 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium active:scale-95 transition-all"
                    >
                      {isExpanded ? '收起' : '查看'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
