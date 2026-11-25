import { describe, expect, it, vi } from "vitest";
import {
  DRIVE_SCOPE,
  EXPORT_LIMIT_BYTES,
  GoogleDriveError,
  downloadPlanned,
  driveError,
  exchangeDriveCode,
  exportTarget,
  fileDownloadUrl,
  fileExportUrl,
  fileMetaUrl,
  gdAuthorizationUrl,
  getFileMeta,
  importedName,
  newGdAttempt,
  normalizeMime,
  parseFileMeta,
  partitionDriveIds,
  planDownload,
  projectNumberFromClientId,
  safeDriveReturn,
} from "./google-drive";

const ID = "1AbCdEfGhIjKlMnOpQrStUv";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const max = (mime: string) => (mime === "application/zip" ? 100 : mime.startsWith("image/") ? 25 : mime.includes("officedocument") || mime === "application/pdf" || mime.startsWith("text/") ? 100 * 1024 * 1024 : null);

describe("export mapping", () => {
  it("maps Google Docs/Sheets/Slides to Office and Drawings to PDF", () => {
    expect(exportTarget("application/vnd.google-apps.document")?.ext).toBe("docx");
    expect(exportTarget("application/vnd.google-apps.spreadsheet")?.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(exportTarget("application/vnd.google-apps.presentation")?.ext).toBe("pptx");
    expect(exportTarget("application/vnd.google-apps.drawing")?.mimeType).toBe("application/pdf");
    expect(exportTarget("application/vnd.google-apps.form")).toBeNull();
    expect(exportTarget("application/pdf")).toBeNull();
  });

  it("plans an export for native docs with the export extension and 10 MB cap", () => {
    const plan = planDownload(parseFileMeta({ id: ID, name: "Budget 2026", mimeType: "application/vnd.google-apps.spreadsheet" }), max);
    expect(plan.name).toBe("Budget 2026.xlsx");
    expect(plan.maxBytes).toBe(EXPORT_LIMIT_BYTES);
    expect(plan.url).toContain(`/files/${ID}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`);
  });

  it("plans a plain download for regular files and checks size/type", () => {
    const plan = planDownload(parseFileMeta({ id: ID, name: "notes.md", mimeType: "application/octet-stream", size: "120" }), max);
    expect(plan.mimeType).toBe("text/markdown");
    expect(plan.url).toBe(`https://www.googleapis.com/drive/v3/files/${ID}?alt=media&supportsAllDrives=true`);
    expect(() => planDownload(parseFileMeta({ id: ID, name: "big.zip", mimeType: "application/zip", size: "101" }), max)).toThrow(/larger than/);
    expect(() => planDownload(parseFileMeta({ id: ID, name: "app.exe", mimeType: "application/x-msdownload", size: "10" }), max)).toThrow(/isn't supported/);
    expect(() => planDownload(parseFileMeta({ id: ID, name: "Form", mimeType: "application/vnd.google-apps.form" }), max)).toThrow(/can't be imported/);
    expect(() => planDownload(parseFileMeta({ id: ID, name: "x.txt", mimeType: "text/plain", trashed: true }), max)).toThrow(/trash/);
  });

  it("normalizes mime types and names", () => {
    expect(normalizeMime("image/jpg", "a.jpg")).toBe("image/jpeg");
    expect(normalizeMime("text/x-markdown; charset=utf-8", "a")).toBe("text/markdown");
    expect(normalizeMime("", "Report.DOCX")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(importedName("Notes", "docx")).toBe("Notes.docx");
    expect(importedName("Notes.docx", "docx")).toBe("Notes.docx");
    expect(importedName("a/b\\c\u0001", undefined)).toBe("a b c");
    expect(importedName("", undefined)).toBe("Untitled");
  });
});

describe("dedupe", () => {
  it("drops invalid ids, repeats, already-imported and skipped ids", () => {
    const r = partitionDriveIds([ID, ID, "bad id!", "2AbCdEfGhIjKlMnOpQrStUv", "3AbCdEfGhIjKlMnOpQrStUv"], ["2AbCdEfGhIjKlMnOpQrStUv"], ["3AbCdEfGhIjKlMnOpQrStUv"]);
    expect(r.unique).toEqual([ID, "2AbCdEfGhIjKlMnOpQrStUv", "3AbCdEfGhIjKlMnOpQrStUv"]);
    expect(r.existing).toEqual(["2AbCdEfGhIjKlMnOpQrStUv"]);
    expect(r.fresh).toEqual([ID]);
  });
});

describe("URL building", () => {
  it("builds the OAuth URL with drive.file only and PKCE", () => {
    const a = newGdAttempt("u1", "/drive");
    const url = new URL(gdAuthorizationUrl(a, "123-abc.apps.googleusercontent.com", "https://x.test/api/google-drive/callback", "me@x.test"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(DRIVE_SCOPE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(a.state);
    expect(url.searchParams.get("login_hint")).toBe("me@x.test");
  });

  it("refuses ids that aren't Drive ids", () => {
    expect(() => fileDownloadUrl("../../etc")).toThrow(GoogleDriveError);
    expect(() => fileExportUrl("a b", "application/pdf")).toThrow(GoogleDriveError);
    expect(fileMetaUrl(ID)).toContain("fields=id%2Cname%2CmimeType%2Csize");
  });

  it("derives the project number and keeps return paths in the app", () => {
    expect(projectNumberFromClientId("987654321-xyz.apps.googleusercontent.com")).toBe("987654321");
    expect(projectNumberFromClientId("abc")).toBeNull();
    expect(safeDriveReturn("/drive?x=1")).toBe("/drive?x=1");
    expect(safeDriveReturn("//evil.com")).toBe("/drive");
    expect(safeDriveReturn("https://evil.com")).toBe("/drive");
    expect(safeDriveReturn("/api/google-drive/token")).toBe("/drive");
  });
});

describe("Google API calls (mocked fetch)", () => {
  it("exchanges the code and checks the granted scope", async () => {
    const f = vi.fn().mockResolvedValue(json({ access_token: "tok", expires_in: 3599, scope: `openid ${DRIVE_SCOPE}` }));
    const r = await exchangeDriveCode("code", "ver", "https://x.test/cb", { clientId: "c", clientSecret: "s" }, f);
    expect(r.accessToken).toBe("tok");
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3000_000);
    const body = f.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get("code_verifier")).toBe("ver");
    const denied = vi.fn().mockResolvedValue(json({ access_token: "tok", scope: "openid" }));
    await expect(exchangeDriveCode("c", "v", "r", { clientId: "c", clientSecret: "s" }, denied)).rejects.toMatchObject({ status: 403 });
  });

  it("reads metadata and maps 401 to reconnect", async () => {
    const ok = vi.fn().mockResolvedValue(json({ id: ID, name: "a.pdf", mimeType: "application/pdf", size: "42" }));
    const meta = await getFileMeta("tok", ID, ok);
    expect(meta).toMatchObject({ id: ID, size: 42, canDownload: true });
    expect(ok.mock.calls[0]![1].headers.authorization).toBe("Bearer tok");
    const expired = vi.fn().mockResolvedValue(json({ error: { message: "Invalid Credentials" } }, 401));
    await expect(getFileMeta("tok", ID, expired)).rejects.toMatchObject({ reconnect: true });
  });

  it("maps Drive API errors", () => {
    expect(driveError(403, { error: { message: "Google Drive API has not been used in project 1" } }).status).toBe(503);
    expect(driveError(403, { error: { message: "x", errors: [{ reason: "exportSizeLimitExceeded" }] } }).status).toBe(413);
    expect(driveError(404, {}).status).toBe(404);
    expect(driveError(500, {}).status).toBe(502);
  });

  it("downloads bytes and enforces the size cap", async () => {
    const plan = { url: fileDownloadUrl(ID), mimeType: "text/plain", name: "a.txt", maxBytes: 5 };
    const ok = vi.fn().mockResolvedValue(new Response("hey"));
    expect(new TextDecoder().decode(await downloadPlanned("tok", plan, ok))).toBe("hey");
    const big = vi.fn().mockResolvedValue(new Response("123456"));
    await expect(downloadPlanned("tok", plan, big)).rejects.toMatchObject({ status: 413 });
    const declared = vi.fn().mockResolvedValue(new Response("1", { headers: { "content-length": "999" } }));
    await expect(downloadPlanned("tok", plan, declared)).rejects.toMatchObject({ status: 413 });
    const empty = vi.fn().mockResolvedValue(new Response(""));
    await expect(downloadPlanned("tok", plan, empty)).rejects.toMatchObject({ status: 502 });
  });
});
