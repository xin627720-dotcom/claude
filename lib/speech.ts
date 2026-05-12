'use client'

const SPEAK_SETTING_KEY = 'auto_speak_enabled'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function stopSpeaking(): void {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
}

export function speakText(text: string, rate = 0.85): void {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = rate
  window.speechSynthesis.speak(u)
}

/**
 * Speak with lifecycle callbacks. Returns a cleanup fn to cancel the silence timer.
 * onBlocked fires when speech is not-allowed OR when no onstart fires within 600ms
 * (handles iOS Safari which sometimes silently swallows blocked speech).
 */
export function speakTextTracked(
  text: string,
  opts: {
    rate?: number
    onStart?: () => void
    onEnd?: () => void
    onBlocked?: () => void
  }
): () => void {
  if (!canSpeak()) {
    opts.onBlocked?.()
    return () => {}
  }

  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = opts.rate ?? 0.85

  let started = false

  // Fallback: if no onstart within 600ms, treat as blocked (covers iOS Safari)
  const silenceTimer = window.setTimeout(() => {
    if (!started) opts.onBlocked?.()
  }, 600)

  u.onstart = () => {
    started = true
    clearTimeout(silenceTimer)
    opts.onStart?.()
  }

  u.onend = () => {
    clearTimeout(silenceTimer)
    opts.onEnd?.()
  }

  u.onerror = (e: SpeechSynthesisErrorEvent) => {
    clearTimeout(silenceTimer)
    // 'interrupted' means we cancelled it ourselves — not an error
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      opts.onBlocked?.()
    }
    opts.onEnd?.()
  }

  window.speechSynthesis.speak(u)

  return () => clearTimeout(silenceTimer)
}

export function getAutoSpeakEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const val = localStorage.getItem(SPEAK_SETTING_KEY)
  return val === null ? true : val === 'true'
}

export function setAutoSpeakEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SPEAK_SETTING_KEY, String(enabled))
}
