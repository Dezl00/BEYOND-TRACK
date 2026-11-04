"use client";
import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LockKeyhole, UserRound, Eye, EyeOff } from "lucide-react";
import { ar } from "@/messages/ar";
import {
  loginSchema,
  otpSchema,
  resetSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { Button, Field, Checkbox, Message } from "./form-controls";
import { Brand } from "./common";
import { useLoginReady } from "./login-entry";
import { InstallApp } from "./pwa";
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
}) {
  const id = useId(),
    [visible, setVisible] = useState(false);
  return (
    <div className="field login-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="login-input-wrap">
        <LockKeyhole
          size={17}
          className="login-input-icon"
          aria-hidden="true"
        />
        <input
          id={id}
          className="input numeric"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="login-password-toggle"
          aria-label={visible ? ar.auth.hidePassword : ar.auth.showPassword}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}
export default function LoginForm() {
  useLoginReady();
  const params = useSearchParams(),
    reset = params.get("reset");
  const [mode, setMode] = useState(reset ? "reset" : "login"),
    [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [remember, setRemember] = useState(false),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (mode === "reset" && password !== confirmation)
        throw new Error(ar.errors.passwordMatch);
      const data =
        mode === "login"
          ? loginSchema.parse({ identifier, password, remember })
          : mode === "otp"
            ? otpSchema.parse({ challenge, code })
            : mode === "forgot"
              ? resetSchema.parse({ email: identifier })
              : resetPasswordSchema.parse({ token: reset, password });
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.challenge) {
        setChallenge(result.challenge);
        setMode("otp");
        setPassword("");
        setSuccess(ar.auth.otpSent);
      } else if (result.redirect) window.location.assign(result.redirect);
      else {
        setSuccess(result.message);
        if (mode === "reset") {
          setMode("login");
          setPassword("");
          history.replaceState(null, "", "/login");
        }
      }
    } catch (e) {
      setError(
        "issues" in (e as object) ? ar.errors.invalid : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-box">
      <Brand />
      <h1>
        {mode === "login"
          ? ar.auth.title
          : mode === "otp"
            ? ar.auth.otp
            : mode === "forgot"
              ? ar.auth.resetTitle
              : ar.auth.changePassword}
      </h1>
      <form onSubmit={submit} noValidate>
        <Message error={error} success={success} />
        {["login", "forgot"].includes(mode) ? (
          <Field label={mode === "login" ? ar.auth.identifier : ar.auth.email}>
            <div className="login-input-wrap">
              <UserRound
                size={17}
                className="login-input-icon"
                aria-hidden="true"
              />
              <input
                autoComplete="username"
                className="input numeric"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                type={mode === "forgot" ? "email" : "text"}
                disabled={busy}
              />
            </div>
          </Field>
        ) : null}
        {["login", "reset"].includes(mode) ? (
          <PasswordField
            key={mode}
            label={mode === "login" ? ar.auth.password : ar.auth.newPassword}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={setPassword}
            disabled={busy}
          />
        ) : null}
        {mode === "reset" ? (
          <PasswordField
            label={ar.auth.confirmPassword}
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            disabled={busy}
          />
        ) : null}
        {mode === "otp" ? (
          <Field label={ar.auth.otp}>
            <input
              className="input numeric"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              disabled={busy}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        ) : null}
        {mode === "login" ? (
          <div className="row between login-options">
            <Checkbox
              label={ar.auth.remember}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <button
              className="btn link small login-forgot"
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
            >
              {ar.auth.forgot}
            </button>
          </div>
        ) : null}
        <Button className="full login-submit" pending={busy} type="submit">
          {mode === "login"
            ? ar.auth.login
            : mode === "otp"
              ? ar.auth.verify
              : mode === "forgot"
                ? ar.auth.sendReset
                : ar.auth.changePassword}
          <ArrowLeft size={17} />
        </Button>
      </form>
      <div className="login-install">
        <InstallApp />
      </div>
      {mode !== "login" ? (
        <div className="login-bottom">
          <Button
            className="link"
            onClick={() => {
              setMode("login");
              setError("");
              setSuccess("");
            }}
          >
            {ar.auth.returnLogin}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
