'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { allWords, getWordById } from '@/lib/vocab'
import {
  getWordProgress,
  saveWordProgress,
  getQuizProgress,
  saveQuizProgress,
  saveWrongWord,
  getWrongWords,
} from '@/lib/localStore'
import { trySyncInBackground } from '@/lib/sync'
import { buildReviewQueue, getNextReviewDate } from '@/lib/review'
import { canUseSpeech, speakWordDirect } from '@/lib/speech'
import { markTaskComplete, getDailyTaskSequence, getCompletedTasks, TASK_META, type MimoTask } from '@/lib/mimoTaskRunner'
import {
  getLearningSession,
  saveLearningSession,
  clearLearningSession,
  updateSessionProgress,
} from '@/lib/mimoLearningSession'
import { getLocalDateString } from '@/lib/date'
import type { VocabWord } from '@/lib/types'

function getWordExample(word: VocabWord): { en: string; zh: string } | null {
  if (word.gaokaoExamples?.length) {
    return { en: word.gaokaoExamples[0].en, zh: word.gaokaoExamples[0].zh }
  }
  if (word.examples?.length) {
    return word.examples[0]
  }
  return null
}

function SentenceHighlight({ sentence, word }: { sentence: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = sentence.split(new RegExp(`(${escaped})`, 'i'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase()
          ? <strong key={i} className="text-accent">{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildOptions(correct: VocabWord, all: VocabWord[]): VocabWord[] {
  const others = all.filter((w) => w.id !== correct.id)
  const picks = shuffle(others).slice(0, 3)
  return shuffle([correct, ...picks])
}

/**
 * Build options for mimo-confusing mode.
 * Prioritizes actual confusingWords entries from the vocab data as distractors.
 * Falls back to random options if not enough confusing words found.
 */
function buildConfusingOptions(correct: VocabWord, all: VocabWord[]): VocabWord[] {
  const confusingWordStrings = (correct.confusingWords ?? []).map(cw => cw.word.toLowerCase())

  // Find actual VocabWord objects for confusingWords entries
  const confusingVocabWords = all.filter(
    w => w.id !== correct.id && confusingWordStrings.includes(w.word.toLowerCase())
  )

  // Also find near-meaning words (words that share similar meanings or are in same word family)
  const distractors: VocabWord[] = [...confusingVocabWords]

  // If we don't have 3 distactors yet, supplement with random words
  if (distractors.length < 3) {
    const usedIds = new Set([correct.id, ...distractors.map(w => w.id)])
    const extras = shuffle(all.filter(w => !usedIds.has(w.id))).slice(0, 3 - distractors.length)
    distractors.push(...extras)
  }

  return shuffle([correct, ...distractors.slice(0, 3)])
}

const QUIZ_MODE_TO_TASK: Record<string, MimoTask> = {
  'mimo-sentence': 'sentence',
  'mimo-confusing': 'confusing',
}

export default function QuizPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [options, setOptions] = useState<VocabWord[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [correct, setCorrect] = useState<VocabWord | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [wrongCount, setWrongCount] = useState(0)
  const [currentExample, setCurrentExample] = useState<{ en: string; zh: string } | null>(null)
  const urlModeRef = useRef<string>('')

  const setupQuestion = useCallback((q: string[], i: number) => {
    const wordId = q[i]
    const word = getWordById(wordId)
    if (!word) return
    setCorrect(word)
    const urlMode = urlModeRef.current
    if (urlMode === 'mimo-confusing') {
      setOptions(buildConfusingOptions(word, allWords))
    } else {
      setOptions(buildOptions(word, allWords))
    }
    setChosen(null)
    setCurrentExample(urlMode === 'mimo-sentence' ? getWordExample(word) : null)
  }, [])

  useEffect(() => {
    const urlMode = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('mode') ?? ''
      : ''
    urlModeRef.current = urlMode

    const today = getLocalDateString()

    // mimo-sentence and mimo-confusing: support resume via mimoLearningSession_v1
    if (urlMode === 'mimo-sentence' || urlMode === 'mimo-confusing') {
      // Determine the canonical word IDs for this mode from today's plan
      let planWordIds: string[] = []
      try {
        const raw = localStorage.getItem('mimoDailyPlan_v1')
        if (raw) {
          const plan = JSON.parse(raw)
          if (plan.date === today) {
            if (urlMode === 'mimo-sentence') {
              // ONLY use sentenceMeaningWordIds — no mixing with confusing/wrong
              planWordIds = plan.sentenceMeaningWordIds ?? []
            } else {
              // mimo-confusing: ONLY use confusingWordIds
              planWordIds = plan.confusingWordIds ?? []
            }
          }
        }
      } catch {}

      if (planWordIds.length === 0) {
        setDone(true)
        setReady(true)
        return
      }

      // Check existing session — only resume if wordIds match the current plan
      const existing = getLearningSession(urlMode)
      const sessionIsValid =
        existing !== null &&
        existing.wordIds.length === planWordIds.length &&
        existing.wordIds.every((id, idx) => id === planWordIds[idx]) &&
        existing.currentIndex < existing.wordIds.length

      if (sessionIsValid && existing) {
        const q = existing.wordIds
        const resumeIndex = existing.currentIndex
        setQueue(q)
        setIndex(resumeIndex)
        saveQuizProgress({
          currentQuizQueue: q,
          currentQuizIndex: resumeIndex,
          answeredWordIds: existing.completedWordIds,
          wrongWordIds: [],
          updatedAt: new Date().toISOString(),
        })
        setupQuestion(q, resumeIndex)
        setReady(true)
        return
      }

      // No valid session — create new session from plan word IDs (no slice!)
      const q = planWordIds
      const now = new Date().toISOString()
      saveLearningSession({
        date: today,
        mode: urlMode,
        wordIds: q,
        currentIndex: 0,
        completedWordIds: [],
        updatedAt: now,
      })
      setQueue(q)
      setIndex(0)
      saveQuizProgress({ currentQuizQueue: q, currentQuizIndex: 0, answeredWordIds: [], wrongWordIds: [], updatedAt: now })
      setupQuestion(q, 0)
      setReady(true)
      return
    }

    // Normal quiz mode — resume or start fresh
    const saved = getQuizProgress()
    const progressMap = Object.fromEntries(
      allWords.map((w) => [w.id, getWordProgress(w.id)])
    )
    const fullQueue = buildReviewQueue(allWords.map((w) => w.id), progressMap)

    if (
      saved.currentQuizQueue.length > 0 &&
      saved.currentQuizIndex < saved.currentQuizQueue.length
    ) {
      setQueue(saved.currentQuizQueue)
      setIndex(saved.currentQuizIndex)
      setupQuestion(saved.currentQuizQueue, saved.currentQuizIndex)
    } else {
      const q = fullQueue.slice(0, 20)
      setQueue(q)
      setIndex(0)
      saveQuizProgress({
        currentQuizQueue: q,
        currentQuizIndex: 0,
        answeredWordIds: [],
        wrongWordIds: [],
        updatedAt: new Date().toISOString(),
      })
      if (q.length > 0) setupQuestion(q, 0)
      else setDone(true)
    }
    setReady(true)
  }, [setupQuestion])

  const handleChoice = useCallback(
    (word: VocabWord) => {
      if (chosen || !correct) return
      setChosen(word.id)

      const isRight = word.id === correct.id
      const now = new Date().toISOString()

      if (isRight) {
        setScore((s) => s + 1)
        const p = getWordProgress(correct.id)
        saveWordProgress({
          ...p,
          quizCorrectCount: p.quizCorrectCount + 1,
          lastQuizAt: now,
          updatedAt: now,
        })
      } else {
        setWrongCount((w) => w + 1)
        const p = getWordProgress(correct.id)
        saveWordProgress({
          ...p,
          quizWrongCount: p.quizWrongCount + 1,
          isWrongWord: true,
          lastQuizAt: now,
          updatedAt: now,
        })
        const ww = getWrongWords()[correct.id]
        saveWrongWord({
          wordId: correct.id,
          wrongCount: (ww?.wrongCount ?? 0) + 1,
          lastWrongAt: now,
          nextReviewAt: getNextReviewDate('learning'),
          updatedAt: now,
        })
      }

      // Save progress
      const nextIndex = index + 1
      saveQuizProgress({
        currentQuizQueue: queue,
        currentQuizIndex: nextIndex,
        answeredWordIds: [...(getQuizProgress().answeredWordIds), correct.id],
        wrongWordIds: isRight ? getQuizProgress().wrongWordIds : [...(getQuizProgress().wrongWordIds), correct.id],
        updatedAt: now,
      })

      // Update mimo session progress for resumable modes
      const urlMode = urlModeRef.current
      if (urlMode === 'mimo-sentence' || urlMode === 'mimo-confusing') {
        updateSessionProgress(urlMode, nextIndex, correct.id)
      }

      setTimeout(() => {
        if (nextIndex >= queue.length) {
          setDone(true)
          // Reset quiz queue so next session starts fresh
          saveQuizProgress({
            currentQuizQueue: [],
            currentQuizIndex: 0,
            answeredWordIds: [],
            wrongWordIds: [],
            updatedAt: now,
          })
          trySyncInBackground()
          return
        }
        setIndex(nextIndex)
        setupQuestion(queue, nextIndex)
      }, 800)
    },
    [chosen, correct, index, queue, setupQuestion]
  )

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-text-secondary">加载中…</p>
      </div>
    )
  }

  if (done) {
    const total = queue.length
    const pct = total > 0 ? Math.round((score / total) * 100) : 0
    const isMimoMode = urlModeRef.current.startsWith('mimo-')
    const currentTask = QUIZ_MODE_TO_TASK[urlModeRef.current] ?? null

    // Compute next unfinished task
    let nextTaskUrl: string | null = null
    if (isMimoMode && currentTask) {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('mimoDailyPlan_v1') : null
        if (raw) {
          const plan = JSON.parse(raw) as {
            date: string
            reviewWordIds: string[]
            wrongWordIds: string[]
            fuzzyWordIds: string[]
            newWordIds: string[]
            sentenceMeaningWordIds: string[]
            confusingWordIds: string[]
          }
          const today = getLocalDateString()
          if (plan.date === today) {
            const seq = getDailyTaskSequence(plan)
            const completed = getCompletedTasks()
            const next = seq.find(t => !completed.includes(t) && t !== currentTask) ?? null
            if (next) {
              const meta = TASK_META[next]
              nextTaskUrl = `/${meta.page}?mode=${meta.mode}`
            }
          }
        }
      } catch {}
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center animate-fade-up">
        <div className="text-6xl mb-4">{pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '💪'}</div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">测验完成！</h2>
        <p className="text-text-secondary mb-1">
          答对 <strong className="text-success">{score}</strong> / {total} 题
        </p>
        <p className="text-text-secondary mb-6">
          错误 <strong className="text-danger">{wrongCount}</strong> 题（已加入错词本）
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isMimoMode ? (
            <>
              <button
                onClick={() => {
                  const mode = urlModeRef.current
                  if (mode === 'mimo-sentence' || mode === 'mimo-confusing') {
                    clearLearningSession(mode)
                  }
                  if (currentTask) markTaskComplete(currentTask)
                  if (nextTaskUrl) {
                    window.location.href = nextTaskUrl
                  } else {
                    router.push('/daily-plan')
                  }
                }}
                className="bg-accent text-white rounded-xl py-3 font-semibold active:scale-[0.97] transition-all"
              >
                {nextTaskUrl ? '继续下一个任务' : '完成今日计划'}
              </button>
              {nextTaskUrl && (
                <button
                  onClick={() => {
                    const mode = urlModeRef.current
                    if (mode === 'mimo-sentence' || mode === 'mimo-confusing') {
                      clearLearningSession(mode)
                    }
                    if (currentTask) markTaskComplete(currentTask)
                    router.push('/daily-plan')
                  }}
                  className="bg-white text-text-primary rounded-xl py-3 font-semibold shadow-card active:scale-[0.97] transition-all"
                >
                  返回今日计划
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => {
                setDone(false)
                setScore(0)
                setWrongCount(0)
                const pm = Object.fromEntries(allWords.map((w) => [w.id, getWordProgress(w.id)]))
                const q = buildReviewQueue(allWords.map((w) => w.id), pm).slice(0, 20)
                setQueue(q)
                setIndex(0)
                saveQuizProgress({ currentQuizQueue: q, currentQuizIndex: 0, answeredWordIds: [], wrongWordIds: [], updatedAt: new Date().toISOString() })
                if (q.length > 0) setupQuestion(q, 0)
                else setDone(true)
              }}
              className="bg-accent text-white rounded-xl py-3 font-semibold active:scale-[0.97] transition-all"
            >
              再来一轮
            </button>
          )}
          <button onClick={() => router.push('/')} className="bg-white text-text-primary rounded-xl py-3 font-semibold shadow-card active:scale-[0.97] transition-all">
            返回首页
          </button>
        </div>
      </div>
    )
  }

  if (!correct) return null

  return (
    <div className="px-4 pt-12 animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-text-secondary active:text-accent">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-text-primary">
          {urlModeRef.current === 'mimo-sentence' ? '阅读句中识义' :
           urlModeRef.current === 'mimo-confusing' ? '易混词辨析' : '选择测验'}
        </h1>
        <span className="text-sm text-text-secondary">{index + 1}/{queue.length}</span>
      </div>

      {/* Progress */}
      <div className="w-full bg-bg-tertiary rounded-full h-1.5 mb-6">
        <div
          className="bg-accent h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${((index + 1) / queue.length) * 100}%` }}
        />
      </div>

      {/* Score */}
      <div className="flex gap-3 mb-5">
        <span className="text-xs text-success font-medium">✓ {score} 答对</span>
        <span className="text-xs text-danger font-medium">✗ {wrongCount} 答错</span>
      </div>

      {/* Question */}
      <div className="bg-white rounded-xl shadow-card p-6 mb-5">
        <p className="text-xs text-text-tertiary mb-2">
          {urlModeRef.current === 'mimo-sentence'
            ? '阅读句子，判断加粗词的含义：'
            : urlModeRef.current === 'mimo-confusing'
            ? '选出正确的中文意思（注意区分易混词）：'
            : '这个单词的中文意思是？'}
        </p>
        {urlModeRef.current === 'mimo-sentence' && currentExample && (
          <p className="text-sm text-text-secondary leading-relaxed italic mb-3 border-l-2 border-accent/40 pl-3">
            <SentenceHighlight sentence={currentExample.en} word={correct.word} />
          </p>
        )}
        <div className="flex items-center gap-3">
          <p className="text-3xl font-bold text-text-primary">{correct.word}</p>
          {canUseSpeech() && (
            <button
              onClick={() => speakWordDirect(correct.word, {})}
              className="text-text-tertiary active:text-accent transition-colors p-1"
              aria-label="朗读"
            >
              🔊
            </button>
          )}
        </div>
        <p className="text-sm text-text-tertiary mt-1">{correct.pos}</p>
        {urlModeRef.current === 'mimo-confusing' && (correct.confusingWords?.length ?? 0) > 0 && (
          <p className="text-xs text-warning mt-2">
            ⚠ 注意与 {correct.confusingWords!.map(cw => cw.word).join('、')} 区分
          </p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        {options.map((opt) => {
          let style = 'bg-white text-text-primary shadow-sm'
          if (chosen) {
            if (opt.id === correct.id) {
              style = 'bg-green-50 border-2 border-success text-success'
            } else if (opt.id === chosen) {
              style = 'bg-red-50 border-2 border-danger text-danger'
            } else {
              style = 'bg-white text-text-tertiary opacity-60'
            }
          }
          return (
            <button
              key={opt.id}
              onClick={() => handleChoice(opt)}
              disabled={!!chosen}
              className={`w-full rounded-xl px-5 py-4 text-left font-medium text-sm transition-all active:scale-[0.98] ${style}`}
            >
              {opt.meaning}
            </button>
          )
        })}
      </div>
    </div>
  )
}
