'use client'

import Link from 'next/link'
import type { WeakWordItem } from '@/lib/aiTypes'

interface Props {
  weakWords: WeakWordItem[]
}

export default function WeakWordsList({ weakWords }: Props) {
  if (weakWords.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6 text-center">
        <p className="text-4xl mb-2">🌟</p>
        <p className="text-sm font-semibold text-text-primary">没有明显薄弱词汇</p>
        <p className="text-xs text-text-secondary mt-1">继续保持，多练习可以进一步巩固</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <h2 className="font-semibold text-text-primary text-sm">薄弱词汇排行</h2>
        <p className="text-xs text-text-tertiary mt-0.5">按弱点分从高到低，重点复习</p>
      </div>
      <ul className="divide-y divide-gray-50">
        {weakWords.map((item, index) => (
          <li key={item.wordId}>
            <Link
              href={`/word/${item.wordId}`}
              className="flex items-center px-4 py-3 gap-3 active:bg-gray-50 transition-colors"
            >
              {/* Rank */}
              <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0 ? 'bg-danger text-white' :
                index === 1 ? 'bg-orange-400 text-white' :
                index === 2 ? 'bg-yellow-400 text-white' :
                'bg-gray-100 text-text-tertiary'
              }`}>
                {index + 1}
              </span>

              {/* Word info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-text-primary">{item.word}</span>
                  {item.isOverdue && (
                    <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">逾期</span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary truncate">{item.meaning}</p>
              </div>

              {/* Stats */}
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-semibold text-danger">{item.weakScore}</p>
                <p className="text-[10px] text-text-tertiary">弱点分</p>
              </div>

              {/* Mini stats */}
              <div className="flex-shrink-0 flex flex-col gap-0.5 text-[10px] text-text-tertiary min-w-[44px]">
                {item.wrongCount > 0 && (
                  <span className="text-danger">✗ {item.wrongCount}</span>
                )}
                {item.fuzzyCount > 0 && (
                  <span className="text-warning">~ {item.fuzzyCount}</span>
                )}
                {item.correctCount > 0 && (
                  <span className="text-success">✓ {item.correctCount}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
