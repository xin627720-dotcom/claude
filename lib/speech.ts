// SSR-safe speech synthesis utilities

export interface SpeakCallbacks {
  onStart?: () => void
  onEnd?: () => void
  onError?: (errMsg: string) => void
}

const AUTOSPEAK_KEY = 'autoSpeakEnabled'
const SPEECH_UNLOCKED_KEY = 'speechUnlocked'

export function canUseSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Load voices, waiting for the async voiceschanged event if the list is empty.
 * Chrome / Android fires voiceschanged asynchronously on first call.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([])
      return
    }
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true })
    // Fallback: some browsers never fire voiceschanged
    setTimeout(finish, 3000)
  })
}

/** Return the best available English voice, or null if none loaded yet. */
export function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (!canUseSpeech()) return null
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(v => v.lang === 'en-US') ??
    voices.find(v => v.lang === 'en-GB') ??
    voices.find(v => /^en/i.test(v.lang)) ??
    null
  )
}

/**
 * Speak a word directly.  Must be called inside a user-gesture handler on
 * first use.  Calls resume() before speak() to recover Android Chrome's
 * tendency to pause synthesis after a period of inactivity.
 */
export function speakWordDirect(word: string, callbacks?: SpeakCallbacks): boolean {
  if (typeof window === 'undefined') {
    callbacks?.onError?.('SSR 环境')
    return false
  }
  if (!('speechSynthesis' in window)) {
    callbacks?.onError?.('当前浏览器不支持 speechSynthesis')
    return false
  }
  try {
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    u.rate = 0.85
    u.pitch = 1
    u.volume = 1
    const voice = getEnglishVoice()
    if (voice) u.voice = voice
    if (callbacks?.onStart) u.onstart = () => callbacks.onStart!()
    if (callbacks?.onEnd) u.onend = () => callbacks.onEnd!()
    u.onerror = (e) => {
      const msg = String(e.error ?? '未知错误')
      console.warn('[speech] onerror:', msg, 'word:', word)
      callbacks?.onError?.(msg)
    }
    window.speechSynthesis.speak(u)
    return true
  } catch (err) {
    const msg = String(err)
    console.warn('[speech] speakWordDirect exception:', msg)
    callbacks?.onError?.(msg)
    return false
  }
}

export function stopSpeech(): void {
  if (!canUseSpeech()) return
  try { window.speechSynthesis.cancel() } catch {}
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

export function getSpeechUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SPEECH_UNLOCKED_KEY) === 'true'
}

export function persistSpeechUnlocked(): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SPEECH_UNLOCKED_KEY, 'true')
}
