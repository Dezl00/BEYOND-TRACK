"use client";
import { useLanguage } from "@/components/language-context";

import { NumberField } from "./number-field";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAutosave } from "./use-autosave";

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
  const { m: msg } = useLanguage();
  
  const router = useRouter(),
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
    {  otpEnabled: otp, preferences },
    async (value) => {
      await command("preferences", preferencesSchema.parse(value));
      router.refresh();
    },
    (value) => {

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
            
            otpEnabled: otp,
            preferences,
          });
          await command("preferences", data);
          setSuccess(msg.common.saved);
          router.refresh();
        } catch (e) {
          setError(
            "issues" in (e as object)
              ? msg.errors.invalid
              : (e as Error).message,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Message error={error || autoError} success={success} />
      {tab === "security" ? (
        <Checkbox
          label={msg.auth.otpEnabled}
          checked={otp}
          disabled={otpRequired}
          onChange={(e) => setOtp(e.target.checked)}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{msg.fields.type}</th>
                <th>{msg.settings.inApp}</th>
                <th>{msg.settings.email}</th>
                <th>{msg.settings.whatsapp}</th>
                <th>{msg.settings.forced}</th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((p) => (
                <tr key={p.type}>
                  <td>{msg.notificationTypes[p.type]}</td>
                  {(["inApp", "email", "whatsapp"] as const).map((channel) => (
                    <td key={channel}>
                      <Checkbox
                        hideLabel
                        label={`${msg.settings[channel]} · ${msg.notificationTypes[p.type]}`}
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
                      ? msg.common.yes
                      : msg.common.no}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row end">
        <Button type="submit" intent="blue" pending={busy}>
          {msg.common.save}
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
  const { m: msg } = useLanguage();
  
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
          setSuccess(msg.common.saved);
          router.refresh();
        } catch (e) {
          setError(
            "issues" in (e as object)
              ? msg.errors.invalid
              : (e as Error).message,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Message error={error || autoError} success={success} />
      <div className="fields">
        <Field label={msg.settings.defaultTheme}>
          <SelectBox
            value={String(state.defaultTheme)}
            onChange={(v) =>
              setState((s) => ({ ...s, defaultTheme: Number(v) }))
            }
            options={[
              { value: "0", label: msg.settings.light },
              { value: "1", label: msg.settings.dark },
            ]}
          />
        </Field>
        <Field label={msg.settings.digits}>
          <SelectBox
            value={String(state.digits)}
            onChange={(v) => setState((s) => ({ ...s, digits: Number(v) }))}
            options={[
              { value: "0", label: msg.settings.western },
              { value: "1", label: msg.settings.arabic },
            ]}
          />
        </Field>
        <NumberField
          label={msg.settings.notificationDays}
          min={1}
          max={365}
          precision={0}
          value={state.readNotificationDays}
          onChange={(value) =>
            setState((s) => ({ ...s, readNotificationDays: value }))
          }
        />
        <Checkbox
          label={msg.auth.globalOtp}
          disabled={!owner}
          checked={state.otpRequired}
          onChange={(e) =>
            setState((s) => ({ ...s, otpRequired: e.target.checked }))
          }
        />
      </div>
      <h2>{msg.settings.notificationDefaults}</h2>
      <Checkbox
        label={msg.whatsapp.enableSystem}
        checked={state.whatsappEnabled}
        onChange={(e) =>
          setState((s) => ({ ...s, whatsappEnabled: e.target.checked }))
        }
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{msg.fields.type}</th>
              <th>{msg.settings.inApp}</th>
              <th>{msg.settings.email}</th>
              <th>{msg.settings.whatsapp}</th>
              <th>{msg.settings.forced}</th>
            </tr>
          </thead>
          <tbody>
            {state.policies.map((p) => (
              <tr key={p.type}>
                <td>{msg.notificationTypes[p.type]}</td>
                {(["inApp", "email", "whatsapp", "forced"] as const).map(
                  (key) => (
                    <td key={key}>
                      <Checkbox
                        hideLabel
                        label={`${msg.settings[key]} · ${msg.notificationTypes[p.type]}`}
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
        <span className="muted">{msg.settings.retention}</span>
        <Button type="submit" intent="blue" pending={busy}>
          {msg.common.save}
        </Button>
      </div>
    </form>
  );
}
export function PasswordForm() {
  const { m: msg } = useLanguage();
  
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
          if (password !== confirm) throw new Error(msg.errors.passwordMatch);
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
              ? msg.errors.password
              : (e as Error).message,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <Message error={error} />
      <Field label={msg.auth.currentPassword}>
        <input
          type="password"
          className="input numeric"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <div className="fields">
        <Field label={msg.auth.newPassword}>
          <input
            type="password"
            className="input numeric"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={msg.auth.confirmPassword}>
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
          {msg.auth.changePassword}
        </Button>
      </div>
    </form>
  );
}
