import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/domain";
const state = vi.hoisted(() => ({
  database: null as unknown,
  actor: null as unknown,
}));
vi.mock("@/db", async () => {
  const { sql } = await import("drizzle-orm");
  return {
    db: () => state.database,
    sql,
    rows: async (query: unknown, conn = state.database) =>
      (
        await (
          conn as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
        ).execute(query)
      ).rows,
    one: async (query: unknown, conn = state.database) =>
      (
        await (
          conn as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
        ).execute(query)
      ).rows[0],
  };
});
vi.mock("@/server/auth", () => ({ requireActor: async () => state.actor }));
import {
  reportContext,
  consumptionPage,
  reportOverview,
  reportOptions,
} from "@/server/reports";
import {
  printRequestLines,
  printRequestHeader,
  printReceipts,
  printHistory,
  printAttachments,
} from "@/server/request-print";
import { GET as exportReport } from "@/app/api/reports/export/route";
import {
  reportQuerySchema,
  consumption,
  requestPrintSchema,
} from "@/lib/reporting";
const ids = Object.fromEntries(
  [
    "role",
    "owner",
    "engineer",
    "analyst",
    "p1",
    "p2",
    "main",
    "secondary",
    "leaf",
    "leafKg",
    "unit",
    "kg",
    "a",
    "b",
    "c",
    "old",
    "new",
    "kgRequest",
  ].map((key) => [key, randomUUID()]),
);
function actor(id: string, permissions: string[], owner = false): Actor {
  return {
    id,
    name: "مستخدم تقرير",
    email: `${id}@example.invalid`,
    username: id,
    role_id: ids.role,
    role_name: "دور",
    job_title: "مهندس",
    is_owner: owner,
    permissions,
    force_password_change: false,
    theme: 0,
    otp_enabled: false,
    otp_exempt: false,
    session_id: randomUUID(),
    expires_at: new Date(Date.now() + 3600000),
    remember: false,
  };
}
const owner = actor(ids.owner, [], true),
  engineer = actor(ids.engineer, ["reports.view", "requests.view"]),
  analyst = actor(ids.analyst, [
    "reports.view",
    "reports.export",
    "requests.view",
    "requests.view_all",
    "technical.view",
  ]);
const q = () =>
  reportQuerySchema.parse({
    project: ids.p1,
    from: "2026-02-01",
    to: "2026-02-28",
  }) as ReturnType<typeof reportQuerySchema.parse> & { project: string };
let pg: PGlite, oldLine: string;
async function makeRequest(
  id: string,
  status: number,
  createdBy: string,
  at: string,
  material: string,
  quantity: string,
) {
  const line = randomUUID();
  await pg.query(
    "INSERT INTO purchase_requests(id,project_id,created_by,status,submitted_at,created_at) VALUES($1,$2,$3,$4,$5,$5)",
    [id, ids.p1, createdBy, status, at],
  );
  await pg.query(
    "INSERT INTO request_lines(id,request_id,material_id,quantity,price) VALUES($1,$2,$3,$4,4.25)",
    [line, id, material, quantity],
  );
  return line;
}
async function receipt(
  at: string,
  accepted: string,
  returned: string,
  damaged = "0",
  rejected = "0",
) {
  const id = randomUUID();
  await pg.query(
    "INSERT INTO receipts(id,request_id,created_by,idempotency_key,created_at) VALUES($1,$2,$3,$4,$5)",
    [id, ids.old, ids.owner, randomUUID(), at],
  );
  await pg.query(
    "INSERT INTO receipt_lines(receipt_id,request_line_id,accepted,returned,damaged,rejected) VALUES($1,$2,$3,$4,$5,$6)",
    [id, oldLine, accepted, returned, damaged, rejected],
  );
  return id;
}
beforeAll(async () => {
  pg = new PGlite();
  state.database = drizzle(pg);
  for (const folder of ["drizzle/generated", "drizzle/custom"])
    for (const file of (await readdir(folder))
      .filter(
        (file) =>
          file.endsWith(".sql") && file !== "0006_pricing_and_receipts.sql",
      )
      .sort())
      await pg.exec(await readFile(`${folder}/${file}`, "utf8"));
  await pg.query("INSERT INTO settings(id) VALUES(1)");
  await pg.query("INSERT INTO roles(id,name) VALUES($1,'دور تقارير')", [
    ids.role,
  ]);
  for (const person of [owner, engineer, analyst])
    await pg.query(
      "INSERT INTO users(id,name,email,username,job_title,password_hash,role_id,is_owner,force_password_change) VALUES($1,$2,$3,$4,'مهندس','test-only-hash',$5,$6,false)",
      [
        person.id,
        person.name,
        person.email,
        person.username,
        ids.role,
        person.is_owner,
      ],
    );
  await pg.query(
    "INSERT INTO projects(id,code,name) VALUES($1,'R1','مشروع التقارير'),($2,'R2','مشروع محجوب')",
    [ids.p1, ids.p2],
  );
  for (const user of [ids.engineer, ids.analyst])
    await pg.query(
      "INSERT INTO project_users(project_id,user_id) VALUES($1,$2)",
      [ids.p1, user],
    );
  await pg.query(
    "INSERT INTO units(id,name,symbol) VALUES($1,'متر مكعب','م³'),($2,'كيلوجرام','كجم')",
    [ids.unit, ids.kg],
  );
  for (const [id, level, parent, code, unit] of [
    [ids.main, 1, null, "01", ids.unit],
    [ids.secondary, 2, ids.main, "01.01", ids.unit],
    [ids.leaf, 3, ids.secondary, "01.01.01", ids.unit],
    [ids.leafKg, 3, ids.secondary, "01.01.02", ids.kg],
  ])
    await pg.query(
      "INSERT INTO boq_items(id,project_id,parent_id,level,code,name,description,unit_id,quantity) VALUES($1,$2,$3,$4,$5,'بند',$6,$7,999)",
      [id, ids.p1, parent, level, code, level === 3 ? "وصف البند" : null, unit],
    );
  for (const [id, item, name, limit] of [
    [ids.a, ids.leaf, "خرسانة", 100],
    [ids.b, ids.leaf, "عازل", 40],
    [ids.c, ids.leafKg, "حديد", 50],
  ])
    await pg.query(
      "INSERT INTO materials(id,boq_item_id,name,quantity) VALUES($1,$2,$3,$4)",
      [id, item, name, limit],
    );
  oldLine = await makeRequest(
    ids.old,
    4,
    ids.owner,
    "2026-01-01T10:00:00Z",
    ids.a,
    "90",
  );
  const secondLine = randomUUID();
  await pg.query(
    "INSERT INTO request_lines(id,request_id,material_id,quantity,price) VALUES($1,$2,$3,5,3)",
    [secondLine, ids.old, ids.b],
  );
  await makeRequest(
    ids.new,
    1,
    ids.engineer,
    "2026-02-15T10:00:00Z",
    ids.a,
    "30",
  );
  await makeRequest(
    ids.kgRequest,
    3,
    ids.owner,
    "2026-01-10T10:00:00Z",
    ids.c,
    "400",
  );
  for (const status of [0, 7, 8])
    await makeRequest(
      randomUUID(),
      status,
      ids.engineer,
      "2026-02-05T12:00:00Z",
      ids.a,
      "9000",
    );
  await makeRequest(
    randomUUID(),
    3,
    ids.owner,
    "2026-03-01T10:00:00Z",
    ids.a,
    "1000",
  );
  const firstReceipt = await receipt(
    "2026-01-15T10:00:00Z",
    "80",
    "0",
    "2",
    "3",
  );
  await pg.query(
    "INSERT INTO receipt_lines(receipt_id,request_line_id,accepted,returned,damaged,rejected) VALUES($1,$2,4,0,0,0)",
    [firstReceipt, secondLine],
  );
  await receipt("2026-01-20T10:00:00Z", "0", "10");
  await receipt("2026-01-31T21:30:00Z", "40", "5");
  await receipt("2026-03-01T10:00:00Z", "1000", "0");
  // Existing over-receipts remain reportable after installing the new limit.
  await pg.exec(
    await readFile("drizzle/custom/0006_pricing_and_receipts.sql", "utf8"),
  );
});
afterAll(async () => {
  await pg.close();
});
describe("Material consumption reports", () => {
  it("compares every material to its own allocation and avoids multiplying requests by receipts", async () => {
    const data = await consumptionPage(analyst, q());
    const concrete = data.items.find((row) => row.id === ids.a)!;
    expect(concrete).toMatchObject({
      allocated: "100.000",
      requested: "120.000",
      received: "105.000",
      period_requested: "30.000",
      period_received: "35.000",
      damaged: "2.000",
      rejected: "3.000",
      returned: "15.000",
    });
    expect(consumption(concrete)).toMatchObject({
      receivedRate: "105.00",
      requestedRate: "120.00",
      requestedOverage: "20.000",
      requestedOverageRate: "20.00",
      receivedOverage: "5.000",
      receivedOverageRate: "5.00",
    });
    expect(data.items.find((row) => row.id === ids.b)).toMatchObject({
      allocated: "40.000",
      requested: "5.000",
      received: "4.000",
    });
  });
  it("uses the Riyadh date of each receipt independently of its request date", async () => {
    const january = await consumptionPage(analyst, {
      ...q(),
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(january.items.find((row) => row.id === ids.a)).toMatchObject({
      requested: "90.000",
      received: "70.000",
    });
    const overview = await reportOverview(analyst, q());
    expect(overview.request_count).toBe(1);
    expect(overview.receipt_count).toBe(1);
    expect(
      overview.trend.find((point) => point.month === "2026-02"),
    ).toMatchObject({ requests: 1, receipts: 1 });
  });
  it("counts overages per material without adding quantities in different units", async () => {
    const overview = await reportOverview(analyst, q());
    expect(overview).toMatchObject({
      items: 2,
      materials: 3,
      requested_over: 2,
      received_over: 1,
      untouched: 1,
      within_limit: 1,
    });
    expect(overview.trend).toHaveLength(12);
    expect(overview.top[0]).toMatchObject({
      id: ids.c,
      allocated: "50.000",
      requested: "400.000",
      unit_name: "كيلوجرام",
    });
  });
  it("preserves creator visibility and project assignments even with reports permissions", async () => {
    const own = await consumptionPage(engineer, q());
    expect(own.items.find((row) => row.id === ids.a)).toMatchObject({
      requested: "30.000",
      received: "0",
    });
    await expect(
      consumptionPage(analyst, { ...q(), project: ids.p2 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      consumptionPage({ ...analyst, permissions: [] }, q()),
    ).rejects.toMatchObject({ status: 403 });
    const projects = await reportOptions(analyst, "report-projects", { q: "" });
    expect(projects.items.map((project) => project.id)).toEqual([ids.p1]);
  });
  it("filters a leaf, an ancestor, several items, and Arabic search across the whole project", async () => {
    const leaf = await consumptionPage(analyst, { ...q(), items: [ids.leaf] });
    expect(leaf.items.map((row) => row.id).sort()).toEqual(
      [ids.a, ids.b].sort(),
    );
    const ancestor = await consumptionPage(analyst, {
      ...q(),
      items: [ids.main],
    });
    expect(ancestor.items).toHaveLength(3);
    const search = await consumptionPage(analyst, {
      ...q(),
      items: [ids.leaf, ids.leafKg],
      q: "حديد",
    });
    expect(search.items.map((row) => row.id)).toEqual([ids.c]);
    await expect(
      reportContext(analyst, { ...q(), items: [randomUUID()] }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      consumptionPage(analyst, { ...q(), cursor: "invalid" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
  it("validates date ranges, identifiers, item limits, and nonempty print sections", () => {
    expect(
      reportQuerySchema.safeParse({ from: "2026-03-01", to: "2026-02-28" })
        .success,
    ).toBe(false);
    expect(reportQuerySchema.safeParse({ items: "not-an-id" }).success).toBe(
      false,
    );
    expect(
      reportQuerySchema.safeParse({
        items: Array.from({ length: 31 }, () => randomUUID()).join(","),
      }).success,
    ).toBe(false);
    expect(
      requestPrintSchema.safeParse({
        materials: "0",
        receipts: "0",
        attachments: "0",
        timeline: "0",
      }).success,
    ).toBe(false);
    expect(
      requestPrintSchema.safeParse({
        materials: "0",
        receipts: "0",
        attachments: "1",
        timeline: "0",
      }).success,
    ).toBe(true);
  });
});
describe("Authorized complete print and export data", () => {
  it("keeps print data scoped and hides prices even when a print flag is forged", async () => {
    const lines = await printRequestLines(analyst, ids.old, true);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.price === null)).toBe(true);
    const priced = await printRequestLines(
      { ...analyst, permissions: [...analyst.permissions, "procurement.view"] },
      ids.old,
      true,
    );
    expect(priced[0].price).not.toBeNull();
    await expect(printRequestHeader(engineer, ids.old)).rejects.toMatchObject({
      status: 404,
    });
    expect((await printRequestHeader(analyst, ids.old)).project_code).toBe(
      "R1",
    );
  });
  it("paginates all receipts, attachments, and timeline entries beyond the screen's latest 25", async () => {
    for (let i = 0; i < 31; i++) {
      const at = new Date(Date.UTC(2026, 2, 2, 12, 0, i)).toISOString();
      await receipt(at, "0", "0.001");
      await pg.query(
        "INSERT INTO request_timeline(request_id,user_id,from_status,to_status,note,created_at) VALUES($1,$2,3,4,$3,$4)",
        [ids.old, ids.owner, `ملاحظة ${i}`, at],
      );
      await pg.query(
        "INSERT INTO attachments(request_id,uploaded_by,public_id,resource_type,format,name,bytes,created_at) VALUES($1,$2,$3,'raw','pdf',$4,100,$5)",
        [ids.old, ids.owner, randomUUID(), `محضر ${i}.pdf`, at],
      );
    }
    for (const [fetch, expected] of [
      [printReceipts, 35],
      [printHistory, 31],
      [printAttachments, 31],
    ] as const) {
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const data = await fetch(analyst, ids.old, cursor);
        expect(data.items.length).toBeLessThanOrEqual(25);
        data.items.forEach((item) => {
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        });
        cursor = data.next || undefined;
      } while (cursor);
      expect(seen.size).toBe(expected);
    }
    const receipts = await printReceipts(analyst, ids.old);
    expect(receipts.items[0].lines).toHaveLength(2);
    await expect(printAttachments(engineer, ids.old)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("exports every filtered material using bounded pages and escapes spreadsheet formulas", async () => {
    for (let i = 0; i < 205; i++)
      await pg.query(
        "INSERT INTO materials(boq_item_id,name,quantity) VALUES($1,$2,1)",
        [ids.leaf, `تصدير ${String(i).padStart(3, "0")}`],
      );
    const query = { ...q(), q: "تصدير" },
      seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const data = await consumptionPage(analyst, { ...query, cursor });
      data.items.forEach((row) => {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      });
      cursor = data.next || undefined;
    } while (cursor);
    expect(seen.size).toBe(205);
    state.actor = analyst;
    const response = await exportReport(
      new Request(
        `https://test.invalid/api/reports/export?project=${ids.p1}&q=${encodeURIComponent("تصدير")}&to=2026-02-28`,
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const csv = await response.text();
    expect(csv.trim().split("\r\n")).toHaveLength(206);
    expect(csv).toContain("تصدير 204");
    await pg.query(
      "INSERT INTO materials(boq_item_id,name,quantity) VALUES($1,'=1+1',1)",
      [ids.leaf],
    );
    const safe = await exportReport(
      new Request(
        `https://test.invalid/api/reports/export?project=${ids.p1}&q=%3D1%2B1`,
      ),
    );
    expect(await safe.text()).toContain("'=1+1");
  });
  it("requires both report viewing and export permissions", async () => {
    for (const permissions of [["reports.view"], ["reports.export"]]) {
      state.actor = { ...analyst, permissions };
      const response = await exportReport(
        new Request(
          `https://test.invalid/api/reports/export?project=${ids.p1}`,
        ),
      );
      expect(response.status).toBe(403);
    }
    state.actor = {
      ...analyst,
      permissions: ["reports.view", "reports.export"],
    };
    const outside = await exportReport(
      new Request(`https://test.invalid/api/reports/export?project=${ids.p2}`),
    );
    expect(outside.status).toBe(403);
  });
  it("migrates only functional report permissions and grants the existing supervisor role idempotently", async () => {
    await pg.query(
      "INSERT INTO roles(name,system) VALUES('مشرف أعلى',true) ON CONFLICT DO NOTHING",
    );
    const migration = await readFile("drizzle/custom/0005_reports.sql", "utf8");
    await pg.exec(migration);
    await pg.exec(migration);
    const data = await pg.query<{ key: string }>(
      "SELECT p.key FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN roles r ON r.id=rp.role_id WHERE r.name='مشرف أعلى' AND p.key LIKE 'reports.%' ORDER BY p.key",
    );
    expect(data.rows.map((row) => row.key)).toEqual([
      "reports.export",
      "reports.view",
    ]);
  });
});
