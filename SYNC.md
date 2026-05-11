# 同步配置指南

本文档说明如何配置 Supabase，让安卓手机和 iPad 的学习记录保持同步。

---

## 第一步：创建 Supabase 项目

1. 打开 [https://supabase.com](https://supabase.com)，点击 **Start your project**
2. 用 GitHub 账号或邮箱注册登录
3. 点击 **New project**
4. 填写：
   - **Project name**：vocab-app（随意填）
   - **Database Password**：设一个安全密码（记住它）
   - **Region**：选 **Southeast Asia (Singapore)**（离中国最近）
5. 点击 **Create new project**，等待约 2 分钟创建完成

---

## 第二步：获取 Supabase URL 和 anon key

1. 项目创建完成后，点击左侧菜单 **Settings → API**
2. 找到以下两个值：
   - **Project URL**：类似 `https://xxxxxxxx.supabase.co`
   - **anon public**（在 Project API keys 下）：一串很长的字符串

---

## 第三步：创建数据库表

1. 点击左侧菜单 **SQL Editor**
2. 点击 **New query**
3. 复制下方全部 SQL，粘贴进去，点击 **Run**

```sql
-- 单词学习进度表
CREATE TABLE IF NOT EXISTS word_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word_id text NOT NULL,
  status text NOT NULL DEFAULT 'unseen',
  correct_count int NOT NULL DEFAULT 0,
  wrong_count int NOT NULL DEFAULT 0,
  fuzzy_count int NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  is_favorite boolean NOT NULL DEFAULT false,
  is_wrong_word boolean NOT NULL DEFAULT false,
  last_quiz_at timestamptz,
  quiz_correct_count int NOT NULL DEFAULT 0,
  quiz_wrong_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, word_id)
);

-- 用户统计表
CREATE TABLE IF NOT EXISTS user_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  daily_goal int NOT NULL DEFAULT 20,
  streak_days int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0,
  last_checkin_date date,
  total_learned int NOT NULL DEFAULT 0,
  total_mastered int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 测验进度表
CREATE TABLE IF NOT EXISTS quiz_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_quiz_queue text[] NOT NULL DEFAULT '{}',
  current_quiz_index int NOT NULL DEFAULT 0,
  answered_word_ids text[] NOT NULL DEFAULT '{}',
  wrong_word_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 错词本表
CREATE TABLE IF NOT EXISTS wrong_words (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word_id text NOT NULL,
  wrong_count int NOT NULL DEFAULT 1,
  last_wrong_at timestamptz NOT NULL DEFAULT now(),
  next_review_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, word_id)
);

-- 开启行级安全（RLS）
ALTER TABLE word_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE wrong_words ENABLE ROW LEVEL SECURITY;

-- 每个用户只能读写自己的数据
CREATE POLICY "own_word_progress" ON word_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_user_stats" ON user_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_quiz_progress" ON quiz_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_wrong_words" ON wrong_words FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

4. 看到 **Success** 说明建表成功

---

## 第四步：配置 Vercel 环境变量

1. 打开你的 Vercel 项目 → **Settings → Environment Variables**
2. 依次添加：

| 变量名 | 值 |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | 你的 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 anon public key |

3. 点击 **Save**，然后重新部署（Deployments → Redeploy）

---

## 第五步：配置登录跳转地址（Magic Link）

1. 在 Supabase 控制台 → **Authentication → URL Configuration**
2. **Site URL** 填写你的 Vercel 地址，例如 `https://your-app.vercel.app`
3. **Redirect URLs** 里添加 `https://your-app.vercel.app/**`
4. 点击 **Save**

---

## 第六步：安卓手机如何安装到桌面

1. 用 **Chrome 浏览器**打开你的 Vercel 地址
2. 点击右上角三点菜单 `⋮`
3. 选择 **添加到主屏幕**
4. 点击 **添加**
5. 桌面会出现 **高考英语词汇学习** 图标，点击即可全屏使用

---

## 第七步：iPad 如何添加到主屏幕

1. 用 **Safari 浏览器**打开你的 Vercel 地址
2. 点击底部工具栏的 **分享按钮**（方块加箭头图标）
3. 向下滑动，选择 **添加到主屏幕**
4. 点击 **添加**
5. 主屏幕会出现 App 图标

---

## 数据同步说明

### 学习时如何保存
- 每次点击「认识 / 模糊 / 不认识」后，数据**立即保存到本设备**
- 如果你已登录且有网络，**同时自动同步到云端**
- 没有网络时，数据保存在本地，**下次联网后自动同步**

### 两台设备如何同步
1. 安卓和 iPad 用**同一个邮箱**登录
2. App 打开时自动从云端拉取最新数据
3. 学习后自动推送到云端
4. 随时可在「我的」页面点击**手动同步**

### 冲突处理
- 同一个单词同时在两台设备上学习时，**以最新的时间戳为准**
- 答对次数、答错次数取**较大值**，不丢失学习记录

---

## 本地开发配置

在项目根目录创建 `.env.local` 文件（不提交到 Git）：

```
NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon_key
```

然后运行：

```bash
npm install
npm run dev
```

打开 http://localhost:3000 即可本地预览。
