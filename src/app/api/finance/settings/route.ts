import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";
import { isCurrency } from "@/lib/money";
import { sheetsStatus } from "@/app/api/google-drive/sheets/_lib";
import { userCurrency } from "../_lib";

/** Finance settings: currency and whether Google Sheets export can work. */
export const GET = route(async ({ user }) => {
  const [currency, sheets] = await Promise.all([userCurrency(user.id), sheetsStatus(user)]);
  return { currency, sheets };
});

const schema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCurrency, "Choose a valid ISO 4217 currency code (e.g. INR, USD)"),
});

/** Changing the currency relabels amounts; it never converts them. */
export const PATCH = route(async ({ req, user }) => {
  const { currency } = await body(req, schema);
  await db.userSettings.upsert({ where: { userId: user.id }, update: { currency }, create: { userId: user.id, currency } });
  return { currency };
});
