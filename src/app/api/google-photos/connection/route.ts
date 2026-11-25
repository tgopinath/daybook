import { route } from "@/lib/api";
import { clearToken } from "../_lib";

/** "Disconnect Google Photos": forgets the stored access token. */
export const DELETE = route(async ({ user }) => {
  await clearToken(user.id);
  return { ok: true };
});
