// Demo mode: the app runs without a database (DATABASE_URL not set), e.g. the public portfolio deployment.
// Data lives in an in-memory Postgres (PGlite) inside the server process; every visitor gets their own
// fictional sample account (Alex Rivera), so nothing is shared between visitors and nothing is kept.
// Safe to import from the edge middleware: no Node-only imports here.

export function isDemo() {
  return !process.env.DATABASE_URL;
}

export const DEMO_NAME = "Alex Rivera";
/** Cookie naming this browser's demo account ("<key>.<timezone>"), so any server instance can rebuild it. */
export const DEMO_COOKIE = "pad_demo";
export const DEMO_EMAIL_DOMAIN = "demo.daybook.invalid";
/** Demo accounts older than this are removed when a new visitor starts. */
export const DEMO_TTL_MS = 6 * 3600_000;
/** At most this many demo accounts are kept in memory at once (oldest removed first). */
export const DEMO_MAX_USERS = 200;
