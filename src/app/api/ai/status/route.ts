import { route } from "@/lib/api";
import { aiStatus } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export const GET = route(async () => aiStatus());
