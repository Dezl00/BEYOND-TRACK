import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hash as passwordHash } from "bcryptjs";
import { sql as sqlTag } from "drizzle-orm";
import type { Actor } from "@/lib/domain";
const state = vi.hoisted(() => ({
  database: null as unknown,
  cookies: new Map<string, string>(),
  push: vi.fn(async () => ({})),
  cloudDestroy: vi.fn(async () => ({ result: "ok" })),
}));
vi.mock("web-push", () => ({ default: { sendNotification: state.push } }));
vi.mock("@/server/cloudinary", () => ({
  cloud: () => ({ uploader: { destroy: state.cloudDestroy } }),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async () => ({ data: { id: "test" }, error: null }) };
  },
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
  submitQuotations,
  receive,
} from "@/server/requests";
import { saveBoq, saveUser, saveRole } from "@/server/admin";
import { setActive } from "@/server/activation";
import { issueRequestPurge, purgeRequests } from "@/server/request-purge";
import { deleteRecord } from "@/server/delete";
import {
  listRequests,
  auditList,
  requestDetail,
  listResource,
  notifications,
} from "@/server/queries";
import { liveSnapshot } from "@/server/live";
import { processJobs, maintain } from "@/server/jobs";
import { deliverPush } from "@/server/push";
import {
  login,
  verifyOtp,
  forgotPassword,
  resetPassword,
  currentActor,
  requireActor,
  changePassword,
} from "@/server/auth";
import { GET as options } from "@/app/api/options/route";
import { ar } from "@/messages/ar";
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
const technical = actor(ids.buyer, [
    ...buyer.permissions,
    "technical.view",
    "technical.approve",
    "requests.approve",
  ]),
  finance = actor(ids.buyer, [
    ...buyer.permissions,
    "finance.view",
    "finance.approve",
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
    "drizzle/generated/0001_approvals_push.sql",
    "drizzle/generated/0002_resource_activation.sql",
    "drizzle/generated/0003_request_purge.sql",
    "drizzle/generated/0004_military_onslaught.sql",
    "drizzle/generated/0005_boq_leaf_measurements.sql",
    "drizzle/generated/0006_fixed_fixer.sql",
    "drizzle/custom/0001_integrity.sql",
    "drizzle/custom/0002_approvals_and_push.sql",
    "drizzle/custom/0003_account_integrity.sql",
    "drizzle/custom/0004_request_purge.sql",
    "drizzle/custom/0005_reports.sql",
    "drizzle/custom/0006_pricing_and_receipts.sql",
    "drizzle/custom/0007_boq_leaf_measurements.sql",
    "drizzle/custom/0008_whatsapp.sql",
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
    technical,
    { id, version: r.version, status: 9, reason: "" },
    meta,
  );
  r = await request(id);
  await transitionRequest(
    finance,
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
  await submitQuotations(
    buyer,
    {
      id,
      version: r.version,
      selectedIndex: 0,
      offers: [
        {
          supplierId: ids.supplier,
          expectedAt: "2026-12-10",
          prices: lines.map((l) => ({ id: l.id, price: "5.25" })),
        },
      ],
    },
    meta,
  );
  await transitionRequest(
    finance,
    { id, version: (await request(id)).version, status: 11, reason: "" },
    meta,
  );
  await placeOrder(buyer, { id, version: (await request(id)).version }, meta);
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
  it("blocks new requests for disabled BOQ items, materials and units", async () => {
    for (const [resource, id] of [
      ["boq", ids.leaf],
      ["boq", ids.main],
      ["material", ids.material],
      ["unit", ids.unit],
    ] as const) {
      await setActive(owner, { resource, id, active: false }, meta);
      try {
        await expect(create("1")).rejects.toMatchObject({ code: "invalid" });
        expect(
          (
            await listResource(owner, "materials", { q: "", selectable: "1" })
          ).items.map((row) => row.id),
        ).not.toContain(ids.material);
      } finally {
        await setActive(owner, { resource, id, active: true }, meta);
      }
    }
    await expect(
      setActive(
        engineer,
        { resource: "boq", id: ids.leaf, active: false },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setActive(
        { ...owner, is_owner: false, permissions: ["boq.edit"] },
        { resource: "boq", id: ids.leaf, active: false },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("hides the BOQ from procurement and migrates both approval roles", async () => {
    await expect(listResource(buyer, "boq", { q: "" })).rejects.toMatchObject({
      status: 403,
    });
    const roles = await pg.query<{ name: string }>(
      "SELECT name FROM roles WHERE name IN('المكتب الفني','المالية')",
    );
    expect(roles.rows).toHaveLength(2);
    const technicalPermissions = await pg.query<{ key: string }>(
      "SELECT p.key FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE r.name='المكتب الفني'",
    );
    expect(technicalPermissions.rows.map((row) => row.key)).toContain(
      "technical.approve",
    );
  });
  it("changes live revisions only for visible project requests and bounds the notification preview", async () => {
    const before = await liveSnapshot(other);
    const { id } = await create("1");
    expect((await liveSnapshot(other)).revision).toBe(before.revision);
    const own = await liveSnapshot(engineer);
    await transitionRequest(
      technical,
      { id, version: 1, status: 9, reason: "" },
      meta,
    );
    expect((await liveSnapshot(engineer)).revision).not.toBe(own.revision);
    expect((await liveSnapshot(engineer)).items.length).toBeLessThanOrEqual(6);
  });
  it("scopes engineers to their own requests and blocks unauthorized transitions", async () => {
    const { id } = await create();
    expect(
      (await listRequests(other, { q: "" })).items.map((r) => r.id),
    ).not.toContain(id);
    expect(
      (await listRequests(buyer, { q: "" })).items.map((r) => r.id),
    ).not.toContain(id);
    await expect(
      transitionRequest(
        engineer,
        { id, version: 1, status: 9, reason: "" },
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
  it("requires both approvals and explicit overage approval before procurement", async () => {
    const { id } = await create("101");
    expect(
      (await listRequests(finance, { q: "" })).items.map((row) => row.id),
    ).not.toContain(id);
    await expect(
      transitionRequest(buyer, { id, version: 1, status: 2, reason: "" }, meta),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      transitionRequest(buyer, { id, version: 1, status: 9, reason: "" }, meta),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      transitionRequest(
        technical,
        { id, version: 1, status: 9, reason: "" },
        meta,
      ),
    ).rejects.toMatchObject({ code: "overage" });
    await approveOverage(technical, id, meta);
    await transitionRequest(
      technical,
      { id, version: 2, status: 9, reason: "" },
      meta,
    );
    expect(
      (await listRequests(finance, { q: "" })).items.map((row) => row.id),
    ).toContain(id);
    expect(
      (await listRequests(buyer, { q: "" })).items.map((row) => row.id),
    ).not.toContain(id);
    await expect(
      transitionRequest(
        technical,
        { id, version: 3, status: 2, reason: "" },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await transitionRequest(
      finance,
      { id, version: 3, status: 2, reason: "" },
      meta,
    );
    expect((await request(id)).status).toBe(2);
    expect(
      (await listRequests(buyer, { q: "" })).items.map((row) => row.id),
    ).toContain(id);
  });
  it("keeps an engineer's draft hidden from the approval departments", async () => {
    const { id } = await saveRequest(
      engineer,
      {
        projectId: ids.p1,
        notes: "",
        submit: false,
        lines: [{ materialId: ids.material, quantity: "1", notes: "" }],
      },
      meta,
    );
    expect(
      (await listRequests(technical, { q: "" })).items.map((row) => row.id),
    ).not.toContain(id);
    expect(
      (await listRequests(engineer, { q: "" })).items.map((row) => row.id),
    ).toContain(id);
  });
  it("requires new receipt evidence, caps all receipt quantities, and supports replacements and idempotency", async () => {
    await pg.query("UPDATE materials SET quantity=10000 WHERE id=$1", [
      ids.material,
    ]);
    const { id } = await create("10"),
      [line] = await order(id);
    async function receipt(
      accepted: string,
      damaged = "0",
      rejected = "0",
      returned = "0",
    ) {
      const key = randomUUID();
      const file = randomUUID();
      await pg.query(
        "INSERT INTO attachments(id,request_id,uploaded_by,public_id,resource_type,format,name,bytes,receipt_key) VALUES($1,$2,$3,$4,'image','png','receipt.png',100,$5)",
        [file, id, ids.receiver, randomUUID(), key],
      );
      return {
        requestId: id,
        key,
        notes: "",
        attachmentIds: [file],
        lines: [{ lineId: line.id, accepted, damaged, rejected, returned }],
      };
    }
    const abandoned = await receipt("1");
    await pg.query(
      "UPDATE attachments SET created_at=now()-interval '2 days' WHERE id=$1",
      abandoned.attachmentIds,
    );
    const first = await receipt("4", "1", "2");
    expect((await requestDetail(receiver, id)).files).toHaveLength(0);
    await maintain();
    expect(
      (
        await pg.query(
          "SELECT id FROM attachments WHERE id=$1",
          abandoned.attachmentIds,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await pg.query(
          "SELECT id FROM attachments WHERE id=$1",
          first.attachmentIds,
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      receive(receiver, { ...first, attachmentIds: [] }, meta),
    ).rejects.toMatchObject({ code: "receiptAttachments" });
    await expect(
      receive(receiver, { ...first, key: randomUUID() }, meta),
    ).rejects.toMatchObject({ code: "receiptAttachments" });
    await receive(receiver, first, meta);
    expect((await requestDetail(receiver, id)).files.map((f) => f.id)).toEqual(
      first.attachmentIds,
    );
    await receive(receiver, first, meta);
    expect((await request(id)).status).toBe(4);
    expect(
      (await pg.query("SELECT id FROM receipts WHERE request_id=$1", [id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await pg.query<{ receipt_id: string }>(
          "SELECT receipt_id FROM attachments WHERE id=$1",
          first.attachmentIds,
        )
      ).rows[0].receipt_id,
    ).toBeTruthy();
    await expect(
      receive(receiver, await receipt("7"), meta),
    ).rejects.toMatchObject({ code: "receiptLimit" });
    await expect(
      receive(receiver, await receipt("6", "1"), meta),
    ).rejects.toMatchObject({ code: "receiptLimit" });
    await expect(
      receive(receiver, await receipt("11", "0", "0", "5"), meta),
    ).rejects.toMatchObject({ code: "returned" });
    await receive(receiver, await receipt("6"), meta);
    expect((await request(id)).status).toBe(5);
    await expect(
      receive(receiver, await receipt("1"), meta),
    ).rejects.toMatchObject({ code: "receiptLimit" });
    await receive(receiver, await receipt("0", "0", "0", "2"), meta);
    expect((await request(id)).status).toBe(4);
    await receive(receiver, await receipt("2"), meta);
    expect((await request(id)).status).toBe(5);
    const rawReceipt = randomUUID();
    await pg.query(
      "INSERT INTO receipts(id,request_id,created_by,idempotency_key) VALUES($1,$2,$3,$4)",
      [rawReceipt, id, ids.receiver, randomUUID()],
    );
    await expect(
      pg.query(
        "INSERT INTO receipt_lines(receipt_id,request_line_id,accepted,damaged,rejected,returned) VALUES($1,$2,1,0,0,0)",
        [rawReceipt, line.id],
      ),
    ).rejects.toThrow();
  });
  it("compares multiple supplier quotes, restricts financial approval and invalidates changed pricing", async () => {
    const { id } = await create("1");
    await transitionRequest(
      technical,
      { id, version: 1, status: 9, reason: "" },
      meta,
    );
    await transitionRequest(
      finance,
      { id, version: 2, status: 2, reason: "" },
      meta,
    );
    const line = (
      await pg.query<{ id: string }>(
        "SELECT id FROM request_lines WHERE request_id=$1",
        [id],
      )
    ).rows[0];
    const supplier = randomUUID();
    await pg.query("INSERT INTO suppliers(id,name) VALUES($1,$2)", [
      supplier,
      "مورد بديل " + supplier,
    ]);
    const offers = [
      {
        supplierId: ids.supplier,
        expectedAt: "2026-12-10",
        prices: [{ id: line.id, price: "5.25" }],
      },
      {
        supplierId: supplier,
        expectedAt: "2026-12-11",
        prices: [{ id: line.id, price: "4.00" }],
      },
    ];
    await expect(
      placeOrder(buyer, { id, version: 3 }, meta),
    ).rejects.toMatchObject({ code: "pricingRequired" });
    await expect(
      transitionRequest(owner, { id, version: 3, status: 3, reason: "" }, meta),
    ).rejects.toMatchObject({ code: "transition" });
    await submitQuotations(
      buyer,
      { id, version: 3, offers, selectedIndex: 1 },
      meta,
    );
    const financeOnly = {
      ...finance,
      permissions: [
        "requests.view",
        "requests.view_all",
        "projects.all",
        "finance.view",
        "finance.approve",
      ],
    };
    const detail = await requestDetail(financeOnly, id);
    expect(detail.quotes).toHaveLength(2);
    expect(detail.quotes.find((q) => q.selected)?.supplier_id).toBe(supplier);
    expect((await requestDetail(engineer, id)).quotes).toHaveLength(0);
    expect(
      (await listRequests(financeOnly, { q: "" }, "finance")).items.map(
        (x) => x.id,
      ),
    ).toContain(id);
    await expect(
      transitionRequest(
        buyer,
        { id, version: 4, status: 11, reason: "" },
        meta,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await transitionRequest(
      financeOnly,
      { id, version: 4, status: 2, reason: "مراجعة السعر" },
      meta,
    );
    await submitQuotations(
      buyer,
      { id, version: 5, offers, selectedIndex: 1 },
      meta,
    );
    await transitionRequest(
      financeOnly,
      { id, version: 6, status: 11, reason: "" },
      meta,
    );
    await submitQuotations(
      buyer,
      { id, version: 7, offers, selectedIndex: 0 },
      meta,
    );
    expect((await request(id)).status).toBe(10);
    await expect(
      placeOrder(buyer, { id, version: 8 }, meta),
    ).rejects.toMatchObject({ code: "pricingRequired" });
    await transitionRequest(
      financeOnly,
      { id, version: 8, status: 11, reason: "" },
      meta,
    );
    await placeOrder(buyer, { id, version: 9 }, meta);
    expect((await requestDetail(financeOnly, id)).lines[0].price).toBe("5.25");
    expect(
      (
        await pg.query<{ supplier_id: string }>(
          "SELECT supplier_id FROM purchase_requests WHERE id=$1",
          [id],
        )
      ).rows[0].supplier_id,
    ).toBe(ids.supplier);
    await saveRequest(
      engineer,
      {
        id,
        version: (await request(id)).version,
        projectId: ids.p1,
        notes: "",
        submit: true,
        lines: [{ materialId: ids.material, quantity: "2", notes: "" }],
      },
      meta,
    );
    expect((await request(id)).status).toBe(1);
    expect((await requestDetail(owner, id)).quotes).toHaveLength(0);
    await expect(
      placeOrder(owner, { id, version: (await request(id)).version }, meta),
    ).rejects.toMatchObject({ code: "pricingRequired" });
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
  it("queues device notifications and rechecks notification preferences before delivery", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:admin@test.invalid");
    const subscription = (
      await pg.query<{ id: string }>(
        "INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,'public','secret') RETURNING id",
        [ids.owner, "https://fcm.googleapis.com/fcm/send/test"],
      )
    ).rows[0];
    await create("1");
    await processJobs(200);
    expect(state.push).toHaveBeenCalled();
    const notification = (
      await pg.query<{ id: string; type: number }>(
        "SELECT id,type FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
        [ids.owner],
      )
    ).rows[0];
    const before = state.push.mock.calls.length;
    await pg.query(
      "INSERT INTO notification_preferences(user_id,type,in_app,email) VALUES($1,$2,false,false) ON CONFLICT(user_id,type) DO UPDATE SET in_app=false",
      [ids.owner, notification.type],
    );
    await deliverPush(subscription.id, notification.id);
    expect(state.push.mock.calls.length).toBe(before);
    await pg.query("UPDATE notification_policy SET forced=true WHERE type=$1", [
      notification.type,
    ]);
    await deliverPush(subscription.id, notification.id);
    expect(state.push.mock.calls.length).toBe(before + 1);
    await pg.query(
      "UPDATE notification_policy SET forced=false WHERE type=$1",
      [notification.type],
    );
    expect((await liveSnapshot(owner)).unread).toBeGreaterThan(0);
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
    expect(data.slice(0, 2).map((row) => row.slice(4, 6))).toEqual([
      ["", ""],
      ["", ""],
    ]);
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
  it("saves and lists unmeasured parent items, including parents from older records", async () => {
    const fields = { projectId: ids.p1, code: "TEST-MAIN", name: "بند رئيسي" };
    const main = await saveBoq(
      owner,
      boqSchema.parse({ ...fields, level: 1, parentId: null }),
      meta,
    );
    const secondary = await saveBoq(
      owner,
      boqSchema.parse({
        ...fields,
        code: "TEST-SECOND",
        level: 2,
        parentId: main.id,
      }),
      meta,
    );
    const leaf = {
      ...fields,
      code: "TEST-LEAF",
      level: 3,
      parentId: secondary.id,
      description: "وصف",
    };
    expect(boqSchema.safeParse({ ...leaf, quantity: "1" }).success).toBe(false);
    expect(boqSchema.safeParse({ ...leaf, unitId: ids.unit }).success).toBe(
      false,
    );
    await saveBoq(
      owner,
      boqSchema.parse({ ...leaf, unitId: ids.unit, quantity: "1.25" }),
      meta,
    );
    expect(
      (
        await pg.query(
          "SELECT unit_id,quantity FROM boq_items WHERE id IN ($1,$2)",
          [main.id, secondary.id],
        )
      ).rows,
    ).toEqual([
      { unit_id: null, quantity: null },
      { unit_id: null, quantity: null },
    ]);
    const parents = await listResource(owner, "boq", {
      q: "",
      project: ids.p1,
      level: 2,
      selectable: "1",
    });
    for (const id of [ids.secondary, secondary.id])
      expect(parents.items).toContainEqual(
        expect.objectContaining({
          id,
          unit_name: null,
          unit_id: null,
          quantity: null,
        }),
      );
    await expect(
      pg.query(
        "UPDATE boq_items SET quantity=NULL WHERE code='TEST-LEAF' AND project_id=$1",
        [ids.p1],
      ),
    ).rejects.toThrow();
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
  it("assigns multiple projects, disables accounts and roles, and deletes users without losing historical actors", async () => {
    for (const key of [
      "requests.view",
      "requests.create",
      "projects.view",
      "boq.view",
    ])
      await pg.query(
        "INSERT INTO permissions(key,label) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
        [key, ar.common.actions],
      );
    const role = await saveRole(
      owner,
      {
        name: "دور إدارة الاختبار",
        permissions: [
          "requests.view",
          "requests.create",
          "projects.view",
          "boq.view",
        ],
      },
      meta,
    );
    const identifier = `member-${randomUUID()}`;
    const account = await saveUser(
      owner,
      {
        name: "مستخدم متعدد المشاريع",
        email: `${identifier}@test.invalid`,
        username: identifier,
        jobTitle: "مهندس",
        whatsappCountryCode: "+966",
        whatsappNumber: "",
        whatsappEnabled: false,
        roleId: role.id,
        projectIds: [ids.p1, ids.p2],
        password: "Temporary-test-12345",
        locked: false,
        forcePasswordChange: false,
        otpEnabled: false,
        otpExempt: false,
      },
      meta,
    );
    expect(
      (
        await pg.query(
          "SELECT project_id FROM project_users WHERE user_id=$1",
          [account.id],
        )
      ).rows,
    ).toHaveLength(2);
    await login({
      identifier,
      password: "Temporary-test-12345",
      remember: false,
    });
    expect((await currentActor())?.id).toBe(account.id);
    await setActive(
      owner,
      { resource: "user", id: account.id, active: false },
      meta,
    );
    expect(await currentActor()).toBeNull();
    await expect(
      login({ identifier, password: "Temporary-test-12345", remember: false }),
    ).rejects.toMatchObject({ status: 401 });
    await setActive(
      owner,
      { resource: "user", id: account.id, active: true },
      meta,
    );
    await login({
      identifier,
      password: "Temporary-test-12345",
      remember: false,
    });
    await setActive(
      owner,
      { resource: "role", id: role.id, active: false },
      meta,
    );
    expect(await currentActor()).toBeNull();
    await expect(
      login({ identifier, password: "Temporary-test-12345", remember: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await listResource(owner, "roles", {
          q: "دور إدارة الاختبار",
          selectable: "1",
        })
      ).items.map((row) => row.id),
    ).not.toContain(role.id);
    await setActive(
      owner,
      { resource: "role", id: role.id, active: true },
      meta,
    );
    await login({
      identifier,
      password: "Temporary-test-12345",
      remember: false,
    });
    const user = await requireActor();
    const request = await saveRequest(
      user,
      {
        projectId: ids.p1,
        notes: "",
        submit: false,
        lines: [{ materialId: ids.material, quantity: "1", notes: "" }],
      },
      meta,
    );
    await deleteRecord(owner, { resource: "user", id: account.id }, meta);
    expect(await currentActor()).toBeNull();
    expect(
      (await listResource(owner, "users", { q: identifier })).items,
    ).toHaveLength(0);
    await expect(
      login({ identifier, password: "Temporary-test-12345", remember: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await pg.query<{ name: string }>(
          "SELECT u.name FROM purchase_requests r JOIN users u ON u.id=r.created_by WHERE r.id=$1",
          [request.id],
        )
      ).rows[0].name,
    ).toBe("مستخدم متعدد المشاريع");
    await expect(
      deleteRecord(owner, { resource: "user", id: ids.owner }, meta),
    ).rejects.toMatchObject({ code: "owner" });
    await expect(
      setActive(owner, { resource: "role", id: ids.role, active: false }, meta),
    ).rejects.toMatchObject({ code: "owner" });
    await expect(
      pg.query("UPDATE users SET deleted_at=now() WHERE id=$1", [ids.owner]),
    ).rejects.toThrow();
    await expect(
      pg.query("UPDATE roles SET active=false WHERE id=$1", [ids.role]),
    ).rejects.toThrow();
  });
  it("keeps project APIs forbidden until a forced password change completes, including for the owner", async () => {
    await pg.query("UPDATE users SET force_password_change=true WHERE id=$1", [
      ids.owner,
    ]);
    const result = await login({
      identifier: owner.email,
      password: "Test-password-12345",
      remember: false,
    });
    expect(result).toEqual({ redirect: "/settings/security" });
    const endpoint = new Request(
      "http://localhost:3000/api/options?resource=projects&q=",
    );
    const blocked = await options(endpoint);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: ar.errors.forcePassword });
    await expect(requireActor()).rejects.toMatchObject({
      code: "forcePassword",
      status: 403,
    });
    const account = await requireActor(true);
    await changePassword(account, {
      current: "Test-password-12345",
      password: "Updated-password-12345",
    });
    expect((await requireActor()).force_password_change).toBe(false);
    const allowed = await options(endpoint);
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).items.length).toBeGreaterThan(0);
  });
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

describe("Owner-only request purge", () => {
  let admin: Actor;
  it("identifies missing mail settings without using OTP attempts", async () => {
    const key = process.env.RESEND_API_KEY!,
      sender = process.env.EMAIL_FROM!;
    const before = (
      await pg.query<{ n: number }>(
        "SELECT count(*)::int n FROM rate_limits WHERE key LIKE 'purge-issue%'",
      )
    ).rows[0].n;
    try {
      vi.stubEnv("RESEND_API_KEY", "");
      await expect(issueRequestPurge(owner, meta)).rejects.toMatchObject({
        code: "mailKeyMissing",
        status: 503,
      });
      vi.stubEnv("RESEND_API_KEY", key);
      vi.stubEnv("EMAIL_FROM", " ");
      await expect(issueRequestPurge(owner, meta)).rejects.toMatchObject({
        code: "mailSenderMissing",
        status: 503,
      });
    } finally {
      vi.stubEnv("RESEND_API_KEY", key);
      vi.stubEnv("EMAIL_FROM", sender);
    }
    expect(
      (
        await pg.query<{ n: number }>(
          "SELECT count(*)::int n FROM rate_limits WHERE key LIKE 'purge-issue%'",
        )
      ).rows[0].n,
    ).toBe(before);
  });
  async function codeFor(challenge: string) {
    const mail = (
      await pg.query<{ payload: { encrypted: string } }>(
        "SELECT payload FROM outbox WHERE kind=2 AND payload->>'key'=$1",
        ["purge:" + challenge],
      )
    ).rows[0];
    return decrypt<{ html: string }>(mail.payload.encrypted).html.match(
      /dir="ltr">(\d{6})/,
    )![1];
  }
  async function session() {
    const id = randomUUID();
    await pg.query(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,ip,user_agent) VALUES($1,$2,$3,now()+interval '1 hour','127.0.0.1','purge-test')",
      [id, ids.owner, randomUUID()],
    );
    return { ...owner, session_id: id };
  }
  it("requires the database owner and binds an encrypted, hashed code to its issuing session", async () => {
    await expect(issueRequestPurge(engineer, meta)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      issueRequestPurge({ ...engineer, is_owner: true }, meta),
    ).rejects.toMatchObject({ status: 403 });
    admin = await session();
    const challenge = await issueRequestPurge(admin, meta),
      code = await codeFor(challenge.challenge);
    expect(challenge.email).toBe(owner.email);
    const stored = (
      await pg.query<{ token_hash: string }>(
        "SELECT token_hash FROM request_purge_challenges WHERE id=$1",
        [challenge.challenge],
      )
    ).rows[0];
    expect(stored.token_hash).not.toBe(code);
    expect(stored.token_hash).toHaveLength(64);
    const device = await session();
    await expect(
      purgeRequests(device, { challenge: challenge.challenge, code }, meta),
    ).rejects.toMatchObject({ code: "purge" });
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      await expect(
        purgeRequests(
          admin,
          { challenge: challenge.challenge, code: wrong },
          meta,
        ),
      ).rejects.toMatchObject({ code: "purge" });
    expect(
      (
        await pg.query<{ attempts: number }>(
          "SELECT attempts FROM request_purge_challenges WHERE id=$1",
          [challenge.challenge],
        )
      ).rows[0].attempts,
    ).toBe(5);
    await expect(
      purgeRequests(admin, { challenge: challenge.challenge, code }, meta),
    ).rejects.toMatchObject({ code: "purge" });
  });
  it("expires codes, invalidates earlier resends, and revokes challenges with the session", async () => {
    await pg.query("DELETE FROM rate_limits WHERE key LIKE 'purge-%'");
    admin = await session();
    const first = await issueRequestPurge(admin, meta);
    const firstCode = await codeFor(first.challenge);
    const second = await issueRequestPurge(admin, meta);
    const secondCode = await codeFor(second.challenge);
    expect(
      (
        await pg.query("SELECT id FROM request_purge_challenges WHERE id=$1", [
          first.challenge,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      purgeRequests(
        admin,
        { challenge: first.challenge, code: firstCode },
        meta,
      ),
    ).rejects.toMatchObject({ code: "purge" });
    await pg.query(
      "UPDATE request_purge_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
      [second.challenge],
    );
    await expect(
      purgeRequests(
        admin,
        { challenge: second.challenge, code: secondCode },
        meta,
      ),
    ).rejects.toMatchObject({ code: "purge" });
    await pg.query("DELETE FROM sessions WHERE id=$1", [admin.session_id]);
    expect(
      (
        await pg.query(
          "SELECT id FROM request_purge_challenges WHERE user_id=$1",
          [ids.owner],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("atomically removes request dependents, preserves master data and immutable audit, queues file removal, and prevents replay", async () => {
    await pg.query("DELETE FROM rate_limits WHERE key LIKE 'purge-%'");
    admin = await session();
    const request = randomUUID(),
      line = randomUUID(),
      receipt = randomUUID();
    await pg.query(
      "INSERT INTO purchase_requests(id,project_id,created_by,status) VALUES($1,$2,$3,3)",
      [request, ids.p1, ids.owner],
    );
    await pg.query(
      "INSERT INTO request_lines(id,request_id,material_id,quantity) VALUES($1,$2,$3,1)",
      [line, request, ids.material],
    );
    await pg.query(
      "INSERT INTO receipts(id,request_id,created_by,idempotency_key) VALUES($1,$2,$3,$4)",
      [receipt, request, ids.owner, randomUUID()],
    );
    await pg.query(
      "INSERT INTO receipt_lines(receipt_id,request_line_id,accepted,damaged,rejected,returned) VALUES($1,$2,1,0,0,0)",
      [receipt, line],
    );
    await pg.query(
      "INSERT INTO request_timeline(request_id,user_id,from_status,to_status) VALUES($1,$2,3,5)",
      [request, ids.owner],
    );
    await pg.query(
      "INSERT INTO attachments(request_id,receipt_id,uploaded_by,public_id,resource_type,format,name,bytes) VALUES($1,$2,$3,'purge-test-asset','image','png','اختبار',100)",
      [request, receipt, ids.owner],
    );
    await pg.query(
      "INSERT INTO notification_policy(type) VALUES(0) ON CONFLICT DO NOTHING",
    );
    await pg.query(
      "INSERT INTO notifications(user_id,event_id,type,request_id) VALUES($1,$2,0,$3)",
      [ids.engineer, randomUUID(), request],
    );
    await pg.exec("SELECT ensure_audit_partition(now())");
    const auditId = randomUUID();
    await pg.query(
      "INSERT INTO audit_log(id,actor_id,entity_id,action,entity,ip,user_agent,diff) VALUES($1,$2,$3,0,4,'test','test','{}')",
      [auditId, ids.owner, auditId],
    );
    expect(
      (await auditList(owner, { q: auditId })).items.map((row) => row.id),
    ).toEqual([auditId]);
    expect(
      (await notifications(engineer, undefined, "no-such-notification-query"))
        .items,
    ).toHaveLength(0);
    const masters = [
      "users",
      "roles",
      "projects",
      "boq_items",
      "materials",
      "units",
      "suppliers",
    ];
    const counts = await Promise.all(
      masters.map((table) =>
        pg
          .query<{ n: number }>("SELECT count(*)::int n FROM " + table)
          .then((result) => result.rows[0].n),
      ),
    );
    const challenge = await issueRequestPurge(admin, meta),
      code = await codeFor(challenge.challenge);
    await pg.exec(
      "CREATE FUNCTION reject_purge_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rollback-test'; END $$; CREATE TRIGGER reject_purge_test BEFORE DELETE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION reject_purge_test()",
    );
    await expect(
      purgeRequests(admin, { challenge: challenge.challenge, code }, meta),
    ).rejects.toThrow();
    expect(
      (await pg.query("SELECT id FROM receipts WHERE id=$1", [receipt])).rows,
    ).toHaveLength(1);
    expect(
      (
        await pg.query("SELECT id FROM attachments WHERE request_id=$1", [
          request,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await pg.query<{ verified_at: Date | null }>(
          "SELECT verified_at FROM request_purge_challenges WHERE id=$1",
          [challenge.challenge],
        )
      ).rows[0].verified_at,
    ).toBeNull();
    await pg.exec(
      "DROP TRIGGER reject_purge_test ON purchase_requests; DROP FUNCTION reject_purge_test()",
    );
    const result = await purgeRequests(
      admin,
      { challenge: challenge.challenge, code },
      meta,
    );
    expect(result.deleted).toBeGreaterThan(0);
    for (const table of [
      "purchase_requests",
      "request_lines",
      "receipts",
      "receipt_lines",
      "request_timeline",
      "attachments",
      "notifications",
    ])
      expect(
        (await pg.query<{ n: number }>("SELECT count(*)::int n FROM " + table))
          .rows[0].n,
      ).toBe(0);
    for (let i = 0; i < masters.length; i++)
      expect(
        (
          await pg.query<{ n: number }>(
            "SELECT count(*)::int n FROM " + masters[i],
          )
        ).rows[0].n,
      ).toBe(counts[i]);
    expect(
      (await pg.query("SELECT id FROM audit_log WHERE id=$1", [auditId])).rows,
    ).toHaveLength(1);
    await expect(
      pg.query("DELETE FROM audit_log WHERE id=$1", [auditId]),
    ).rejects.toThrow();
    await expect(
      purgeRequests(admin, { challenge: challenge.challenge, code }, meta),
    ).rejects.toMatchObject({ code: "purge" });
    expect(
      (
        await pg.query("SELECT id FROM sessions WHERE id=$1", [
          admin.session_id,
        ])
      ).rows,
    ).toHaveLength(1);
    await processJobs(1000);
    expect(state.cloudDestroy).toHaveBeenCalledWith("purge-test-asset", {
      resource_type: "image",
      type: "authenticated",
      invalidate: true,
    });
    expect(
      (await pg.query("SELECT id FROM outbox WHERE kind=4")).rows,
    ).toHaveLength(0);
  });
});
