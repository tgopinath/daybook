import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it("names common browsers and systems", () => {
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36").label).toBe("Chrome on macOS");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0").label).toBe("Edge on Windows");
    const iphone = describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
    expect(iphone).toMatchObject({ label: "Safari on iOS", kind: "mobile" });
    expect(describeUserAgent("Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0")).toMatchObject({ label: "Firefox on Android", kind: "mobile" });
    expect(describeUserAgent("curl/8.7.1").label).toBe("curl");
    expect(describeUserAgent(null).label).toBe("Unknown device");
  });
});
