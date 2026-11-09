import readWorkbook from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { db, rows, sql } from "@/db";
import type { Actor } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { requirePermission, requireProject } from "./access";
import { AppError } from "./errors";
import { audit, type Meta } from "./events";
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
  if (!file.size || file.size > 4 * 1024 * 1024) throw new AppError("file");
  const buffer = Buffer.from(await file.arrayBuffer());
  let sheets: unknown[][][];
  if (/\.xlsx$/i.test(file.name)) {
    checkZip(buffer);
    sheets = (await readWorkbook(buffer)).map((sheet) => sheet.data);
  } else if (/\.csv$/i.test(file.name)) {
    sheets = [
      parseCsv(buffer, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 32000,
      }),
    ];
  } else throw new AppError("import");
  const data: string[][] = [];
  for (const sheet of sheets) {
    const [headers, ...body] = sheet;
    if (!headers?.length && !body.length) continue;
    if (
      headers.length !== 5 ||
      ar.boq.headers.some((h, i) => {
        const value = String(headers[i] ?? "").trim();
        return h !== value && !(i === 2 && value === "القسم الفرعي2");
      })
    )
      throw new AppError("import");
    for (const row of body) {
      if (row.every((cell) => cell == null || cell === "")) continue;
      if (
        row.length !== 5 ||
        Array.from(row).some(
          (cell) =>
            typeof cell !== "string" ||
            !cell.trim() ||
            cell.trim().length > 200,
        )
      )
        throw new AppError("import");
      data.push(row.map((cell) => String(cell).trim()));
      if (data.length > 10000) throw new AppError("import");
    }
  }
  if (!data.length) throw new AppError("import");
  return data;
}
type Section = {
  id: string;
  parent: string | null;
  level: number;
  name: string;
  unit: string | null;
  active: boolean;
};
type Product = { parent: string; name: string; unit: string };
export async function importBoq(
  a: Actor,
  projectId: string,
  data: string[][],
  meta: Meta,
) {
  requirePermission(a, "boq.create");
  return db().transaction(async (tx) => {
    await requireProject(a, projectId, tx, true);
    await tx.execute(
      sql`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`,
    );
    await tx.execute(sql`SELECT pg_advisory_xact_lock(918371)`);
    const units = await rows<{
      id: string;
      name: string;
      symbol: string;
      active: boolean;
    }>(sql`SELECT id,name,symbol,active FROM units`, tx);
    const unitIds = new Map<string, string>();
    const newUnits = [];
    for (const label of new Set(data.map((row) => row[4]))) {
      const exact = units.filter((u) => u.name === label);
      const matches = exact.length
        ? exact
        : units.filter((u) => u.symbol === label);
      if (
        matches.length > 1 ||
        matches[0]?.active === false ||
        !label ||
        label.length > 50
      )
        throw new AppError("import");
      const id = matches[0]?.id ?? randomUUID();
      if (!matches.length)
        newUnits.push({ id, name: label, symbol: label.slice(0, 20) });
      unitIds.set(label, id);
    }
    if (newUnits.length)
      await tx.execute(sql`INSERT INTO units(id,name,symbol)
      SELECT id,name,symbol FROM jsonb_to_recordset(${JSON.stringify(newUnits)}::jsonb) AS u(id uuid,name text,symbol text)`);
    const found = await rows<Section>(
      sql`SELECT id,parent_id parent,level,name,unit_id unit,active FROM boq_items WHERE project_id=${projectId}`,
      tx,
    );
    const key = (parent: string | null, name: string) =>
      JSON.stringify([parent, name]);
    const sections = new Map<string, Section>();
    const ambiguous = new Set<string>();
    for (const section of found) {
      const k = key(section.parent, section.name);
      if (sections.has(k)) ambiguous.add(k);
      sections.set(k, section);
    }
    const added: Section[] = [];
    const products = new Map<string, Product>();
    for (const row of data) {
      let parent: string | null = null;
      const unit = unitIds.get(row[4])!;
      for (let level = 1; level <= 3; level++) {
        const name = row[level - 1],
          k = key(parent, name);
        let section: Section | undefined = sections.get(k);
        if (ambiguous.has(k) || section?.active === false)
          throw new AppError("import");
        if (!section) {
          section = {
            id: randomUUID(),
            parent,
            level,
            name,
            unit: level === 3 ? unit : null,
            active: true,
          };
          added.push(section);
          sections.set(k, section);
        } else if (level === 3 && section.unit !== unit) section.unit = null;
        parent = section.id;
      }
      const product = { parent: parent!, name: row[3], unit };
      const k = key(parent, row[3]);
      if (products.has(k) && products.get(k)!.unit !== unit)
        throw new AppError("import");
      products.set(k, product);
    }
    for (const level of [1, 2, 3]) {
      const batch = added.filter((s) => s.level === level);
      if (batch.length)
        await tx.execute(sql`INSERT INTO boq_items(id,project_id,parent_id,level,name,description,unit_id,quantity)
        SELECT (v->>'id')::uuid,${projectId},(v->>'parent')::uuid,${level},v->>'name',
          CASE WHEN ${level}::int=3 THEN v->>'name' END,(v->>'unit')::uuid,CASE WHEN ${level}::int=3 THEN 0 END
          FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) WITH ORDINALITY AS t(v,ord) ORDER BY ord`);
    }
    const existing = await rows<Product>(
      sql`SELECT m.boq_item_id parent,m.name,COALESCE(m.unit_id,b.unit_id) unit FROM materials m JOIN boq_items b ON b.id=m.boq_item_id WHERE b.project_id=${projectId}`,
      tx,
    );
    for (const item of existing) {
      const k = key(item.parent, item.name);
      if (products.has(k) && products.get(k)!.unit !== item.unit)
        throw new AppError("import");
      products.delete(k);
    }
    if (products.size)
      await tx.execute(sql`INSERT INTO materials(boq_item_id,name,unit_id,quantity)
      SELECT (v->>'parent')::uuid,v->>'name',(v->>'unit')::uuid,0 FROM jsonb_array_elements(${JSON.stringify([...products.values()])}::jsonb) WITH ORDINALITY AS t(v,ord) ORDER BY ord`);
    const result = {
      rows: added.length,
      materials: products.size,
      units: newUnits.length,
    };
    if (result.rows || result.materials || result.units)
      await audit(
        tx,
        a.id,
        meta,
        0,
        2,
        projectId,
        { import: result },
        projectId,
      );
    return result;
  });
}
export async function importTemplate() {
  const data = [
    ar.boq.headers,
    [
      ar.seed.sampleMain,
      ar.seed.sampleSecondary,
      ar.seed.sampleSub,
      ar.seed.sampleMaterial,
      ar.seed.units[2][0],
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
      columns: [24, 24, 28, 48, 15].map((width) => ({ width })),
    },
    { fontFamily: "IBM Plex Sans Arabic", fontSize: 11 },
  ).toBuffer();
}
