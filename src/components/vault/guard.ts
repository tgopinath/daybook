// Shared by the vault API (hard reject) and the vault UI (inline warning).
// The vault is for personal reference information, never for secrets that
// unlock money or accounts. No "server-only"/"use client" so both sides can import.

export type VaultField = { label: string; value: string; sensitive: boolean };

export const VAULT_BLOCK_MESSAGE = "Passwords and financial credentials don't belong here — use a password manager";

export const VAULT_CATEGORIES = [
  "Profile",
  "Emergency contact",
  "Phone",
  "Address",
  "Family",
  "Important date",
  "Vehicle",
  "Insurance",
  "Subscription",
  "Document",
  "Custom",
] as const;
export type VaultCategory = (typeof VAULT_CATEGORIES)[number];

/** Sensible starting fields per category. */
export const VAULT_TEMPLATES: Record<VaultCategory, { label: string; sensitive?: boolean }[]> = {
  Profile: [{ label: "Full name" }, { label: "Date of birth" }, { label: "Blood group" }, { label: "Allergies" }],
  "Emergency contact": [{ label: "Phone" }, { label: "Relationship" }, { label: "Alternate phone" }],
  Phone: [{ label: "Number" }, { label: "Notes" }],
  Address: [{ label: "Street" }, { label: "City" }, { label: "PIN / ZIP code" }, { label: "Country" }],
  Family: [{ label: "Relationship" }, { label: "Date of birth" }, { label: "Phone" }],
  "Important date": [{ label: "Date" }, { label: "Notes" }],
  Vehicle: [{ label: "Registration" }, { label: "Make / Model" }, { label: "Insurance expiry" }, { label: "Next service" }],
  Insurance: [{ label: "Provider" }, { label: "Policy number", sensitive: true }, { label: "Renewal date" }, { label: "Helpline" }],
  Subscription: [{ label: "Plan" }, { label: "Cost" }, { label: "Renews" }],
  Document: [{ label: "Document number", sensitive: true }, { label: "Issued" }, { label: "Expires" }, { label: "Kept at" }],
  Custom: [{ label: "Details" }],
};

const LABEL_RULES: [RegExp, string][] = [
  [/pass\s*(word|wd|code|phrase)|\bpwd\b/i, "a password"],
  [/\bpin\b(?!\s*(code\b|\/|or\b))|\bm-?pin\b|\batm\s*pin\b/i, "a PIN"],
  [/\bcvv2?\b|\bcvc\b|\bcsc\b|security\s*code/i, "a card security code"],
  [/(credit|debit)\s*card|card\s*(no|num|number)|\bcard\s*#/i, "a card number"],
  [/bank.*(account|a\/c|acct)|(account|a\/c|acct).*bank|\biban\b|\bifsc\b|routing|sort\s*code|\bswift\b|\bbic\b/i, "bank account details"],
  [/api[\s_-]*key|secret|access[\s_-]*token|auth[\s_-]*token|bearer|private[\s_-]*key|seed\s*phrase|recovery\s*phrase|mnemonic|\botp\b|2fa\s*(code|backup)|backup\s*codes?/i, "a secret key or token"],
];

function luhn(digits: string) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const PHONE_LABEL = /phone|mobile|\btel\b|whatsapp|contact|helpline|fax|landline/i;

function valueReason(label: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/\b(password|passwd|pwd|pin|cvv|otp)\s*[:=]/i.test(v)) return "a password or PIN";
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v)) return "a private key";
  if (/\b(sk|rk)[-_](live|test|proj|ant)[-_A-Za-z0-9]{8,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{30,}/.test(v)) return "an API key";
  if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase()) && /\d/.test(v) && v.length === 11) return "an IFSC code";
  if (/^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{11,30}$/.test(v) && /^[A-Z]{2}\d{2}/i.test(v) && v.replace(/\s/g, "").length >= 15 && /\d{6,}/.test(v.replace(/\s/g, ""))) return "an IBAN";
  // Card numbers: 13–19 digits, separators allowed, passing the Luhn check.
  if (/^[\d\s-]+$/.test(v) && !v.startsWith("+") && !PHONE_LABEL.test(label)) {
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "a card number";
  }
  // Long random-looking tokens (letters + digits, no spaces).
  if (/^[A-Za-z0-9_\-+/=]{32,}$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v)) return "a secret key or token";
  return null;
}

/** Returns a human message when the field looks like a credential, else null. */
export function fieldProblem(label: string, value: string): string | null {
  for (const [re, what] of LABEL_RULES) if (re.test(label)) return `"${label || "Field"}" looks like ${what}.`;
  const r = valueReason(label, value);
  return r ? `"${label || "Field"}" looks like ${r}.` : null;
}

/** First problem in an item (title + fields), or null when it is fine to store. */
export function vaultProblem(title: string, fields: VaultField[]): string | null {
  for (const [re, what] of LABEL_RULES) if (re.test(title)) return `The title looks like it describes ${what}.`;
  for (const f of fields) {
    const p = fieldProblem(f.label, f.value);
    if (p) return p;
  }
  return null;
}
