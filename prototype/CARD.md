# Daybook

**Pitch:** A personal dashboard for tasks, goals, habits and notes, with an AI assistant that asks before it writes.

**Description:** Daybook brings tasks, goals and milestones, reminders, a calendar, habits, notes and an encrypted personal-information vault into one workspace, with an Overview that shows today at a glance. The AI assistant (Claude, server side only) reads a compact snapshot of your data; anything it wants to change comes back as a card you confirm or edit first. Without an API key the AI surfaces say so and the rest of the app works fully; AI calls are rate-limited per user and per server.

**Tags:** AI product, Next.js, Productivity, Dashboard, Postgres, Privacy, Web app

**Live:** https://daybook-livid-one.vercel.app (demo mode: no database, each browser gets a private sample account for the fictional user Alex Rivera in an in-memory Postgres, reset after a while; AI off)
**APK:** https://github.com/tgopinath/daybook/releases/latest/download/daybook.apk (4,076,532 bytes, release v1.0.0; Capacitor shell, Material 3 via the Kolam M3 kit)
**iOS repo:** https://github.com/tgopinath/Daybook-iOS (SwiftUI WKWebView shell, Apple HIG via the Kolam iOS kit)
**Repo:** https://github.com/tgopinath/daybook (Vercel project daybook, git-connected: a push to main deploys)
**Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, Prisma 6 + PostgreSQL (PGlite in demo mode), Anthropic SDK, Web Push
**Status:** published 2026-11-18 in demo mode

**Env vars for Vercel (none needed for the demo; set these for the full app):** DATABASE_URL, DIRECT_URL, AUTH_SECRET, VAULT_ENCRYPTION_KEY, ANTHROPIC_API_KEY (optional; without it AI stays off), NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional, push), CRON_SECRET (optional), AI_RATE_LIMIT_PER_HOUR / AI_DAILY_LIMIT (optional).

**Shots:** `prototype/shots/overview.jpg`, `tasks.jpg`, `habits.jpg`, `calendar.jpg` (600 wide, fictional seed account "Alex Rivera"), `web.jpg` (1440x900).
