"use client";
import { NumberField } from "./number-field";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAutosave } from "./use-autosave";
import { ar } from "@/messages/ar";
import {
  settingsSchema,
  preferencesSchema,
  passwordChangeSchema,
} from "@/lib/validation";
import { Button, Field, Checkbox, SelectBox, Message, command } from "./ui";
type Policy = {
  type: number;
  in_app: boolean;
  email: boolean;
  whatsapp: boolean;
  forced: boolean;
};
export function PreferencesForm({
  theme,
  otpEnabled,
  otpRequired,
  policies,
  prefs,
  tab,
}: {
  theme: number;
  otpEnabled: boolean;
  otpRequired: boolean;
  policies: Policy[];
  prefs: { type: number; in_app: boolean; email: boolean; whatsapp: boolean }[];
  tab: string;
}) {
  const router = useRouter(),
    [selected, setSelected] = useState(theme),
    [otp, setOtp] = useState(otpEnabled || otpRequired),
    [preferences, setPreferences] = useState(
      policies.map((p) => ({
        type: p.type,
        inApp:
          (p.forced
            ? p.in_app
            : prefs.find((x) => x.type === p.type)?.in_app) ?? p.in_app,
        email:
          (p.forced ? p.email : prefs.find((x) => x.type === p.type)?.email) ??
          p.email,
        whatsapp:
          (p.forced
            ? p.whatsapp
            : prefs.find((x) => x.type === p.type)?.whatsapp) ?? p.whatsapp,
      })),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const autoError = useAutosave(
    { theme: selected, otpEnabled: otp, preferences },
    async (value) => {
      await command("preferences", preferencesSchema.parse(value));
      document.documentElement.dataset.theme = value.theme ? "dark" : "light";
      router.refresh();
    },
    (value) => {
      setSelected(value.theme);
      setOtp(value.otpEnabled);
      setPreferences(value.preferences);
    },
  );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setBusy(true);
        try {
          const data = preferencesSchema.parse({
            theme: selected,
            otpEnabled: otp,
            preferences,
          });
          await command("preferences", data);
          document.documentElement.dataset.theme = selected ? "dark" : "light";
          setSuccess(ar.common.saved);
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
      <Message error={error || autoError} success={success} />
      {tab === "appearance" ? (
        <Field label={ar.common.appearance}>
          <SelectBox
            value={String(selected)}
            onChange={(v) => setSelected(Number(v))}
            options={[
              { value: "0", label: ar.settings.light },
              { value: "1", label: ar.settings.dark },
            ]}
          />
        </Field>
      ) : tab === "security" ? (
        <Checkbox
          label={ar.auth.otpEnabled}
          checked={otp}
          disabled={otpRequired}
          onChange={(e) => setOtp(e.target.checked)}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ar.fields.type}</th>
                <th>{ar.settings.inApp}</th>
                <th>{ar.settings.email}</th>
                <th>{ar.settings.whatsapp}</th>
                <th>{ar.settings.forced}</th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((p) => (
                <tr key={p.type}>
                  <td>{ar.notificationTypes[p.type]}</td>
                  {(["inApp", "email", "whatsapp"] as const).map((channel) => (
                    <td key={channel}>
                      <Checkbox
                        hideLabel
                        label={`${ar.settings[channel]} · ${ar.notificationTypes[p.type]}`}
                        checked={p[channel]}
                        disabled={
                          policies.find((x) => x.type === p.type)?.forced
                        }
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev.map((x) =>
                              x.type === p.type
                                ? { ...x, [channel]: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    {policies.find((x) => x.type === p.type)?.forced
                      ? ar.common.yes
                      : ar.common.no}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row end">
        <Button type="submit" intent="blue" pending={busy}>
          {ar.common.save}
        </Button>
      </div>
    </form>
  );
}
export function SystemSettings({
  settings,
  policies,
  owner,
}: {
  settings: {
    otp_required: boolean;
    default_theme: number;
    digits: number;
    read_notification_days: number;
    whatsapp_enabled: boolean;
  };
  policies: Policy[];
  owner: boolean;
}) {
  const router = useRouter(),
    [state, setState] = useState({
      otpRequired: settings.otp_required,
      defaultTheme: settings.default_theme,
      digits: settings.digits,
      readNotificationDays: String(settings.read_notification_days),
      whatsappEnabled: settings.whatsapp_enabled,
      policies: policies.map((p) => ({
        type: p.type,
        inApp: p.in_app,
        email: p.email,
        whatsapp: p.whatsapp,
        forced: p.forced,
      })),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const autoError = useAutosave(
    state,
    async (value) => {
      await command(
        "settings",
        settingsSchema.parse({
          ...value,
          readNotificationDays: Number(value.readNotificationDays),
        }),
      );
      router.refresh();
    },
    setState,
  );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await command(
            "settings",
            settingsSchema.parse({
              ...state,
              readNotificationDays: Number(state.readNotificationDays),
            }),
          );
          setSuccess(ar.common.saved);
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
      <Message error={error || autoError} success={success} />
      <div className="fields">
        <Field label={ar.settings.defaultTheme}>
          <SelectBox
            value={String(state.defaultTheme)}
            onChange={(v) =>
              setState((s) => ({ ...s, defaultTheme: Number(v) }))
            }
            options={[
              { value: "0", label: ar.settings.light },
              { value: "1", label: ar.settings.dark },
            ]}
          />
        </Field>
        <Field label={ar.settings.digits}>
          <SelectBox
            value={String(state.digits)}
            onChange={(v) => setState((s) => ({ ...s, digits: Number(v) }))}
            options={[
              { value: "0", label: ar.settings.western },
              { value: "1", label: ar.settings.arabic },
            ]}
          />
        </Field>
        <NumberField
          label={ar.settings.notificationDays}
          min={1}
          max={365}
          precision={0}
          value={state.readNotificationDays}
          onChange={(value) =>
            setState((s) => ({ ...s, readNotificationDays: value }))
          }
        />
        <Checkbox
          label={ar.auth.globalOtp}
          disabled={!owner}
          checked={state.otpRequired}
          onChange={(e) =>
            setState((s) => ({ ...s, otpRequired: e.target.checked }))
          }
        />
      </div>
      <h2>{ar.settings.notificationDefaults}</h2>
      <Checkbox
        label={ar.whatsapp.enableSystem}
        checked={state.whatsappEnabled}
        onChange={(e) =>
          setState((s) => ({ ...s, whatsappEnabled: e.target.checked }))
        }
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{ar.fields.type}</th>
              <th>{ar.settings.inApp}</th>
              <th>{ar.settings.email}</th>
              <th>{ar.settings.whatsapp}</th>
              <th>{ar.settings.forced}</th>
            </tr>
          </thead>
          <tbody>
            {state.policies.map((p) => (
              <tr key={p.type}>
                <td>{ar.notificationTypes[p.type]}</td>
                {(["inApp", "email", "whatsapp", "forced"] as const).map(
                  (key) => (
                    <td key={key}>
                      <Checkbox
                        hideLabel
                        label={`${ar.settings[key]} · ${ar.notificationTypes[p.type]}`}
                        checked={p[key]}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            policies: s.policies.map((x) =>
                              x.type === p.type
                                ? { ...x, [key]: e.target.checked }
                                : x,
                            ),
                          }))
                        }
                      />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row between">
        <span className="muted">{ar.settings.retention}</span>
        <Button type="submit" intent="blue" pending={busy}>
          {ar.common.save}
        </Button>
      </div>
    </form>
  );
}
export function PasswordForm() {
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          if (password !== confirm) throw new Error(ar.errors.passwordMatch);
          const result = await command(
            "password",
            passwordChangeSchema.parse({ current, password }),
          );
          setCurrent("");
          setPassword("");
          setConfirm("");
          // A fresh document also refreshes the shared shell's account state
          // and discards any pages prefetched before the password change.
          window.location.replace(result.redirect || "/dashboard");
        } catch (e) {
          setError(
            "issues" in (e as object)
              ? ar.errors.password
              : (e as Error).message,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Message error={error} />
      <Field label={ar.auth.currentPassword}>
        <input
          type="password"
          className="input numeric"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <div className="fields">
        <Field label={ar.auth.newPassword}>
          <input
            type="password"
            className="input numeric"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={ar.auth.confirmPassword}>
          <input
            type="password"
            className="input numeric"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
      </div>
      <div className="row end">
        <Button intent="blue" type="submit" pending={busy}>
          {ar.auth.changePassword}
        </Button>
      </div>
    </form>
  );
}
