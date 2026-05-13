'use client'

import type { AiAnalysisResult, LocalAnalysisResult } from '@/lib/aiTypes'
import { allWords } from '@/lib/vocab'
import type { VocabWord } from '@/lib/types'

// Build a case-insensitive lookup by word string at module load time (static data)
const vocabByName = new Map<string, VocabWord>(
  allWords.map((w) => [w.word.toLowerCase(), w])
)

function getVocabByName(word: string): VocabWord | undefined {
  return vocabByName.get(word.toLowerCase())
}

function getBestExample(v: VocabWord): string | null {
  const gk = v.gaokaoExamples?.[0]?.en
  if (gk) return gk
  return v.examples[0]?.en ?? null
}

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
  localData?: LocalAnalysisResult | null
}

export default function AiAnalysisCard({ result, cachedAt, localData }: Props) {
  const levelClass = levelColors[result.overallLevel] ?? 'bg-gray-100 text-gray-600'
  const time = new Date(cachedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  // Use localData for accurate display stats if available
  const touchedWords = localData?.seenWords ?? 0
  const masteredWords = localData?.masteredWords ?? 0
  const knownWords = localData?.knownWords ?? 0
  const fuzzyWords = localData?.fuzzyWords ?? 0
  const wrongWords = localData?.wrongWords ?? 0
  const quizAccuracy = localData?.quizAccuracy ?? null
  const todayCompletionRate = localData?.todayCompletionRate ?? null

  return (
    <div className="space-y-3">
      {/* Today's conclusion — hero card */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-text-primary text-sm">今日结论</h2>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${levelClass}`}>
              {result.overallLevel}
            </span>
            <span className="text-[10px] text-text-tertiary">{time} 更新</span>
          </div>
        </div>
        <p className="text-sm font-medium text-text-primary leading-relaxed">
          {result.todayConclusion || result.summary}
        </p>
        {result.mainProblem && result.mainProblem !== result.todayConclusion && (
          <p className="mt-2 text-xs text-text-secondary border-t pt-2 leading-relaxed">
            {result.mainProblem}
          </p>
        )}
      </div>

      {/* Current data — real stats */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <h2 className="font-semibold text-text-primary text-sm mb-3">当前数据</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '已接触', value: touchedWords, color: 'text-accent' },
            { label: '已掌握', value: masteredWords, color: 'text-success' },
            { label: '认识', value: knownWords, color: 'text-blue-500' },
            { label: '模糊', value: fuzzyWords, color: 'text-warning' },
            { label: '错词', value: wrongWords, color: 'text-danger' },
            {
              label: '测验正确率',
              value: quizAccuracy !== null ? `${quizAccuracy}%` : '暂无',
              color: quizAccuracy !== null && quizAccuracy >= 70 ? 'text-success' : 'text-warning',
            },
          ].map((item) => (
            <div key={item.label} className="text-center py-2 bg-gray-50 rounded-lg">
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-text-tertiary mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
        {todayCompletionRate !== null && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-text-tertiary">今日完成率</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${todayCompletionRate}%` }}
              />
            </div>
            <span className="text-xs font-medium text-accent">{todayCompletionRate}%</span>
          </div>
        )}
      </div>

      {/* Top 5 review words — real words with reasons */}
      {result.topReviewWords?.length > 0 && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-3">最需要复习的词</h2>
          <div className="space-y-2.5">
            {result.topReviewWords.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-danger text-white' :
                  i === 1 ? 'bg-orange-400 text-white' :
                  i === 2 ? 'bg-yellow-400 text-white' :
                  'bg-gray-100 text-text-tertiary'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-text-primary">{item.word}</span>
                    <span className="text-[10px] bg-gray-100 text-text-tertiary px-1.5 py-0.5 rounded-full">
                      {item.status}
                    </span>
                    {item.wrongCount > 0 && (
                      <span className="text-[10px] text-danger">✗{item.wrongCount}</span>
                    )}
                    {item.fuzzyCount > 0 && (
                      <span className="text-[10px] text-warning">~{item.fuzzyCount}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5 truncate">{item.meaning}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confusing words — rich display with vocab lookup */}
      {(() => {
        // Filter pairs to only those where BOTH words exist in local vocab
        const richPairs = (result.confusingWordsList ?? [])
          .map((item) => ({
            item,
            vocabA: getVocabByName(item.word),
            vocabB: getVocabByName(item.confusingWith),
          }))
          .filter((p) => p.vocabA && p.vocabB)

        if (richPairs.length === 0) {
          return (
            <div className="bg-white rounded-xl shadow-card p-4">
              <h2 className="font-semibold text-text-primary text-sm mb-2">最容易混淆的词</h2>
              <p className="text-xs text-text-tertiary">暂无足够易混词数据，继续测验后生成。</p>
            </div>
          )
        }

        return (
          <div className="bg-white rounded-xl shadow-card p-4">
            <h2 className="font-semibold text-text-primary text-sm mb-3">最容易混淆的词</h2>
            <div className="space-y-4">
              {richPairs.map(({ item, vocabA, vocabB }, i) => {
                const exA = getBestExample(vocabA!)
                const exB = getBestExample(vocabB!)
                return (
                  <div key={i} className="border border-orange-100 rounded-xl overflow-hidden">
                    {/* Two word cards side by side */}
                    <div className="flex">
                      {/* Word A */}
                      <div className="flex-1 bg-blue-50 p-3 border-r border-orange-100">
                        <p className="font-semibold text-sm text-blue-800">{vocabA!.word}</p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {vocabA!.pos} {vocabA!.meaning}
                        </p>
                        {exA ? (
                          <p className="text-[10px] text-text-secondary mt-1.5 italic leading-relaxed line-clamp-2">
                            &ldquo;{exA}&rdquo;
                          </p>
                        ) : (
                          <p className="text-[10px] text-text-tertiary mt-1.5 italic">暂无例句</p>
                        )}
                      </div>
                      {/* Word B */}
                      <div className="flex-1 bg-orange-50 p-3">
                        <p className="font-semibold text-sm text-orange-700">{vocabB!.word}</p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {vocabB!.pos} {vocabB!.meaning}
                        </p>
                        {exB ? (
                          <p className="text-[10px] text-text-secondary mt-1.5 italic leading-relaxed line-clamp-2">
                            &ldquo;{exB}&rdquo;
                          </p>
                        ) : (
                          <p className="text-[10px] text-text-tertiary mt-1.5 italic">暂无例句</p>
                        )}
                      </div>
                    </div>
                    {/* One-sentence difference */}
                    <div className="px-3 py-2 bg-white border-t border-orange-100">
                      <p className="text-xs text-text-secondary">
                        <span className="font-medium text-orange-600">区别：</span>
                        {item.reason}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Tomorrow's plan — specific numbers */}
      {result.tomorrowPlan && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-3">明日计划建议</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '新词', value: result.tomorrowPlan.newWords, color: 'text-accent', unit: '个' },
              { label: '复习', value: result.tomorrowPlan.reviewWords, color: 'text-blue-500', unit: '个' },
              { label: '错词重认', value: result.tomorrowPlan.wrongWords, color: 'text-danger', unit: '个' },
              { label: '句中识义', value: result.tomorrowPlan.sentenceMeaningWords, color: 'text-purple-500', unit: '题' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-xs text-text-tertiary">{item.label}</span>
                <span className={`font-bold text-sm ${item.color}`}>
                  {item.value} <span className="text-[10px] font-normal">{item.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily new word adjustment */}
      {result.dailyNewWordAdjustment && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-2">是否调整计划</h2>
          <p className="text-sm text-text-secondary leading-relaxed">{result.dailyNewWordAdjustment}</p>
        </div>
      )}

      {/* Legacy: weak word analysis (if topReviewWords not available) */}
      {(!result.topReviewWords || result.topReviewWords.length === 0) &&
        result.weakWordAnalysis?.length > 0 && (
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

      {/* Legacy: today's plan (if tomorrowPlan not available) */}
      {!result.tomorrowPlan && result.todayPlan?.length > 0 && (
        <div className="bg-white rounded-xl shadow-card p-4">
          <h2 className="font-semibold text-text-primary text-sm mb-2">今日建议</h2>
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

      {/* Short encouragement — always at the bottom */}
      {result.encouragement && (
        <div className="bg-gradient-to-r from-accent/10 to-purple-100 rounded-xl p-3 text-center">
          <p className="text-sm text-accent font-medium">{result.encouragement}</p>
        </div>
      )}
    </div>
  )
}
