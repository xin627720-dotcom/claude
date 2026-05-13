'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  computeLocalAnalysis,
  buildAiRequest,
  loadCachedAiAnalysis,
  saveCachedAiAnalysis,
  isCacheStale,
  clearAiAnalysisCache,
  generateLocalFallback,
} from '@/lib/aiAnalysis'
import type { LocalAnalysisResult, AiAnalysisResult } from '@/lib/aiTypes'
import AiAnalysisCard from '@/components/AiAnalysisCard'
import WeakWordsList from '@/components/WeakWordsList'
import MemoryCurvePanel from '@/components/MemoryCurvePanel'

type Tab = 'overview' | 'weak' | 'curve'

export default function AiAnalysisPage() {
  const [localData, setLocalData] = useState<LocalAnalysisResult | null>(null)
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [usingFallback, setUsingFallback] = useState(false)

  // Load local analysis and check AI availability
  useEffect(() => {
    const analysis = computeLocalAnalysis()
    setLocalData(analysis)

    // Check if AI is available by probing (cached)
    const cached = loadCachedAiAnalysis()
    if (cached) {
      setAiResult(cached.result)
      setCachedAt(cached.cachedAt)
      setAiEnabled(true)
    }

    // Auto-analyze if cache is stale or missing
    const shouldAutoAnalyze = !cached || isCacheStale(cached.cachedAt)
    if (shouldAutoAnalyze) {
      triggerAiAnalysis(analysis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerAiAnalysis = useCallback(async (analysis?: LocalAnalysisResult) => {
    const data = analysis ?? localData
    if (!data) return
    setLoading(true)
    setError(null)
    setUsingFallback(false)

    try {
      const requestBody = buildAiRequest(data)
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (res.status === 503) {
        // AI not configured — use local fallback
        setAiEnabled(false)
        const fallback = generateLocalFallback(data)
        setAiResult(fallback)
        setCachedAt(new Date().toISOString())
        setUsingFallback(true)
        setLoading(false)
        return
      }

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const result = await res.json() as AiAnalysisResult
      saveCachedAiAnalysis(result)
      setAiResult(result)
      setCachedAt(new Date().toISOString())
      setAiEnabled(true)
      setUsingFallback(false)
    } catch (e) {
      // On any failure, show local fallback instead of empty screen
      const fallback = generateLocalFallback(data)
      setAiResult(fallback)
      setCachedAt(new Date().toISOString())
      setUsingFallback(true)
      setError(e instanceof Error ? e.message : 'AI 分析失败，显示本地诊断')
    } finally {
      setLoading(false)
    }
  }, [localData])

  const handleReanalyze = () => {
    clearAiAnalysisCache()
    setAiResult(null)
    setCachedAt(null)
    setError(null)
    setUsingFallback(false)
    const fresh = computeLocalAnalysis()
    setLocalData(fresh)
    triggerAiAnalysis(fresh)
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'AI 总评' },
    { id: 'weak', label: '薄弱词汇' },
    { id: 'curve', label: '记忆曲线' },
  ]

  return (
    <div className="px-4 pt-12 pb-nav animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">AI 学习诊断</h1>
          <p className="text-xs text-text-secondary mt-0.5">基于真实学习数据的具体建议</p>
        </div>
        <button
          onClick={handleReanalyze}
          disabled={loading}
          className="text-xs bg-accent/10 text-accent px-3 py-1.5 rounded-full font-medium active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? '分析中…' : '重新分析'}
        </button>
      </div>

      {/* AI status notice */}
      {aiEnabled === false && (
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 mb-4 text-sm text-yellow-800">
          AI 诊断未开启，显示基于本地数据的诊断建议。
        </div>
      )}

      {/* Fallback notice */}
      {usingFallback && aiEnabled !== false && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-sm text-blue-700">
          AI 暂时不可用，已切换为本地数据诊断（基于真实学习数据生成）。
        </div>
      )}

      {/* Error (non-blocking since we show fallback) */}
      {error && !usingFallback && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !aiResult && (
        <div className="bg-white rounded-xl shadow-card p-6 text-center mb-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-text-secondary">正在分析学习数据…</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-white rounded-xl shadow-card p-1 mb-4 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-secondary active:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {localData && (
        <>
          {tab === 'overview' && (
            <>
              {aiResult && cachedAt ? (
                <AiAnalysisCard result={aiResult} cachedAt={cachedAt} localData={localData} />
              ) : (
                /* No AI result yet — show local data stats while loading */
                <div className="space-y-3">
                  <div className="bg-white rounded-xl shadow-card p-4">
                    <h2 className="font-semibold text-text-primary text-sm mb-3">当前学习数据</h2>
                    {localData.seenWords === 0 ? (
                      <p className="text-sm text-text-secondary text-center py-4">
                        暂无足够学习数据，完成一次学习或测验后会生成更具体的诊断。
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: '已接触', value: localData.seenWords, color: 'text-accent' },
                          { label: '已掌握', value: localData.masteredWords, color: 'text-success' },
                          { label: '认识', value: localData.knownWords, color: 'text-blue-500' },
                          { label: '模糊', value: localData.fuzzyWords, color: 'text-warning' },
                          { label: '错词', value: localData.wrongWords, color: 'text-danger' },
                          { label: '未学', value: localData.unseenWords, color: 'text-text-tertiary' },
                        ].map((item) => (
                          <div key={item.label} className="text-center py-2 bg-gray-50 rounded-lg">
                            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                            <p className="text-[10px] text-text-tertiary mt-0.5">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'weak' && (
            <WeakWordsList weakWords={localData.weakWords} />
          )}

          {tab === 'curve' && (
            <MemoryCurvePanel
              memoryCurve={localData.memoryCurve}
              totalWords={localData.totalWords}
              overdueCount={localData.overdueCount}
              quizAccuracy={localData.quizAccuracy}
              streakDays={localData.streakDays}
            />
          )}
        </>
      )}

      {!localData && (
        <div className="text-center py-12 text-text-tertiary text-sm">加载中…</div>
      )}
    </div>
  )
}
