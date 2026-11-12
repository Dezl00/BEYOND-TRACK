"use client";
import { useLanguage } from "@/components/language-context";

import { NumberField } from "./number-field";
import { decimalText } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";

import { modules, actionsForModule, type Actor } from "@/lib/domain";
import * as v from "@/lib/validation";
import {
  DateInput,
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
  const { m: msg, unit, role } = useLanguage();
  
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const initialState = (): Data => ({
    id: initial?.id,
    code: initial?.code || "",
    name: initial?.name || "",
    client: initial?.client || "",
    details: initial?.details || "",
    startDate: initial?.start_date || "",
    endDate: initial?.end_date || "",
    location: initial?.location || "",
    archived: initial?.archived || false,
    active: initial?.active ?? true,
    symbol: initial?.symbol || "",
    projectId: initial?.project_id || project || "",
    parentId: initial?.parent_id || null,
    level: initial?.level || 1,
    description: initial?.description || "",
    unitId: initial?.unit_id || "",
    quantity: decimalText(initial?.quantity) || "0",
    boqItemId: initial?.boq_item_id || "",
    email: initial?.email || "",
    username: initial?.username || "",
    jobTitle: initial?.job_title || "",
    whatsappCountryCode: initial?.whatsapp_country_code || "+966",
    whatsappNumber: initial?.whatsapp_number || "",
    whatsappEnabled: initial?.whatsapp_enabled || false,
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
        unitId: state.unitId || null,
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
              msg.errors.invalid
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
      title={initial ? msg.common.edit : msg.common.create}
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
          <span>{initial ? msg.common.edit : msg.common.create}</span>
        </Button>
      }
    >
      <form className="stack" onSubmit={save} noValidate>
        <Message error={error} />
        <div className="fields">
          {text("name", msg.fields.name, { maxLength: 200 })}
          {resource === "project" ? (
            <>
              {text("code", msg.fields.code, {
                maxLength: 30,
                placeholder: "KS",
              })}
              {text("location", msg.fields.location)}
              {text("client", msg.interface.client, { maxLength: 200 })}
              <Field label={msg.interface.startDate}>
                <DateInput
                  value={String(state.startDate)}
                  onChange={(value) => set("startDate", value)}
                />
              </Field>
              <Field label={msg.interface.endDate}>
                <DateInput
                  value={String(state.endDate)}
                  onChange={(value) => set("endDate", value)}
                />
              </Field>
              <Field wide label={msg.interface.projectDetails}>
                <textarea
                  className="input"
                  value={String(state.details)}
                  maxLength={4000}
                  onChange={(e) => set("details", e.target.value)}
                />
              </Field>
              {initial ? check("archived", msg.common.archive) : null}
            </>
          ) : null}
          {resource === "supplier" ? check("active", msg.common.active) : null}
          {resource === "unit" ? (
            <>
              {text("symbol", msg.fields.symbol)}
              {check("active", msg.common.active)}
            </>
          ) : null}
          {resource === "boq" ? (
            <>
              <Field label={msg.common.project}>
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
              <Field label={msg.fields.level}>
                <SelectBox
                  value={String(state.level)}
                  onChange={(value) => {
                    set("level", Number(value));
                    set("parentId", null);
                    if (value !== "3") set("description", "");
                  }}
                  options={[msg.boq.main, msg.boq.secondary, msg.boq.sub].map(
                    (label, i) => ({ value: String(i + 1), label }),
                  )}
                />
              </Field>
              {Number(state.level) > 1 ? (
                <Field label={msg.fields.parent}>
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
              {Number(state.level) === 3 ? (
                <>
                  <Field label={msg.fields.unit}>
                    <Lookup
                      resource="units"
                      value={String(state.unitId)}
                      initialLabel={unit(initial?.unit_name)}
                      onChange={(value) => set("unitId", value)}
                    />
                  </Field>
                  <NumberField
                    label={msg.fields.quantity}
                    value={String(state.quantity)}
                    onChange={(value) => set("quantity", value)}
                  />
                  <Field wide label={msg.fields.description}>
                    <textarea
                      className="input"
                      value={String(state.description)}
                      onChange={(e) => set("description", e.target.value)}
                      maxLength={4000}
                    />
                  </Field>
                </>
              ) : null}
            </>
          ) : null}
          {resource === "material" ? (
            <>
              <Field label={msg.fields.boqItem}>
                <Lookup
                  resource="boq"
                  project={project}
                  onlyLevel={3}
                  value={String(state.boqItemId)}
                  initialLabel={String(initial?.boq_name || "")}
                  onChange={(value) => set("boqItemId", value)}
                />
              </Field>
              <Field label={msg.fields.unit}>
                <Lookup
                  resource="units"
                  value={String(state.unitId || "")}
                  initialLabel={unit(initial?.unit_name)}
                  onChange={(value) => set("unitId", value)}
                />
              </Field>
              <NumberField
                label={msg.fields.materialLimit}
                value={String(state.quantity)}
                onChange={(value) => set("quantity", value)}
              />
              {check("active", msg.common.active)}
            </>
          ) : null}
          {resource === "user" ? (
            <>
              {text("email", msg.fields.email, {
                type: "email",
                autoComplete: "off",
              })}
              {text("username", msg.auth.username, { autoComplete: "off" })}
              {text("jobTitle", msg.auth.jobTitle)}
              <Field label={msg.whatsapp.countryCode}>
                <SelectBox
                  value={String(state.whatsappCountryCode)}
                  onChange={(value) => set("whatsappCountryCode", value)}
                  options={[
                    { value: "+966", label: msg.whatsapp.saudi },
                    { value: "+20", label: msg.whatsapp.egypt },
                  ]}
                />
              </Field>
              <Field label={msg.whatsapp.number}>
                <input
                  className="input numeric"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  dir="ltr"
                  maxLength={30}
                  placeholder={
                    state.whatsappCountryCode === "+20"
                      ? "01xxxxxxxxx"
                      : "05xxxxxxxx"
                  }
                  value={String(state.whatsappNumber)}
                  onChange={(e) => set("whatsappNumber", e.target.value)}
                  aria-describedby="whatsapp-number-hint"
                />
                <span className="muted" id="whatsapp-number-hint">
                  {msg.whatsapp.numberHint}
                </span>
              </Field>
              {check("whatsappEnabled", msg.whatsapp.enableAccount)}
              <Field label={msg.fields.role}>
                <Lookup
                  resource="roles"
                  value={String(state.roleId)}
                  initialLabel={role(initial?.role_name)}
                  onChange={(value) => set("roleId", value)}
                />
              </Field>
              {text("password", msg.auth.password, {
                type: "password",
                autoComplete: "new-password",
              })}
              <Field wide label={msg.fields.projects}>
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
              {check("locked", msg.auth.locked, !!initial?.is_owner)}
              {check("forcePasswordChange", msg.auth.forcePassword)}
              {check("otpEnabled", msg.auth.otpEnabled)}
              {actor?.is_owner ? check("otpExempt", msg.auth.otpExempt) : null}
            </>
          ) : null}
        </div>
        {resource === "role" ? (
          <div className="permissions-grid">
            {modules
              .filter((mod) => mod !== "audit")
              .map((mod) => (
                <div className="permission-group" key={mod}>
                  <h3>{msg.nav[mod]}</h3>
                  <div className="row">
                    {actionsForModule(mod).map((action) => {
                      const key = `${mod}.${action}`;
                      return (
                        <Checkbox
                          key={key}
                          label={
                            mod === "reports" && action === "export"
                              ? msg.reports.exportPrint
                              : msg.permissionActions[action]
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
                    ? msg.common.allProjects
                    : key === "requests.view_all"
                      ? msg.permissionActions.view_all
                      : msg.permissionActions.manage
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
            {msg.common.cancel}
          </Button>
          <Button intent="green" type="submit" pending={busy}>
            {msg.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
