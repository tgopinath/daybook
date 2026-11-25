import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { getCurrentSession } from "@/lib/auth";
import { describeUserAgent } from "@/components/security/user-agent";

/** Signed-in devices for this account (no tokens or hashes are returned). */
export const GET = route(async ({ user }) => {
  const current = await getCurrentSession();
  const rows = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });
  const items = rows
    .map((s) => ({ ...s, ...describeUserAgent(s.userAgent), current: s.id === current?.id }))
    .sort((a, b) => Number(b.current) - Number(a.current));
  return { items };
});

/** Signs out every other device. */
export const DELETE = route(async ({ user }) => {
  const current = await getCurrentSession();
  const { count } = await db.session.deleteMany({ where: { userId: user.id, ...(current ? { id: { not: current.id } } : {}) } });
  return { ok: true, count };
});
