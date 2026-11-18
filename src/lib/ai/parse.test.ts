import { describe, expect, it } from "vitest";
import { parseCapture, isUnambiguous, describeCaptureRecurrence } from "./parse";

// Tuesday 17 Nov 2026, 10:00 in Asia/Kolkata (04:30 UTC).
const NOW = new Date("2026-11-17T04:30:00Z");
const TZ = "Asia/Kolkata";
const parse = (t: string) => parseCapture(t, NOW, TZ);

describe("parseCapture — spec examples", () => {
  it("Call John tomorrow at 10 AM", () => {
    const p = parse("Call John tomorrow at 10 AM");
    expect(p.intent).toBe("task");
    expect(p.title).toBe("Call John");
    expect(p.date).toBe("2026-11-18");
    expect(p.time).toBe("10:00");
    expect(p.recurrence.kind).toBe("NONE");
    expect(p.category).toBe("Personal");
    expect(p.confidence).toBe("high");
    expect(isUnambiguous(p)).toBe(true);
  });

  it("Complete portfolio by December 10", () => {
    const p = parse("Complete portfolio by December 10");
    expect(p.intent).toBe("task");
    expect(p.title).toBe("Complete portfolio");
    expect(p.date).toBe("2026-12-10");
    expect(p.time).toBeNull();
    expect(p.category).toBe("Work");
  });

  it("Read 20 pages every day", () => {
    const p = parse("Read 20 pages every day");
    expect(p.intent).toBe("habit");
    expect(p.title).toBe("Read 20 pages");
    expect(p.recurrence).toEqual({ kind: "DAILY" });
    expect(p.date).toBeNull();
    expect(p.category).toBe("Learning");
    expect(isUnambiguous(p)).toBe(false);
  });

  it("Pay electricity bill on Friday", () => {
    const p = parse("Pay electricity bill on Friday");
    expect(p.intent).toBe("task");
    expect(p.title).toBe("Pay electricity bill");
    expect(p.date).toBe("2026-11-20");
    expect(p.recurrence.kind).toBe("NONE");
    expect(p.category).toBe("Finance");
  });

  it("Buy groceries this evening", () => {
    const p = parse("Buy groceries this evening");
    expect(p.intent).toBe("task");
    expect(p.title).toBe("Buy groceries");
    expect(p.date).toBe("2026-11-17");
    expect(p.time).not.toBeNull();
    expect(Number(p.time!.slice(0, 2))).toBeGreaterThanOrEqual(17);
    expect(p.category).toBe("Shopping");
  });
});

describe("parseCapture — recurrence, priority, intent", () => {
  it("drink water every two hours → hourly reminder", () => {
    const p = parse("Remind me to drink water every two hours");
    expect(p.intent).toBe("reminder");
    expect(p.title).toBe("Drink water");
    expect(p.recurrence).toEqual({ kind: "HOURLY", intervalMinutes: 120 });
    expect(describeCaptureRecurrence(p.recurrence)).toBe("Every 2 hours");
  });

  it("every Monday → weekly on Monday", () => {
    const p = parse("Team standup every Monday at 9am");
    expect(p.recurrence).toEqual({ kind: "WEEKLY", daysOfWeek: [1] });
    expect(p.time).toBe("09:00");
    expect(p.intent).toBe("event");
  });

  it("weekly keyword", () => {
    expect(parse("Water the plants weekly").recurrence.kind).toBe("WEEKLY");
  });

  it("urgent → HIGH priority and is stripped from the title", () => {
    const p = parse("Urgent: send invoice to client tomorrow");
    expect(p.priority).toBe("HIGH");
    expect(p.title).toBe("Send invoice to client");
    expect(p.date).toBe("2026-11-18");
  });

  it("note prefix", () => {
    const p = parse("note: try the new onboarding copy");
    expect(p.intent).toBe("note");
    expect(p.title).toBe("Try the new onboarding copy");
  });

  it("empty input is low confidence", () => {
    expect(parse("   ").confidence).toBe("low");
  });
});
