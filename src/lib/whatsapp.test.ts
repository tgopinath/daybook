import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory database (no DATABASE_URL) and placeholder WhatsApp credentials; fetch is mocked.
const saved = { ...process.env };
process.env.DATABASE_URL = "";
process.env.WHATSAPP_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

type Mods = { wa: typeof import("./whatsapp"); notify: typeof import("./notify")["notify"]; db: typeof import("./db")["db"] };
let m: Mods;
const calls: { url: string; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
  });
  m = { wa: await import("./whatsapp"), notify: (await import("./notify")).notify, db: (await import("./db")).db };
});
beforeEach(() => {
  calls.length = 0;
});
afterAll(() => {
  vi.unstubAllGlobals();
  process.env = saved;
});

describe("WhatsApp helpers", () => {
  it("normalises numbers that include a country code", () => {
    expect(m.wa.normalizeNumber("+91 98765 43210")).toBe("919876543210");
    expect(m.wa.normalizeNumber("0044 7700-900123")).toBe("447700900123");
    expect(m.wa.normalizeNumber("98765 43210")).toBeNull(); // no country code
    expect(m.wa.normalizeNumber("+0 123")).toBeNull();
    expect(m.wa.normalizeNumber("+1 2")).toBeNull();
  });

  it("cleans template parameters", () => {
    expect(m.wa.templateText("Pay\nbill\t now     please")).toBe("Pay bill now please");
    expect(m.wa.templateText("   ")).toBe("-");
    expect(m.wa.templateText("x".repeat(500), 10)).toHaveLength(10);
  });

  it("binds codes to the user and number", () => {
    const h = m.wa.hashCode("u1", "919876543210", "123456");
    expect(m.wa.codeMatches(h, "u1", "919876543210", "123456")).toBe(true);
    expect(m.wa.codeMatches(h, "u1", "919876543210", "654321")).toBe(false);
    expect(m.wa.codeMatches(h, "u2", "919876543210", "123456")).toBe(false);
    expect(m.wa.codeMatches(h, "u1", "447700900123", "123456")).toBe(false);
    expect(m.wa.newCode()).toMatch(/^\d{6}$/);
  });

  it("sends reminders and codes as approved templates", async () => {
    await m.wa.sendReminderMessage("919876543210", "Pay electricity bill", "Due 6:00 PM");
    await m.wa.sendVerificationCode("919876543210", "042137");
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    expect(calls[0]!.body).toMatchObject({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
      template: { name: "mydiary_reminder", language: { code: "en" } },
    });
    expect(JSON.stringify(calls[0]!.body)).toContain("Pay electricity bill");
    expect(calls[1]!.body).toMatchObject({ template: { name: "mydiary_verify" } });
    expect(JSON.stringify(calls[1]!.body)).toContain('"sub_type":"url"');
  });
});

describe("reminder delivery", () => {
  async function userWith(settings: Record<string, unknown>) {
    return m.db.user.create({
      data: { name: "W", email: `w${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "-", settings: { create: { browserNotifications: false, ...settings } } },
    });
  }

  it("sends reminders to a verified number that's switched on", async () => {
    const u = await userWith({ whatsappNumber: "919876543210", whatsappVerified: true, whatsappReminders: true });
    const row = await m.notify(u.id, { type: "REMINDER", title: "Drink water", body: "Every 2 hours" });
    expect(calls).toHaveLength(1);
    expect((await m.db.notification.findUnique({ where: { id: row!.id } }))?.whatsappSent).toBe(true);
  });

  it("doesn't send for unverified, switched-off or non-reminder notifications", async () => {
    const unverified = await userWith({ whatsappNumber: "919876543210", whatsappVerified: false, whatsappReminders: true });
    const off = await userWith({ whatsappNumber: "919876543210", whatsappVerified: true, whatsappReminders: false });
    const on = await userWith({ whatsappNumber: "919876543210", whatsappVerified: true, whatsappReminders: true });
    await m.notify(unverified.id, { type: "REMINDER", title: "a" });
    await m.notify(off.id, { type: "REMINDER", title: "b" });
    await m.notify(on.id, { type: "TASK_OVERDUE", title: "c" });
    expect(calls).toHaveLength(0);
  });

  it("stops at the daily cap", async () => {
    const u = await userWith({ whatsappNumber: "919876543210", whatsappVerified: true, whatsappReminders: true });
    await m.db.notification.createMany({ data: Array.from({ length: m.wa.DAILY_CAP }, () => ({ userId: u.id, type: "REMINDER" as const, title: "x", whatsappSent: true })) });
    const row = await m.notify(u.id, { type: "REMINDER", title: "over the cap" });
    expect(calls).toHaveLength(0);
    expect(row).not.toBeNull(); // the in-app notification is still created
  });
});
