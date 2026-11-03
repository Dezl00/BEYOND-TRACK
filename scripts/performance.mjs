// Performance auditing only: no UI input, page scripting, or screenshot output.
import lighthouse from "lighthouse";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const { launch } = require(
  require.resolve("chrome-launcher", {
    paths: [path.dirname(require.resolve("lighthouse/package.json"))],
  }),
);
const base = process.env.APP_URL || "http://localhost:3000";
await mkdir(".local", { recursive: true });
const profile = await mkdtemp(path.resolve(".local/chrome-audit-"));
let cookie = "";
let owner;
async function post(endpoint, data) {
  const r = await fetch(base + endpoint, {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Audit setup failed: ${r.status}`);
  return r.json();
}
if (process.env.SEED_ADMIN_PASSWORD) {
  const response = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      remember: false,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error("Performance login failed");
  cookie = response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  if (result.redirect === "/settings/security")
    await post("/api/commands", {
      command: "password",
      data: {
        current: process.env.SEED_ADMIN_PASSWORD,
        password: process.env.SEED_ADMIN_PASSWORD,
      },
    });
  const usersResponse = await fetch(base + "/api/options?resource=users", {
    headers: { Cookie: cookie },
  });
  owner = (await usersResponse.json()).items.find((u) => u.is_owner);
}
let browser;
const report = [];
try {
  browser = await launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ["--headless=new", "--disable-gpu"],
    userDataDir: profile,
  });
  for (const route of cookie
    ? ["/login", "/dashboard", "/requests"]
    : ["/login"]) {
    const result = await lighthouse(
      base + route,
      {
        port: browser.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices"],
        extraHeaders: cookie ? { Cookie: cookie } : {},
        disableStorageReset: true,
      },
      {
        extends: "lighthouse:default",
        settings: {
          skipAudits: [
            "screenshot-thumbnails",
            "final-screenshot",
            "full-page-screenshot",
          ],
        },
      },
    );
    const lhr = result.lhr;
    if (new URL(lhr.finalDisplayedUrl).pathname !== route)
      throw new Error(`Unexpected redirect while auditing ${route}`);
    if (process.env.AUDIT_DIAGNOSTICS && route === "/dashboard")
      await writeFile(
        ".local/performance-diagnostics.json",
        JSON.stringify(
          Object.fromEntries(
            [
              "layout-shifts",
              "bootup-time",
              "errors-in-console",
              "mainthread-work-breakdown",
            ].map((key) => [key, lhr.audits[key]?.details]),
          ),
          null,
          2,
        ),
      );
    report.push({
      route,
      url: lhr.finalDisplayedUrl,
      performance: lhr.categories.performance.score,
      accessibility: lhr.categories.accessibility.score,
      bestPractices: lhr.categories["best-practices"].score,
      metrics: {
        fcp: lhr.audits["first-contentful-paint"].numericValue,
        lcp: lhr.audits["largest-contentful-paint"].numericValue,
        cls: lhr.audits["cumulative-layout-shift"].numericValue,
      },
      failures: Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 0.9)
        .map((a) => ({
          id: a.id,
          title: a.title,
          displayValue: a.displayValue,
        })),
    });
    console.log(JSON.stringify(report.at(-1)));
  }
} finally {
  if (browser) await browser.kill();
  if (owner)
    await post("/api/commands", {
      command: "user",
      data: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        username: owner.username,
        jobTitle: owner.job_title,
        roleId: owner.role_id,
        projectIds: owner.project_ids,
        locked: false,
        forcePasswordChange: true,
        otpEnabled: owner.otp_enabled,
        otpExempt: owner.otp_exempt,
      },
    });
  if (cookie)
    await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
}
await writeFile(".local/performance.json", JSON.stringify(report, null, 2));
