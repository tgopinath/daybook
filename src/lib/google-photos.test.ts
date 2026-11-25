import { describe, expect, it, vi } from "vitest";
import {
  GooglePhotosError,
  PICKER_SCOPE,
  downloadItem,
  downloadUrl,
  downloadedMime,
  exchangePickerCode,
  gpAuthorizationUrl,
  gpRedirectUri,
  listPickedItems,
  newGpAttempt,
  parseDuration,
  parseMediaItems,
  parseSession,
  partitionImported,
  pickerFetch,
  pickerWindowUrl,
  safeReturnPath,
  type PickedItem,
} from "./google-photos";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const item = (over: Partial<PickedItem> = {}): PickedItem => ({
  id: "a",
  type: "PHOTO",
  createTime: "2023-06-01T10:00:00Z",
  baseUrl: "https://lh3.googleusercontent.com/abc",
  mimeType: "image/jpeg",
  filename: "IMG_1.jpg",
  width: 4000,
  height: 3000,
  videoReady: true,
  ...over,
});

describe("OAuth helpers", () => {
  it("builds the picker consent URL with PKCE, state, scope and login hint", () => {
    const a = newGpAttempt("u1", "/photos");
    const url = new URL(gpAuthorizationUrl(a, "cid", "https://app.test/api/google-photos/callback", "me@example.com"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("scope")).toBe(PICKER_SCOPE);
    expect(p.get("include_granted_scopes")).toBe("true");
    expect(p.get("login_hint")).toBe("me@example.com");
    expect(p.get("state")).toBe(a.state);
    expect(p.get("code_challenge")).toBe(a.challenge);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("redirect_uri")).toBe("https://app.test/api/google-photos/callback");
    expect(p.get("response_type")).toBe("code");
  });

  it("derives the callback from the request host unless APP_URL is set", () => {
    const req = { headers: new Headers({ host: "localhost:3300" }), nextUrl: new URL("http://localhost:3300/api/google-photos/connect") };
    const saved = process.env.APP_URL;
    delete process.env.APP_URL;
    expect(gpRedirectUri(req)).toBe("http://localhost:3300/api/google-photos/callback");
    process.env.APP_URL = "https://daybook.example/";
    expect(gpRedirectUri(req)).toBe("https://daybook.example/api/google-photos/callback");
    process.env.APP_URL = saved;
    if (saved === undefined) delete process.env.APP_URL;
  });

  it("only allows in-app return paths", () => {
    expect(safeReturnPath("/memories/abc")).toBe("/memories/abc");
    expect(safeReturnPath("//evil.com")).toBe("/photos");
    expect(safeReturnPath("https://evil.com")).toBe("/photos");
    expect(safeReturnPath("/api/x")).toBe("/photos");
    expect(safeReturnPath(null)).toBe("/photos");
  });

  it("exchanges the code and checks the granted scope", async () => {
    const f = vi.fn().mockResolvedValue(json({ access_token: "tok", expires_in: 3599, scope: `openid ${PICKER_SCOPE}` }));
    const r = await exchangePickerCode("code", "ver", "https://x/cb", { clientId: "c", clientSecret: "s" }, f);
    expect(r.accessToken).toBe("tok");
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3000_000);
    const body = String(f.mock.calls[0]![1].body);
    expect(body).toContain("code_verifier=ver");
    expect(body).toContain("grant_type=authorization_code");

    const denied = vi.fn().mockResolvedValue(json({ access_token: "tok", scope: "openid email" }));
    await expect(exchangePickerCode("c", "v", "r", { clientId: "c", clientSecret: "s" }, denied)).rejects.toMatchObject({ status: 403 });
    const bad = vi.fn().mockResolvedValue(json({ error: "invalid_grant", error_description: "Bad Request" }, 400));
    await expect(exchangePickerCode("c", "v", "r", { clientId: "c", clientSecret: "s" }, bad)).rejects.toThrow("Bad Request");
  });
});

describe("Picker responses", () => {
  it("parses a session and its polling config", () => {
    const s = parseSession({ id: "s1", pickerUri: "https://photos.google.com/picker/s1", mediaItemsSet: false, pollingConfig: { pollInterval: "3.5s", timeoutIn: "1800s" } });
    expect(s).toMatchObject({ id: "s1", mediaItemsSet: false, pollIntervalMs: 3500, timeoutMs: 1_800_000 });
    expect(parseSession({ id: "s1", pollingConfig: { pollInterval: "0.5s" } }).pollIntervalMs).toBe(2000);
    expect(() => parseSession({})).toThrow(GooglePhotosError);
    expect(pickerWindowUrl("https://photos.google.com/picker/s1/")).toBe("https://photos.google.com/picker/s1/autoclose");
    expect(parseDuration("nonsense", 42)).toBe(42);
  });

  it("parses media items, skipping malformed ones", () => {
    const r = parseMediaItems({
      mediaItems: [
        { id: "p1", type: "PHOTO", createTime: "2020-01-02T03:04:05Z", mediaFile: { baseUrl: "https://lh3/p1", mimeType: "image/HEIC", filename: "a.heic", mediaFileMetadata: { width: 4032, height: "3024" } } },
        { id: "v1", type: "VIDEO", createTime: "2021-05-05T00:00:00Z", mediaFile: { baseUrl: "https://lh3/v1", mimeType: "video/mp4", mediaFileMetadata: { videoMetadata: { processingStatus: "PROCESSING" } } } },
        { id: "bad", mediaFile: { baseUrl: "http://insecure" } },
        { type: "PHOTO" },
      ],
      nextPageToken: "next",
    });
    expect(r.nextPageToken).toBe("next");
    expect(r.items.map((i) => i.id)).toEqual(["p1", "v1"]);
    expect(r.items[0]).toMatchObject({ type: "PHOTO", mimeType: "image/heic", width: 4032, height: 3024, videoReady: true });
    expect(r.items[1]).toMatchObject({ type: "VIDEO", videoReady: false, filename: null });
  });

  it("lists every page of picked items", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ mediaItems: [{ id: "1", type: "PHOTO", mediaFile: { baseUrl: "https://lh3/1" } }], nextPageToken: "t2" }))
      .mockResolvedValueOnce(json({ mediaItems: [{ id: "2", type: "PHOTO", mediaFile: { baseUrl: "https://lh3/2" } }] }));
    const items = await listPickedItems("tok", "sess", f);
    expect(items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(String(f.mock.calls[0]![0])).toContain("sessionId=sess");
    expect(String(f.mock.calls[1]![0])).toContain("pageToken=t2");
    expect(f.mock.calls[0]![1].headers.authorization).toBe("Bearer tok");
  });

  it("maps Google errors truthfully; 401 asks to reconnect", async () => {
    const f401 = vi.fn().mockResolvedValue(json({ error: { message: "Invalid Credentials" } }, 401));
    await expect(pickerFetch("t", "/sessions", {}, f401)).rejects.toMatchObject({ status: 401, reconnect: true });
    const f400 = vi.fn().mockResolvedValue(json({ error: { message: "Session not ready" } }, 400));
    await expect(pickerFetch("t", "/sessions/x", {}, f400)).rejects.toThrow("Google Photos: Session not ready");
    const fApi = vi.fn().mockResolvedValue(json({ error: { message: "Photos Picker API has not been used in project 1 before or it is disabled." } }, 403));
    await expect(pickerFetch("t", "/sessions", {}, fApi)).rejects.toMatchObject({ status: 503 });
  });
});

describe("downloads and dedupe", () => {
  it("chooses download params per type", () => {
    expect(downloadUrl(item())).toBe("https://lh3.googleusercontent.com/abc=w2560-h2560");
    expect(downloadUrl(item({ type: "VIDEO" }))).toBe("https://lh3.googleusercontent.com/abc=dv");
  });

  it("prefers the response content type, then the item's", () => {
    expect(downloadedMime(item({ mimeType: "image/heic" }), "image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(downloadedMime(item({ mimeType: "image/png" }), "application/octet-stream")).toBe("image/png");
    expect(downloadedMime(item({ mimeType: "", type: "VIDEO" }), null)).toBe("video/mp4");
  });

  it("splits already-imported items and drops duplicates within a pick", () => {
    const { existing, fresh } = partitionImported([item({ id: "a" }), item({ id: "b" }), item({ id: "a" }), item({ id: "c" })], ["b"]);
    expect(existing.map((i) => i.id)).toEqual(["b"]);
    expect(fresh.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("downloads with the bearer token and enforces size limits", async () => {
    const f = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    const r = await downloadItem("tok", item(), 10, f);
    expect(r.bytes.length).toBe(3);
    expect(r.mimeType).toBe("image/jpeg");
    expect(f.mock.calls[0]![0]).toBe("https://lh3.googleusercontent.com/abc=w2560-h2560");
    expect(f.mock.calls[0]![1].headers.authorization).toBe("Bearer tok");

    const big = vi.fn().mockResolvedValue(new Response(new Uint8Array(20), { status: 200, headers: { "content-length": "20" } }));
    await expect(downloadItem("tok", item(), 10, big)).rejects.toMatchObject({ status: 413 });
  });
});
