import "server-only";
import { randomBytes } from "crypto";
import { isDemo } from "./demo-mode";

// In demo mode the session and vault secrets fall back to random per-process values:
// the in-memory demo data never outlives the process, so nothing needs a stable key.
const g = globalThis as unknown as { __daybookDemoSecrets?: Record<string, string> };

export function secret(name: "AUTH_SECRET" | "VAULT_ENCRYPTION_KEY"): string | undefined {
  const v = process.env[name];
  if (v) return v;
  if (!isDemo()) return undefined;
  g.__daybookDemoSecrets ??= { AUTH_SECRET: randomBytes(32).toString("base64url"), VAULT_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
  return g.__daybookDemoSecrets[name];
}
