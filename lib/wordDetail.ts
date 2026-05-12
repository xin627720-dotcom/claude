import type { VocabWord } from './types'

const CACHE_KEY = 'wordEnrichCache_v1'

export function hasEnhancedData(word: VocabWord): boolean {
  return !!(
    (word.gaokaoExamples && word.gaokaoExamples.length > 0) ||
    (word.wordFamily && word.wordFamily.length > 0) ||
    (word.collocationItems && word.collocationItems.length > 0) ||
    word.memoryTip
  )
}

export function getEnrichCache(wordText: string): Partial<VocabWord> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as Record<string, Partial<VocabWord>>)[wordText.toLowerCase()] ?? null
  } catch { return null }
}

export function setEnrichCache(wordText: string, data: Partial<VocabWord>): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const cache: Record<string, Partial<VocabWord>> = raw ? JSON.parse(raw) : {}
    cache[wordText.toLowerCase()] = data
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}
