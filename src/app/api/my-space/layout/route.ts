import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { writeWidgetStore } from "@/components/dashboard/widgets";
import { MY_SPACE_IDS, normalizeMySpace } from "@/components/my-space/registry";

const input = z.union([
  z.object({ reset: z.literal(true) }),
  z.object({ widgets: z.array(z.object({ id: z.enum(MY_SPACE_IDS), visible: z.boolean(), size: z.enum(["small", "large"]) })).max(50) }),
]);

/**
 * Save My space widget order, visibility and size, or `{ reset: true }` for the default.
 * Stored under `UserSettings.dashboardWidgets.mySpace`; the Overview layout beside it is kept as is.
 */
export const PUT = route(async ({ req, user }) => {
  const data = await body(req, input);
  const layout = normalizeMySpace("reset" in data ? null : data.widgets);
  const current = await db.userSettings.findUnique({ where: { userId: user.id }, select: { dashboardWidgets: true } });
  const next = writeWidgetStore(current?.dashboardWidgets, "mySpace", "reset" in data ? undefined : layout);
  const stored = next ? (next as Prisma.InputJsonValue) : Prisma.DbNull;
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, dashboardWidgets: stored },
    update: { dashboardWidgets: stored },
  });
  return { layout };
});
