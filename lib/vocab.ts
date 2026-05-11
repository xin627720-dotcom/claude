import basicRaw from '@/data/vocab-basic.json'
import coreRaw from '@/data/vocab-core.json'
import type { VocabWord } from './types'

export const basicWords: VocabWord[] = basicRaw as VocabWord[]
export const coreWords: VocabWord[] = coreRaw as VocabWord[]
export const allWords: VocabWord[] = [...basicWords, ...coreWords]

const wordMap = new Map<string, VocabWord>(allWords.map((w) => [w.id, w]))

export function getWordById(id: string): VocabWord | undefined {
  return wordMap.get(id)
}

export function searchWords(query: string, level?: 'basic' | 'core'): VocabWord[] {
  const q = query.toLowerCase().trim()
  const list = level === 'basic' ? basicWords : level === 'core' ? coreWords : allWords
  if (!q) return list
  return list.filter(
    (w) => w.word.toLowerCase().includes(q) || w.meaning.includes(q)
  )
}
