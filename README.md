# 高考英语词汇学习 PWA

一个可以安装到安卓手机和 iPad 桌面的英语词汇学习应用，支持多设备数据同步。

## 功能

- **翻卡学习** — 翻卡片背单词，支持认识 / 模糊 / 不认识三档评分
- **间隔复习** — 根据记忆曲线自动安排复习时间
- **选择测验** — 多选题测试记忆，测验进度跨会话保存
- **拼写测试** — 看中文写英文，锻炼拼写
- **错词本** — 自动收录答错单词，专项复习
- **单词详情** — 词义 / 例句 / 搭配 / 近反义词 / 词根
- **云端同步** — 用同一邮箱登录，安卓和 iPad 数据互通
- **离线可用** — 没有网络时仍可学习，联网后自动同步
- **朗读功能** — 使用系统 TTS 朗读英文单词和例句

## 技术栈

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase（云同步 + 邮箱登录）
- PWA（Service Worker + Web Manifest）

## 部署

详见 [SYNC.md](./SYNC.md) — 包含 Supabase 配置和 Vercel 部署完整教程。

## 词库格式

词库位于 `data/vocab-basic.json` 和 `data/vocab-core.json`。

每个单词包含：

```json
{
  "id": "b001",
  "word": "abandon",
  "meaning": "抛弃、放弃",
  "pos": "v.",
  "definition": "to leave someone or something permanently",
  "collocations": ["abandon a plan", "abandon hope"],
  "examples": [{"en": "...", "zh": "..."}],
  "synonyms": ["desert", "forsake"],
  "antonyms": ["keep", "maintain"],
  "root": "法语 abandonner",
  "examTips": "高考常考：abandon + 名词",
  "level": "basic"
}
```

替换完整词库只需编辑这两个 JSON 文件，保持结构不变即可。

## 开发

```bash
npm install
npm run dev       # 开发服务器
npm run build     # 生产构建
npm run typecheck # 类型检查
```
