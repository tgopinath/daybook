import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { throttle, verifyPassword } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo-mode";
import { hasPassword } from "@/lib/google";

/** Sample accounts from "Explore demo" can't change security settings. */
export function assertNotDemo(email: string, what = "Two-step verification") {
  if (isDemoEmail(email)) throw new ApiError(403, `${what} isn't available on demo accounts`);
}

export function assertThrottle(key: string, limit: number, windowMs?: number) {
  if (!throttle(key, limit, windowMs)) throw new ApiError(429, "Too many attempts. Try again later.");
}

/** Accounts with a password confirm sensitive changes with it. Returns whether the account has a password. */
export async function confirmPassword(userId: string, password: string | undefined, { required }: { required: boolean }) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!row) throw new ApiError(404, "Account not found");
  const has = hasPassword(row.passwordHash);
  if (!has) return false;
  if (!password) {
    if (required) throw new ApiError(400, "Enter your password");
    return true;
  }
  if (!(await verifyPassword(password, row.passwordHash))) throw new ApiError(400, "Password is incorrect");
  return true;
}
