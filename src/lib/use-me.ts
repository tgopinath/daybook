"use client";
import type { User, UserSettings } from "@prisma/client";
import { useApi, type Wire } from "./client";

export type Me = {
  user: Wire<Pick<User, "id" | "email" | "name" | "avatarUrl" | "createdAt">>;
  settings: Wire<UserSettings>;
  hasDemoData: boolean;
  /** WhatsApp Cloud API credentials are configured on the server. */
  whatsappAvailable?: boolean;
  /** How this account signs in. `demo` = throwaway sample account from "Explore demo". */
  account?: { hasPassword: boolean; google: boolean; demo: boolean; twoFactor?: boolean };
  /** App lock after this many idle minutes; 0 = off. */
  appLock?: number;
};

export function useMe() {
  return useApi<Me>("/api/me");
}

/** The user's timezone from settings, falling back to the browser. */
export function useTz() {
  const { data } = useMe();
  if (data?.settings.timezone && data.settings.timezone !== "UTC") return data.settings.timezone;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
