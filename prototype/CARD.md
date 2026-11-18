# Daybook

**Pitch:** A personal dashboard for tasks, goals, habits and notes, with an AI assistant that asks before it writes.

**Description:** Daybook brings tasks, goals and milestones, reminders, a calendar, habits, notes and an encrypted personal-information vault into one workspace, with an Overview that shows today at a glance. The AI assistant (Claude, server side only) reads a compact snapshot of your data; anything it wants to change comes back as a card you confirm or edit first. Without an API key the AI surfaces say so and the rest of the app works fully; AI calls are rate-limited per user and per server.

**Tags:** AI product, Next.js, Productivity, Dashboard, Postgres, Privacy, Web app

**Live:** not deployed yet. Planned: https://daybook.vercel.app (update `prototype/mobile.html` once the real URL is known)
**APK:** not built yet (needs the live URL; Android shell via build-remote.sh)
**iOS repo:** not created yet (planned tgopinath/Daybook-iOS via new-shell.sh)
**Repo:** planned tgopinath/daybook (local git repo ready on main)
**Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, Prisma 6 + PostgreSQL, Anthropic SDK, Web Push
**Status:** built and verified locally; blocked before publishing (public repo creation was not permitted in this run, and the app needs a Postgres database)

**Env vars for Vercel:** DATABASE_URL, DIRECT_URL, AUTH_SECRET, VAULT_ENCRYPTION_KEY, ANTHROPIC_API_KEY (optional; without it AI stays off), NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional, push), CRON_SECRET (optional), AI_RATE_LIMIT_PER_HOUR / AI_DAILY_LIMIT (optional).

**Shots:** `prototype/shots/overview.jpg`, `tasks.jpg`, `habits.jpg`, `calendar.jpg` (600 wide, fictional seed account "Alex Rivera"), `web.jpg` (1440x900).
