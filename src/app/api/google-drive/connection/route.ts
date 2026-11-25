import { route } from "@/lib/api";
import { clearDriveToken } from "../_lib";

/** "Disconnect Google Drive": forgets the stored access token (shared with the Sheets export). */
export const DELETE = route(async ({ user }) => {
  await clearDriveToken(user.id);
  return { ok: true };
});
