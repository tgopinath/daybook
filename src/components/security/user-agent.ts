// Simple, dependency-free user-agent summary for the session list ("Chrome on macOS").
// Order matters: Edge/Opera/Samsung include "Chrome", Chrome includes "Safari".

export type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown";

export function describeUserAgent(ua: string | null | undefined): { browser: string; os: string; kind: DeviceKind; label: string } {
  if (!ua) return { browser: "Unknown browser", os: "Unknown device", kind: "unknown", label: "Unknown device" };
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser\//.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : /curl\//i.test(ua)
                ? "curl"
                : "Browser";
  const os = /iPad/.test(ua)
    ? "iPadOS"
    : /iPhone|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "Unknown OS";
  const kind: DeviceKind = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "mobile" : os === "Unknown OS" ? "unknown" : "desktop";
  return { browser, os, kind, label: os === "Unknown OS" ? browser : `${browser} on ${os}` };
}
