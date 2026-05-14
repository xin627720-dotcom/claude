# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a Next.js 14 PWA (`vocab-pwa`) for Chinese high-school students learning English vocabulary. The `android/` directory contains only Gradle scaffolding with no source code — ignore it entirely.

### Running the app

- `npm run dev` starts the Next.js dev server on port 3000.
- The app is offline-first: Supabase (auth/sync) and OpenAI (AI features) are optional. Without them, core features (flashcards, quizzes, spaced repetition, wrong-word tracking) work fully via localStorage.
- See `README.md` and `SYNC.md` for Supabase/Vercel deployment details.

### Lint, typecheck, build

- `npm run typecheck` — TypeScript strict check (currently passes clean).
- `npm run lint` — ESLint via `next lint`. Requires `.eslintrc.json` (extends `next/core-web-vitals`). There are pre-existing lint errors in `app/learn/page.tsx` (unescaped quote entities), which also cause `npm run build` to fail.
- `npm run build` — production build; currently blocked by the above lint errors.

### Environment variables

See `.env.example`. All are optional for local dev:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — cloud sync
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` — AI features (server-side only)
