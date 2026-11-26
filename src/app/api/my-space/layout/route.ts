import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { DEFAULT_SECTIONS, MY_SPACE_IDS, defaultLayout, normalizeMySpace, readMySpaceLayout, writeMySpaceLayout, type MySpaceLayout } from "@/components/my-space/registry";

const widget = z.object({ id: z.enum(MY_SPACE_IDS), visible: z.boolean(), size: z.enum(["small", "large"]) });
const input = z.union([
  z.object({ reset: z.literal(true) }),
  z.object({
    widgets: z.array(widget).max(50),
    sections: z.object({ today: z.boolean(), week: z.boolean() }).partial().optional(),
  }),
]);

/**
 * Save the My space layout (widget order, visibility and size, plus which page sections show),
 * or `{ reset: true }` for the default. Stored as `UserSettings.dashboardWidgets = { mySpace: { v: 2, … } }`;
 * an older Overview / plain-array layout is migrated (and dropped) on the first save.
 */
export const PUT = route(async ({ req, user }) => {
  const data = await body(req, input);
  let layout: MySpaceLayout;
  if ("reset" in data) layout = defaultLayout();
  else {
    // Sections not sent keep their saved value (so an old client that only sends widgets can't hide Today).
    const current = await db.userSettings.findUnique({ where: { userId: user.id }, select: { dashboardWidgets: true } });
    const saved = readMySpaceLayout(current?.dashboardWidgets).sections;
    layout = { sections: { ...DEFAULT_SECTIONS, ...saved, ...data.sections }, widgets: normalizeMySpace(data.widgets) };
  }
  const next = writeMySpaceLayout("reset" in data ? null : layout);
  const stored = next ? (next as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, dashboardWidgets: stored },
    update: { dashboardWidgets: stored },
  });
  return { layout };
});
