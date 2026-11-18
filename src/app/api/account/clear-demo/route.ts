import { route } from "@/lib/api";
import { clearDemoData } from "@/lib/demo";

export const POST = route(async ({ user }) => {
  await clearDemoData(user.id);
  return { ok: true };
});
