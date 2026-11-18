// Node.js runtime only — imported from instrumentation.ts.
// On serverless hosting, call /api/cron/dispatch from an external cron instead.
import { runDispatcher } from "./lib/dispatcher";
import { isDemo } from "./lib/demo-mode";

const g = globalThis as unknown as { __daybookDispatcherStarted?: boolean };

// Demo mode (no database): no scheduler, no push.
if (!g.__daybookDispatcherStarted && !isDemo()) {
  // dev: avoid double registration on reload
  g.__daybookDispatcherStarted = true;
  const tick = () => {
    runDispatcher().catch((err) => console.error("[dispatcher] run failed", err));
  };
  setInterval(tick, 30_000);
  setTimeout(tick, 5_000);
}
