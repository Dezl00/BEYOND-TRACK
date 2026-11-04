// Integration verification against an explicitly configured running server.
// Creates/reuses a clearly named DEMO project. Never run against another tenant.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.APP_URL || "http://localhost:3000",
  jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function response(path, options = {}) {
  const r = await fetch(base + path, {
    ...options,
    headers: { Cookie: cookie(), ...options.headers },
    redirect: "manual",
  });
  for (const c of r.headers.getSetCookie()) {
    const pair = c.split(";")[0],
      i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return r;
}
async function post(path, data) {
  const r = await response(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify(data),
    }),
    result = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${result.error}`);
  return result;
}
const command = (command, data) => post("/api/commands", { command, data });
async function json(path) {
  const r = await response(path),
    data = await r.json();
  assert.equal(r.status, 200, `${path}: ${r.status}`);
  return data;
}
async function ensure(resource, commandName, predicate, values, project) {
  const params = new URLSearchParams({
    resource,
    ...(project ? { project } : {}),
  });
  const items = (await json(`/api/options?${params}`)).items;
  return items.find(predicate) || command(commandName, values);
}
async function main() {
  assert.equal((await response("/dashboard")).status, 307);
  const login = await post("/api/auth/login", {
    identifier: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    remember: false,
  });
  if (login.redirect === "/settings/security")
    await command("password", {
      current: process.env.SEED_ADMIN_PASSWORD,
      password: process.env.SEED_ADMIN_PASSWORD,
    });
  const me = (await json("/api/options?resource=users")).items.find(
    (u) => u.is_owner,
  );
  assert.ok(me);
  try {
    const routes = [
      "dashboard",
      "projects",
      "boq",
      "materials",
      "units",
      "requests",
      "procurement",
      "receipts",
      "suppliers",
      "users",
      "roles",
      "audit",
      "notifications",
      "settings/appearance",
      "settings/system",
      "settings/security",
    ];
    for (const route of routes) {
      const r = await response("/" + route),
        html = await r.text();
      assert.equal(r.status, 200, route);
      assert.ok(
        !html.includes("تعذر إتمام العملية"),
        `${route} error boundary`,
      );
    }
    console.log(
      `PASS: ${routes.length} authenticated pages and login-only entry`,
    );
    const unit = (await json("/api/options?resource=units")).items.find(
      (u) => u.name === "متر مكعب",
    );
    assert.ok(unit);
    const project = await ensure(
      "projects",
      "project",
      (p) => p.code === "DEMO",
      { code: "DEMO", name: "مشروع تجريبي", location: "", archived: false },
    );
    const common = { projectId: project.id, unitId: unit.id, quantity: "100" };
    const main = await ensure(
      "boq",
      "boq",
      (b) => b.code === "01",
      {
        ...common,
        parentId: null,
        level: 1,
        code: "01",
        name: "أعمال إنشائية",
        description: "",
      },
      project.id,
    );
    const secondary = await ensure(
      "boq",
      "boq",
      (b) => b.code === "01.01",
      {
        ...common,
        parentId: main.id,
        level: 2,
        code: "01.01",
        name: "أعمال الموقع",
        description: "",
      },
      project.id,
    );
    const leaf = await ensure(
      "boq",
      "boq",
      (b) => b.code === "01.01.01",
      {
        ...common,
        parentId: secondary.id,
        level: 3,
        code: "01.01.01",
        name: "بند تجريبي",
        description: "مواد أعمال الموقع",
      },
      project.id,
    );
    const material = await ensure(
      "materials",
      "material",
      (m) => m.name === "مادة تجريبية",
      {
        boqItemId: leaf.id,
        name: "مادة تجريبية",
        quantity: "100",
        active: true,
      },
      project.id,
    );
    const supplier = await ensure(
      "suppliers",
      "supplier",
      (s) => s.name === "مورد تجريبي",
      { name: "مورد تجريبي", active: true },
    );
    const request = await command("request", {
      projectId: project.id,
      notes: "اختبار التشغيل",
      submit: true,
      lines: [{ materialId: material.id, quantity: "10", notes: "" }],
    });
    await command("transition", {
      id: request.id,
      version: 1,
      status: 9,
      reason: "",
    });
    await command("transition", {
      id: request.id,
      version: 2,
      status: 2,
      reason: "",
    });
    let detail = await json(`/api/requests/${request.id}`);
    await command("order", {
      id: request.id,
      version: detail.version,
      supplierId: supplier.id,
      expectedAt: "2026-12-10",
      prices: detail.lines.map((l) => ({ id: l.id, price: "25.50" })),
    });
    const lineId = detail.lines[0].id,
      key = randomUUID();
    const receipt = {
      requestId: request.id,
      key,
      notes: "اختبار التشغيل",
      lines: [
        { lineId, accepted: "4", damaged: "1", rejected: "1", returned: "0" },
      ],
    };
    const first = await command("receipt", receipt),
      repeated = await command("receipt", receipt);
    assert.equal(first.id, repeated.id);
    detail = await json(`/api/requests/${request.id}`);
    assert.equal(detail.status, 4);
    await command("receipt", {
      ...receipt,
      key: randomUUID(),
      lines: [
        { lineId, accepted: "8", damaged: "0", rejected: "0", returned: "0" },
      ],
    });
    assert.equal((await json(`/api/requests/${request.id}`)).status, 5);
    await command("receipt", {
      ...receipt,
      key: randomUUID(),
      lines: [
        { lineId, accepted: "0", damaged: "0", rejected: "0", returned: "5" },
      ],
    });
    assert.equal((await json(`/api/requests/${request.id}`)).status, 4);
    await command("receipt", {
      ...receipt,
      key: randomUUID(),
      lines: [
        { lineId, accepted: "3", damaged: "0", rejected: "0", returned: "0" },
      ],
    });
    detail = await json(`/api/requests/${request.id}`);
    assert.equal(detail.status, 5);
    await command("transition", {
      id: request.id,
      version: detail.version,
      status: 6,
      reason: "",
    });
    console.log(
      "PASS: request → technical → finance → procurement → order → partial/excess receipt → return → receipt → closure; receipt idempotency",
    );
    const r = await response(`/requests/${request.id}`),
      html = await r.text();
    assert.ok(html.includes("مادة تجريبية"), "request details render");
    assert.ok(!html.includes("تعذر إتمام العملية"));
    assert.equal(
      (await response(`/requests/${request.id}/receipts`)).status,
      200,
    );
    const policies = [0, 1, 2].map((type) => ({
      type,
      inApp: true,
      email: true,
    }));
    await command("preferences", {
      theme: 1,
      otpEnabled: false,
      preferences: policies,
    });
    assert.ok(
      (await (await response("/dashboard")).text()).includes(
        'data-theme="dark"',
      ),
    );
    await command("preferences", {
      theme: 0,
      otpEnabled: false,
      preferences: policies,
    });
    assert.ok(
      (await (await response("/dashboard")).text()).includes(
        'data-theme="light"',
      ),
    );
    assert.equal((await response("/api/import")).status, 200);
    assert.equal((await response("/api/export?resource=audit")).status, 200);
    const denied = await fetch(base + "/api/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie(),
        Origin: "https://example.invalid",
      },
      body: JSON.stringify({ command: "preferences", data: {} }),
    });
    assert.equal(denied.status, 403);
    if (process.env.CLOUDINARY_API_SECRET) {
      const form = new FormData();
      form.set("requestId", request.id);
      form.set(
        "file",
        new Blob(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          { type: "image/png" },
        ),
        "verification.png",
      );
      const upload = await response("/api/attachments", {
          method: "POST",
          headers: { Origin: base },
          body: form,
        }),
        result = await upload.json();
      assert.equal(upload.status, 200, `upload: ${result.error || ""}`);
      assert.equal(
        (await response(`/api/attachments/${result.id}`)).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + `/api/attachments/${result.id}`, {
            redirect: "manual",
          })
        ).status,
        401,
      );
      console.log(
        "PASS: signed Cloudinary upload and authenticated-only attachment retrieval",
      );
    }
    console.log(
      "PASS: SSR theme persistence, Arabic import template/export, CSRF rejection",
    );
    console.log(`Verified sample request: ${request.id}`);
  } finally {
    await command("user", {
      id: me.id,
      name: me.name,
      email: me.email,
      username: me.username,
      jobTitle: me.job_title,
      roleId: me.role_id,
      projectIds: me.project_ids,
      locked: false,
      forcePasswordChange: true,
      otpEnabled: me.otp_enabled,
      otpExempt: me.otp_exempt,
    });
    await post("/api/auth/logout", {});
    console.log(
      "Owner force-password-change restored; verification session ended.",
    );
  }
}
main().catch((e) => {
  console.error(
    e instanceof assert.AssertionError
      ? `Assertion failed: ${e.operator}`
      : e.message,
  );
  process.exitCode = 1;
});
