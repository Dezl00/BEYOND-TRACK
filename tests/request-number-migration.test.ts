import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

it("upgrades existing request numbers per project, retains references, and allocates transactional sequences", async () => {
  const pg = new PGlite();
  const schemaMigration = "0011_omniscient_chimera.sql";
  const dataMigration = "0012_project_request_numbers.sql";
  try {
    for (const folder of ["drizzle/generated", "drizzle/custom"])
      for (const file of (await readdir(folder))
        .filter(
          (file) =>
            file.endsWith(".sql") &&
            file !== schemaMigration &&
            file !== dataMigration,
        )
        .sort())
        await pg.exec(await readFile(`${folder}/${file}`, "utf8"));
    const user = randomUUID(),
      firstProject = randomUUID(),
      secondProject = randomUUID();
    await pg.query(
      "INSERT INTO users(id,name,email,username,job_title,password_hash,role_id) SELECT $1,'test','upgrade@test.invalid','upgrade','test','unused',id FROM roles LIMIT 1",
      [user],
    );
    await pg.query(
      "INSERT INTO projects(id,code,name) VALUES($1,'KS','first'),($2,'AB','second')",
      [firstProject, secondProject],
    );
    const original = (
      await pg.query<{ id: string; project_id: string }>(
        "INSERT INTO purchase_requests(project_id,created_by,number) VALUES($1,$3,3),($2,$3,7),($1,$3,12) RETURNING id,project_id",
        [firstProject, secondProject, user],
      )
    ).rows;
    await pg.query(
      "INSERT INTO request_timeline(request_id,user_id,to_status) VALUES($1,$2,0)",
      [original[0].id, user],
    );
    await pg.exec(
      await readFile("drizzle/generated/" + schemaMigration, "utf8"),
    );
    await pg.exec(await readFile("drizzle/custom/" + dataMigration, "utf8"));
    expect(
      (
        await pg.query(
          "SELECT id,number FROM purchase_requests ORDER BY number",
        )
      ).rows,
    ).toEqual([
      { id: original[1].id, number: "AB-001" },
      { id: original[0].id, number: "KS-001" },
      { id: original[2].id, number: "KS-002" },
    ]);
    expect(
      (await pg.query("SELECT request_id FROM request_timeline")).rows,
    ).toEqual([{ request_id: original[0].id }]);
    // A failed insertion must roll back its counter allocation too.
    await expect(
      pg.query(
        "INSERT INTO purchase_requests(project_id,created_by,status) VALUES($1,$2,99)",
        [firstProject, user],
      ),
    ).rejects.toThrow();
    const inserts = await Promise.all(
      Array.from({ length: 6 }, () =>
        pg.query<{ number: string }>(
          "INSERT INTO purchase_requests(project_id,created_by) VALUES($1,$2) RETURNING number",
          [firstProject, user],
        ),
      ),
    );
    expect(inserts.map((r) => r.rows[0].number).sort()).toEqual([
      "KS-003",
      "KS-004",
      "KS-005",
      "KS-006",
      "KS-007",
      "KS-008",
    ]);
    expect(
      (
        await pg.query(
          "INSERT INTO purchase_requests(project_id,created_by) VALUES($1,$2) RETURNING number",
          [secondProject, user],
        )
      ).rows,
    ).toEqual([{ number: "AB-002" }]);
  } finally {
    await pg.close();
  }
});
