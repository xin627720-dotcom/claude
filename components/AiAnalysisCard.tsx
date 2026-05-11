'use client'

import type { AiAnalysisResult } from '@/lib/aiTypes'

const levelColors: Record<string, string> = {
  '入门': 'bg-gray-100 text-gray-600',
  '基础': 'bg-blue-100 text-blue-700',
  '进阶': 'bg-yellow-100 text-yellow-700',
  '熟练': 'bg-green-100 text-green-700',
  '精通': 'bg-purple-100 text-purple-700',
}

interface Props {
  result: AiAnalysisResult
  cachedAt: string
}

export default function AiAnalysisCard({ result, cachedAt }: Props) {
  const levelClass = levelColors[result.overallLevel] ?? 'bg-gray-100 text-gray-600'
  const time = new Date(cachedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-text-primary text-sm">AI 诊断总评</h2>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${levelClass}`}>
              {result.overallLevel}
            </span>
            <span className="text-[10px] text-text-tertiary">{time} 更新</span>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{result.summary}</p>
        {result.memoryCurveInsight && (
          <p className="mt-2 text-xs text-text-tertiary border-t pt-2">{result.memoryCurveInsight}</p>
        )}
      </div>

      {/* Today's plan */}
      {result.todayPlan?.length > 0 && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-2">今日学习计划</h2>
          <ul className="space-y-1.5">
            {result.todayPlan.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-medium mt-0.5">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weak word analysis */}
      {result.weakWordAnalysis?.length > 0 && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-2">重点攻克词汇</h2>
          <div className="space-y-3">
            {result.weakWordAnalysis.map((item, i) => (
              <div key={i} className="border-l-2 border-danger/40 pl-3">
                <p className="font-medium text-sm text-text-primary">{item.word}</p>
                <p className="text-xs text-text-tertiary mt-0.5">{item.issue}</p>
                <p className="text-xs text-accent mt-1">💡 {item.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Practice suggestions */}
      {result.practiceSuggestions?.length > 0 && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-2">练习建议</h2>
          <ul className="space-y-1.5">
            {result.practiceSuggestions.map((s, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-accent flex-shrink-0">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Encouragement */}
      {result.encouragement && (
        <div className="bg-gradient-to-r from-accent/10 to-purple-100 rounded-xl p-4 text-center">
          <p className="text-sm text-accent font-medium">{result.encouragement}</p>
        </div>
      )}
    </div>
  )
}
