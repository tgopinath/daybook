import { route, tzOf } from "@/lib/api";
import { computeInsights } from "@/lib/ai/insights";

export const dynamic = "force-dynamic";

export const GET = route(async ({ req, user }) => computeInsights(user.id, tzOf(req)));
