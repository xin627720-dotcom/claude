'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { allWords, basicWords, coreWords } from '@/lib/vocab'
import { loadStore } from '@/lib/localStore'
import type { VocabWord, WordProgress, WordStatus } from '@/lib/types'

const statusLabel: Record<WordStatus, { text: string; color: string }> = {
  unseen: { text: '未学', color: 'bg-bg-tertiary text-text-tertiary' },
  learning: { text: '学习中', color: 'bg-red-100 text-danger' },
  fuzzy: { text: '模糊', color: 'bg-orange-100 text-warning' },
  known: { text: '认识', color: 'bg-blue-100 text-blue-600' },
  mastered: { text: '已掌握', color: 'bg-green-100 text-success' },
}

type Tab = 'all' | 'basic' | 'core'

export default function VocabularyPage() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [progressMap, setProgressMap] = useState<Record<string, WordProgress>>({})

  useEffect(() => {
    setProgressMap(loadStore().wordProgress)
  }, [])

  const sourceList = tab === 'basic' ? basicWords : tab === 'core' ? coreWords : allWords

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return sourceList
    return sourceList.filter(
      (w) => w.word.toLowerCase().includes(q) || w.meaning.includes(q)
    )
  }, [query, sourceList])

  return (
    <div className="px-4 pt-12 animate-fade-up">
      <h1 className="text-2xl font-bold text-text-primary mb-4">词库</h1>

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索单词或中文含义…"
          className="w-full bg-white rounded-xl px-4 py-3 pl-10 text-sm text-text-primary placeholder-text-tertiary shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <svg className="absolute left-3 top-3.5 w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-3.5 text-text-tertiary active:text-text-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'basic', 'core'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95 ${
              tab === t ? 'bg-accent text-white shadow-sm' : 'bg-white text-text-secondary shadow-sm'
            }`}
          >
            {t === 'all' ? `全部 (${allWords.length})` : t === 'basic' ? `基础 (${basicWords.length})` : `核心 (${coreWords.length})`}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-text-tertiary">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">没有找到相关单词</p>
        </div>
      ) : (
        <div className="space-y-2 pb-4">
          {filtered.map((word) => {
            const p = progressMap[word.id]
            const status = p?.status ?? 'unseen'
            const sl = statusLabel[status]
            return (
              <Link
                key={word.id}
                href={`/word/${word.id}`}
                className="bg-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm active:scale-[0.99] transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{word.word}</span>
                    <span className="text-xs text-text-tertiary">{word.pos}</span>
                    {p?.isFavorite && <span className="text-yellow-400 text-xs">★</span>}
                  </div>
                  <p className="text-sm text-text-secondary truncate">{word.meaning}</p>
                </div>
                <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${sl.color}`}>
                  {sl.text}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
