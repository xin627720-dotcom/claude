'use client'

import type { VocabWord, GaokaoExample } from '@/lib/types'

const freqColors: Record<string, string> = {
  '高频': 'bg-red-100 text-red-600',
  '中频': 'bg-orange-100 text-orange-600',
  '低频': 'bg-blue-100 text-blue-600',
  '超纲拓展': 'bg-purple-100 text-purple-600',
}

function Section({ title, children, bg = 'bg-bg-primary' }: {
  title: string
  children: React.ReactNode
  bg?: string
}) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <p className="text-[11px] font-semibold text-text-secondary mb-2 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-text-tertiary italic">{text}</p>
}

function ExampleItem({ ex }: { ex: GaokaoExample }) {
  return (
    <div className="border-l-2 border-accent/30 pl-3 py-0.5">
      <p className="text-sm text-text-primary italic leading-snug">{ex.en}</p>
      <p className="text-xs text-text-secondary mt-0.5">{ex.zh}</p>
      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-text-tertiary">
        {ex.isRealExam ? ex.source : '高考风格例句（非原题）'}
      </span>
    </div>
  )
}

export default function WordDetail({
  word,
  compact = false,
  enriching = false,
}: {
  word: VocabWord
  compact?: boolean
  enriching?: boolean
}) {
  const examples = Array.isArray(word.examples) ? word.examples : []
  const collocations = Array.isArray(word.collocations) ? word.collocations : []
  const synonyms = Array.isArray(word.synonyms) ? word.synonyms : []
  const antonyms = Array.isArray(word.antonyms) ? word.antonyms : []
  const examTips = Array.isArray(word.examTips) ? word.examTips : []
  const gaokaoExamples = Array.isArray(word.gaokaoExamples) ? word.gaokaoExamples : []
  const wordFamily = Array.isArray(word.wordFamily) ? word.wordFamily : []
  const collocationItems = Array.isArray(word.collocationItems) ? word.collocationItems : []
  const confusingWords = Array.isArray(word.confusingWords) ? word.confusingWords : []
  const commonTraps = Array.isArray(word.commonTraps) ? word.commonTraps : []
  const examScenes = Array.isArray(word.examScenes) ? word.examScenes : []
  const commonMeaningsInExam = Array.isArray(word.commonMeaningsInExam) ? word.commonMeaningsInExam : []
  const trapsAndTips = [...commonTraps, ...examTips]

  const gap = compact ? 'space-y-2' : 'space-y-3'

  return (
    <div className={gap}>
      {/* AI enriching indicator */}
      {enriching && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent/5 rounded-lg border border-accent/10">
          <div className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
          <p className="text-xs text-accent">AI 正在生成高考风格详情，请稍候…</p>
        </div>
      )}

      {/* ── 1. 基础释义 ── */}
      <Section title="基础释义">
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {word.pronunciation && (
            <span className="text-xs text-text-tertiary">{word.pronunciation}</span>
          )}
          {word.frequencyLevel ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${freqColors[word.frequencyLevel]}`}>
              {word.frequencyLevel}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs bg-bg-tertiary text-text-tertiary">
              暂无考频统计
            </span>
          )}
          {word.pos && <span className="text-xs text-text-tertiary">{word.pos}</span>}
        </div>
        <p className="font-semibold text-text-primary">{word.meaning}</p>
        {word.definition && <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{word.definition}</p>}
        {/* Synonyms / antonyms inline if compact */}
        {compact && (synonyms.length > 0 || antonyms.length > 0) && (
          <div className="flex gap-3 mt-2 flex-wrap">
            {synonyms.length > 0 && (
              <div>
                <span className="text-[10px] text-text-tertiary mr-1">近义：</span>
                {synonyms.slice(0, 3).map((s, i) => (
                  <span key={i} className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs mr-1">{s}</span>
                ))}
              </div>
            )}
            {antonyms.length > 0 && (
              <div>
                <span className="text-[10px] text-text-tertiary mr-1">反义：</span>
                {antonyms.slice(0, 3).map((a, i) => (
                  <span key={i} className="inline-block px-1.5 py-0.5 bg-red-50 text-danger rounded text-xs mr-1">{a}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── 2. 高考考点 ── */}
      <Section title="高考考点" bg="bg-amber-50">
        {examScenes.length === 0 && commonMeaningsInExam.length === 0 && trapsAndTips.length === 0 ? (
          <Empty text={enriching ? '正在分析考点…' : '暂无官方考频统计，以下为通用学习建议'} />
        ) : null}
        {examScenes.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] text-text-tertiary mb-1">常见场景</p>
            <div className="flex flex-wrap gap-1">
              {examScenes.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-white rounded-full text-xs text-text-primary border border-amber-200">{s}</span>
              ))}
            </div>
          </div>
        )}
        {commonMeaningsInExam.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] text-text-tertiary mb-1">高考常考含义</p>
            <ul className="space-y-0.5">
              {commonMeaningsInExam.map((m, i) => (
                <li key={i} className="text-xs text-text-primary">• {m}</li>
              ))}
            </ul>
          </div>
        )}
        {trapsAndTips.length > 0 && (
          <div>
            <p className="text-xs text-warning font-medium mb-1">⚠ 易错提示</p>
            <ul className="space-y-0.5">
              {trapsAndTips.map((t, i) => (
                <li key={i} className="text-xs text-text-primary">• {t}</li>
              ))}
            </ul>
          </div>
        )}
        {examScenes.length === 0 && commonMeaningsInExam.length === 0 && trapsAndTips.length === 0 && !enriching && (
          <ul className="space-y-0.5 mt-1">
            <li className="text-xs text-text-secondary">• 注意结合语境理解该词含义，高考中可能出现多种用法</li>
            <li className="text-xs text-text-secondary">• 不要只死记一个中文意思，要通过例句理解实际用法</li>
          </ul>
        )}
      </Section>

      {/* ── 3. 高考风格例句 ── */}
      <Section title="高考风格例句">
        {gaokaoExamples.length > 0 ? (
          <div className="space-y-2">
            {gaokaoExamples.map((ex, i) => <ExampleItem key={i} ex={ex} />)}
          </div>
        ) : examples.length > 0 ? (
          <div className="space-y-2">
            {examples.map((ex, i) => (
              <div key={i} className="border-l-2 border-accent/30 pl-3 py-0.5">
                <p className="text-sm text-text-primary italic leading-snug">{ex.en}</p>
                <p className="text-xs text-text-secondary mt-0.5">{ex.zh}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty text={enriching ? '正在生成高考风格例句…' : '暂无例句，AI 增强后可自动获取'} />
        )}
      </Section>

      {/* ── 4. 同根词 / 词族 ── */}
      <Section title="同根词 / 词族">
        {wordFamily.length > 0 ? (
          <div className="space-y-1.5">
            {wordFamily.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-semibold text-sm text-text-primary min-w-[90px]">{m.word}</span>
                <span className="text-xs text-text-tertiary pt-0.5 min-w-[36px]">{m.pos}</span>
                <span className="text-xs text-text-secondary pt-0.5 flex-1">{m.meaning}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text={enriching ? '正在生成…' : '暂无同根词数据'} />
        )}
      </Section>

      {/* ── 5. 常用搭配 ── */}
      <Section title="常用搭配">
        {collocationItems.length > 0 ? (
          <div className="space-y-1.5">
            {collocationItems.map((c, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-accent">{c.phrase}</span>
                  <span className="text-xs text-text-secondary">{c.meaning}</span>
                </div>
                {c.example && <p className="text-xs text-text-tertiary italic mt-0.5 pl-1">{c.example}</p>}
              </div>
            ))}
          </div>
        ) : collocations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {collocations.map((c, i) => (
              <span key={i} className="px-2.5 py-1 bg-white rounded-full text-xs text-text-primary border border-bg-tertiary">{c}</span>
            ))}
          </div>
        ) : (
          <Empty text={enriching ? '正在生成…' : '暂无常用搭配数据'} />
        )}
      </Section>

      {/* ── 6. 易混词辨析 ── */}
      <Section title="易混词辨析">
        {confusingWords.length > 0 ? (
          <div className="space-y-2">
            {confusingWords.map((cw, i) => (
              <div key={i} className="bg-white rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-text-primary">{cw.word}</span>
                  <span className="text-xs text-text-secondary">{cw.meaning}</span>
                </div>
                <p className="text-xs text-text-tertiary">{cw.difference}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty text={enriching ? '正在生成…' : '暂无易混词数据'} />
        )}
      </Section>

      {/* ── 词根词缀（仅有数据时显示）── */}
      {word.root && (
        <Section title="词根词缀">
          <p className="text-sm text-text-primary">{word.root}</p>
        </Section>
      )}

      {/* ── 近义 / 反义词（仅有数据时显示，且非 compact）── */}
      {!compact && (synonyms.length > 0 || antonyms.length > 0) && (
        <div className="flex gap-2">
          {synonyms.length > 0 && (
            <div className="flex-1 bg-bg-primary rounded-xl p-3">
              <p className="text-[11px] font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">近义词</p>
              <div className="flex flex-wrap gap-1">
                {synonyms.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}
          {antonyms.length > 0 && (
            <div className="flex-1 bg-bg-primary rounded-xl p-3">
              <p className="text-[11px] font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">反义词</p>
              <div className="flex flex-wrap gap-1">
                {antonyms.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-50 text-danger rounded-full text-xs">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 7. 记忆提示 ── */}
      <Section title="记忆提示" bg="bg-green-50">
        {word.memoryTip || word.usageNote ? (
          <>
            {word.memoryTip && (
              <div className={word.usageNote ? 'mb-2' : ''}>
                <p className="text-[10px] font-semibold text-green-700 mb-0.5">记忆技巧</p>
                <p className="text-xs text-text-primary">{word.memoryTip}</p>
              </div>
            )}
            {word.usageNote && (
              <div>
                <p className="text-[10px] font-semibold text-green-700 mb-0.5">用法说明</p>
                <p className="text-xs text-text-primary">{word.usageNote}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-text-primary">
            {enriching ? '正在生成记忆提示…' : '多次朗读并在句子中使用该词，有助于强化记忆。建议结合例句反复练习。'}
          </p>
        )}
      </Section>
    </div>
  )
}
