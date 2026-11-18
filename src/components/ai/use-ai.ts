"use client";
import { useApi } from "@/lib/client";
import type { AIStatus } from "@/lib/ai/types";

/** Whether an AI provider key is configured on the server. */
export function useAIStatus() {
  const { data, isLoading, error } = useApi<AIStatus>("/api/ai/status", { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return { status: data, configured: !!data?.configured, loading: isLoading, error };
}
