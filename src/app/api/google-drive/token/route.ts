import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { DRIVE_UNAVAILABLE_MESSAGE, driveConnectUnavailable, gdRoute, readDriveToken } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's own short-lived Google Drive access token, for the Google Picker in their browser.
 * Never cached; 401 { reconnect: true } when there's no live connection.
 */
export const GET = gdRoute(async ({ user }) => {
  const reason = driveConnectUnavailable(user);
  if (reason) throw new ApiError(reason === "demo" ? 403 : 503, DRIVE_UNAVAILABLE_MESSAGE[reason]);
  const t = await readDriveToken(user.id);
  const headers = { "cache-control": "no-store, private", pragma: "no-cache" };
  if (!t) return NextResponse.json({ error: "Connect Google Drive to continue.", reconnect: true }, { status: 401, headers });
  return NextResponse.json({ accessToken: t.token, expiresAt: t.expiresAt }, { headers });
});
