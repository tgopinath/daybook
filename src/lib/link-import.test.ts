import { readFileSync, existsSync } from "fs";
import { describe, expect, it } from "vitest";
import { extractAppCards } from "./link-import";

const sample = `
<main>
  <article class="card"><h3>Wake Me There</h3><p>A location-based travel alarm.</p>
    <a href="https://github.com/me/wmt/releases/latest/download/app.apk">Download for Android</a>
    <a href="https://wake-me-there.vercel.app">Open the live app ↗</a><a href="#">Open the project</a></article>
  <article class="card"><h3>Vanam &amp; friends</h3><p>A field guide for kids.</p>
    <a href="https://github.com/me/vanam">Source</a></article>
  <article class="card"><h3>No link here</h3><p>Coming soon.</p></article>
</main><script>var x = "<article><h3>fake</h3><a href='https://evil.example'>x</a></article>"</script>`;

describe("extractAppCards", () => {
  it("turns project cards into apps, preferring the live link", () => {
    const r = extractAppCards(sample, "https://me.github.io/projects/");
    expect(r).toEqual([
      { name: "Wake Me There", url: "https://wake-me-there.vercel.app/", description: "A location-based travel alarm.", image: null },
      { name: "Vanam & friends", url: "https://github.com/me/vanam", description: "A field guide for kids.", image: null },
    ]);
  });

  it("keeps a card's screenshot and finds a page's share image or icon", async () => {
    const { findThumbnail } = await import("./link-import");
    const r = extractAppCards(`<article><h3>A</h3><img src="/shots/a.jpg" width="600"><a href="https://a.example.com">Open the live app</a></article><article><h3>B</h3><a href="https://b.example.com">Open</a></article>`, "https://me.github.io/p/");
    expect(r[0]!.image).toBe("https://me.github.io/shots/a.jpg");
    expect(findThumbnail(`<meta property="og:image" content="/og.png"><link rel="apple-touch-icon" href="icon-512.png">`, "https://x.example.com/app/")).toBe("https://x.example.com/og.png");
    expect(findThumbnail(`<link rel="icon" href="icon.svg"><link rel="apple-touch-icon" href="icon-512.png">`, "https://x.example.com/")).toBe("https://x.example.com/icon-512.png");
    expect(findThumbnail(`<title>x</title>`, "https://x.example.com/")).toBeNull();
  });

  it("falls back to outbound links when there are no cards", () => {
    const r = extractAppCards(`<p><a href="https://a.example.com/x">Alpha app</a> <a href="/about">About</a> <a href="https://b.example.com">Beta</a></p>`, "https://me.example.com/");
    expect(r.map((x) => x.name)).toEqual(["Alpha app", "Beta"]);
  });

  it("reads a real portfolio page when available", () => {
    const f = "/tmp/pp.html";
    if (!existsSync(f)) return;
    const r = extractAppCards(readFileSync(f, "utf8"), "https://tgopinath.github.io/PetProjects/");
    expect(r.length).toBeGreaterThanOrEqual(10);
    expect(r.find((x) => x.name === "Wake Me There")?.url).toBe("https://wake-me-there.vercel.app/");
  });
});
