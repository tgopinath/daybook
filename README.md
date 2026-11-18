# Daybook — Personal AI Dashboard

One workspace for tasks, goals, reminders, calendar, habits, notes and personal information, with an AI assistant that understands all of it.

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Radix primitives · Lucide · Framer Motion · dnd-kit · Recharts · TipTap
- **Backend:** Next.js route handlers (REST) · PostgreSQL · Prisma 6 · Zod validation
- **Auth:** email + password (bcrypt), HTTP-only session cookie, hashed session tokens stored in Postgres
- **AI:** Anthropic Claude (default) or OpenAI, server-side only, with tool calling and a confirm-before-write flow
- **Notifications:** Web Notifications + service worker + Web Push (VAPID), fired by a server-side dispatcher

## Quick start

Requirements: Node.js 20+ (tested on 24).

```bash
npm install
cp .env.example .env          # then fill in the secrets (see below)
npm run db:local              # starts a local Postgres (Prisma dev server); leave it running
npm run db:migrate            # applies migrations in prisma/migrations
npm run db:seed               # optional: creates a demo account with sample data
npm run dev                   # http://localhost:3300
```

`npm run db:local` runs Prisma's embedded local Postgres, so you don't need to install anything. It prints a `postgres://` URL. Use it for both `DATABASE_URL` (keep `&connection_limit=1&pgbouncer=true` on the end) and `DIRECT_URL`. Any regular PostgreSQL 14+ works too. Just point both URLs at it and drop the `pgbouncer` parameter unless you use a pooler.

The seed creates a local-only demo account. Its credentials are in [`prisma/seed.ts`](prisma/seed.ts). You can also sign up from the UI, and new accounts can start with sample data or empty.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | yes | PostgreSQL connection (pooled / direct for migrations) |
| `AUTH_SECRET` | yes | HMAC secret for session-token hashing |
| `VAULT_ENCRYPTION_KEY` | yes | 32-byte base64 key for AES-256-GCM encryption of Personal Information fields. **If you lose it, vault data can't be recovered.** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | Web Push keys. Generate them with `npm run vapid` |
| `AI_PROVIDER` | no | `anthropic` (default) or `openai` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | for AI | Without a key, AI surfaces say so and stay disabled. Responses are never faked. |
| `AI_MODEL` | no | Model override (defaults: `claude-sonnet-5` / `gpt-4.1`) |
| `STORAGE_DIR` | no | Private folder for task attachments (default `./storage`) |
| `CRON_SECRET` | no | Bearer token for calling `/api/cron/dispatch` from an external scheduler |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # VAULT_ENCRYPTION_KEY
npm run vapid                                                                     # VAPID keys
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3300 |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run db:local` | Local Postgres via `prisma dev` |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Demo account + sample data |
| `npm run db:studio` | Prisma Studio |

## Architecture

```
prisma/
  schema.prisma          data model (users, tasks, subtasks, goals, milestones, reminders,
                         calendar events, habits + entries, notes + tags, categories, projects,
                         notifications, attachments, settings, vault, AI conversations/messages)
  migrations/            SQL migrations
  seed.ts                demo account
src/
  middleware.ts          redirects signed-out visitors to /login
  instrumentation.ts     starts the reminder/notification dispatcher (Node runtime)
  lib/
    api.ts               route() wrapper: auth, same-origin check, Zod → JSON errors
    auth.ts              sessions, password hashing, throttling
    crypto.ts            AES-256-GCM helpers for the vault
    time.ts              timezone-aware day math
    recurrence.ts        next-occurrence math for reminders, tasks and events
    notify.ts, push.ts   in-app notifications + Web Push
    dispatcher.ts        fires due reminders, overdue alerts, calendar alerts
    ai/                  provider abstraction, tools, context builder, quick-capture parser
  app/
    (auth)/              login, signup
    (app)/               overview, tasks, goals, calendar, reminders, habits, notes, vault,
                         assistant, planner, insights, archive, trash, settings
    api/                 REST endpoints, one folder per resource
  components/
    ui/                  design-system primitives (button, input, dialog, menu, toast, confirm…)
    layout/              sidebar, top bar, mobile navigation, app shell + shortcuts
    <module>/            feature components
public/sw.js             service worker for push notifications
docs/CONVENTIONS.md      API and UI conventions used across modules
```

### Data and security

- Every user-owned row has a `userId` foreign key with `ON DELETE CASCADE`, plus indexes on the common query paths. Every query is scoped to the signed-in user.
- Sessions use random 256-bit tokens. Only an HMAC of each token is stored. The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- State-changing requests are rejected when the `Origin` header doesn't match the host.
- Personal Information fields are encrypted at rest with AES-256-GCM. Only the title and category stay readable, so they can be searched. The vault refuses values that look like passwords, card numbers, bank details or API secrets.
- Attachments are stored outside `public/` and are only served through an authenticated route.
- Deleting is soft first (Recently Deleted, with Undo); permanent deletion asks for confirmation. Settings → Data has full export/import, removal of sample data, and account deletion.
- In transit: serve the app over HTTPS in production (TLS termination at your host or proxy).

### Notifications

The server dispatcher (`src/lib/dispatcher.ts`) runs every 30 seconds inside the Node server, via `instrumentation.ts`. It turns due reminders, overdue tasks and upcoming calendar events into in-app notifications and sends them by Web Push to every device that allowed notifications, so they arrive even when the tab is closed. On serverless hosts, where there's no long-lived process, call `POST /api/cron/dispatch` every minute with `Authorization: Bearer $CRON_SECRET` (for example from Vercel Cron).

### AI assistant

`/api/ai/chat` sends the conversation and a compact snapshot of the user's data to the configured model with tool definitions:

- **Read-only tools** (overview, search, schedule, week summary) run automatically.
- **Write tools** (create a task, reminder, event or note, update or complete a task, break a goal into tasks) are never executed directly. They come back as confirmation cards, and the change happens only after the user confirms (optionally after editing the fields).

Quick Capture (⌘K) parses input locally with `chrono-node` ("Basic parsing") and can upgrade the parse with the model ("Parsed by AI"). Recurring or ambiguous entries always show a preview before saving.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| ⌘K / Ctrl+K | Quick capture |
| / | Search |
| N | New task |
| ⌘. | Toggle AI panel |
| ⌘\ | Collapse sidebar |
| G then O/T/G/C/R/H/N/A/P/I/S | Go to Overview / Tasks / Goals / Calendar / Reminders / Habits / Notes / Assistant / Planner / Insights / Settings |

## Deployment

1. Provision PostgreSQL and set `DATABASE_URL` / `DIRECT_URL`.
2. Set all secrets from the table above in your host's environment. Never commit `.env`.
3. `npm ci && npm run db:deploy && npm run build && npm start`. Use any Node host; a long-running process keeps the dispatcher alive.
4. On serverless, schedule `/api/cron/dispatch` every minute and point `STORAGE_DIR` at a persistent volume, or swap the attachment storage for an object store.

## Not included (yet)

- Google sign-in. Email and password are fully implemented, and the session layer is ready for an OAuth provider.
- Email delivery of notifications. The setting is shown as unavailable instead of pretending to work.
- Languages other than English.
