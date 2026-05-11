# AI 学习诊断功能说明

## 功能概述

AI 学习诊断（`/ai-analysis`）在现有 PWA 基础上增加了两层分析能力：

1. **本地算法分析**（无需 API Key，始终可用）
   - 薄弱词汇排行（弱点分公式计算）
   - 记忆曲线分布（各阶段词数可视化）
   - 学习关键指标（逾期词数、测验正确率、连续天数）

2. **AI 文字诊断**（需配置 `OPENAI_API_KEY`）
   - 总体评价 + 学习水平定级
   - 重点薄弱词逐词分析 + 记忆技巧
   - 个性化今日计划
   - 练习建议 + 鼓励话语

## 配置说明

### 环境变量

在 `.env.local` 中添加（**不要提交到 Git**）：

```
# 服务端专用，绝不使用 NEXT_PUBLIC_ 前缀
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_MODEL=gpt-4.1-mini   # 可选，默认 gpt-4.1-mini
```

在 Vercel 中：
- 打开项目 → Settings → Environment Variables
- 添加 `OPENAI_API_KEY`（不勾选 "Expose to browser"）
- 添加 `OPENAI_MODEL`（可选）

### 未配置时的表现

若未配置 `OPENAI_API_KEY`，页面显示：

> AI 诊断未开启。你仍然可以查看本地学习分析。

本地分析的薄弱词汇排行、记忆曲线面板仍然正常显示。

## 安全设计

| 要求 | 实现 |
|------|------|
| API Key 仅服务端 | 读取 `process.env.OPENAI_API_KEY`（服务器），非 `NEXT_PUBLIC_` |
| Key 不出现在前端 | API Route 在 `app/api/ai/analyze/route.ts`，前端只调用 `/api/ai/analyze` |
| 不发完整词库 | 仅发送最多 30 个薄弱词，每词含 word/meaning/scores/1个例句 |
| 不发敏感数据 | 不含用户 ID、邮箱、密码等信息 |
| Key 不提交 GitHub | `.gitignore` 包含 `.env.local` |

## 弱点分公式

```
weakScore = wrongCount × 3 + fuzzyCount × 2 - correctCount + overdueWeight
```

- `overdueWeight`: 逾期天数，最多 +5 分
- `weakScore ≤ 0` 的词不显示（说明已掌握良好）

## 缓存策略

- AI 分析结果缓存在 `localStorage`（key: `ai_analysis_cache_v1`）
- 每天自动分析一次（进入页面时检查日期）
- 点击「重新分析」按钮可强制刷新
- 版本号变更时自动清除旧缓存

## 文件结构

```
lib/
  aiTypes.ts          # TypeScript 类型定义
  aiAnalysis.ts       # 本地算法：弱点分计算、缓存读写

app/
  api/ai/analyze/
    route.ts          # Next.js API Route（服务端，调用 OpenAI）
  ai-analysis/
    page.tsx          # AI 诊断页面

components/
  AiAnalysisCard.tsx  # AI 诊断结果卡片（总评/计划/词汇分析/建议）
  WeakWordsList.tsx   # 薄弱词汇排行列表
  MemoryCurvePanel.tsx # 记忆曲线分布图
```

## 可选 Supabase 表

若需云端保存 AI 报告，在 Supabase 执行：

```sql
create table ai_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  report jsonb not null,
  created_at timestamptz default now()
);

alter table ai_analysis_reports enable row level security;

create policy "users can manage own reports"
  on ai_analysis_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

当前版本暂不自动上传，如需实现可在 `saveCachedAiAnalysis` 后调用 Supabase 插入。
