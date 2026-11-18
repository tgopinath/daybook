import { query, route, tzOf } from "@/lib/api";
import { loadSeries } from "../_lib/series";
import { parseRange } from "../_lib/shared";

/** Chart series for the overview: ?range=7d|30d|90d|12m. */
export const GET = route(async ({ req, user }) => {
  const { stats } = await loadSeries(user.id, tzOf(req), parseRange(query(req).get("range")));
  return stats;
});
