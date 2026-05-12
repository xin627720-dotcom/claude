// Speech synthesis utility — SSR-safe, no 'use client' needed (guards inside each fn)

const AUTOSPEAK_KEY = 'autoSpeakEnabled'
const SPEECH_UNLOCKED_KEY = 'speechUnlocked'

export function canUseSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function stopSpeech(): void {
  if (!canUseSpeech()) return
  try { window.speechSynthesis.cancel() } catch {}
}

export function speakWord(
  word: string,
  opts?: { onStart?: () => void; onEnd?: () => void }
): void {
  if (!canUseSpeech()) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    u.rate = 0.85
    u.pitch = 1
    u.volume = 1
    u.onstart = opts?.onStart ?? null
    u.onend = opts?.onEnd ?? null
    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      // 'interrupted'/'canceled' means we called cancel() ourselves, not a real error
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.debug('[speech] error:', e.error)
      }
      opts?.onEnd?.()
    }
    window.speechSynthesis.speak(u)
  } catch (e) {
    console.debug('[speech] speakWord threw:', e)
    opts?.onEnd?.()
  }
}

/**
 * Warm up iOS Safari speech synthesis with a zero-volume utterance.
 * Must be called synchronously inside a user-gesture handler.
 */
export function unlockSpeechEngine(): void {
  if (!canUseSpeech()) return
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    u.lang = 'en-US'
    window.speechSynthesis.speak(u)
  } catch {}
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getAutoSpeakEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const val = localStorage.getItem(AUTOSPEAK_KEY)
  return val === null ? true : val === 'true'
}

export function setAutoSpeakEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTOSPEAK_KEY, String(enabled))
}

/**
 * Returns true if the user has already clicked a button this session,
 * meaning the browser's autoplay gate has been cleared.
 */
export function getSpeechUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SPEECH_UNLOCKED_KEY) === 'true'
}

export function persistSpeechUnlocked(): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SPEECH_UNLOCKED_KEY, 'true')
}
