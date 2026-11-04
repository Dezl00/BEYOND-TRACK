import { z } from "zod";
import { ar } from "@/messages/ar";
z.config({ customError: () => ar.errors.invalid });
export const uuid = z.uuid();
const short = z.string().trim().min(1).max(200);
export const password = z
  .string()
  .min(12, ar.errors.password)
  .max(72, ar.errors.password)
  .regex(/[A-Za-z\u0600-\u06ff]/, ar.errors.password)
  .regex(/[0-9]/, ar.errors.password)
  .refine((v) => new TextEncoder().encode(v).length <= 72, ar.errors.password);
export const qty = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0,
    ar.errors.positive,
  );
export const nonnegative = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v), ar.errors.invalid);
export const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), ar.errors.invalid);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, ar.errors.date);
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(100),
  remember: z.boolean().default(false),
});
export const otpSchema = z.object({
  challenge: uuid,
  code: z.string().regex(/^\d{6}$/),
});
export const resetSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
});
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password,
});
const line = z.object({
  materialId: uuid,
  quantity: qty,
  notes: z.string().trim().max(1000).default(""),
});
export const requestSchema = z
  .object({
    id: uuid.optional(),
    projectId: uuid,
    version: z.number().int().positive().optional(),
    notes: z.string().trim().max(2000).default(""),
    submit: z.boolean().default(false),
    lines: z.array(line).min(1).max(100),
  })
  .refine(
    (v) => new Set(v.lines.map((l) => l.materialId)).size === v.lines.length,
    ar.errors.duplicate,
  );
export const transitionSchema = z.object({
  id: uuid,
  version: z.number().int().positive(),
  status: z.number().int().min(0).max(9),
  reason: z.string().trim().max(1000).default(""),
});
export const orderSchema = z.object({
  id: uuid,
  version: z.number().int().positive(),
  supplierId: uuid,
  expectedAt: dateOnly,
  prices: z
    .array(z.object({ id: uuid, price: money }))
    .min(1)
    .max(100),
});
export const receiptSchema = z
  .object({
    requestId: uuid,
    key: uuid,
    notes: z.string().trim().max(1000).default(""),
    lines: z
      .array(
        z.object({
          lineId: uuid,
          accepted: nonnegative,
          damaged: nonnegative,
          rejected: nonnegative,
          returned: nonnegative,
        }),
      )
      .min(1)
      .max(100),
  })
  .refine((v) => new Set(v.lines.map((l) => l.lineId)).size === v.lines.length)
  .refine(
    (v) =>
      v.lines.some((l) =>
        [l.accepted, l.damaged, l.rejected, l.returned].some(
          (x) => Number(x) > 0,
        ),
      ),
    ar.errors.receipt,
  );
export const projectSchema = z.object({
  id: uuid.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: short,
  location: z.string().trim().max(200).default(""),
  archived: z.boolean().default(false),
});
export const boqSchema = z
  .object({
    id: uuid.optional(),
    projectId: uuid,
    parentId: uuid.nullable(),
    level: z.number().int().min(1).max(3),
    code: z.string().trim().min(1).max(60),
    name: short,
    description: z.string().trim().max(4000).default(""),
    unitId: uuid,
    quantity: qty,
  })
  .refine((v) => v.level !== 3 || v.description.length > 0, ar.errors.required)
  .refine((v) => v.level === 3 || !v.description, ar.errors.invalid);
export const materialSchema = z.object({
  id: uuid.optional(),
  boqItemId: uuid,
  name: short,
  quantity: qty,
  active: z.boolean().default(true),
});
export const supplierSchema = z.object({
  id: uuid.optional(),
  name: short,
  active: z.boolean().default(true),
});
export const unitSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(50),
  symbol: z.string().trim().min(1).max(20),
  active: z.boolean().default(true),
});
export const userSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(150),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    username: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .transform((v) => v.toLowerCase()),
    jobTitle: z.string().trim().min(1).max(150),
    roleId: uuid,
    projectIds: z.array(uuid).max(100),
    password: password.optional(),
    locked: z.boolean().default(false),
    forcePasswordChange: z.boolean().default(true),
    otpEnabled: z.boolean().default(false),
    otpExempt: z.boolean().default(false),
  })
  .refine((v) => !!v.id || !!v.password, ar.errors.required);
export const roleSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.string().min(1).max(80)).max(100),
});
export const settingsSchema = z
  .object({
    otpRequired: z.boolean(),
    defaultTheme: z.number().int().min(0).max(1),
    digits: z.number().int().min(0).max(1),
    readNotificationDays: z.number().int().min(1).max(365),
    policies: z
      .array(
        z.object({
          type: z.number().int().min(0).max(2),
          inApp: z.boolean(),
          email: z.boolean(),
          forced: z.boolean(),
        }),
      )
      .length(3),
  })
  .refine((v) => new Set(v.policies.map((p) => p.type)).size === 3);
export const preferencesSchema = z
  .object({
    theme: z.number().int().min(0).max(1),
    otpEnabled: z.boolean(),
    preferences: z
      .array(
        z.object({
          type: z.number().int().min(0).max(2),
          inApp: z.boolean(),
          email: z.boolean(),
        }),
      )
      .length(3),
  })
  .refine((v) => new Set(v.preferences.map((p) => p.type)).size === 3);
export const passwordChangeSchema = z.object({
  current: z.string().min(1).max(100),
  password,
});
export const cursorSchema = z.string().max(256).optional();
export const listQuerySchema = z.object({
  cursor: cursorSchema,
  q: z.string().trim().max(100).default(""),
  project: uuid.optional(),
  status: z.coerce.number().int().min(0).max(9).optional(),
  user: uuid.optional(),
  action: z.coerce.number().int().min(0).max(13).optional(),
  entity: z.coerce.number().int().min(0).max(11).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
