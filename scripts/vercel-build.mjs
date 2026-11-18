// Vercel build: apply database migrations when a database is configured, then build.
// Without DATABASE_URL the build still succeeds; the app then shows its sign-in page but can't store data.
import { execSync } from "node:child_process";
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.DATABASE_URL) run("npx prisma migrate deploy");
else console.warn("DATABASE_URL is not set: skipping migrations. Add a Postgres database (e.g. Neon) in Vercel.");
run("npx next build");
