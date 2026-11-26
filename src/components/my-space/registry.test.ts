import { describe, expect, it } from "vitest";
import { DEFAULT_MY_SPACE, readMySpaceLayout, writeMySpaceLayout } from "./registry";

describe("My space layout storage", () => {
  it("defaults when nothing is stored", () => {
    const l = readMySpaceLayout(null);
    expect(l.sections).toEqual({ today: true, week: true });
    expect(l.widgets).toEqual(DEFAULT_MY_SPACE);
  });

  it("reads an old plain-array Overview layout (sections from its widgets)", () => {
    const l = readMySpaceLayout([
      { id: "focus", visible: false },
      { id: "upcoming", visible: false },
      { id: "mood", visible: false },
      { id: "week", visible: true },
    ]);
    expect(l.sections).toEqual({ today: false, week: true });
    expect(l.widgets).toEqual(DEFAULT_MY_SPACE);
  });

  it("reads the pre-merge { overview, mySpace: [...] } shape and drops the old mood widget", () => {
    const l = readMySpaceLayout({
      overview: [{ id: "productivity", visible: false }, { id: "week", visible: false }],
      mySpace: [
        { id: "mood", visible: true, size: "small" },
        { id: "notes", visible: false, size: "large" },
        { id: "tasks", visible: true, size: "small" },
      ],
    });
    expect(l.sections).toEqual({ today: true, week: false });
    expect(l.widgets.find((w) => w.id === "notes")).toEqual({ id: "notes", visible: false, size: "large" });
    expect(l.widgets.find((w) => w.id === "tasks")).toEqual({ id: "tasks", visible: true, size: "small" });
    // The user's order is kept (notes before tasks); widgets they never saw are slotted in around them.
    expect(l.widgets.findIndex((w) => w.id === "notes")).toBeLessThan(l.widgets.findIndex((w) => w.id === "tasks"));
    expect(l.widgets.some((w) => (w.id as string) === "mood")).toBe(false);
    expect(l.widgets).toHaveLength(DEFAULT_MY_SPACE.length);
  });

  it("round-trips the current shape", () => {
    const layout = { sections: { today: true, week: false }, widgets: DEFAULT_MY_SPACE.map((w) => ({ ...w, visible: w.id !== "vault" })) };
    expect(readMySpaceLayout(writeMySpaceLayout(layout))).toEqual(layout);
    expect(writeMySpaceLayout(null)).toBeNull();
  });
});
