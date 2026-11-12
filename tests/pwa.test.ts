import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { appManifest } from "@/lib/pwa-manifest";
import { GET as offline } from "@/app/offline/route";
type RequestLike = { url: string; method?: string; mode?: string };
function worker() {
  const events = new Map<string, (event: Record<string, unknown>) => void>(),
    stored = new Map<string, Response>();
  const key = (request: string | RequestLike) =>
    new URL(
      typeof request === "string" ? request : request.url,
      "https://example.com",
    ).href;
  const cache = {
    addAll: vi.fn(async (paths: string[]) => {
      for (const path of paths)
        stored.set(
          key(path),
          new Response(path === "/offline" ? "offline-screen" : "public-asset"),
        );
    }),
    match: vi.fn(async (request: string | RequestLike) =>
      stored.get(key(request))?.clone(),
    ),
    put: vi.fn(async (request: string | RequestLike, response: Response) => {
      stored.set(key(request), response);
    }),
    keys: vi.fn(async () => [...stored.keys()]),
    delete: vi.fn(async (request: string | RequestLike) =>
      stored.delete(key(request)),
    ),
  };
  const cacheApi = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ["bt-public-v0", "bt-public-v1", "another-app"]),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn(
    async (_request: RequestLike) => new Response("online-private-data"),
  );
  const clients = {
    claim: vi.fn(async () => {}),
    matchAll: vi.fn(
      async () =>
        [] as {
          url: string;
          focus: () => Promise<void>;
          postMessage: (message: unknown) => void;
        }[],
    ),
    openWindow: vi.fn(async () => {}),
  };
  const notification = vi.fn(async () => {}),
    skipWaiting = vi.fn(async () => {});
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://example.com" },
      addEventListener: (
        name: string,
        handler: (event: Record<string, unknown>) => void,
      ) => events.set(name, handler),
      clients,
      skipWaiting,
      registration: { showNotification: notification },
    },
    caches: cacheApi,
    fetch,
    URL,
    Response,
  });
  function dispatch(type: string, extra: Record<string, unknown> = {}) {
    let response: Promise<Response> | undefined;
    const tasks: Promise<unknown>[] = [];
    events.get(type)!({
      ...extra,
      waitUntil: (value: Promise<unknown>) => tasks.push(value),
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    return { response, done: Promise.all(tasks) };
  }
  return {
    dispatch,
    cache,
    cacheApi,
    fetch,
    stored,
    clients,
    notification,
    skipWaiting,
  };
}
describe("Installable ERP application", () => {
  it("provides Arabic standalone identity and correctly sized PNG icons", () => {
    const manifest = appManifest();
    expect(manifest).toMatchObject({
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "ar",
      dir: "rtl",
    });
    for (const icon of manifest.icons!) {
      const data = readFileSync("public" + icon.src),
        size = Number(icon.sizes!.split("x")[0]);
      expect(data.subarray(1, 4).toString()).toBe("PNG");
      expect(data.readUInt32BE(16)).toBe(size);
      expect(data.readUInt32BE(20)).toBe(size);
    }
    expect(manifest.icons!.some((icon) => icon.purpose === "maskable")).toBe(
      true,
    );
  });
  it("serves a functional offline screen without account information or scripts", async () => {
    const response = offline(new Request("https://example.com/offline")),
      html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("gm@");
  });
});
describe("Service worker isolation", () => {
  it("precaches only public files and removes only its obsolete caches", async () => {
    const sw = worker();
    await sw.dispatch("install").done;
    await sw.dispatch("activate").done;
    expect(sw.cache.addAll).toHaveBeenCalledWith([
      "/offline",
      "/offline?lang=en",
      "/icon.svg",
      "/pwa-192.png",
      "/pwa-512.png",
      "/pwa-maskable.png",
    ]);
    expect(sw.cacheApi.delete).toHaveBeenCalledTimes(2);
    expect(sw.cacheApi.delete).toHaveBeenCalledWith("bt-public-v1");
    expect(sw.cacheApi.delete).toHaveBeenCalledWith("bt-public-v0");
    expect(sw.clients.claim).toHaveBeenCalled();
  });
  it("never caches authenticated navigation, RSC responses, attachments, or API calls", async () => {
    const sw = worker();
    await sw.dispatch("install").done;
    const navigation = sw.dispatch("fetch", {
      request: {
        url: "https://example.com/requests/private",
        method: "GET",
        mode: "navigate",
      },
    });
    expect(await (await navigation.response!).text()).toBe(
      "online-private-data",
    );
    for (const path of [
      "/api/attachments/id",
      "/api/options?resource=users",
      "/requests?_rsc=private",
    ])
      expect(
        sw.dispatch("fetch", {
          request: {
            url: "https://example.com" + path,
            method: "GET",
            mode: "cors",
          },
        }).response,
      ).toBeUndefined();
    expect(sw.cache.put).not.toHaveBeenCalled();
    expect(sw.stored.has("https://example.com/requests/private")).toBe(false);
  });
  it("returns only the public offline screen for failed navigation", async () => {
    const sw = worker();
    await sw.dispatch("install").done;
    sw.fetch.mockRejectedValue(new TypeError("Offline"));
    const result = sw.dispatch("fetch", {
      request: {
        url: "https://example.com/users",
        method: "GET",
        mode: "navigate",
      },
    });
    expect(await (await result.response!).text()).toBe("offline-screen");
  });
  it("caches immutable bundles with a bound and tolerates cache write failures", async () => {
    const sw = worker();
    await sw.dispatch("install").done;
    for (let index = 0; index < 82; index++)
      await sw.dispatch("fetch", {
        request: {
          url: `https://example.com/_next/static/${index}.js`,
          method: "GET",
          mode: "cors",
        },
      }).response;
    expect(sw.stored.size).toBeLessThanOrEqual(80);
    expect(sw.stored.has("https://example.com/offline")).toBe(true);
    sw.cache.put.mockRejectedValueOnce(new Error("Quota exceeded"));
    const result = sw.dispatch("fetch", {
      request: {
        url: "https://example.com/_next/static/new.js",
        method: "GET",
        mode: "cors",
      },
    });
    expect((await result.response!).status).toBe(200);
    sw.cacheApi.open.mockRejectedValueOnce(new Error("Storage unavailable"));
    const uncached = sw.dispatch("fetch", {
      request: {
        url: "https://example.com/_next/static/uncached.js",
        method: "GET",
        mode: "cors",
      },
    });
    expect((await uncached.response!).status).toBe(200);
  });
  it("retains push notifications and rejects external notification targets", async () => {
    const sw = worker();
    await sw.dispatch("push", {
      data: {
        json: () => ({ title: "طلب", body: "اعتماد", url: "/requests/id" }),
      },
    }).done;
    expect(sw.notification).toHaveBeenCalledWith(
      "طلب",
      expect.objectContaining({ icon: "/pwa-192.png", dir: "rtl" }),
    );
    await sw.dispatch("notificationclick", {
      notification: {
        close: vi.fn(),
        data: { url: "https://external.invalid" },
      },
    }).done;
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
    await sw.dispatch("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/requests/id" } },
    }).done;
    expect(sw.clients.openWindow).toHaveBeenCalledWith(
      "https://example.com/requests/id",
    );
  });
});
