import { readSheet } from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { db, one, rows, sql } from "@/db";
import type { Actor } from "@/lib/domain";
import { boqSchema, materialSchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import { requirePermission, requireProject } from "./access";
import { AppError } from "./errors";
import { audit, type Meta } from "./events";
import type { z } from "zod";
function checkZip(buffer: Buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new AppError("import");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16),
    total = 0;
  if (count > 6000 || offset >= buffer.length) throw new AppError("import");
  for (let n = 0; n < count; n++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new AppError("import");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 12 * 1024 * 1024) throw new AppError("file");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
export async function parseImport(file: File) {
  if (file.size > 4 * 1024 * 1024 || !file.size) throw new AppError("file");
  const buffer = Buffer.from(await file.arrayBuffer());
  let cells: unknown[][];
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    checkZip(buffer);
    cells = await readSheet(buffer);
  } else if (file.name.toLowerCase().endsWith(".csv"))
    cells = parseCsv(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 32000,
    }) as unknown[][];
  else throw new AppError("import");
  if (
    !cells.length ||
    cells.length > 501 ||
    cells.some((row) => row.length > 9)
  )
    throw new AppError("import");
  const headers = cells[0];
  if (ar.boq.headers.some((h, i) => String(headers[i] ?? "").trim() !== h))
    throw new AppError("import");
  const data: string[][] = [];
  cells.slice(1).forEach((row) => {
    const values = Array.from({ length: 9 }, (_, i) => {
      const cell = row[i];
      if (
        cell !== null &&
        cell !== undefined &&
        typeof cell !== "string" &&
        typeof cell !== "number"
      )
        throw new AppError("import");
      return String(cell ?? "").trim();
    });
    if (values.some(Boolean)) data.push(values);
  });
  if (!data.length) throw new AppError("import");
  return data;
}
export async function importBoq(
  a: Actor,
  projectId: string,
  data: string[][],
  meta: Meta,
) {
  requirePermission(a, "boq.create");
  return db().transaction(async (tx) => {
    await requireProject(a, projectId, tx, true);
    const unitRows = await rows<{ id: string; name: string; symbol: string }>(
        sql`SELECT id,name,symbol FROM units WHERE active=true ORDER BY id LIMIT 1000`,
        tx,
      ),
      items = new Map<string, { id: string; values: string[] }>();
    for (const row of data) {
      if (row[0].length > 60) throw new AppError("import");
      const existing = items.get(row[0]);
      if (
        existing &&
        existing.values.slice(0, 7).join("\u001f") !==
          row.slice(0, 7).join("\u001f")
      )
        throw new AppError("import");
      if (!existing) items.set(row[0], { id: randomUUID(), values: row });
    }
    const parsed: (z.infer<typeof boqSchema> & { id: string })[] = [];
    for (const item of [...items.values()].sort(
      (a, b) => Number(a.values[2]) - Number(b.values[2]),
    )) {
      const r = item.values,
        unit = unitRows.find((u) => u.name === r[4] || u.symbol === r[4]);
      if (!unit) throw new AppError("import");
      const parent = r[3] ? items.get(r[3]) : undefined;
      if (r[3] && !parent) throw new AppError("hierarchy");
      const v = boqSchema.parse({
        projectId,
        code: r[0],
        name: r[1],
        level: Number(r[2]),
        parentId: parent?.id || null,
        unitId: unit.id,
        quantity: r[5],
        description: r[6],
      });
      if (parent && Number(parent.values[2]) !== v.level - 1)
        throw new AppError("hierarchy");
      parsed.push({ ...v, id: item.id });
    }
    // Three ordered batches preserve parent constraints without one round trip per row.
    for (const level of [1, 2, 3]) {
      const batch = parsed.filter((item) => item.level === level);
      if (batch.length)
        await tx.execute(
          sql`INSERT INTO boq_items(id,project_id,parent_id,level,code,name,unit_id,quantity,description) VALUES ${sql.join(
            batch.map(
              (v) =>
                sql`(${v.id},${projectId},${v.parentId},${v.level},${v.code},${v.name},${v.unitId},${v.quantity},${v.level === 3 ? v.description : null})`,
            ),
            sql`,`,
          )}`,
        );
    }
    const parsedMaterials: z.infer<typeof materialSchema>[] = [];
    for (const r of data) {
      if (!r[7] && !r[8]) continue;
      const item = items.get(r[0])!;
      if (Number(r[2]) !== 3) throw new AppError("import");
      const v = materialSchema.parse({
        boqItemId: item.id,
        name: r[7],
        quantity: r[8],
      });
      parsedMaterials.push(v);
    }
    if (parsedMaterials.length)
      await tx.execute(
        sql`INSERT INTO materials(boq_item_id,name,quantity) VALUES ${sql.join(
          parsedMaterials.map(
            (v) => sql`(${v.boqItemId},${v.name},${v.quantity})`,
          ),
          sql`,`,
        )}`,
      );
    const materials = parsedMaterials.length;
    await audit(
      tx,
      a.id,
      meta,
      0,
      2,
      projectId,
      { import: { codes: [...items.keys()], materials } },
      projectId,
    );
    return { rows: items.size, materials };
  });
}
export async function importTemplate() {
  const data: (string | number)[][] = [
    [...ar.boq.headers],
    ["01", ar.seed.sampleMain, 1, "", ar.seed.units[2][0], 100, "", "", ""],
    [
      "01.01",
      ar.seed.sampleSecondary,
      2,
      "01",
      ar.seed.units[2][0],
      100,
      "",
      "",
      "",
    ],
    [
      "01.01.01",
      ar.seed.sampleSub,
      3,
      "01.01",
      ar.seed.units[2][0],
      100,
      ar.seed.sampleDescription,
      ar.seed.sampleMaterial,
      100,
    ],
  ];
  return writeExcelFile(
    data.map((row, i) =>
      row.map((value) => ({
        value,
        fontWeight: i === 0 ? ("bold" as const) : undefined,
        align: "right" as const,
      })),
    ),
    {
      sheet: ar.boq.title,
      rightToLeft: true,
      stickyRowsCount: 1,
      columns: ar.boq.headers.map((_, i) => ({ width: i === 6 ? 50 : 22 })),
    },
    { fontFamily: "IBM Plex Sans Arabic", fontSize: 11 },
  ).toBuffer();
}
