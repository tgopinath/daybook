import { describe, expect, it } from "vitest";
import { parseAppLinks } from "./parse-app-links";

describe("parseAppLinks", () => {
  it("understands the common formats", () => {
    const r = parseAppLinks(`Word Wonders - https://word.example.com/
https://money.example.com/app Money Master
Puzzle Quest | https://puzzle.example.com | A puzzle game for kids
https://tgopinath.github.io/kaadu/
http://insecure.example.com/x
just some text`);
    expect(r[0]).toMatchObject({ name: "Word Wonders", url: "https://word.example.com/" });
    expect(r[1]).toMatchObject({ name: "Money Master", url: "https://money.example.com/app" });
    expect(r[2]).toMatchObject({ name: "Puzzle Quest", url: "https://puzzle.example.com", description: "A puzzle game for kids" });
    expect(r[3]).toMatchObject({ name: "Kaadu", url: "https://tgopinath.github.io/kaadu/" });
    expect(r[4]!.url).toBe("https://insecure.example.com/x");
    expect(r[5]!.error).toBeTruthy();
  });
});
