import { z } from "zod";

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url("Enter a full link starting with https://")
  .refine((u) => u.startsWith("https://"), "Use a secure link that starts with https://");

export const linkInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  url: httpsUrl,
  description: z.string().trim().max(240).nullish(),
  emoji: z.string().trim().max(8).nullish(),
});

export const linkPatch = linkInput.partial();
