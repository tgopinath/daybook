import { route } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = route(async ({ user }) => {
  const rows = await db.aIConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { messages: { where: { role: "USER" }, orderBy: { createdAt: "desc" }, take: 1, select: { content: true } } },
  });
  return {
    items: rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      preview: c.messages[0]?.content.slice(0, 120) ?? "",
    })),
  };
});
