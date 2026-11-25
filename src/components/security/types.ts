import type { Me } from "@/lib/use-me";

/** /api/me plus the security fields it now returns (see src/app/api/me/route.ts). */
export type MeWithSecurity = Me & {
  appLock?: number;
  account?: NonNullable<Me["account"]> & { twoFactor?: boolean };
};

export type SecurityOverview = {
  hasPassword: boolean;
  google: boolean;
  demo: boolean;
  twoFactor: { enabled: boolean; enabledAt: string | null };
  backupCodes: { remaining: number; total: number };
  appLock: { enabled: boolean; minutes: number };
  vaultCount: number;
  sessionCount: number;
};

export type SessionItem = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  browser: string;
  os: string;
  kind: "desktop" | "mobile" | "tablet" | "unknown";
  label: string;
  current: boolean;
};
