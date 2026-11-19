/* MyDiary service worker: Web Push notifications only (no offline caching). */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function safeLink(link) {
  // Only in-app paths; never follow absolute URLs from a payload.
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : "/";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MyDiary", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MyDiary";
  const actions = Array.isArray(data.actions) && data.notificationId ? data.actions.slice(0, 2) : [];
  const options = {
    body: data.body || "",
    tag: data.tag || data.notificationId || undefined,
    renotify: !!data.tag,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { link: safeLink(data.link), notificationId: data.notificationId || null },
    actions,
    requireInteraction: actions.length > 0,
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Let open tabs refresh the bell immediately.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach((c) => c.postMessage({ type: "daybook:push" }));
    })(),
  );
});

async function callApi(id, payload) {
  try {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const { link, notificationId } = n.data || {};
  n.close();

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      if (event.action === "snooze" || event.action === "done") {
        if (notificationId) {
          const ok = await callApi(notificationId, { action: event.action });
          if (!ok) {
            // Signed out or offline: open the app so the user can act there.
            if (wins[0]) return wins[0].focus();
            return self.clients.openWindow(safeLink(link));
          }
        }
        wins.forEach((c) => c.postMessage({ type: "daybook:refresh" }));
        return;
      }

      if (notificationId) await callApi(notificationId, { read: true });
      const target = safeLink(link);
      const win = wins.find((c) => "focus" in c);
      if (win) {
        await win.focus();
        win.postMessage({ type: "daybook:navigate", link: target });
        return;
      }
      return self.clients.openWindow(target);
    })(),
  );
});
