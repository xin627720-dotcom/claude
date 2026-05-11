'use client'

import type { MemoryCurvePoint } from '@/lib/aiTypes'

interface Props {
  memoryCurve: MemoryCurvePoint[]
  totalWords: number
  overdueCount: number
  quizAccuracy: number | null
  streakDays: number
}

const barColors = [
  'bg-gray-200',
  'bg-blue-400',
  'bg-yellow-400',
  'bg-green-400',
  'bg-accent',
]

export default function MemoryCurvePanel({ memoryCurve, totalWords, overdueCount, quizAccuracy, streakDays }: Props) {
  const maxCount = Math.max(...memoryCurve.map((p) => p.count), 1)

  return (
    <div className="space-y-3">
      {/* Distribution bar */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <h2 className="font-semibold text-text-primary text-sm mb-3">学习进度分布</h2>

        {/* Stacked bar */}
        <div className="flex rounded-full overflow-hidden h-4 mb-3">
          {memoryCurve.map((p, i) => (
            p.count > 0 ? (
              <div
                key={i}
                className={`${barColors[i]} transition-all`}
                style={{ width: `${(p.count / totalWords) * 100}%` }}
                title={`${p.label}: ${p.count}`}
              />
            ) : null
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2">
          {memoryCurve.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${barColors[i]}`} />
              <div>
                <p className="text-[10px] text-text-tertiary">{p.label}</p>
                <p className="text-xs font-semibold text-text-primary">{p.count}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-status bars */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <h2 className="font-semibold text-text-primary text-sm mb-3">各阶段词数</h2>
        <div className="space-y-2.5">
          {memoryCurve.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-text-secondary w-14 flex-shrink-0">{p.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full ${barColors[i]} transition-all duration-700`}
                  style={{ width: `${(p.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-text-primary w-8 text-right">{p.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl shadow-card p-3 text-center">
          <p className="text-xl font-bold text-warning">{overdueCount}</p>
          <p className="text-[10px] text-text-tertiary mt-0.5">逾期待复习</p>
        </div>
        <div className="bg-white rounded-xl shadow-card p-3 text-center">
          <p className="text-xl font-bold text-accent">
            {quizAccuracy !== null ? `${quizAccuracy}%` : '--'}
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">测验正确率</p>
        </div>
        <div className="bg-white rounded-xl shadow-card p-3 text-center">
          <p className="text-xl font-bold text-success">{streakDays}</p>
          <p className="text-[10px] text-text-tertiary mt-0.5">连续学习天</p>
        </div>
      </div>
    </div>
  )
}
