import { describe, expect, it } from "vitest";
import { cleanName, descendantIds, folderPath, folderPathLabel, formatBytes, subtreeDepth, typeLabel, wouldCreateCycle } from "./drive";

const folders = [
  { id: "a", parentId: null, name: "Trips" },
  { id: "b", parentId: "a", name: "2026" },
  { id: "c", parentId: "b", name: "Goa" },
  { id: "d", parentId: null, name: "Work" },
];

describe("folder tree helpers", () => {
  it("builds paths and labels", () => {
    expect(folderPath(folders, "c").map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(folderPathLabel(folders, "c")).toBe("Trips / 2026 / Goa");
    expect(folderPath(folders, null)).toEqual([]);
  });

  it("finds descendants and prevents cycles", () => {
    expect(descendantIds(folders, ["a"]).sort()).toEqual(["b", "c"]);
    expect(wouldCreateCycle(folders, "a", "c")).toBe(true);
    expect(wouldCreateCycle(folders, "a", "a")).toBe(true);
    expect(wouldCreateCycle(folders, "c", "d")).toBe(false);
    expect(wouldCreateCycle(folders, "c", null)).toBe(false);
    expect(subtreeDepth(folders, "a")).toBe(3);
  });

  it("survives a corrupted cycle", () => {
    const loop = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect(folderPath(loop, "x").length).toBe(2);
    expect(descendantIds(loop, ["x"])).toEqual(["y"]);
  });
});

describe("formatting", () => {
  it("cleans names", () => {
    expect(cleanName("  a/b  ")).toBe("a-b");
    expect(cleanName("..")).toBeNull();
    expect(cleanName("   ")).toBeNull();
  });
  it("formats bytes and types", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
    expect(typeLabel("application/pdf", "document")).toBe("PDF");
    expect(typeLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "file")).toBe("Spreadsheet");
  });
});
