# Ledger

Personal finance dashboard, built on Vite + React + Supabase.

## Local setup

```
npm install
cp .env.example .env
# edit .env with your real Supabase Project URL and Publishable key
npm run dev
```

## Deploying

Import this repo into Vercel. Framework preset: Vite (should auto-detect).
Add the two environment variables from `.env.example` in Vercel's Project
Settings -> Environment Variables, using your real values - Vercel builds
on its own servers and won't see your local `.env` file.

## Database

Schema lives in `supabase/migrations/`. Run each file in order in your
Supabase project's SQL Editor (or via `supabase db push` if using the CLI).
