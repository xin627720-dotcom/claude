'use client'

import type { VocabWord, GaokaoExample, WordFamilyMember, CollocationItem, ConfusingWord } from '@/lib/types'

const freqColors: Record<string, string> = {
  '高频': 'bg-red-100 text-red-600',
  '中频': 'bg-orange-100 text-orange-600',
  '低频': 'bg-blue-100 text-blue-600',
  '超纲拓展': 'bg-purple-100 text-purple-600',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">{children}</h3>
}

function ExampleItem({ ex }: { ex: GaokaoExample }) {
  return (
    <div className="border-l-2 border-accent/30 pl-3 py-0.5">
      <p className="text-sm text-text-primary italic">{ex.en}</p>
      <p className="text-xs text-text-secondary mt-0.5">{ex.zh}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {ex.isRealExam ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">{ex.source}</span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-text-tertiary">高考风格例句（非原题）</span>
        )}
      </div>
    </div>
  )
}

export default function WordDetail({ word, compact = false }: { word: VocabWord; compact?: boolean }) {
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

  const gap = compact ? 'space-y-3' : 'space-y-4'

  return (
    <div className={gap}>
      {/* ── 基础释义 ── */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {word.pronunciation && (
            <span className="text-sm text-text-tertiary">{word.pronunciation}</span>
          )}
          {word.frequencyLevel && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${freqColors[word.frequencyLevel] ?? 'bg-bg-tertiary text-text-tertiary'}`}>
              {word.frequencyLevel}
            </span>
          )}
          {word.pos && (
            <span className="text-xs text-text-tertiary">{word.pos}</span>
          )}
        </div>
        <p className="font-semibold text-text-primary">{word.meaning}</p>
        {word.definition && <p className="text-sm text-text-secondary mt-0.5">{word.definition}</p>}
      </div>

      {/* ── 高考考点 ── */}
      {(examScenes.length > 0 || commonMeaningsInExam.length > 0 || commonTraps.length > 0 || examTips.length > 0 || (word.appearedYears && word.appearedYears.length > 0)) && (
        <div className="bg-amber-50 rounded-xl p-3">
          <SectionTitle>高考考点</SectionTitle>
          {word.appearedYears && word.appearedYears.length > 0 && (
            <p className="text-xs text-text-secondary mb-1.5">
              出现年份：{word.appearedYears.join('、')}
            </p>
          )}
          {examScenes.length > 0 && (
            <div className="mb-1.5">
              <p className="text-xs text-text-tertiary mb-1">常见场景</p>
              <div className="flex flex-wrap gap-1">
                {examScenes.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white rounded-full text-xs text-text-primary border border-amber-200">{s}</span>
                ))}
              </div>
            </div>
          )}
          {commonMeaningsInExam.length > 0 && (
            <div className="mb-1.5">
              <p className="text-xs text-text-tertiary mb-1">高考常考含义</p>
              <ul className="space-y-0.5">
                {commonMeaningsInExam.map((m, i) => (
                  <li key={i} className="text-xs text-text-primary">• {m}</li>
                ))}
              </ul>
            </div>
          )}
          {(commonTraps.length > 0 || examTips.length > 0) && (
            <div>
              <p className="text-xs text-warning font-medium mb-1">⚠ 易错提示</p>
              <ul className="space-y-0.5">
                {[...commonTraps, ...examTips].map((t, i) => (
                  <li key={i} className="text-xs text-text-primary">• {t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── 高考例句 ── */}
      {gaokaoExamples.length > 0 && (
        <div>
          <SectionTitle>高考例句</SectionTitle>
          <div className="space-y-2">
            {gaokaoExamples.map((ex, i) => (
              <ExampleItem key={i} ex={ex} />
            ))}
          </div>
        </div>
      )}

      {/* ── 普通例句 (fallback if no gaokao examples) ── */}
      {gaokaoExamples.length === 0 && examples.length > 0 && (
        <div>
          <SectionTitle>例句</SectionTitle>
          <div className="space-y-2">
            {examples.map((ex, i) => (
              <div key={i} className="border-l-2 border-accent/30 pl-3 py-0.5">
                <p className="text-sm text-text-primary italic">{ex.en}</p>
                <p className="text-xs text-text-secondary mt-0.5">{ex.zh}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 词族/同根词 ── */}
      {wordFamily.length > 0 && (
        <div>
          <SectionTitle>同根词 / 词族</SectionTitle>
          <div className="space-y-1.5">
            {wordFamily.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-semibold text-sm text-text-primary min-w-[90px]">{m.word}</span>
                <span className="text-xs text-text-tertiary pt-0.5 min-w-[40px]">{m.pos}</span>
                <span className="text-xs text-text-secondary pt-0.5 flex-1">{m.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 搭配 ── */}
      {(collocationItems.length > 0 || collocations.length > 0) && (
        <div>
          <SectionTitle>常用搭配</SectionTitle>
          {collocationItems.length > 0 ? (
            <div className="space-y-1.5">
              {collocationItems.map((c, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-accent">{c.phrase}</span>
                    <span className="text-xs text-text-secondary">{c.meaning}</span>
                  </div>
                  {c.example && <p className="text-xs text-text-tertiary italic mt-0.5 pl-1">{c.example}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {collocations.map((c, i) => (
                <span key={i} className="px-2.5 py-1 bg-bg-primary rounded-full text-xs text-text-primary">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 近义/反义词 ── */}
      {(synonyms.length > 0 || antonyms.length > 0) && (
        <div className="flex gap-4">
          {synonyms.length > 0 && (
            <div className="flex-1">
              <SectionTitle>近义词</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {synonyms.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}
          {antonyms.length > 0 && (
            <div className="flex-1">
              <SectionTitle>反义词</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {antonyms.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-50 text-danger rounded-full text-xs">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 易混词 ── */}
      {confusingWords.length > 0 && (
        <div>
          <SectionTitle>易混词辨析</SectionTitle>
          <div className="space-y-2">
            {confusingWords.map((cw, i) => (
              <div key={i} className="bg-bg-primary rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-text-primary">{cw.word}</span>
                  <span className="text-xs text-text-secondary">{cw.meaning}</span>
                </div>
                <p className="text-xs text-text-tertiary">{cw.difference}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 词根词缀 ── */}
      {word.root && (
        <div>
          <SectionTitle>词根词缀</SectionTitle>
          <p className="text-sm text-text-primary">{word.root}</p>
        </div>
      )}

      {/* ── 记忆提示 ── */}
      {(word.memoryTip || word.usageNote) && (
        <div className="bg-green-50 rounded-xl p-3">
          {word.memoryTip && (
            <div className={word.usageNote ? 'mb-2' : ''}>
              <p className="text-xs font-semibold text-green-700 mb-0.5">记忆技巧</p>
              <p className="text-xs text-text-primary">{word.memoryTip}</p>
            </div>
          )}
          {word.usageNote && (
            <div>
              <p className="text-xs font-semibold text-green-700 mb-0.5">用法说明</p>
              <p className="text-xs text-text-primary">{word.usageNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
