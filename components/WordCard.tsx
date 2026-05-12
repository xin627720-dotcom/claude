'use client'

import { useState, useCallback } from 'react'
import type { VocabWord } from '@/lib/types'
import { canUseSpeech } from '@/lib/speech'

interface WordCardProps {
  word: VocabWord
  onResult: (result: 'correct' | 'fuzzy' | 'wrong') => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
  showProgress?: string
  /** Parent handles speaking; called when user clicks the 🔊 button */
  onSpeak?: () => void
  /** Called on any button press — parent uses this to unlock speech session */
  onInteract?: () => void
}

export default function WordCard({
  word,
  onResult,
  isFavorite = false,
  onToggleFavorite,
  showProgress,
  onSpeak,
  onInteract,
}: WordCardProps) {
  const [revealed, setRevealed] = useState(false)
  const [chosen, setChosen] = useState<'correct' | 'fuzzy' | 'wrong' | null>(null)

  const handleReveal = () => {
    onInteract?.()
    setRevealed(true)
  }

  const handleResult = useCallback(
    (result: 'correct' | 'fuzzy' | 'wrong') => {
      onInteract?.()
      setChosen(result)
      setTimeout(() => {
        setRevealed(false)
        setChosen(null)
        onResult(result)
      }, 320)
    },
    [onResult, onInteract]
  )

  const handleSpeak = () => {
    onInteract?.()
    onSpeak?.()
  }

  const feedbackBg =
    chosen === 'correct'
      ? 'bg-green-50 border-success'
      : chosen === 'wrong'
      ? 'bg-red-50 border-danger'
      : chosen === 'fuzzy'
      ? 'bg-orange-50 border-warning'
      : 'bg-white border-transparent'

  return (
    <div className={`relative rounded-xl shadow-card border-2 transition-all duration-200 overflow-hidden ${feedbackBg}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        {showProgress && (
          <span className="text-xs text-text-tertiary">{showProgress}</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Speak button */}
          <button
            onClick={handleSpeak}
            className="p-1.5 rounded-full text-text-tertiary active:text-accent active:scale-95 transition-all"
            aria-label="朗读"
            title={canUseSpeech() ? '朗读' : '当前浏览器不支持朗读'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0l-2.53-2.53M12 17.747l2.53-2.53M6.343 9.343a8 8 0 000 5.314m10-5.314a8 8 0 010 5.314" />
            </svg>
          </button>
          {/* Favorite */}
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              className="p-1.5 rounded-full active:scale-95 transition-all"
              aria-label="收藏"
            >
              <svg
                className={`w-5 h-5 ${isFavorite ? 'text-yellow-400' : 'text-text-tertiary'}`}
                fill={isFavorite ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Word */}
      <div className="px-6 pt-4 pb-2 text-center">
        <h2 className="text-4xl font-bold text-text-primary tracking-tight">{word.word}</h2>
        <p className="text-sm text-text-tertiary mt-1">{word.pos}</p>
      </div>

      {/* Reveal area */}
      {!revealed ? (
        <button
          onClick={handleReveal}
          className="w-full py-10 flex flex-col items-center gap-2 text-text-tertiary active:text-accent transition-colors"
        >
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm">点击查看释义</span>
        </button>
      ) : (
        <div className="px-6 pb-4 animate-fade-in">
          <p className="text-xl text-text-primary font-semibold text-center mb-1">{word.meaning}</p>
          <p className="text-sm text-text-secondary text-center mb-4">{word.definition}</p>
          {word.examples[0] && (
            <div className="bg-bg-primary rounded-md p-3 mb-4">
              <p className="text-sm text-text-primary italic">{word.examples[0].en}</p>
              <p className="text-xs text-text-secondary mt-1">{word.examples[0].zh}</p>
            </div>
          )}
          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleResult('wrong')}
              className="flex flex-col items-center gap-1 py-3 rounded-md bg-red-50 text-danger font-medium text-sm active:scale-95 transition-all"
            >
              <span className="text-lg">✗</span>
              <span className="text-xs">不认识</span>
            </button>
            <button
              onClick={() => handleResult('fuzzy')}
              className="flex flex-col items-center gap-1 py-3 rounded-md bg-orange-50 text-warning font-medium text-sm active:scale-95 transition-all"
            >
              <span className="text-lg">~</span>
              <span className="text-xs">模糊</span>
            </button>
            <button
              onClick={() => handleResult('correct')}
              className="flex flex-col items-center gap-1 py-3 rounded-md bg-green-50 text-success font-medium text-sm active:scale-95 transition-all"
            >
              <span className="text-lg">✓</span>
              <span className="text-xs">认识</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
