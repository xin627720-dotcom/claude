'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getWordById } from '@/lib/vocab'
import {
  getWrongWords,
  saveWordProgress,
  getWordProgress,
  removeWrongWord,
} from '@/lib/localStore'
import type { WrongWord } from '@/lib/types'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export default function WrongWordsPage() {
  const [list, setList] = useState<WrongWord[]>([])

  const reload = useCallback(() => {
    const ww = getWrongWords()
    const arr = Object.values(ww).sort(
      (a, b) => new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime()
    )
    setList(arr)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleMastered = (wordId: string) => {
    const p = getWordProgress(wordId)
    saveWordProgress({
      ...p,
      status: 'mastered',
      isWrongWord: false,
      updatedAt: new Date().toISOString(),
    })
    removeWrongWord(wordId)
    reload()
  }

  const handleRemove = (wordId: string) => {
    const p = getWordProgress(wordId)
    saveWordProgress({ ...p, isWrongWord: false, updatedAt: new Date().toISOString() })
    removeWrongWord(wordId)
    reload()
  }

  return (
    <div className="px-4 pt-12 animate-fade-up">
      <h1 className="text-2xl font-bold text-text-primary mb-2">错词本</h1>
      <p className="text-sm text-text-secondary mb-5">共 {list.length} 个单词</p>

      {list.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-text-tertiary">
          <p className="text-5xl mb-4">🎉</p>
          <p className="font-semibold text-text-secondary">错词本是空的</p>
          <p className="text-sm mt-1">继续加油，保持零错误！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((ww) => {
            const word = getWordById(ww.wordId)
            if (!word) return null
            return (
              <div key={ww.wordId} className="bg-white rounded-xl shadow-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/word/${ww.wordId}`} className="flex-1 min-w-0">
                    <p className="font-bold text-lg text-text-primary">{word.word}</p>
                    <p className="text-sm text-text-secondary">{word.meaning}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-danger">错误 {ww.wrongCount} 次</span>
                      <span className="text-xs text-text-tertiary">最近 {formatDate(ww.lastWrongAt)}</span>
                      <span className="text-xs text-text-tertiary">复习 {formatDate(ww.nextReviewAt)}</span>
                    </div>
                  </Link>
                </div>
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
                  <Link
                    href={`/word/${ww.wordId}`}
                    className="flex-1 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium text-center active:scale-95 transition-all"
                  >
                    查看
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
