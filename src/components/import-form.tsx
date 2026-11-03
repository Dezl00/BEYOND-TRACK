"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/messages/ar";
import { uuid } from "@/lib/validation";
import { Button, Field, Lookup, Message, FilePicker } from "./ui";
export default function ImportForm({ project }: { project?: string }) {
  const router = useRouter(),
    [projectId, setProject] = useState(project || ""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSuccess("");
        try {
          uuid.parse(projectId);
          if (
            !file ||
            file.size > 4 * 1024 * 1024 ||
            !/\.(xlsx|csv)$/i.test(file.name)
          )
            throw new Error(ar.errors.file);
          const form = new FormData();
          form.set("projectId", projectId);
          form.set("file", file);
          const r = await fetch("/api/import", { method: "POST", body: form }),
            data = await r.json();
          if (!r.ok) throw new Error(data.error);
          setSuccess(`${ar.boq.imported}: ${data.rows}`);
          router.refresh();
        } catch (e) {
          setError(
            "issues" in (e as object)
              ? ar.errors.invalid
              : (e as Error).message,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Message error={error} success={success} />
      <div className="fields">
        <Field label={ar.common.project}>
          <Lookup resource="projects" value={projectId} onChange={setProject} />
        </Field>
        <Field label={ar.fields.file}>
          <FilePicker accept=".xlsx,.csv" onChange={setFile} />
        </Field>
      </div>
      <div className="row end">
        <a href="/api/import" className="btn">
          {ar.common.template}
        </a>
        <Button intent="blue" type="submit" pending={busy}>
          {ar.common.import}
        </Button>
      </div>
    </form>
  );
}
