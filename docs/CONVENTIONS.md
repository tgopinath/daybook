# MyDiary — code conventions

Next.js 15 App Router + React 19 + TypeScript (strict) + Tailwind v4 + Prisma 6 (PostgreSQL).
Read `prisma/schema.prisma` first — it is the source of truth for the data model.

## Server / API
- REST routes live in `src/app/api/<resource>/route.ts` and `src/app/api/<resource>/[id]/route.ts`.
- Always wrap handlers with `route()` from `@/lib/api`:
  ```ts
  export const GET = route(async ({ req, user, params }) => { ... return { items }; });
  ```
  `route()` enforces auth (user is guaranteed), blocks cross-origin writes, and turns `ApiError` / Zod errors into JSON `{ error }`.
  Dynamic params: `route<{ id: string }>(async ({ params }) => params.id)`.
- Validate bodies with Zod: `const input = await body(req, schema)`.
- **Every query must be scoped by `userId: user.id`** (use `findFirst({ where: { id, userId } })`, never `findUnique({ where: { id } })` alone). Throw `notFound("Task")` when missing.
- The caller's timezone: `tzOf(req)` (client sends `x-tz`). Use `@/lib/time` (`dayRange`, `dayKey`, `zonedToUtc`, `addDaysKey`) for "today", day keys etc.
- Recurrence math: `@/lib/recurrence` (`nextOccurrence`, `describeRecurrence`).
- Notifications: `notify(userId, { type, title, body, link, sourceId, dedupeHours })` from `@/lib/notify` (creates row + web push). Links are in-app paths only; never put private data in URLs.
- Prisma client: `import { db } from "@/lib/db"`.

### Soft delete / archive contract (shared by all modules)
Resources: `/api/tasks`, `/api/goals`, `/api/reminders`, `/api/events`, `/api/habits`, `/api/notes`, `/api/vault`.
- `GET /api/<r>` excludes rows with `deletedAt` or `archivedAt` set. `?scope=archived` returns only archived (not deleted); `?scope=trash` returns only deleted. (Models without `archivedAt` — events, vault — simply return [] for archived.)
- `DELETE /api/<r>/<id>` → soft delete (sets `deletedAt`). `DELETE /api/<r>/<id>?permanent=1` → hard delete.
- `PATCH /api/<r>/<id>` accepts `{ deletedAt: null }` to restore and `{ archived: boolean }` to archive/unarchive, in addition to normal field updates.
- Every list item returned includes `id`, `title` (notes/tasks/goals/reminders/events/vault) or `name` (habits), `deletedAt`, `archivedAt` (if present), `updatedAt`, `isDemo`.

## Client
- Pages are client components under `src/app/(app)/<section>/page.tsx` (add `"use client"` and keep page-specific components in a sibling `_components/` folder or in `src/components/<module>/`).
- Data: `useApi<T>(url)` (SWR) and `api.get/post/patch/put/delete` from `@/lib/client`. JSON dates arrive as strings: use `Wire<Model>` types.
- After any mutation call `refresh("/api/<resource>", ...SUMMARY_KEYS)` so the dashboard, notification bell and AI panel stay in sync.
- Feedback: `toast.success(msg)`, `toastError(err)`, `toast.undo(msg, onUndo)` from `@/components/ui/toast`. Deletes should be soft with an Undo toast; permanent deletes go through `await confirm({ title, body, destructive: true, confirmLabel })` from `@/components/ui/confirm`.
- UI primitives (use these, don't re-invent):
  - `@/components/ui/button` → `Button` (variants primary|secondary|outline|ghost|danger, sizes sm|md|lg|icon|icon-sm, `loading`)
  - `@/components/ui/input` → `Input`, `Textarea`, `Select` (native), `Field` (label wrapper), `Checkbox` (round, `color` prop), `Switch`
  - `@/components/ui/dialog` → `Dialog` (open, onOpenChange, title, description, footer, size sm|md|lg|xl) — becomes a bottom sheet on mobile
  - `@/components/ui/menu` → `Menu` (Radix dropdown: `trigger`, `items` with icon/onSelect/danger/separator)
  - `@/components/ui/misc` → `Card`, `Badge` (tone), `DemoBadge` (show for `isDemo` rows), `Skeleton`, `SkeletonList`, `EmptyState`, `Progress`, `PageHeader`, `Segmented` (tabs/view switcher), `Kbd`, `PRIORITY_META`
  - Popovers: `@radix-ui/react-popover`; tooltips: `@radix-ui/react-tooltip`.
- Global openers: `openTaskDialog(init?)` from `@/components/tasks/task-dialog`, `openQuickCapture(text?)`, `openSearch()`, `toggleAIPanel()` from `@/lib/ui-store`.
- User + settings: `useMe()` / `useTz()` from `@/lib/use-me`.
- Icons: `lucide-react` only. Animations: `framer-motion` (subtle). Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`. Charts: `recharts`. Dates: `date-fns` v4. Rich text: TipTap v2.
- Every list needs a loading skeleton, an empty state with a primary action, and error feedback. No dead buttons: if something can't work (e.g. AI key missing) show it disabled with an explanation.
- Mobile: layouts must work at 375px. Bottom nav is 64px tall (pages already have bottom padding). Use `md:` / `lg:` breakpoints.

## Design tokens (Tailwind classes)
`bg-bg` (page), `bg-surface` (cards), `bg-surface-2` (subtle fills), `text-fg` / `text-fg-2` / `text-fg-3`, `border-line` / `border-line-strong`, `bg-primary` / `text-primary` / `bg-primary-soft`, `text-success` / `bg-success-soft`, `text-warning` / `bg-warning-soft`, `text-danger` / `bg-danger-soft`, `shadow-card` / `shadow-pop` / `shadow-modal`, `rounded-[14px]` cards, `rounded-[10px]` controls.
Typography: page titles 22px semibold (use `PageHeader`), section titles 15px semibold, body 13.5–14px, meta 12px `text-fg-3`. Inspiration: Linear, Things 3, Notion — minimal, white, soft borders, no gradients.

## Testing locally
- Dev server is already running at http://localhost:3300 (do not start another; do not use the Browser pane).
- Local demo account: see `prisma/seed.ts` (DEMO_EMAIL / DEMO_PASSWORD).
- Sign in with curl: `curl -s -c /tmp/x.jar -H 'content-type: application/json' -d '{"email":"…","password":"…"}' localhost:3300/api/auth/login` then `curl -b /tmp/x.jar -H 'x-tz: Asia/Kolkata' localhost:3300/api/...`.
- Typecheck: `npx tsc --noEmit` (other modules are being built in parallel; fix only errors in your own files).
- Do NOT run `npm install` for new packages, do not edit `prisma/schema.prisma`, `package.json`, `src/lib/{api,auth,client,db,time,recurrence,notify,push,crypto,ui-store,use-me}.ts`, `src/components/ui/*` or `src/components/layout/*`. If you truly need a change there, describe it in your final report instead.

## Media (photos, videos, audio, documents) — Phase 1+
- Upload from the client with `uploadFile(file, { onProgress })` from `@/lib/upload` (downscales big photos, PUTs straight to object storage when configured, then confirms). It returns a `Media` (`id`, `kind`, `url`, …). `media.url` (`/api/media/:id`) is authenticated: use it directly in `<img src>` / `<video src>`.
- UI: `MediaUploader` (drop zone or `variant="button"`, calls `onUploaded(media)` per file), `MediaThumb`, `MediaGrid` (with viewer + optional `onRemove`), `MediaViewer` — all from `@/components/media/media`. `ACCEPT` presets in `@/lib/upload`.
- Server: rows reference `MediaFile` through join tables (`JournalMedia`, `MemoryMedia`, `TimelineMedia`) or a `mediaId` column (`PhotoEntry`, `BucketItem.imageMediaId`). When linking, **verify every mediaId belongs to the user** (`db.mediaFile.count({ where: { id: { in: ids }, userId: user.id, status: "ready" } })`). Serialize with `serializeMedia` from `@/lib/media`. Unlinking a file from a record should not delete the file; deleting a record permanently may delete media used only by it (`deleteObjects` from `@/lib/storage` + delete the MediaFile row).
- Uploads are refused for demo accounts and when no storage is configured (clear 403/503 messages) — surface the API error with `toastError`.

## Phase 1 data model
See `prisma/schema.prisma` (section "Phase 1"): `JournalEntry` (+`JournalTag`, `JournalMedia`), `GratitudeEntry`, `MoodEntry`, `Album`, `Memory` (+`MemoryMedia`), `PhotoCollection`, `PhotoEntry`, `BucketItem`, `TimelineEvent` (+`TimelineMedia`), `WeeklyReview`; `UserSettings.dashboardWidgets` (Overview layout) and `googlePhotosTokenEnc/Expires`.
Mood values everywhere: `happy | excited | calm | neutral | sad | anxious | stressed | angry` (shared metadata in `src/lib/moods.ts`). Day keys are `yyyy-MM-dd` in the user's timezone (`dayKey`/`tzOf`).
Journal entries with `isPrivate` are excluded from global search previews and from anything sent to AI.

## Personal look (Nov 2026)
Plain white background and cards (the user prefers white), soft warm-grey text and borders, purple accent unchanged. Use `font-display` (Fraunces serif) for page titles (already in `PageHeader`), greetings, journal/memory titles and big numbers that should feel personal; keep controls, labels and body UI in the default sans. Prefer gentle, human copy ("What's on your mind today?") over system copy. Keep it minimal: no gradients or decorative textures.

## My spaces: Finance, Storage, Security (Nov 2026)
Models (schema end): `FinanceAccount`, `Transaction` (amounts are **integers in minor units**, currency from `UserSettings.currency`, default INR), `Budget`, `DriveFolder`, `DriveFile` (a named, foldered pointer to a `MediaFile`), `BackupCode`; `User.totpSecretEnc/totpEnabledAt`; `Session.lastSeenAt`; `UserSettings.currency`, `appLockPinHash`, `appLockMinutes`, `googleDriveTokenEnc/Expires`.
Media kind `file` (Office/OpenDocument, text, CSV, JSON, ZIP, EPUB; up to 100 MB) is always served as a download with a sandbox CSP.
Google Drive and Sheets use the `https://www.googleapis.com/auth/drive.file` scope only (files the user picks or the app creates — non-sensitive). The Google Photos import uses a separate picker scope.
