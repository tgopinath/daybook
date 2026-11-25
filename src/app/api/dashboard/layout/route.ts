import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { normalizeLayout, WIDGET_IDS } from "@/components/dashboard/widgets";

const input = z.union([
  z.object({ reset: z.literal(true) }),
  z.object({ widgets: z.array(z.object({ id: z.enum(WIDGET_IDS), visible: z.boolean() })).max(50) }),
]);

/** Save the Overview widget order/visibility, or `{ reset: true }` for the default layout. */
export const PUT = route(async ({ req, user }) => {
  const data = await body(req, input);
  const stored = "reset" in data ? Prisma.DbNull : (normalizeLayout(data.widgets) as unknown as Prisma.InputJsonValue);
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, dashboardWidgets: stored },
    update: { dashboardWidgets: stored },
  });
  return { layout: normalizeLayout("reset" in data ? null : data.widgets) };
});
