import { rows, sql } from "@/db";
import type { Actor } from "@/lib/domain";
import { projectScope, requirePermission } from "./access";
export async function catalogExport(a: Actor, project?: string) {
  requirePermission(a, "boq.view");
  requirePermission(a, "boq.export");
  return rows<{
    main: string;
    second: string;
    leaf: string;
    material: string;
    unit: string;
    quantity: string;
    code: string;
    project: string;
    description: string;
  }>(sql`
 WITH RECURSIVE tree AS (
 SELECT b.*,ARRAY[b.name::text] path FROM boq_items b WHERE b.parent_id IS NULL
 UNION ALL SELECT b.*,t.path||b.name::text FROM boq_items b JOIN tree t ON b.parent_id=t.id
 ), catalog AS (
 SELECT p.name project,t.path[1] main,COALESCE(t.path[2],'') AS "second",COALESCE(t.path[3],'') leaf,'' material,COALESCE(u.name,'') unit,COALESCE(t.quantity::text,'') quantity,t.code,COALESCE(t.description,'') description,t.path sort_path,0 kind,t.id
 FROM tree t JOIN projects p ON p.id=t.project_id LEFT JOIN units u ON u.id=t.unit_id
 WHERE ${projectScope(a)} ${project ? sql`AND p.id=${project}` : sql``}
 UNION ALL
 SELECT p.name,t.path[1],COALESCE(t.path[2],''),COALESCE(t.path[3],''),m.name,u.name,m.quantity::text,m.code,'',t.path,1,m.id
 FROM materials m JOIN tree t ON t.id=m.boq_item_id JOIN projects p ON p.id=t.project_id JOIN units u ON u.id=COALESCE(m.unit_id,t.unit_id)
 WHERE ${projectScope(a)} ${project ? sql`AND p.id=${project}` : sql``}
 ) SELECT * FROM catalog ORDER BY project,sort_path,kind,material,id`);
}
