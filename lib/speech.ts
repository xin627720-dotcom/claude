// SSR-safe speech synthesis utilities
// No 'use client' — each function guards with typeof window checks

const AUTOSPEAK_KEY = 'autoSpeakEnabled'
const SPEECH_UNLOCKED_KEY = 'speechUnlocked'

export function canUseSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Speak a word. Returns true if the call was dispatched to the speech engine.
 * Must be called inside a user-gesture handler on first use (browser autoplay policy).
 */
export function speakWord(word: string): boolean {
  if (typeof window === 'undefined') return false
  if (!('speechSynthesis' in window)) return false
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    u.rate = 0.85
    u.pitch = 1
    u.volume = 1
    window.speechSynthesis.speak(u)
    return true
  } catch (err) {
    console.warn('[speech] speakWord failed:', err)
    return false
  }
}

export function stopSpeech(): void {
  if (!canUseSpeech()) return
  try { window.speechSynthesis.cancel() } catch {}
}

// ── Auto-speak setting (localStorage — survives app restarts) ─────────────────

export function getAutoSpeakEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const val = localStorage.getItem(AUTOSPEAK_KEY)
  return val === null ? true : val === 'true'
}

export function setAutoSpeakEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTOSPEAK_KEY, String(enabled))
}

// ── Speech unlock (sessionStorage — resets on tab/app close) ─────────────────
// The browser's autoplay gate is per browsing-context session. Storing in
// sessionStorage means: once unlocked in this tab, stays unlocked for navigation
// within the same tab without requiring another click.

export function getSpeechUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SPEECH_UNLOCKED_KEY) === 'true'
}

export function persistSpeechUnlocked(): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SPEECH_UNLOCKED_KEY, 'true')
}
