import { route } from "@/lib/api";
import { sheetsStatus } from "../_lib";

/** Whether Sheets export can work here and whether a live Google (drive.file) connection exists. */
export const GET = route(async ({ user }) => sheetsStatus(user));
