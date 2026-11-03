import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hash as passwordHash } from "bcryptjs";
import { sql as sqlTag } from "drizzle-orm";
import type { Actor } from "@/lib/domain";
const state = vi.hoisted(() => ({
  database: null as unknown,
  cookies: new Map<string, string>(),
}));
vi.mock("@/db", async () => {
  const { sql } = await import("drizzle-orm");
  return {
    db: () => state.database,
    sql,
    rows: async (q: unknown, c = state.database) =>
      (
        await (
          c as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
        ).execute(q)
      ).rows,
    one: async (q: unknown, c = state.database) =>
      (
        await (
          c as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
        ).execute(q)
      ).rows[0],
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined,
    set: (key: string, value: string) => state.cookies.set(key, value),
    delete: (key: string) => state.cookies.delete(key),
  }),
  headers: async () =>
    new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "test" }),
}));
import {
  saveRequest,
  transitionRequest,
  approveOverage,
  placeOrder,
  receive,
} from "@/server/requests";
import { saveUser, saveRole } from "@/server/admin";
import { listRequests, auditList, requestDetail } from "@/server/queries";
import {
  login,
  verifyOtp,
  forgotPassword,
  resetPassword,
  currentActor,
} from "@/server/auth";
import { decrypt } from "@/server/security";
import { importTemplate, parseImport, importBoq } from "@/server/import";
import { can, effectivePreference, receiptStatus } from "@/lib/domain";
import { requestSchema, boqSchema } from "@/lib/validation";
let pg: PGlite;
const ids = {
  owner: randomUUID(),
  engineer: randomUUID(),
  other: randomUUID(),
  buyer: randomUUID(),
  receiver: randomUUID(),
  p1: randomUUID(),
  p2: randomUUID(),
  role: randomUUID(),
  unit: randomUUID(),
  main: randomUUID(),
  secondary: randomUUID(),
  leaf: randomUUID(),
  material: randomUUID(),
  supplier: randomUUID(),
};
const meta = { ip: "127.0.0.1", userAgent: "test" };
function actor(id: string, permissions: string[], owner = false): Actor {
  return {
    id,
    name: "مستخدم",
    email: `${id}@test.invalid`,
    username: id,
    job_title: "مهندس",
    role_id: ids.role,
    role_name: "دور",
    is_owner: owner,
    force_password_change: false,
    theme: 0,
    otp_enabled: false,
    otp_exempt: false,
    permissions,
    session_id: randomUUID(),
    expires_at: new Date(Date.now() + 3600000),
    remember: false,
  };
}
const owner = actor(ids.owner, [], true),
  engineer = actor(ids.engineer, [
    "projects.view",
    "boq.view",
    "requests.view",
    "requests.create",
    "requests.edit",
    "requests.delete",
  ]),
  other = actor(ids.other, engineer.permissions),
  buyer = actor(ids.buyer, [
    "projects.all",
    "projects.view",
    "requests.view",
    "requests.view_all",
    "procurement.view",
    "procurement.edit",
    "procurement.approve",
  ]),
  receiver = actor(ids.receiver, [
    "projects.view",
    "requests.view",
    "requests.view_all",
    "receipts.view",
    "receipts.create",
  ]);
beforeAll(async () => {
  vi.stubEnv(
    "AUTH_SECRET",
    "test-only-secret-with-at-least-thirty-two-characters",
  );
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "test@test.invalid");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  pg = new PGlite();
  state.database = drizzle(pg);
  for (const file of [
    "drizzle/generated/0000_dizzy_onslaught.sql",
    "drizzle/custom/0001_integrity.sql",
  ])
    await pg.exec(await readFile(file, "utf8"));
  await pg.query("INSERT INTO settings(id) VALUES(1)");
  await pg.query("INSERT INTO roles(id,name) VALUES($1,$2)", [
    ids.role,
    "اختبار",
  ]);
  const hash = await passwordHash("Test-password-12345", 12);
  for (const id of [
    ids.owner,
    ids.engineer,
    ids.other,
    ids.buyer,
    ids.receiver,
  ])
    await pg.query(
      "INSERT INTO users(id,name,email,username,job_title,password_hash,role_id,is_owner,force_password_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)",
      [
        id,
        "مستخدم",
        `${id}@test.invalid`,
        id,
        "مهندس",
        hash,
        ids.role,
        id === ids.owner,
      ],
    );
  await pg.query(
    "INSERT INTO projects(id,code,name) VALUES($1,$2,$3),($4,$5,$6)",
    [ids.p1, "P1", "مشروع أول", ids.p2, "P2", "مشروع ثان"],
  );
  for (const id of [ids.engineer, ids.other, ids.receiver])
    await pg.query(
      "INSERT INTO project_users(project_id,user_id) VALUES($1,$2)",
      [ids.p1, id],
    );
  await pg.query("INSERT INTO units(id,name,symbol) VALUES($1,$2,$3)", [
    ids.unit,
    "متر مكعب",
    "م³",
  ]);
  for (const [id, level, parent] of [
    [ids.main, 1, null],
    [ids.secondary, 2, ids.main],
    [ids.leaf, 3, ids.secondary],
  ] as const)
    await pg.query(
      "INSERT INTO boq_items(id,project_id,parent_id,level,code,name,description,unit_id,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,100)",
      [
        id,
        ids.p1,
        parent,
        level,
        String(level),
        "بند",
        level === 3 ? "وصف" : null,
        ids.unit,
      ],
    );
  await pg.query(
    "INSERT INTO materials(id,boq_item_id,name,quantity) VALUES($1,$2,$3,100)",
    [ids.material, ids.leaf, "خرسانة"],
  );
  await pg.query("INSERT INTO suppliers(id,name) VALUES($1,$2)", [
    ids.supplier,
    "مورد",
  ]);
  for (let type = 0; type < 3; type++)
    await pg.query("INSERT INTO notification_policy(type) VALUES($1)", [type]);
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
});
const create = (quantity = "10") =>
  saveRequest(
    engineer,
    {
      projectId: ids.p1,
      notes: "",
      submit: true,
      lines: [{ materialId: ids.material, quantity, notes: "" }],
    },
    meta,
  );
async function request(id: string) {
  return (
    await pg.query<{ version: number; status: number }>(
      "SELECT version,status FROM purchase_requests WHERE id=$1",
      [id],
    )
  ).rows[0];
}
async function order(id: string) {
  let r = await request(id);
  await transitionRequest(
    buyer,
    { id, version: r.version, status: 2, reason: "" },
    meta,
  );
  r = await request(id);
  const lines = (
    await pg.query<{ id: string }>(
      "SELECT id FROM request_lines WHERE request_id=$1",
      [id],
    )
  ).rows;
  await placeOrder(
    buyer,
    {
      id,
      version: r.version,
      supplierId: ids.supplier,
      expectedAt: "2026-12-10",
      prices: lines.map((l) => ({ id: l.id, price: "5.25" })),
    },
    meta,
  );
  return lines;
}
describe("Authorization and database invariants", () => {
  it("restricts audit to the unique owner regardless of custom permissions", async () => {
    expect(can({ ...buyer, permissions: ["audit.view"] }, "audit.view")).toBe(
      false,
    );
    await expect(auditList(buyer, { q: "" })).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects requests outside assigned projects and cross-project material injection", async () => {
    await expect(
      saveRequest(
        engineer,
        {
          projectId: ids.p2,
          notes: "",
          submit: true,
          lines: [{ materialId: ids.material, quantity: "1", notes: "" }],
        },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRequest(
        owner,
        {
          projectId: ids.p2,
          notes: "",
          submit: true,
          lines: [{ materialId: ids.material, quantity: "1", notes: "" }],
        },
        meta,
      ),
    ).rejects.toThrow();
  });
  it("prevents a fourth level and cross-project parent links at database level", async () => {
    await expect(
      pg.query(
        "INSERT INTO boq_items(project_id,parent_id,level,code,name,description,unit_id,quantity) VALUES($1,$2,3,$3,$4,$5,$6,1)",
        [ids.p2, ids.secondary, "bad", "بند", "وصف", ids.unit],
      ),
    ).rejects.toThrow();
  });
  it("protects owner deletion, disabling, demotion and duplicate ownership", async () => {
    await expect(
      pg.query("DELETE FROM users WHERE id=$1", [ids.owner]),
    ).rejects.toThrow();
    await expect(
      pg.query("UPDATE users SET locked=true WHERE id=$1", [ids.owner]),
    ).rejects.toThrow();
    await expect(
      pg.query("UPDATE users SET is_owner=false WHERE id=$1", [ids.owner]),
    ).rejects.toThrow();
  });
  it("enforces immutable receipts and audit rows", async () => {
    const id = randomUUID();
    await pg.query(
      "INSERT INTO audit_log(id,action,entity,ip,user_agent,diff) VALUES($1,0,0,$2,$3,$4)",
      [id, "ip", "test", "{}"],
    );
    await expect(
      pg.query("DELETE FROM audit_log WHERE id=$1", [id]),
    ).rejects.toThrow();
    await expect(
      pg.query("UPDATE audit_log SET action=1 WHERE id=$1", [id]),
    ).rejects.toThrow();
  });
  it("requires description only on third level and unique request materials", () => {
    expect(
      boqSchema.safeParse({
        projectId: ids.p1,
        parentId: ids.secondary,
        level: 3,
        code: "x",
        name: "بند",
        unitId: ids.unit,
        quantity: "1",
        description: "",
      }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({
        projectId: ids.p1,
        lines: [
          { materialId: ids.material, quantity: "1" },
          { materialId: ids.material, quantity: "2" },
        ],
      }).success,
    ).toBe(false);
  });
});
describe("Request to receipt", () => {
  it("scopes engineers to their own requests and blocks unauthorized transitions", async () => {
    const { id } = await create();
    expect(
      (await listRequests(other, { q: "" })).items.map((r) => r.id),
    ).not.toContain(id);
    expect(
      (await listRequests(buyer, { q: "" })).items.map((r) => r.id),
    ).toContain(id);
    await expect(
      transitionRequest(
        engineer,
        { id, version: 1, status: 2, reason: "" },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("enforces the 15-minute edit window and optimistic version checks", async () => {
    const { id } = await create();
    await expect(
      saveRequest(
        engineer,
        {
          id,
          version: 2,
          projectId: ids.p1,
          notes: "",
          submit: true,
          lines: [{ materialId: ids.material, quantity: "5", notes: "" }],
        },
        meta,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await pg.query(
      "UPDATE purchase_requests SET submitted_at=now()-interval '16 minutes' WHERE id=$1",
      [id],
    );
    await expect(
      saveRequest(
        engineer,
        {
          id,
          version: 1,
          projectId: ids.p1,
          notes: "",
          submit: true,
          lines: [{ materialId: ids.material, quantity: "5", notes: "" }],
        },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("requires explicit overage approval before procurement", async () => {
    const { id } = await create("101");
    await expect(
      transitionRequest(buyer, { id, version: 1, status: 2, reason: "" }, meta),
    ).rejects.toMatchObject({ code: "overage" });
    await approveOverage(owner, id, meta);
    await transitionRequest(
      buyer,
      { id, version: 2, status: 2, reason: "" },
      meta,
    );
    expect((await request(id)).status).toBe(2);
  });
  it("supports partial, excess, damaged/rejected receipts and returns without duplicate receipts", async () => {
    await pg.query("UPDATE materials SET quantity=10000 WHERE id=$1", [
      ids.material,
    ]);
    const { id } = await create("10"),
      [line] = await order(id);
    const key = randomUUID();
    const first = {
      requestId: id,
      key,
      notes: "",
      lines: [
        {
          lineId: line.id,
          accepted: "4",
          damaged: "1",
          rejected: "2",
          returned: "0",
        },
      ],
    };
    await receive(receiver, first, meta);
    expect((await request(id)).status).toBe(4);
    await receive(receiver, first, meta);
    expect(
      (
        await pg.query<{ n: number }>(
          "SELECT COUNT(*)::int n FROM receipts WHERE request_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    await receive(
      receiver,
      {
        ...first,
        key: randomUUID(),
        lines: [
          {
            lineId: line.id,
            accepted: "8",
            damaged: "0",
            rejected: "0",
            returned: "0",
          },
        ],
      },
      meta,
    );
    expect((await request(id)).status).toBe(5);
    await receive(
      receiver,
      {
        ...first,
        key: randomUUID(),
        lines: [
          {
            lineId: line.id,
            accepted: "0",
            damaged: "0",
            rejected: "0",
            returned: "5",
          },
        ],
      },
      meta,
    );
    expect((await request(id)).status).toBe(4);
    await expect(
      receive(
        receiver,
        {
          ...first,
          key: randomUUID(),
          lines: [
            {
              lineId: line.id,
              accepted: "0",
              damaged: "0",
              rejected: "0",
              returned: "8",
            },
          ],
        },
        meta,
      ),
    ).rejects.toMatchObject({ code: "returned" });
  });
  it("writes durable audit events in the transaction and exposes pending events to owner", async () => {
    const { id } = await create();
    const log = await auditList(owner, { q: "" });
    expect(log.items.some((e) => e.entity_id === id)).toBe(true);
  });
  it("renders bounded request details and hides prices outside procurement", async () => {
    const { id } = await create();
    await order(id);
    const full = await requestDetail(buyer, id),
      limited = await requestDetail(engineer, id);
    expect(full.lines[0].price).toBe("5.25");
    expect(limited.lines[0].price).toBeNull();
    expect(limited.lines[0].material_name).toBe("خرسانة");
    await expect(requestDetail(other, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("respects mandatory notification policy and decimal-safe status calculation", () => {
    expect(
      effectivePreference(
        { in_app: true, email: true, forced: true },
        { in_app: false, email: false },
      ).email,
    ).toBe(true);
    expect(
      receiptStatus([{ quantity: "0.3", accepted: "0.4", returned: "0.1" }]),
    ).toBe(5);
  });
});
describe("Arabic BOQ import", () => {
  it("round-trips the Arabic XLSX template and imports all levels atomically", async () => {
    const buffer = await importTemplate();
    const data = await parseImport(
      new File([new Uint8Array(buffer)], "template.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(data).toHaveLength(3);
    const imported = await importBoq(owner, ids.p2, data, meta);
    expect(imported).toEqual({ rows: 3, materials: 1 });
    await expect(importBoq(owner, ids.p2, data, meta)).rejects.toThrow();
    expect(
      (
        await pg.query<{ n: number }>(
          "SELECT COUNT(*)::int n FROM boq_items WHERE project_id=$1",
          [ids.p2],
        )
      ).rows[0].n,
    ).toBe(3);
  });
  it("rejects an unauthorized importer and mismatched Arabic headers", async () => {
    await expect(importBoq(engineer, ids.p1, [], meta)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      parseImport(new File(["wrong,headers\n1,2"], "invalid.csv")),
    ).rejects.toMatchObject({ code: "import" });
  });
});
describe("Authentication", () => {
  it("uses hashed sessions with one-hour expiry and supports logout/revocation", async () => {
    const result = await login({
      identifier: engineer.email,
      password: "Test-password-12345",
      remember: false,
    });
    expect(result).toHaveProperty("redirect", "/dashboard");
    const session = (
      await pg.query<{ token_hash: string; expires_at: Date }>(
        "SELECT token_hash,expires_at FROM sessions WHERE user_id=$1",
        [ids.engineer],
      )
    ).rows[0];
    expect(session.token_hash).not.toEqual(state.cookies.get("bt-session"));
    expect(
      new Date(session.expires_at).getTime() - Date.now(),
    ).toBeLessThanOrEqual(3600000);
  });
  it("does not roll back failed login counters", async () => {
    await expect(
      login({ identifier: other.email, password: "wrong", remember: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await pg.query<{ failed_attempts: number }>(
          "SELECT failed_attempts FROM users WHERE id=$1",
          [ids.other],
        )
      ).rows[0].failed_attempts,
    ).toBe(1);
  });
  it("stores OTP hashes, encrypts queued mail, limits attempts, and rejects replay", async () => {
    await pg.query("UPDATE users SET otp_enabled=true WHERE id=$1", [
      ids.other,
    ]);
    const result = await login({
      identifier: other.email,
      password: "Test-password-12345",
      remember: true,
    });
    expect(result).toHaveProperty("challenge");
    const challenge = (result as { challenge: string }).challenge;
    const mail = (
      await pg.query<{ payload: { encrypted: string } }>(
        "SELECT payload FROM outbox WHERE kind=2 ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0];
    const decrypted = decrypt<{ html: string }>(mail.payload.encrypted);
    const code = decrypted.html.match(/dir="ltr">(\d{6})/)![1];
    expect(JSON.stringify(mail)).not.toContain(code);
    await verifyOtp({ challenge, code });
    await expect(verifyOtp({ challenge, code })).rejects.toMatchObject({
      code: "otp",
    });
  });
  it("returns the same reset response and consumes reset tokens once", async () => {
    const known = await forgotPassword(other.email),
      unknown = await forgotPassword("unknown@test.invalid");
    expect(known).toEqual(unknown);
    const mail = (
      await pg.query<{ payload: { encrypted: string } }>(
        "SELECT payload FROM outbox WHERE kind=2 ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0];
    const html = decrypt<{ html: string }>(mail.payload.encrypted).html,
      token = html.match(/reset=([a-f0-9]{64})/)![1];
    await resetPassword({ token, password: "Changed-password-12345" });
    await expect(
      resetPassword({ token, password: "Changed-password-12345" }),
    ).rejects.toMatchObject({ code: "reset" });
    expect(
      (
        await pg.query<{ n: number }>(
          "SELECT COUNT(*)::int n FROM sessions WHERE user_id=$1",
          [ids.other],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
