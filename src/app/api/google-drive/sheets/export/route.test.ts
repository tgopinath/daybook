import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";
import { NextRequest } from "next/server";

// Route-level check of the reconnect contract with Google configured but no stored token.
const user = { id: "u1", email: "someone@example.com", name: "Someone" };
const settings: { googleDriveTokenEnc: string | null; googleDriveTokenExpires: Date | null } = { googleDriveTokenEnc: null, googleDriveTokenExpires: null };
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => user }));
vi.mock("@/lib/db", () => ({
  db: {
    userSettings: { findUnique: async () => settings, updateMany: async () => ({ count: 1 }) },
    transaction: { findMany: async () => [] },
    financeAccount: { findMany: async () => [] },
  },
}));

process.env.GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "secret";
process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const req = (body: unknown) =>
  new NextRequest("http://localhost:3300/api/google-drive/sheets/export", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3300", host: "localhost:3300" }, body: JSON.stringify(body) });

describe("POST /api/google-drive/sheets/export", () => {
  beforeEach(() => {
    settings.googleDriveTokenEnc = null;
    settings.googleDriveTokenExpires = null;
  });
  it("answers 401 { reconnect: true } without a token", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ from: "2026-11-01", to: "2026-11-30" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });
  it("answers 401 { reconnect: true } when the token expired", async () => {
    const { encrypt } = await import("@/lib/crypto");
    settings.googleDriveTokenEnc = encrypt("tok");
    settings.googleDriveTokenExpires = new Date(Date.now() - 1000);
    const { POST } = await import("./route");
    const res = await POST(req({}), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reconnect: true });
  });
  it("validates the range", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ from: "2026-11-30", to: "2026-11-01" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});
