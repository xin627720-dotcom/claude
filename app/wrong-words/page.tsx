'use client'

import { useEffect, useState, useCallback } from 'react'
import { getWordById } from '@/lib/vocab'
import {
  getWrongWordsList,
  saveWordProgress,
  getWordProgress,
  removeWrongWord,
} from '@/lib/localStore'
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

function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function WordDetail({ word }: { word: VocabWord }) {
  const examples = safeArray<{ en: string; zh: string }>(word.examples)
  const collocations = safeArray<string>(word.collocations)
  const synonyms = safeArray<string>(word.synonyms)
  const antonyms = safeArray<string>(word.antonyms)
  const examTips = safeArray<string>(word.examTips)

  return (
    <div className="mt-3 pt-3 border-t border-bg-tertiary space-y-3 text-sm">
      {/* Meaning + pos */}
      <div>
        <p className="font-semibold text-text-primary">{word.meaning || ''}</p>
        {word.pos && <p className="text-xs text-text-tertiary mt-0.5">{word.pos}</p>}
        {word.definition && <p className="text-text-secondary mt-1">{word.definition}</p>}
      </div>

      {/* Examples */}
      {examples.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-1">例句</p>
          <div className="space-y-2">
            {examples.map((ex, i) => (
              <div key={i} className="border-l-2 border-accent/30 pl-2">
                {ex?.en && <p className="italic text-text-primary text-xs">{ex.en}</p>}
                {ex?.zh && <p className="text-text-tertiary text-xs mt-0.5">{ex.zh}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collocations */}
      {collocations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-1">常用搭配</p>
          <div className="flex flex-wrap gap-1.5">
            {collocations.map((c, i) => (
              <span key={i} className="px-2 py-0.5 bg-bg-primary rounded-full text-xs text-text-primary">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Synonyms / Antonyms */}
      {(synonyms.length > 0 || antonyms.length > 0) && (
        <div className="flex gap-4">
          {synonyms.length > 0 && (
            <div className="flex-1">
              <p className="text-xs font-semibold text-text-secondary mb-1">近义词</p>
              <div className="flex flex-wrap gap-1">
                {synonyms.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}
          {antonyms.length > 0 && (
            <div className="flex-1">
              <p className="text-xs font-semibold text-text-secondary mb-1">反义词</p>
              <div className="flex flex-wrap gap-1">
                {antonyms.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-50 text-danger rounded-full text-xs">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Root */}
      {word.root && (
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-0.5">词根词缀</p>
          <p className="text-xs text-text-primary">{word.root}</p>
        </div>
      )}

      {/* Exam tips */}
      {examTips.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warning mb-1">考试提示</p>
          <ul className="space-y-0.5">
            {examTips.map((tip, i) => (
              <li key={i} className="text-xs text-text-primary">• {tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function WrongWordsPage() {
  const [list, setList] = useState<WrongWord[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reload = useCallback(() => {
    const arr = getWrongWordsList()
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

  // Count only entries with a valid vocab word — keeps parity with home page
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
                {word && isExpanded && <WordDetail word={word} />}

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
                      onClick={() => setExpandedId(isExpanded ? null : ww.wordId)}
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
