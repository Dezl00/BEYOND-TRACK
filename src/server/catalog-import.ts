import { randomUUID } from "node:crypto";
import { db, rows, sql, type Executor } from "@/db";
import type { Actor } from "@/lib/domain";
import { catalogName, type ImportPreviewRow } from "@/lib/catalog-transfer";
import { unitLabel } from "@/messages/units";
import { requirePermission, requireProject } from "./access";
import { AppError } from "./errors";
import { audit, type Meta } from "./events";
type Section = {
  id: string;
  parent: string | null;
  name: string;
  level: number;
  unit: string | null;
  quantity: string;
  description: string;
  active: boolean;
};
type Product = { parent: string; name: string; unit: string; quantity: string };
async function plan(tx: Executor, projectId: string, data: string[][]) {
  const projects = await rows<{ name: string }>(
    sql`SELECT name FROM projects WHERE id=${projectId}`,
    tx,
  );
  const units = await rows<{
    id: string;
    name: string;
    symbol: string;
    active: boolean;
  }>(sql`SELECT id,name,symbol,active FROM units`, tx);
  const sections = await rows<Section>(
    sql`SELECT id,parent_id parent,name,level,unit_id unit,quantity::text,description,active FROM boq_items WHERE project_id=${projectId}`,
    tx,
  );
  const materials = await rows<Product>(
    sql`SELECT m.boq_item_id parent,m.name,COALESCE(m.unit_id,b.unit_id) unit,m.quantity::text FROM materials m JOIN boq_items b ON b.id=m.boq_item_id WHERE b.project_id=${projectId}`,
    tx,
  );
  const addedSections: Section[] = [],
    addedProducts: Product[] = [],
    addedUnits: typeof units = [];
  const preview: ImportPreviewRow[] = [],
    seen = new Map<string, string>();
  const key = (parent: string | null, name: string) =>
    JSON.stringify([parent, catalogName(name)]);
  const sectionMap = new Map<string, Section[]>(),
    productMap = new Map<string, Product[]>();
  for (const s of sections) {
    const k = key(s.parent, s.name);
    sectionMap.set(k, [...(sectionMap.get(k) || []), s]);
  }
  for (const m of materials) {
    const k = key(m.parent, m.name);
    productMap.set(k, [...(productMap.get(k) || []), m]);
  }
  for (const [index, values] of data.entries()) {
    const r: ImportPreviewRow = { row: index + 2, values, status: "new" };
    preview.push(r);
    const fail = (issue: ImportPreviewRow["issue"]) => {
      r.status = "error";
      r.issue = issue;
    };
    const [
      main = "",
      second = "",
      leaf = "",
      name = "",
      label = "",
      rawQuantity = "",
      project = "",
      description = "",
    ] = values;
    const quantity = rawQuantity || "0";
    const depth = leaf ? 3 : second ? 2 : main ? 1 : 0;
    if (
      values.some((v) => v.length > 200) ||
      !main ||
      (!second && leaf) ||
      (name && (!leaf || !label)) ||
      !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(quantity)
    ) {
      fail("invalid");
      continue;
    }
    if (project && catalogName(project) !== catalogName(projects[0].name)) {
      fail("project");
      continue;
    }
    let unit: string | null = null;
    if (label) {
      const exact = units.filter(
        (u) =>
          catalogName(u.name) === catalogName(label) ||
          catalogName(unitLabel(u.name, "en")) === catalogName(label),
      );
      const matches = exact.length
        ? exact
        : units.filter(
            (u) =>
              catalogName(u.symbol) === catalogName(label) ||
              catalogName(unitLabel(u.symbol, "en", true)) ===
                catalogName(label),
          );
      if (
        matches.length > 1 ||
        matches[0]?.active === false ||
        label.length > 50
      ) {
        fail("conflict");
        continue;
      }
      if (matches.length) unit = matches[0].id;
      else {
        const u = {
          id: randomUUID(),
          name: label,
          symbol: label.slice(0, 20),
          active: true,
        };
        units.push(u);
        addedUnits.push(u);
        unit = u.id;
      }
    }
    let parent: string | null = null,
      created = false;
    for (let level = 1; level <= depth; level++) {
      const sectionName = values[level - 1],
        k = key(parent, sectionName),
        matches = sectionMap.get(k) || [];
      if (matches.length > 1 || matches[0]?.active === false) {
        fail("conflict");
        break;
      }
      let section = matches[0];
      if (!section) {
        section = {
          id: randomUUID(),
          parent,
          name: sectionName,
          level,
          unit: level === 3 ? unit : null,
          quantity: level === 3 && !name ? quantity : "0",
          description: description || sectionName,
          active: true,
        };
        sectionMap.set(k, [section]);
        addedSections.push(section);
        created = true;
      }
      if (
        level === 3 &&
        !name &&
        !addedSections.includes(section) &&
        ((label && section.unit !== unit) ||
          (rawQuantity !== "" && Number(section.quantity) !== Number(quantity)))
      ) {
        fail("conflict");
        break;
      }
      if (
        level === 3 &&
        addedSections.includes(section) &&
        name &&
        section.unit !== unit
      )
        section.unit = null;
      parent = section.id;
    }
    if (r.status === "error") continue;
    const rowKey = JSON.stringify([values.slice(0, 4).map(catalogName)]),
      signature = JSON.stringify([unit, Number(quantity)]);
    if (seen.has(rowKey)) {
      if (seen.get(rowKey) !== signature) fail("conflict");
      else r.status = "duplicate";
      continue;
    }
    seen.set(rowKey, signature);
    if (name) {
      const k = key(parent, name),
        matches = productMap.get(k) || [];
      if (
        matches.length > 1 ||
        (matches[0] &&
          (matches[0].unit !== unit ||
            (rawQuantity !== "" &&
              Number(matches[0].quantity) !== Number(quantity))))
      ) {
        fail("conflict");
        continue;
      }
      if (matches.length) {
        r.status = "existing";
        continue;
      }
      const m = { parent: parent!, name, unit: unit!, quantity };
      addedProducts.push(m);
      productMap.set(k, [m]);
    } else if (!created) r.status = "existing";
  }
  return {
    preview,
    valid: preview.length > 0 && !preview.some((r) => r.status === "error"),
    addedSections,
    addedProducts,
    addedUnits,
  };
}
export async function previewBoq(
  a: Actor,
  projectId: string,
  data: string[][],
) {
  requirePermission(a, "boq.create");
  await requireProject(a, projectId, db(), true);
  const p = await plan(db(), projectId, data);
  return { items: p.preview, valid: p.valid };
}
export async function applyBoq(
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
    const p = await plan(tx, projectId, data);
    if (!p.valid) throw new AppError("import");
    if (p.addedUnits.length)
      await tx.execute(
        sql`INSERT INTO units(id,name,symbol) SELECT id,name,symbol FROM jsonb_to_recordset(${JSON.stringify(p.addedUnits)}::jsonb) AS u(id uuid,name text,symbol text)`,
      );
    for (const level of [1, 2, 3]) {
      const batch = p.addedSections.filter((s) => s.level === level);
      if (batch.length)
        await tx.execute(sql`INSERT INTO boq_items(id,project_id,parent_id,level,name,description,unit_id,quantity)
    SELECT (v->>'id')::uuid,${projectId},(v->>'parent')::uuid,${level},v->>'name',CASE WHEN ${level}::int=3 THEN v->>'description' END,(v->>'unit')::uuid,CASE WHEN ${level}::int=3 THEN (v->>'quantity')::numeric END
    FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) WITH ORDINALITY AS t(v,ord) ORDER BY ord`);
    }
    if (p.addedProducts.length)
      await tx.execute(
        sql`INSERT INTO materials(boq_item_id,name,unit_id,quantity) SELECT (v->>'parent')::uuid,v->>'name',(v->>'unit')::uuid,(v->>'quantity')::numeric FROM jsonb_array_elements(${JSON.stringify(p.addedProducts)}::jsonb) WITH ORDINALITY AS t(v,ord) ORDER BY ord`,
      );
    const result = {
      rows: p.addedSections.length,
      materials: p.addedProducts.length,
      units: p.addedUnits.length,
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
