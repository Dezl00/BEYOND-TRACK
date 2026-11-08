import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { whatsappRecipient } from "@/lib/whatsapp-phone";
import {
  userSchema,
  preferencesSchema,
  settingsSchema,
} from "@/lib/validation";
import type { Actor } from "@/lib/domain";

const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/db", async () => {
  const { sql } = await import("drizzle-orm");
  const rows = async (q: unknown, c = state.database) =>
    (
      await (
        c as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
      ).execute(q)
    ).rows;
  return {
    db: () => state.database,
    sql,
    rows,
    one: async (q: unknown, c = state.database) => (await rows(q, c))[0],
  };
});
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async () => ({ error: null }) };
  },
}));
import { db } from "@/db";
import { saveUser, savePreferences, saveSettings } from "@/server/admin";
import { notify } from "@/server/events";
import { processJobs } from "@/server/jobs";
import { queueWhatsApp, deliverWhatsApp } from "@/server/whatsapp";
import { sendWhatsApp } from "@/server/whatsapp-gateway";
import { decrypt } from "@/server/security";

const ids = {
  owner: randomUUID(),
  user: randomUUID(),
  sender: randomUUID(),
  role: randomUUID(),
  project: randomUUID(),
  request: randomUUID(),
  permission: randomUUID(),
};
const owner = {
  id: ids.owner,
  is_owner: true,
  permissions: [],
  theme: 0,
  otp_enabled: false,
  otp_exempt: false,
} as unknown as Actor;
const account = {
  ...owner,
  id: ids.user,
  is_owner: false,
  permissions: ["requests.view"],
};
const meta = { ip: "127.0.0.1", userAgent: "WhatsApp tests" };
let pg: PGlite;
let gateway: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  vi.stubEnv("AUTH_SECRET", "whatsapp-test-secret-with-at-least-32-characters");
  vi.stubEnv("WHATSAPP_API_KEY", "test-device-key");
  vi.stubEnv("RESEND_API_KEY", "test-email");
  vi.stubEnv("EMAIL_FROM", "test@example.invalid");
  vi.stubEnv("APP_URL", "https://track.example.invalid");
  pg = new PGlite();
  state.database = drizzle(pg);
  for (const folder of ["drizzle/generated", "drizzle/custom"])
    for (const file of (await readdir(folder))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pg.exec(await readFile(`${folder}/${file}`, "utf8"));
  await pg.exec(
    "INSERT INTO settings(id) VALUES(1); INSERT INTO notification_policy(type) VALUES(0),(1),(2)",
  );
  await pg.query("INSERT INTO roles(id,name) VALUES($1,'Test')", [ids.role]);
  await pg.query(
    "INSERT INTO permissions(id,key,label) VALUES($1,'requests.view','View requests')",
    [ids.permission],
  );
  await pg.query(
    "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",
    [ids.role, ids.permission],
  );
  for (const id of [ids.owner, ids.user, ids.sender])
    await pg.query(
      "INSERT INTO users(id,name,email,username,job_title,password_hash,role_id,is_owner) VALUES($1::uuid,'Test',$2,$1::text,'Test','unused',$3,$4)",
      [id, `${id}@example.invalid`, ids.role, id === ids.owner],
    );
  await pg.query(
    "INSERT INTO projects(id,code,name) VALUES($1,'WA','WhatsApp')",
    [ids.project],
  );
  await pg.query(
    "INSERT INTO project_users(project_id,user_id) VALUES($1,$2)",
    [ids.project, ids.user],
  );
  await pg.query(
    "INSERT INTO purchase_requests(id,project_id,created_by,status) VALUES($1,$2,$3,1)",
    [ids.request, ids.project, ids.user],
  );
});
beforeEach(async () => {
  gateway = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: "gateway-test", state: "queued" }), {
        status: 202,
      }),
  );
  vi.stubGlobal("fetch", gateway);
  await pg.exec(
    "DELETE FROM outbox; DELETE FROM notification_preferences; UPDATE settings SET whatsapp_enabled=true; UPDATE notification_policy SET in_app=false,email=false,whatsapp=true,forced=false; UPDATE roles SET active=true;",
  );
  await pg.query(
    "UPDATE users SET whatsapp_country_code='+20',whatsapp_number='1144797501',whatsapp_enabled=true,locked=false,deleted_at=null WHERE id=$1",
    [ids.user],
  );
  await pg.query(
    "INSERT INTO project_users(project_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [ids.project, ids.user],
  );
  await pg.query(
    "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [ids.role, ids.permission],
  );
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
});
const preferences = (enabled: boolean) =>
  preferencesSchema.parse({
    theme: 0,
    otpEnabled: false,
    preferences: [0, 1, 2].map((type) => ({
      type,
      inApp: false,
      email: false,
      whatsapp: enabled,
    })),
  });
const userData = () =>
  userSchema.parse({
    id: ids.user,
    name: "User",
    email: `${ids.user}@example.invalid`,
    username: ids.user,
    jobTitle: "Engineer",
    roleId: ids.role,
    projectIds: [ids.project],
    whatsappCountryCode: "+20",
    whatsappNumber: "01144797501",
    whatsappEnabled: true,
  });
async function queued() {
  await queueWhatsApp(db(), {
    userId: ids.user,
    requestId: ids.request,
    type: 0,
    to: "+201144797501",
    text: "Test notification",
    key: "whatsapp:stable-test-key",
  });
  return (
    await pg.query<{ id: string; payload: Record<string, unknown> }>(
      "SELECT id,payload FROM outbox WHERE kind=5",
    )
  ).rows[0];
}

describe("WhatsApp numbers and settings", () => {
  it.each([
    ["+20", "01144797501", "+201144797501"],
    ["+20", "١١٤٤٧٩٧٥٠١", "+201144797501"],
    ["+966", "050 000 0000", "+966500000000"],
    ["+966", "۵۰۰۰۰۰۰۰۰", "+966500000000"],
    ["+20", "+201144797501", null],
    ["+20", "201144797501", null],
    ["+966", "00966500000000", null],
    ["+966", "01144797501", null],
    ["+20", "500000000", null],
    ["+1", "500000000", null],
  ])("normalizes %s / %s", (code, number, expected) =>
    expect(whatsappRecipient(code, number)).toBe(expected),
  );
  it("requires a valid local number when enabling an account", () => {
    const value = userData();
    expect(value.whatsappNumber).toBe("1144797501");
    expect(userSchema.safeParse({ ...value, whatsappNumber: "" }).success).toBe(
      false,
    );
    expect(
      userSchema.safeParse({ ...value, whatsappNumber: "+201144797501" })
        .success,
    ).toBe(false);
  });
  it("allows only user administrators to update the phone and records the change", async () => {
    await expect(saveUser(account, userData(), meta)).rejects.toMatchObject({
      status: 403,
    });
    await saveUser(
      owner,
      {
        ...userData(),
        whatsappCountryCode: "+966",
        whatsappNumber: "500000000",
      },
      meta,
    );
    const row = (
      await pg.query(
        "SELECT whatsapp_country_code,whatsapp_number,whatsapp_enabled FROM users WHERE id=$1",
        [ids.user],
      )
    ).rows[0];
    expect(row).toEqual({
      whatsapp_country_code: "+966",
      whatsapp_number: "500000000",
      whatsapp_enabled: true,
    });
    expect(
      JSON.stringify(
        (await pg.query("SELECT payload FROM outbox WHERE kind=0")).rows,
      ),
    ).toContain("whatsapp_number");
  });
  it("enforces valid country/number combinations in PostgreSQL", async () => {
    await expect(
      pg.query("UPDATE users SET whatsapp_country_code='+966' WHERE id=$1", [
        ids.user,
      ]),
    ).rejects.toThrow();
    await expect(
      pg.query("UPDATE users SET whatsapp_number=null WHERE id=$1", [ids.user]),
    ).rejects.toThrow();
  });
  it("persists user preferences and enforces mandatory policy", async () => {
    await savePreferences(account, preferences(false), meta);
    expect(
      (
        await pg.query<{ whatsapp: boolean }>(
          "SELECT whatsapp FROM notification_preferences WHERE user_id=$1",
          [ids.user],
        )
      ).rows.every((r) => !r.whatsapp),
    ).toBe(true);
    await pg.exec("UPDATE notification_policy SET forced=true WHERE type=0");
    await expect(
      savePreferences(account, preferences(false), meta),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("requires settings permission to change the system switch and policies", async () => {
    const settings = settingsSchema.parse({
      otpRequired: false,
      defaultTheme: 0,
      digits: 0,
      readNotificationDays: 30,
      whatsappEnabled: false,
      policies: [0, 1, 2].map((type) => ({
        type,
        inApp: false,
        email: false,
        whatsapp: false,
        forced: false,
      })),
    });
    await expect(saveSettings(account, settings, meta)).rejects.toMatchObject({
      status: 403,
    });
    await saveSettings(owner, settings, meta);
    expect(
      (await pg.query("SELECT whatsapp_enabled FROM settings")).rows[0],
    ).toEqual({ whatsapp_enabled: false });
  });
});

describe("WhatsApp delivery", () => {
  it("sends request events independently of email and in-app notifications", async () => {
    await notify(db(), ids.request, 0, ids.sender);
    await processJobs(10);
    expect(gateway).toHaveBeenCalledTimes(1);
    const [url, options] = gateway.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://beyoondgroup.com/api/v1/messages");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer test-device-key",
      "Content-Type": "application/json",
    });
    const message = JSON.parse(String(options.body));
    expect(message.to).toBe("+201144797501");
    expect(message.text).toContain(
      `https://track.example.invalid/requests/${ids.request}`,
    );
  });
  it("encrypts queued content and retries failures with the same idempotency key", async () => {
    const job = await queued();
    expect(JSON.stringify(job.payload)).not.toContain("+201144797501");
    expect(decrypt<{ to: string }>(String(job.payload.encrypted)).to).toBe(
      "+201144797501",
    );
    gateway.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await processJobs(1);
    const pending = (
      await pg.query<{
        attempts: number;
        locked_until: Date | null;
        delayed: boolean;
      }>(
        "SELECT attempts,locked_until,available_at>now() delayed FROM outbox WHERE id=$1",
        [job.id],
      )
    ).rows[0];
    expect(pending).toEqual({ attempts: 1, locked_until: null, delayed: true });
    await pg.query("UPDATE outbox SET available_at=now() WHERE id=$1", [
      job.id,
    ]);
    await processJobs(1);
    expect(gateway).toHaveBeenCalledTimes(2);
    for (const call of gateway.mock.calls)
      expect(
        (call as unknown as [string, RequestInit])[1].headers,
      ).toMatchObject({ "Idempotency-Key": "whatsapp:stable-test-key" });
    expect(
      (await pg.query("SELECT id FROM outbox WHERE id=$1", [job.id])).rows,
    ).toHaveLength(0);
  });
  it.each([
    "UPDATE settings SET whatsapp_enabled=false",
    "UPDATE users SET whatsapp_enabled=false WHERE id=$1",
    "UPDATE users SET whatsapp_number='1000000000' WHERE id=$1",
    "UPDATE users SET locked=true WHERE id=$1",
    "UPDATE users SET deleted_at=now() WHERE id=$1",
    "DELETE FROM project_users WHERE user_id=$1",
    "DELETE FROM role_permissions",
  ])("cancels queued delivery after %s", async (statement) => {
    const job = await queued();
    await pg.query(statement, statement.includes("$1") ? [ids.user] : []);
    await deliverWhatsApp(job.payload);
    expect(gateway).not.toHaveBeenCalled();
  });
  it("rechecks personal preferences and forced policy before sending", async () => {
    const job = await queued();
    await savePreferences(account, preferences(false), meta);
    await deliverWhatsApp(job.payload);
    expect(gateway).not.toHaveBeenCalled();
    await pg.exec("UPDATE notification_policy SET forced=true WHERE type=0");
    await deliverWhatsApp(job.payload);
    expect(gateway).toHaveBeenCalledTimes(1);
  });
  it("does not include provider responses or credentials in errors", async () => {
    gateway.mockResolvedValueOnce(
      new Response("sensitive upstream details", { status: 401 }),
    );
    await expect(
      sendWhatsApp("+201144797501", "Test", "test-key"),
    ).rejects.toThrow("WhatsApp delivery failed (401)");
  });
});
