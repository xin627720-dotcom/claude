# 项目交接文档

> 写给下一个接手的 Claude 账号。请从头到尾读完再动手。

---

## 一、项目概况

| 项目 | 内容 |
|------|------|
| 项目名称 | 高考英语阅读识词 PWA |
| 技术栈 | Next.js 14 App Router · TypeScript strict · Tailwind CSS · Supabase · PWA |
| 当前仓库 | xin627720-dotcom/claude |
| 当前分支 | `claude/android-vocab-app-9sHhy` |
| 部署平台 | Vercel（具体 URL 以实际 Vercel 后台为准） |
| 核心目标 | 帮助高中生备战高考英语。**主线是阅读识别**：看到英文，快速反应中文意思。不强制拼写，不要求默写。 |

---

## 二、已完成的功能

| 功能 | 状态 |
|------|------|
| 2750 词词库（含频率标注） | ✅ 已完成 |
| 学习页（翻卡片·认识/模糊/不认识） | ✅ 已完成 |
| 测验页（四选一选择题） | ✅ 已完成 |
| 拼写测试页（看释义输入单词） | ✅ 已完成 |
| 错词本（按最近出错排序） | ✅ 已完成 |
| 词库浏览页 | ✅ 已完成 |
| 我的页面（目标/统计/设置） | ✅ 已完成 |
| 邮箱验证码登录（OTP，6–10 位） | ✅ 已完成 |
| Supabase 云同步（多设备同步进度） | ✅ 已完成 |
| 自动发音（Web Speech API） | ✅ 已完成 |
| AI 单词详情（按需生成·缓存复用） | ✅ 已完成 |
| Mimo AI 今日计划（每日一次） | ✅ 已完成 |
| 高频词优先排序 | ✅ 已完成 |
| 到期复习（记忆曲线间隔） | ✅ 已完成 |
| 错词重认（错词优先） | ✅ 已完成 |
| 模糊词加强 | ✅ 已完成 |
| 阅读句中识义（quiz·例句高亮） | ✅ 已完成 |
| 易混词辨析（quiz） | ✅ 已完成 |
| AI 学习诊断（ai-analysis 页面） | ✅ 已完成（诊断内容可能较宽泛，待验证） |
| 记忆曲线/阶段分布面板 | ✅ UI 已完成（`MemoryCurvePanel` 组件），是否为真折线图待验证 |
| 学习会话中断续学（mimoLearningSession） | ✅ 已完成 |
| 顺序任务执行（mimoTaskRunner） | ✅ 已完成 |
| 统一统计口径（lib/stats.ts） | ✅ 已完成 |
| 用户自定义每日新词数量 | ✅ 已完成（profile 页面的"每日目标"输入框） |
| 用户自定义目标天数（30/60/90/120天或自定义） | ✅ 已完成（Mimo AI 学习目标设置） |

---

## 三、重要设计原则

1. **主线是阅读识别，不是强制拼写。** 学习页显示英文 → 用户自行思考 → 翻卡片看中文+例句 → 选择"认识/模糊/不认识"。
2. **高频词优先。** `FREQ_PRIORITY`：高频=0, 中频=1, 低频=2, 超纲=3，数字越小越优先。
3. **错词优先。** `isWrongWord || wrongCount > 0 || quizWrongCount > 0` 的词排前面。
4. **到期复习优先。** `nextReviewAt <= now` 的词先学。
5. **AI 失败必须 fallback。** `/api/mimo/plan` 请求失败或返回空时，`generateLocalFallbackPlan()` 立即生成本地计划，不阻塞用户。
6. **不要全量发词库给 AI。** `buildLocalPlanCandidates()` 过滤后最多发 80+80+50+50 个候选词给 Mimo AI。
7. **Mimo 计划每天只生成一次。** 有 `mimoDailyPlan_v1` 且 `date === today` 就直接用。用户手动"重新生成"才再次调用 AI。
8. **API Key 不得出现在前端。** `OPENAI_API_KEY` 只在 `app/api/` 下的 server route 里读取，绝不放 `NEXT_PUBLIC_` 变量。
9. **Supabase 同步不能被破坏。** 修改 `localStore.ts` / `sync.ts` / `AuthContext.tsx` 前务必通读全文。

---

## 四、关键文件说明

### 页面

| 文件 | 说明 |
|------|------|
| `app/page.tsx` | 首页。显示进度环、统计格、MimoPlanCard、快速开始按钮 |
| `app/learn/page.tsx` | 学习页。翻卡片流程；支持 `?mode=mimo-new/review/wrong/fuzzy`；支持中断续学（mimoLearningSession）；done 屏有"返回今日计划" |
| `app/quiz/page.tsx` | 测验页。四选一；支持 `?mode=mimo-sentence/confusing`；sentence 模式显示例句高亮；有🔊朗读按钮；done 屏有"返回今日计划" |
| `app/spelling/page.tsx` | 拼写测试。看释义拼单词 |
| `app/wrong-words/page.tsx` | 错词本。按最近出错排序；可展开查看 AI 详情 |
| `app/vocabulary/page.tsx` | 词库浏览 |
| `app/daily-plan/page.tsx` | Mimo 今日计划详情页。展示任务卡片；"继续"按钮按顺序执行任务；live 实时统计 |
| `app/ai-analysis/page.tsx` | AI 学习诊断页 |
| `app/profile/page.tsx` | 我的。账号登录（OTP）、同步状态、每日目标、Mimo 计划设置、发音开关 |
| `app/word/[id]/page.tsx` | 单词详情页。支持 AI 按需丰富内容 |

### API Routes（服务端，不暴露 key）

| 文件 | 说明 |
|------|------|
| `app/api/mimo/plan/route.ts` | 生成 Mimo 今日计划。读 `OPENAI_*` env，调用 AI，失败时前端 fallback |
| `app/api/word/enrich/route.ts` | 单词 AI 详情丰富。读 `OPENAI_*` env；强制 `isRealExam: false` |
| `app/api/ai/analyze/route.ts` | AI 学习诊断。读 `OPENAI_*` env |

### 核心库

| 文件 | 说明 |
|------|------|
| `lib/types.ts` | 全部类型定义（WordProgress, UserStats, MimoDailyPlan 等） |
| `lib/vocab.ts` | 加载词库；合并 `vocab-enhanced-details.json` |
| `lib/localStore.ts` | localStorage 读写。`loadStore/saveStore/getWordProgress/saveWordProgress/getUserStats/saveUserStats/getWrongWordsList` |
| `lib/stats.ts` | `calculateLearningStats(totalCount, wordProgress)` → 统一统计口径，所有页面必须用这个函数 |
| `lib/review.ts` | `updateProgressAfterReview` · `buildReviewQueue` · `getNextReviewDate` · `isDueForReview` |
| `lib/mimoPlan.ts` | Mimo 计划核心逻辑：候选词构建、本地 fallback、设置读写、计划读写 |
| `lib/mimoTaskRunner.ts` | 任务顺序：review→wrong→fuzzy→new→sentence→confusing；`getCurrentDailyTask`·`markTaskComplete` |
| `lib/mimoLearningSession.ts` | 会话持久化（`mimoLearningSession_v1`）；`getLearningSession`·`updateSessionProgress`·`clearLearningSession` |
| `lib/speech.ts` | Web Speech API 封装；`speakWordDirect`·`loadVoices`·`getAutoSpeakEnabled` |
| `lib/supabaseClient.ts` | Supabase client 初始化；`isSupabaseConfigured()` 检测是否配置 |
| `lib/sync.ts` | `fullSync()` · `trySyncInBackground()` — 双向同步 localStore ↔ Supabase |
| `lib/wordDetail.ts` | `hasEnhancedData`·`getEnrichCache`·`setEnrichCache`（`wordEnrichCache_v1`） |
| `lib/aiAnalysis.ts` | AI 诊断数据准备 |
| `lib/aiTypes.ts` | AI 相关类型 |
| `contexts/AuthContext.tsx` | 用户认证上下文；`signInWithEmail`·`verifyOtp`·`signOut`·`triggerSync` |

### 组件

| 文件 | 说明 |
|------|------|
| `components/MimoPlanCard.tsx` | 首页 Mimo 计划卡片；自动生成/展示今日计划 |
| `components/WordCard.tsx` | 学习页翻卡片组件 |
| `components/WordDetail.tsx` | 单词详情（7 个 section，缺数据时显示占位符） |
| `components/BottomNav.tsx` | 底部导航 |
| `components/SyncStatus.tsx` | 首页右上角同步状态指示 |
| `components/MemoryCurvePanel.tsx` | 记忆曲线/阶段分布面板 |
| `components/StatCard.tsx` | 统计卡片 |
| `components/AiAnalysisCard.tsx` | AI 诊断结果卡片 |
| `components/WeakWordsList.tsx` | 薄弱词列表 |

---

## 五、Supabase 配置

### 环境变量（`.env.local`，不要提交到 Git）

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 数据库表

| 表名 | 说明 |
|------|------|
| `word_progress` | 每个单词的学习状态（status, correctCount, wrongCount 等） |
| `user_stats` | 用户统计（dailyGoal, streakDays, points 等） |
| `quiz_progress` | 测验进度队列 |
| `wrong_words` | 错词本（wrongCount, lastWrongAt, nextReviewAt） |

### Row Level Security (RLS)

所有表均启用 RLS。用户只能通过 `auth.uid()` 访问自己的数据。策略示例：

```sql
-- 读
USING (user_id = auth.uid())
-- 写
WITH CHECK (user_id = auth.uid())
```

---

## 六、邮箱验证码登录

- 使用 **Supabase Email OTP**（不是 magic link）
- Supabase 邮件模板已改为 `{{ .Token }}`（不使用 `{{ .ConfirmationURL }}`）
- Supabase 实际发送 **8 位**数字验证码
- App 验证码输入框：`maxLength={10}`，校验 `/^[0-9]{6,10}$/`，支持 6–10 位
- 发送验证码调用：`supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
- 验证调用：`supabase.auth.verifyOtp({ email, token, type: 'email' })`
- **注意**：频繁点击"发送验证码"会触发 Supabase 的 email rate limit，建议给发送按钮加 60 秒倒计时（**P0 待办**）

---

## 七、Mimo AI 配置

### 环境变量（服务端，`.env.local`）

```
OPENAI_API_KEY=...
OPENAI_BASE_URL=...    # 例如 https://api.openai.com/v1 或第三方兼容接口
OPENAI_MODEL=...       # 例如 gpt-4o-mini
```

### 使用原则

- 三个变量只在 `app/api/` server route 里读取，绝不放到 `NEXT_PUBLIC_` 前缀
- `OPENAI_BASE_URL` 动态拼接，不写死官方地址（便于切换国内代理）
- 每次 Mimo 计划请求：先用 `buildLocalPlanCandidates()` 过滤候选词（最多 80+80+50+50 个），再发给 AI
- AI 失败 → 前端用 `generateLocalFallbackPlan()` 立即兜底

---

## 八、当前已知问题

| 问题 | 状态 |
|------|------|
| 登录验证码文案（"6位"→"验证码"）和输入位数（6–10位） | ✅ 已修复（commit 9eb3a2a） |
| 发送验证码按钮无倒计时，频繁点击触发 email rate limit | ⚠️ **未修复**，P0 待办 |
| iPad 无 VPN 访问 Vercel 可能不稳定 | ⚠️ 网络问题，无代码解决方案，可考虑国内可访问的部署 |
| Mimo 今日计划中断续学功能 | ✅ 代码已实现（mimoLearningSession），但**未经实机测试** |
| AI 诊断输出是否足够具体 | ⚠️ 实现了，但可能输出较宽泛，需真实数据测试 |
| MemoryCurvePanel 是否为真折线图 | ⚠️ 组件存在，实现细节未验证，需实机查看 |
| 统计口径统一（lib/stats.ts） | ✅ 代码已实现，但各页面是否全部切换需复查 |
| Mimo 顺序任务（daily-plan → learn/quiz → 返回 daily-plan） | ✅ 代码已实现，但未经完整流程测试 |

---

## 九、下一步建议

### P0（影响基本可用性）

1. **给"发送验证码"按钮加 60 秒倒计时**，防止频繁触发 Supabase email rate limit  
   改动位置：`app/profile/page.tsx`，在 `handleSendCode` 成功后启动倒计时，按钮 disabled + 显示剩余秒数

2. **端到端测试登录流程**：发送验证码 → 输入验证码 → 登录成功 → 同步

3. **端到端测试 Mimo 今日计划流程**：生成计划 → 开始任务 → 中断 → 重新进入 → 续学 → 返回今日计划

4. **测试 Supabase 同步**：多设备同一邮箱，确认进度一致

### P1（影响核心体验）

5. 验证 AI 诊断输出质量，如不够具体，改进 prompt

6. 验证 MemoryCurvePanel 是否真正展示历史曲线数据

7. 确认所有页面的"已掌握"统计口径一致（都应使用 `calculateLearningStats()`）

### P2（优化/拓展）

8. 国内可访问的部署方案（Cloudflare Pages 或香港节点）

9. 优化 iPad 大屏布局

10. 考虑 PWA 离线缓存策略

---

## 十、构建状态

记录于 commit `9eb3a2a`（2025-05-12）：

| 检查项 | 结果 |
|--------|------|
| `npm run typecheck`（`tsc --noEmit`） | ✅ 通过，0 错误 |
| `npm run build` | ✅ 通过，所有页面编译成功 |
| 未提交文件 | 无 |

---

## 十一、Git 状态

```
分支：   claude/android-vocab-app-9sHhy
最新 commit：9eb3a2a6f5d9d233d0dd564f4407d838cf242160
说明：   Remove remaining '6位验证码' copy from Step 1 description
未提交：  无（working tree clean）
```

### 最近改动摘要（近 8 次 commit）

| Commit | 说明 |
|--------|------|
| `9eb3a2a` | 修登录文案：去掉"6位" |
| `57ff75c` | OTP 输入改为 6–10 位，maxLength=10 |
| `7946f74` | 登录从 magic link 改为 OTP 验证码 |
| `d032ad0` | Mimo 学习流程修复：续学·顺序任务·语音·统一统计 |
| `9fbf092` | 新增 Mimo AI 今日阅读词汇计划完整功能 |
| `9f8a65a` | 修 API：读 OPENAI_BASE_URL / OPENAI_MODEL env |
| `b63c022` | WordDetail 始终显示7个section；新增 AI 单词详情 |

---

## 十二、接手第一步

> 给下一个 Claude 账号的具体指令：

1. `git checkout claude/android-vocab-app-9sHhy`
2. `npm install`
3. 确认 `.env.local` 已配置（不在 Git 里，需要人工复制）：
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   OPENAI_API_KEY=
   OPENAI_BASE_URL=
   OPENAI_MODEL=
   ```
4. `npm run typecheck && npm run build` 确认能编译
5. **第一个代码任务**：给"发送验证码"按钮加 60 秒倒计时（`app/profile/page.tsx`）
6. 然后做端到端功能测试（登录、同步、Mimo 计划）
