"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { ar } from "@/messages/ar";
import { modules, actionsForModule, type Actor } from "@/lib/domain";
import * as v from "@/lib/validation";
import {
  Button,
  Modal,
  Field,
  Checkbox,
  Lookup,
  MultiLookup,
  SelectBox,
  Message,
  command,
} from "./ui";
type Resource =
  "project" | "boq" | "material" | "supplier" | "unit" | "user" | "role";
type Data = Record<string, unknown>;
const schema = {
  project: v.projectSchema,
  boq: v.boqSchema,
  material: v.materialSchema,
  supplier: v.supplierSchema,
  unit: v.unitSchema,
  user: v.userSchema,
  role: v.roleSchema,
};
export default function ResourceForm({
  resource,
  initial,
  project,
  actor,
}: {
  resource: Resource;
  initial?: Data;
  project?: string;
  actor?: Pick<Actor, "is_owner">;
}) {
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const initialState = (): Data => ({
    id: initial?.id,
    name: initial?.name || "",
    code: initial?.code || "",
    location: initial?.location || "",
    archived: initial?.archived || false,
    active: initial?.active ?? true,
    symbol: initial?.symbol || "",
    projectId: initial?.project_id || project || "",
    parentId: initial?.parent_id || null,
    level: initial?.level || 1,
    description: initial?.description || "",
    unitId: initial?.unit_id || "",
    quantity: initial?.quantity || "",
    boqItemId: initial?.boq_item_id || "",
    email: initial?.email || "",
    username: initial?.username || "",
    jobTitle: initial?.job_title || "",
    roleId: initial?.role_id || "",
    projectIds: initial?.project_ids || [],
    password: "",
    locked: initial?.locked || false,
    forcePasswordChange: initial?.force_password_change ?? true,
    otpEnabled: initial?.otp_enabled || false,
    otpExempt: initial?.otp_exempt || false,
    permissions: initial?.permissions || [],
  });
  const [state, setState] = useState<Data>(initialState);
  function set(key: string, value: unknown) {
    setState((s) => ({ ...s, [key]: value }));
  }
  function text(
    key: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) {
    return (
      <Field label={label}>
        <input
          className={`input ${["code", "quantity", "email", "username", "password"].includes(key) ? "numeric" : ""}`}
          value={String(state[key] ?? "")}
          onChange={(e) => set(key, e.target.value)}
          {...props}
        />
      </Field>
    );
  }
  function check(key: string, label: string, disabled = false) {
    return (
      <Checkbox
        label={label}
        disabled={disabled}
        checked={!!state[key]}
        onChange={(e) => set(key, e.target.checked)}
      />
    );
  }
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = {
        ...state,
        ...(resource === "user" && !state.password
          ? { password: undefined }
          : {}),
      };
      const data = schema[resource].parse(values);
      await command(resource, data);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(
        "issues" in (e as object)
          ? (e as { issues: { message: string }[] }).issues[0]?.message ||
              ar.errors.invalid
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const perms = state.permissions as string[],
    projectIds = state.projectIds as string[];
  return (
    <Modal
      title={initial ? ar.common.edit : ar.common.create}
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setState(initialState());
          setError("");
        }
      }}
      wide={resource === "role"}
      trigger={
        <Button
          intent={initial ? "" : "green"}
          className={initial ? "small edit-button" : ""}
        >
          {initial ? <Pencil size={14} /> : <Plus size={16} />}
          <span>{initial ? ar.common.edit : ar.common.create}</span>
        </Button>
      }
    >
      <form className="stack" onSubmit={save} noValidate>
        <Message error={error} />
        <div className="fields">
          {text("name", ar.fields.name, { maxLength: 200 })}
          {resource === "project" ? (
            <>
              {text("code", ar.fields.code)}
              {text("location", ar.fields.location)}
              {initial ? check("archived", ar.common.archive) : null}
            </>
          ) : null}
          {resource === "supplier" ? check("active", ar.common.active) : null}
          {resource === "unit" ? (
            <>
              {text("symbol", ar.fields.symbol)}
              {check("active", ar.common.active)}
            </>
          ) : null}
          {resource === "boq" ? (
            <>
              {text("code", ar.fields.code)}
              <Field label={ar.common.project}>
                <Lookup
                  resource="projects"
                  value={String(state.projectId)}
                  initialLabel={String(initial?.project_name || "")}
                  onChange={(value) => {
                    set("projectId", value);
                    set("parentId", null);
                  }}
                />
              </Field>
              <Field label={ar.fields.level}>
                <SelectBox
                  value={String(state.level)}
                  onChange={(value) => {
                    set("level", Number(value));
                    set("parentId", null);
                    if (value !== "3") set("description", "");
                  }}
                  options={[ar.boq.main, ar.boq.secondary, ar.boq.sub].map(
                    (label, i) => ({ value: String(i + 1), label }),
                  )}
                />
              </Field>
              {Number(state.level) > 1 ? (
                <Field label={ar.fields.parent}>
                  <Lookup
                    resource="boq"
                    project={String(state.projectId)}
                    onlyLevel={Number(state.level) - 1}
                    value={String(state.parentId || "")}
                    initialLabel={String(initial?.parent_code || "")}
                    onChange={(value) => set("parentId", value)}
                  />
                </Field>
              ) : null}
              <Field label={ar.fields.unit}>
                <Lookup
                  resource="units"
                  value={String(state.unitId)}
                  initialLabel={String(initial?.unit_name || "")}
                  onChange={(value) => set("unitId", value)}
                />
              </Field>
              {text("quantity", ar.fields.quantity, { inputMode: "decimal" })}
              {Number(state.level) === 3 ? (
                <Field wide label={ar.fields.description}>
                  <textarea
                    className="input"
                    value={String(state.description)}
                    onChange={(e) => set("description", e.target.value)}
                    maxLength={4000}
                  />
                </Field>
              ) : null}
            </>
          ) : null}
          {resource === "material" ? (
            <>
              <Field label={ar.fields.boqItem}>
                <Lookup
                  resource="boq"
                  project={project}
                  onlyLevel={3}
                  value={String(state.boqItemId)}
                  initialLabel={String(initial?.boq_name || "")}
                  onChange={(value) => set("boqItemId", value)}
                />
              </Field>
              {text("quantity", ar.fields.materialLimit, {
                inputMode: "decimal",
              })}
              {check("active", ar.common.active)}
            </>
          ) : null}
          {resource === "user" ? (
            <>
              {text("email", ar.fields.email, {
                type: "email",
                autoComplete: "off",
              })}
              {text("username", ar.auth.username, { autoComplete: "off" })}
              {text("jobTitle", ar.auth.jobTitle)}
              <Field label={ar.fields.role}>
                <Lookup
                  resource="roles"
                  value={String(state.roleId)}
                  initialLabel={String(initial?.role_name || "")}
                  onChange={(value) => set("roleId", value)}
                />
              </Field>
              {text("password", ar.auth.password, {
                type: "password",
                autoComplete: "new-password",
              })}
              <Field wide label={ar.fields.projects}>
                <MultiLookup
                  resource="projects"
                  values={projectIds}
                  initialLabels={Object.fromEntries(
                    (
                      (initial?.projects || []) as {
                        id: string;
                        name: string;
                        code?: string;
                      }[]
                    ).map((item) => [
                      item.id,
                      [item.code, item.name].filter(Boolean).join(" · "),
                    ]),
                  )}
                  onChange={(values) => set("projectIds", values)}
                />
              </Field>
              {check("locked", ar.auth.locked, !!initial?.is_owner)}
              {check("forcePasswordChange", ar.auth.forcePassword)}
              {check("otpEnabled", ar.auth.otpEnabled)}
              {actor?.is_owner ? check("otpExempt", ar.auth.otpExempt) : null}
            </>
          ) : null}
        </div>
        {resource === "role" ? (
          <div className="permissions-grid">
            {modules
              .filter((mod) => mod !== "audit")
              .map((mod) => (
                <div className="permission-group" key={mod}>
                  <h3>{ar.nav[mod]}</h3>
                  <div className="row">
                    {actionsForModule(mod).map((action) => {
                      const key = `${mod}.${action}`;
                      return (
                        <Checkbox
                          key={key}
                          label={
                            mod === "reports" && action === "export"
                              ? ar.reports.exportPrint
                              : ar.permissionActions[action]
                          }
                          checked={perms.includes(key)}
                          onChange={(e) =>
                            set(
                              "permissions",
                              e.target.checked
                                ? [...perms, key]
                                : perms.filter((p) => p !== key),
                            )
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            {(
              ["projects.all", "requests.view_all", "security.manage"] as const
            ).map((key) => (
              <Checkbox
                key={key}
                label={
                  key === "projects.all"
                    ? ar.common.allProjects
                    : key === "requests.view_all"
                      ? ar.permissionActions.view_all
                      : ar.permissionActions.manage
                }
                checked={perms.includes(key)}
                onChange={(e) =>
                  set(
                    "permissions",
                    e.target.checked
                      ? [...perms, key]
                      : perms.filter((p) => p !== key),
                  )
                }
              />
            ))}
          </div>
        ) : null}
        <div className="form-footer">
          <Button type="button" onClick={() => setOpen(false)}>
            {ar.common.cancel}
          </Button>
          <Button intent="green" type="submit" pending={busy}>
            {ar.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
