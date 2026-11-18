import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { decryptJSON, encryptJSON } from "@/lib/crypto";
import { VAULT_BLOCK_MESSAGE, VAULT_CATEGORIES, vaultProblem, type VaultField } from "@/components/vault/guard";

export const fieldSchema = z.object({
  label: z.string().trim().min(1, "Every field needs a label").max(60),
  value: z.string().max(2000),
  sensitive: z.boolean(),
});
export const fieldsSchema = z.array(fieldSchema).max(40);
export const categorySchema = z.enum(VAULT_CATEGORIES);

export function assertAllowed(title: string, fields: VaultField[]) {
  const problem = vaultProblem(title, fields);
  if (problem) throw new ApiError(400, `${VAULT_BLOCK_MESSAGE}. ${problem}`);
}

export function readFields(enc: string): VaultField[] {
  try {
    return decryptJSON<VaultField[]>(enc);
  } catch {
    // Never log the payload itself.
    console.error("vault: could not decrypt an item");
    return [];
  }
}

export const sealFields = (fields: VaultField[]) => encryptJSON(fields);

/** Hide sensitive values for list responses; they are fetched one item at a time on reveal. */
export function redact(fields: VaultField[]) {
  return fields.map((f) => (f.sensitive ? { label: f.label, value: "", sensitive: true, hasValue: f.value.length > 0 } : { ...f, hasValue: f.value.length > 0 }));
}

export const NO_STORE = { "cache-control": "no-store, private" };
